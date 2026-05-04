import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ResponsavelDocumentoTipo, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';

const schoolSelect = Prisma.validator<Prisma.SchoolSelect>()({
  id: true,
  name: true,
  email: true,
  phone: true,
  status: true,
  plan: true,
  createdAt: true,
  updatedAt: true,
});

const turmaSelect = Prisma.validator<Prisma.TurmaSelect>()({
  id: true,
  name: true,
  turno: true,
});

const alunoSelect = Prisma.validator<Prisma.AlunoSelect>()({
  id: true,
  name: true,
  matricula: true,
  status: true,
  turma: {
    select: turmaSelect,
  },
});

const alunoResponsavelSelect =
  Prisma.validator<Prisma.AlunoResponsavelSelect>()({
    id: true,
    parentesco: true,
    isFinanceiro: true,
    aluno: {
      select: alunoSelect,
    },
  });

const responsavelDocumentoSelect =
  Prisma.validator<Prisma.ResponsavelDocumentoSelect>()({
    id: true,
    responsavelId: true,
    tipo: true,
    nomeOriginal: true,
    arquivoUrl: true,
    mimeType: true,
    observacao: true,
    createdAt: true,
    updatedAt: true,
  });

const safeUserSelect = Prisma.validator<Prisma.UserSelect>()({
  id: true,
  name: true,
  email: true,
  username: true,
  role: true,
  isActive: true,
  isActivated: true,
  schoolId: true,
  phone: true,
  address: true,
  cpf: true,
  cpfNormalized: true,
  identidade: true,
  fotoUrl: true,
  alunoPerfil: {
    select: {
      fotoUrl: true,
    },
  },
  createdAt: true,
  updatedAt: true,
  school: {
    select: schoolSelect,
  },
  schoolLinks: {
    select: {
      id: true,
      schoolId: true,
      school: {
        select: schoolSelect,
      },
    },
  },
  responsavelAlunos: {
    select: alunoResponsavelSelect,
  },
  responsavelDocumentos: {
    select: responsavelDocumentoSelect,
  },
});

const authUserSelect = Prisma.validator<Prisma.UserSelect>()({
  id: true,
  name: true,
  email: true,
  username: true,
  passwordHash: true,
  role: true,
  isActive: true,
  isActivated: true,
  schoolId: true,
  phone: true,
  address: true,
  cpf: true,
  cpfNormalized: true,
  identidade: true,
  fotoUrl: true,
  alunoPerfil: {
    select: {
      fotoUrl: true,
    },
  },
  activationToken: true,
  activationExpires: true,
  createdAt: true,
  updatedAt: true,
  school: {
    select: schoolSelect,
  },
  schoolLinks: {
    select: {
      id: true,
      schoolId: true,
      school: {
        select: schoolSelect,
      },
    },
  },
});

function normalizeUsername(value?: string | null) {
  const username = String(value || '').trim().toLowerCase();

  if (!username) return null;

  return username;
}

function normalizeCpf(value?: string | null) {
  const cpf = String(value || '').replace(/\D/g, '');

  return cpf || null;
}

function validateUsername(username: string | null) {
  if (!username) return;

  if (username.length < 3) {
    throw new BadRequestException('O usuário deve ter pelo menos 3 caracteres.');
  }

  if (!/^[a-z0-9._-]+$/.test(username)) {
    throw new BadRequestException(
      'Use apenas letras, números, ponto, hífen ou underline no usuário.',
    );
  }
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.user.findMany({
      select: safeUserSelect,
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findBySchoolId(schoolId: string) {
    return this.prisma.user.findMany({
      where: {
        OR: [
          {
            schoolId,
          },
          {
            schoolLinks: {
              some: {
                schoolId,
              },
            },
          },
        ],
      },
      select: safeUserSelect,
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      select: safeUserSelect,
    });
  }

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
      select: authUserSelect,
    });
  }

  async findByLoginIdentifier(identifier: string) {
    const rawIdentifier = String(identifier || '').trim();
    const normalizedIdentifier = rawIdentifier.toLowerCase();
    const cpfNormalized = normalizeCpf(rawIdentifier);

    if (!normalizedIdentifier) return null;

    const emailMatch = await this.prisma.user.findUnique({
      where: {
        email: normalizedIdentifier,
      },
      select: authUserSelect,
    });

    if (emailMatch) {
      return emailMatch;
    }

    const usernameMatch = await this.prisma.user.findUnique({
      where: {
        username: normalizedIdentifier,
      },
      select: authUserSelect,
    });

    if (usernameMatch) {
      return usernameMatch;
    }

    if (!cpfNormalized) return null;

    const cpfMatches = await this.prisma.user.findMany({
      where: {
        cpfNormalized,
      },
      select: authUserSelect,
      take: 2,
    });

    if (cpfMatches.length > 1) {
      throw new BadRequestException(
        'Existe mais de uma conta com este CPF. Peça ao administrador para corrigir o cadastro.',
      );
    }

    if (cpfMatches.length === 1) {
      return cpfMatches[0];
    }

    const legacyCpfMatches = await this.prisma.user.findMany({
      where: {
        cpf: {
          not: null,
        },
      },
      select: authUserSelect,
    });

    const matches = legacyCpfMatches.filter(
      (user) => normalizeCpf(user.cpf) === cpfNormalized,
    );

    if (matches.length > 1) {
      throw new BadRequestException(
        'Existe mais de uma conta com este CPF. Peça ao administrador para corrigir o cadastro.',
      );
    }

    return matches[0] || null;
  }

  async findByActivationToken(token: string) {
    return this.prisma.user.findFirst({
      where: { activationToken: token },
      select: authUserSelect,
    });
  }

  async create(data: {
    name: string;
    email: string;
    username?: string | null;
    passwordHash: string;
    role: UserRole;
    schoolId?: string;
    activationToken?: string | null;
    activationExpires?: Date | null;
    isActivated?: boolean;
    phone?: string;
    address?: string;
    cpf?: string;
    identidade?: string;
    fotoUrl?: string;
  }) {
    const username = normalizeUsername(data.username);
    validateUsername(username);

    if (username) {
      const existingUsername = await this.prisma.user.findUnique({
        where: { username },
        select: { id: true },
      });

      if (existingUsername) {
        throw new BadRequestException('Já existe usuário com este login.');
      }
    }

    return this.prisma.user.create({
      data: {
        ...data,
        username,
        cpfNormalized: normalizeCpf(data.cpf),
        schoolLinks:
          data.schoolId && data.role === UserRole.ADMIN_ESCOLA
            ? {
                create: {
                  schoolId: data.schoolId,
                },
              }
            : undefined,
      },
      select: safeUserSelect,
    });
  }

  async attachUserToSchool(userId: string, schoolId: string) {
    const [user, school] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          role: true,
          schoolId: true,
        },
      }),
      this.prisma.school.findUnique({
        where: { id: schoolId },
        select: {
          id: true,
        },
      }),
    ]);

    if (!user) {
      throw new NotFoundException('Usuário não encontrado.');
    }

    if (!school) {
      throw new NotFoundException('Escola não encontrada.');
    }

    if (user.role !== UserRole.ADMIN_ESCOLA) {
      return this.prisma.user.update({
        where: { id: userId },
        data: { schoolId },
        select: safeUserSelect,
      });
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.userSchoolLink.upsert({
        where: {
          userId_schoolId: {
            userId,
            schoolId,
          },
        },
        update: {},
        create: {
          userId,
          schoolId,
        },
      });

      if (!user.schoolId) {
        await tx.user.update({
          where: { id: userId },
          data: {
            schoolId,
          },
        });
      }

      return tx.user.findUnique({
        where: { id: userId },
        select: safeUserSelect,
      });
    });
  }

  async updatePassword(userId: string, passwordHash: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
      select: safeUserSelect,
    });
  }

  async updateBySuperuser(
    userId: string,
    data: {
      name?: string;
      email?: string;
      username?: string | null;
      password?: string;
      role?: UserRole;
      schoolId?: string | null;
      isActive?: boolean;
      phone?: string | null;
      address?: string | null;
      cpf?: string | null;
      identidade?: string | null;
    },
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        username: true,
        role: true,
      },
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    const nextRole = data.role || user.role;
    const schoolId = data.schoolId?.trim() || null;

    if (nextRole !== UserRole.SUPERUSUARIO && !schoolId) {
      throw new BadRequestException('Selecione a escola deste usuário.');
    }

    if (nextRole !== UserRole.SUPERUSUARIO && schoolId) {
      const school = await this.prisma.school.findUnique({
        where: { id: schoolId },
        select: { id: true },
      });

      if (!school) {
        throw new BadRequestException('Escola não encontrada.');
      }
    }

    const name = data.name?.trim();

    if (data.name !== undefined && !name) {
      throw new BadRequestException('Nome é obrigatório.');
    }

    const email =
      data.email !== undefined ? data.email.trim().toLowerCase() : undefined;

    if (data.email !== undefined && !email) {
      throw new BadRequestException('E-mail é obrigatório.');
    }

    if (email && email !== user.email) {
      const existingEmail = await this.prisma.user.findUnique({
        where: { email },
        select: { id: true },
      });

      if (existingEmail && existingEmail.id !== userId) {
        throw new BadRequestException('Já existe outro usuário com este e-mail.');
      }
    }

    const username =
      data.username !== undefined ? normalizeUsername(data.username) : undefined;

    if (username !== undefined) {
      validateUsername(username);
    }

    if (username && username !== user.username) {
      const existingUsername = await this.prisma.user.findUnique({
        where: { username },
        select: { id: true },
      });

      if (existingUsername && existingUsername.id !== userId) {
        throw new BadRequestException('Já existe outro usuário com este login.');
      }
    }

    const cpf =
      data.cpf !== undefined ? String(data.cpf || '').trim() || null : undefined;
    const cpfNormalized = cpf !== undefined ? normalizeCpf(cpf) : undefined;

    if (cpfNormalized) {
      const existingCpf = await this.prisma.user.findFirst({
        where: {
          cpfNormalized,
          id: {
            not: userId,
          },
        },
        select: { id: true },
      });

      if (existingCpf) {
        throw new BadRequestException('Já existe outro usuário com este CPF.');
      }
    }

    const updateData: Prisma.UserUpdateInput = {
      ...(name !== undefined ? { name } : {}),
      ...(email !== undefined ? { email } : {}),
      ...(username !== undefined ? { username } : {}),
      ...(data.role !== undefined ? { role: data.role } : {}),
      ...(data.isActive !== undefined
        ? { isActive: Boolean(data.isActive) }
        : {}),
      ...(data.phone !== undefined ? { phone: data.phone?.trim() || null } : {}),
      ...(data.address !== undefined
        ? { address: data.address?.trim() || null }
        : {}),
      ...(cpf !== undefined ? { cpf, cpfNormalized } : {}),
      ...(data.identidade !== undefined
        ? { identidade: data.identidade?.trim() || null }
        : {}),
      school:
        nextRole === UserRole.SUPERUSUARIO
          ? { disconnect: true }
          : { connect: { id: schoolId! } },
    };

    const password = data.password?.trim();

    if (password) {
      if (password.length < 6) {
        throw new BadRequestException('A senha deve ter pelo menos 6 caracteres.');
      }

      updateData.passwordHash = await bcrypt.hash(password, 10);
      updateData.isActivated = true;
      updateData.activationToken = null;
      updateData.activationExpires = null;
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: userId },
        data: updateData,
        select: safeUserSelect,
      });

      if (nextRole !== UserRole.ADMIN_ESCOLA) {
        await tx.userSchoolLink.deleteMany({
          where: { userId },
        });
      }

      if (nextRole === UserRole.ADMIN_ESCOLA && schoolId) {
        await tx.userSchoolLink.upsert({
          where: {
            userId_schoolId: {
              userId,
              schoolId,
            },
          },
          update: {},
          create: {
            userId,
            schoolId,
          },
        });
      }

      return updated;
    });
  }

  async updateBySchoolAdmin(
    userId: string,
    currentUserId: string,
    currentSchoolId: string,
    data: {
      name?: string;
      email?: string;
      username?: string | null;
      password?: string;
      role?: UserRole;
      isActive?: boolean;
      phone?: string | null;
      address?: string | null;
      cpf?: string | null;
      identidade?: string | null;
    },
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        username: true,
        role: true,
        schoolId: true,
      },
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    if (user.schoolId !== currentSchoolId) {
      throw new BadRequestException('Usuário não pertence à sua escola.');
    }

    if (user.role === UserRole.SUPERUSUARIO) {
      throw new ForbiddenException('Admin da escola não pode editar superusuário.');
    }

    if (currentUserId === userId) {
      if (data.role && data.role !== user.role) {
        throw new ForbiddenException('Você não pode alterar o próprio perfil.');
      }

      if (data.isActive === false) {
        throw new ForbiddenException('Você não pode desativar o próprio usuário.');
      }
    }

    const name = data.name?.trim();

    if (data.name !== undefined && !name) {
      throw new BadRequestException('Nome é obrigatório.');
    }

    const email =
      data.email !== undefined ? data.email.trim().toLowerCase() : undefined;

    if (data.email !== undefined && !email) {
      throw new BadRequestException('E-mail é obrigatório.');
    }

    if (email && email !== user.email) {
      const existingEmail = await this.prisma.user.findUnique({
        where: { email },
        select: { id: true },
      });

      if (existingEmail && existingEmail.id !== userId) {
        throw new BadRequestException('Já existe outro usuário com este e-mail.');
      }
    }

    const username =
      data.username !== undefined ? normalizeUsername(data.username) : undefined;

    if (username !== undefined) {
      validateUsername(username);
    }

    if (username && username !== user.username) {
      const existingUsername = await this.prisma.user.findUnique({
        where: { username },
        select: { id: true },
      });

      if (existingUsername && existingUsername.id !== userId) {
        throw new BadRequestException('Já existe outro usuário com este login.');
      }
    }

    const cpf =
      data.cpf !== undefined ? String(data.cpf || '').trim() || null : undefined;
    const cpfNormalized = cpf !== undefined ? normalizeCpf(cpf) : undefined;

    if (cpfNormalized) {
      const existingCpf = await this.prisma.user.findFirst({
        where: {
          cpfNormalized,
          id: {
            not: userId,
          },
        },
        select: { id: true },
      });

      if (existingCpf) {
        throw new BadRequestException('Já existe outro usuário com este CPF.');
      }
    }

    const updateData: Prisma.UserUpdateInput = {
      ...(name !== undefined ? { name } : {}),
      ...(email !== undefined ? { email } : {}),
      ...(username !== undefined ? { username } : {}),
      ...(data.isActive !== undefined
        ? { isActive: Boolean(data.isActive) }
        : {}),
      ...(data.phone !== undefined ? { phone: data.phone?.trim() || null } : {}),
      ...(data.address !== undefined
        ? { address: data.address?.trim() || null }
        : {}),
      ...(cpf !== undefined ? { cpf, cpfNormalized } : {}),
      ...(data.identidade !== undefined
        ? { identidade: data.identidade?.trim() || null }
        : {}),
    };

    const password = data.password?.trim();

    if (password) {
      if (password.length < 6) {
        throw new BadRequestException('A senha deve ter pelo menos 6 caracteres.');
      }

      updateData.passwordHash = await bcrypt.hash(password, 10);
      updateData.isActivated = true;
      updateData.activationToken = null;
      updateData.activationExpires = null;
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: safeUserSelect,
    });
  }

  async activateUser(userId: string, passwordHash: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash,
        isActivated: true,
        activationToken: null,
        activationExpires: null,
      },
      select: safeUserSelect,
    });
  }

  async updateResponsavel(
    userId: string,
    data: {
      name?: string;
      phone?: string;
      address?: string;
      cpf?: string;
      identidade?: string;
    },
  ) {
    const cpfNormalized = normalizeCpf(data.cpf);

    if (cpfNormalized) {
      const outroUsuario = await this.prisma.user.findFirst({
        where: {
          cpfNormalized,
          id: {
            not: userId,
          },
        },
        select: {
          id: true,
        },
      });

      if (outroUsuario) {
        throw new BadRequestException('Já existe outro usuário com este CPF.');
      }
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: {
        name: data.name,
        phone: data.phone,
        address: data.address,
        cpf: data.cpf,
        cpfNormalized,
        identidade: data.identidade,
      },
      select: safeUserSelect,
    });
  }

  async configureResponsavelAccess(
    userId: string,
    data: {
      email: string;
      username?: string | null;
      password?: string;
      isActive: boolean;
    },
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
        schoolId: true,
        email: true,
        passwordHash: true,
        isActivated: true,
      },
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    if (user.role !== UserRole.RESPONSAVEL) {
      throw new BadRequestException(
        'Esta operação só pode ser usada para usuários do tipo RESPONSAVEL',
      );
    }

    const emailNormalizado = String(data.email || '').trim().toLowerCase();
    const username = normalizeUsername(data.username);
    validateUsername(username);

    if (!emailNormalizado) {
      throw new BadRequestException('Informe o e-mail do responsável.');
    }

    const outroUsuario = await this.prisma.user.findUnique({
      where: {
        email: emailNormalizado,
      },
      select: {
        id: true,
        role: true,
        schoolId: true,
      },
    });

    if (outroUsuario && outroUsuario.id !== user.id) {
      throw new BadRequestException(
        'Já existe outro usuário com este e-mail.',
      );
    }

    if (username) {
      const usuarioComMesmoLogin = await this.prisma.user.findUnique({
        where: {
          username,
        },
        select: {
          id: true,
        },
      });

      if (usuarioComMesmoLogin && usuarioComMesmoLogin.id !== user.id) {
        throw new BadRequestException(
          'Já existe outro usuário com este login.',
        );
      }
    }

    const updateData: Prisma.UserUpdateInput = {
      email: emailNormalizado,
      username,
      isActive: Boolean(data.isActive),
    };

    const senhaInformada = String(data.password || '').trim();

    if (senhaInformada) {
      updateData.passwordHash = await bcrypt.hash(senhaInformada, 10);
      updateData.isActivated = true;
      updateData.activationToken = null;
      updateData.activationExpires = null;
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: safeUserSelect,
    });
  }

  async updateResponsavelFoto(userId: string, fotoUrl: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
      },
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    if (user.role !== UserRole.RESPONSAVEL) {
      throw new BadRequestException(
        'A foto só pode ser enviada para usuário do tipo RESPONSAVEL',
      );
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: {
        fotoUrl,
      },
      select: safeUserSelect,
    });
  }

  async listResponsavelDocumentos(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
        responsavelDocumentos: {
          select: responsavelDocumentoSelect,
          orderBy: {
            createdAt: 'desc',
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    if (user.role !== UserRole.RESPONSAVEL) {
      throw new BadRequestException(
        'Esta operação só pode ser usada para usuários do tipo RESPONSAVEL',
      );
    }

    return user.responsavelDocumentos;
  }

  async createResponsavelDocumento(data: {
    responsavelId: string;
    tipo: ResponsavelDocumentoTipo;
    nomeOriginal: string;
    arquivoUrl: string;
    mimeType?: string | null;
    observacao?: string | null;
  }) {
    const user = await this.prisma.user.findUnique({
      where: { id: data.responsavelId },
      select: {
        id: true,
        role: true,
      },
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    if (user.role !== UserRole.RESPONSAVEL) {
      throw new BadRequestException(
        'Documento só pode ser enviado para usuário do tipo RESPONSAVEL',
      );
    }

    return this.prisma.responsavelDocumento.create({
      data: {
        responsavelId: data.responsavelId,
        tipo: data.tipo,
        nomeOriginal: data.nomeOriginal,
        arquivoUrl: data.arquivoUrl,
        mimeType: data.mimeType,
        observacao: data.observacao,
      },
      select: responsavelDocumentoSelect,
    });
  }

  async findResponsavelDocumentoById(docId: string) {
    const documento = await this.prisma.responsavelDocumento.findUnique({
      where: { id: docId },
      select: {
        id: true,
        responsavelId: true,
        tipo: true,
        nomeOriginal: true,
        arquivoUrl: true,
        mimeType: true,
        observacao: true,
        createdAt: true,
        updatedAt: true,
        responsavel: {
          select: {
            id: true,
            schoolId: true,
            role: true,
          },
        },
      },
    });

    if (!documento) {
      throw new NotFoundException('Documento do responsável não encontrado');
    }

    if (!documento.responsavel) {
      throw new NotFoundException('Responsável do documento não encontrado');
    }

    if (documento.responsavel.role !== UserRole.RESPONSAVEL) {
      throw new BadRequestException(
        'Este documento não pertence a um usuário do tipo RESPONSAVEL',
      );
    }

    return documento;
  }

  async deleteResponsavelDocumento(docId: string) {
    await this.findResponsavelDocumentoById(docId);

    return this.prisma.responsavelDocumento.delete({
      where: { id: docId },
      select: responsavelDocumentoSelect,
    });
  }

  async blockUser(userId: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { isActive: false },
      select: safeUserSelect,
    });
  }

  async unblockUser(userId: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { isActive: true },
      select: safeUserSelect,
    });
  }

  async deleteUser(userId: string) {
    return this.prisma.user.delete({
      where: { id: userId },
      select: safeUserSelect,
    });
  }

  async getOwnAccess(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        username: true,
        cpf: true,
        role: true,
      },
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    return user;
  }

  async updateOwnAccess(
    userId: string,
    data: {
      username?: string | null;
      cpf?: string | null;
    },
  ) {
    const shouldUpdateUsername =
      data.username !== undefined && data.username !== null;
    const shouldUpdateCpf = data.cpf !== undefined && data.cpf !== null;
    const username = shouldUpdateUsername
      ? normalizeUsername(data.username)
      : null;
    const cpf = shouldUpdateCpf ? String(data.cpf || '').trim() || null : null;
    const cpfNormalized = normalizeCpf(cpf);

    if (!shouldUpdateUsername && !shouldUpdateCpf) {
      throw new BadRequestException('Informe CPF ou usuário para atualizar.');
    }

    if (shouldUpdateUsername) {
      validateUsername(username);
    }

    if (shouldUpdateUsername && username) {
      const usuarioComMesmoLogin = await this.prisma.user.findUnique({
        where: {
          username,
        },
        select: {
          id: true,
        },
      });

      if (usuarioComMesmoLogin && usuarioComMesmoLogin.id !== userId) {
        throw new BadRequestException(
          'Já existe outro usuário com este login.',
        );
      }
    }

    if (shouldUpdateCpf && cpfNormalized) {
      const usuarioComMesmoCpf = await this.prisma.user.findFirst({
        where: {
          cpfNormalized,
          id: {
            not: userId,
          },
        },
        select: {
          id: true,
        },
      });

      if (usuarioComMesmoCpf) {
        throw new BadRequestException('Já existe outro usuário com este CPF.');
      }
    }

    const updateData: Prisma.UserUpdateInput = {};

    if (shouldUpdateUsername) {
      updateData.username = username;
    }

    if (shouldUpdateCpf) {
      updateData.cpf = cpf;
      updateData.cpfNormalized = cpfNormalized;
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: safeUserSelect,
    });
  }

  async changePassword(
    userId: string,
    senhaAtual: string,
    novaSenha: string,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        passwordHash: true,
      },
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    const senhaValida = await bcrypt.compare(senhaAtual, user.passwordHash);

    if (!senhaValida) {
      throw new BadRequestException('Senha atual incorreta');
    }

    const novaSenhaHash = await bcrypt.hash(novaSenha, 10);

    return this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash: novaSenhaHash,
      },
      select: safeUserSelect,
    });
  }
}
