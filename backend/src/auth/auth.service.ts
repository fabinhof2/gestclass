import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { FinanceiroCobrancaStatus, SchoolStatus, UserRole } from '@prisma/client';
import { UsersService } from '../users/users.service';
import { PrismaService } from '../prisma/prisma.service';
import { SchoolsService } from '../schools/schools.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly schoolsService: SchoolsService,
  ) {}

  private getDataLimiteBloqueioAssinatura() {
    const data = new Date();
    data.setDate(data.getDate() - 60);
    return data;
  }

  private async atualizarBloqueioPorAtraso(schoolIds: string[]) {
    const ids = Array.from(new Set(schoolIds.filter(Boolean)));

    if (ids.length === 0) return;

    await this.prisma.financeiroAssinaturaCobranca.updateMany({
      where: {
        schoolId: {
          in: ids,
        },
        status: FinanceiroCobrancaStatus.PENDENTE,
        vencimento: {
          lt: new Date(),
        },
      },
      data: {
        status: FinanceiroCobrancaStatus.ATRASADO,
      },
    });

    const escolasComBloqueio =
      await this.prisma.financeiroAssinaturaCobranca.findMany({
        where: {
          schoolId: {
            in: ids,
          },
          status: {
            in: [
              FinanceiroCobrancaStatus.PENDENTE,
              FinanceiroCobrancaStatus.ATRASADO,
            ],
          },
          vencimento: {
            lt: this.getDataLimiteBloqueioAssinatura(),
          },
          school: {
            status: {
              not: SchoolStatus.CANCELADA,
            },
          },
        },
        select: {
          schoolId: true,
        },
        distinct: ['schoolId'],
      });

    const blockedSchoolIds = escolasComBloqueio.map((item) => item.schoolId);

    if (blockedSchoolIds.length === 0) return;

    await this.prisma.school.updateMany({
      where: {
        id: {
          in: blockedSchoolIds,
        },
        status: {
          not: SchoolStatus.CANCELADA,
        },
      },
      data: {
        status: SchoolStatus.SUSPENSA,
      },
    });
  }

  private async ensureSchoolIsNotBlocked(data: {
    userId: string;
    role: UserRole;
    schoolId?: string | null;
  }) {
    if (data.role === UserRole.SUPERUSUARIO) {
      return;
    }

    const vinculosResponsavel = await this.prisma.alunoResponsavel.findMany({
      where: {
        responsavelId: data.userId,
      },
      select: {
        aluno: {
          select: {
            schoolId: true,
          },
        },
      },
    });

    await this.atualizarBloqueioPorAtraso([
      ...(data.schoolId ? [data.schoolId] : []),
      ...vinculosResponsavel.map((item) => item.aluno.schoolId),
    ]);

    if (data.schoolId) {
      const school = await this.prisma.school.findUnique({
        where: { id: data.schoolId },
        select: { status: true },
      });

      if (school?.status === SchoolStatus.SUSPENSA) {
        throw new UnauthorizedException(
          'A escola esta bloqueada. Entre em contato com o suporte da plataforma.',
        );
      }
    }

    const escolaSuspensaPorVinculo =
      await this.prisma.alunoResponsavel.findFirst({
        where: {
          responsavelId: data.userId,
          aluno: {
            school: {
              status: SchoolStatus.SUSPENSA,
            },
          },
        },
        select: {
          id: true,
        },
      });

    if (escolaSuspensaPorVinculo) {
      throw new UnauthorizedException(
        'A escola esta bloqueada. Entre em contato com o suporte da plataforma.',
      );
    }
  }

  private async buildLoginResponse(user: {
    id: string;
    name: string;
    email: string;
    username?: string | null;
    cpf?: string | null;
    role: UserRole;
    fotoUrl?: string | null;
    alunoPerfil?: { fotoUrl?: string | null } | null;
    schoolId?: string | null;
    isActive: boolean;
    isActivated: boolean;
  }) {
    let schoolPlan: string | null = null;

    await this.ensureSchoolIsNotBlocked({
      userId: user.id,
      role: user.role,
      schoolId: user.schoolId,
    });

    if (user.schoolId) {
      const school = await this.prisma.school.findUnique({
        where: { id: user.schoolId },
        select: {
          plan: true,
          trialEndsAt: true,
          status: true,
        },
      });

      if (school?.status === SchoolStatus.SUSPENSA) {
        throw new UnauthorizedException(
          'A escola esta bloqueada. Entre em contato com o suporte da plataforma.',
        );
      }

      if (
        school?.plan === 'TESTE_15_DIAS' &&
        school.trialEndsAt &&
        school.trialEndsAt < new Date()
      ) {
        throw new UnauthorizedException(
          'Período de teste expirado. Entre em contato com o suporte.',
        );
      }

      schoolPlan = school?.plan || 'BASICO';
    }

    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      schoolId: user.schoolId,
    };

    return {
      access_token: await this.jwtService.signAsync(payload),
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        username: user.username || null,
        cpf: user.cpf || null,
        role: user.role,
        fotoUrl: user.fotoUrl || user.alunoPerfil?.fotoUrl || null,
        schoolId: user.schoolId,
        plan: schoolPlan,
        isActive: user.isActive,
        isActivated: user.isActivated,
      },
    };
  }

  async login(identifier: string, password: string) {
    if (!identifier || !identifier.trim()) {
      throw new BadRequestException('Informe e-mail, CPF ou usuário');
    }

    if (!password || !password.trim()) {
      throw new BadRequestException('Senha é obrigatória');
    }

    const user = await this.usersService.findByLoginIdentifier(identifier);

    if (!user) {
      throw new UnauthorizedException('Login ou senha inválidos');
    }

    if (!user.isActive) {
      if (user.role === 'ALUNO') {
        throw new UnauthorizedException(
          'Usuário está inativo, procure a secretaria da escola.',
        );
      }

      throw new UnauthorizedException('Usuário bloqueado');
    }

    if (!user.isActivated) {
      throw new UnauthorizedException('Conta ainda não ativada');
    }

    const passwordMatches = await bcrypt.compare(password, user.passwordHash);

    if (!passwordMatches) {
      throw new UnauthorizedException('Login ou senha inválidos');
    }

    return this.buildLoginResponse({
      id: user.id,
      name: user.name,
      email: user.email,
      username: user.username,
      cpf: user.cpf,
      role: user.role,
      fotoUrl: user.fotoUrl,
      alunoPerfil: user.alunoPerfil,
      schoolId: user.schoolId,
      isActive: user.isActive,
      isActivated: user.isActivated,
    });
  }

  async switchActiveSchool(
    currentUser: {
      userId: string;
      email: string;
      role: UserRole;
      schoolId?: string | null;
    },
    targetSchoolId: string,
  ) {
    if (!targetSchoolId || !targetSchoolId.trim()) {
      throw new BadRequestException('Informe a escola que deseja ativar.');
    }

    if (currentUser.role !== 'ADMIN_ESCOLA') {
      throw new ForbiddenException(
        'Somente admin de escola pode trocar a escola ativa.',
      );
    }

    const podeAcessar = await this.schoolsService.userCanAccessSchool({
      userId: currentUser.userId,
      userRole: currentUser.role,
      userSchoolId: currentUser.schoolId,
      targetSchoolId: targetSchoolId.trim(),
    });

    if (!podeAcessar) {
      throw new ForbiddenException(
        'Você não tem vínculo com a escola selecionada.',
      );
    }

    const targetSchool = await this.prisma.school.findUnique({
      where: { id: targetSchoolId.trim() },
      select: { status: true },
    });

    if (targetSchool?.status === SchoolStatus.SUSPENSA) {
      throw new ForbiddenException(
        'A escola esta bloqueada. Entre em contato com o suporte da plataforma.',
      );
    }

    await this.prisma.userSchoolLink.upsert({
  where: {
    userId_schoolId: {
      userId: currentUser.userId,
      schoolId: targetSchoolId.trim(),
    },
  },
  update: {},
  create: {
    userId: currentUser.userId,
    schoolId: targetSchoolId.trim(),
  },
});

if (currentUser.schoolId) {
  await this.prisma.userSchoolLink.upsert({
    where: {
      userId_schoolId: {
        userId: currentUser.userId,
        schoolId: currentUser.schoolId,
      },
    },
    update: {},
    create: {
      userId: currentUser.userId,
      schoolId: currentUser.schoolId,
    },
  });
}

const user = await this.prisma.user.update({
  where: {
    id: currentUser.userId,
  },
  data: {
    schoolId: targetSchoolId.trim(),
  },
  select: {
    id: true,
  name: true,
  email: true,
  username: true,
  cpf: true,
  role: true,
    fotoUrl: true,
    alunoPerfil: {
      select: {
        fotoUrl: true,
      },
    },
    schoolId: true,
    isActive: true,
    isActivated: true,
  },
});

    return this.buildLoginResponse(user);
  }

  async enterSchoolAsAdmin(
    currentUser: {
      userId: string;
      email: string;
      role: UserRole;
    },
    targetSchoolId: string,
  ) {
    if (currentUser.role !== UserRole.SUPERUSUARIO) {
      throw new ForbiddenException(
        'Somente superusuário pode acessar uma escola em modo manutenção.',
      );
    }

    if (!targetSchoolId || !targetSchoolId.trim()) {
      throw new BadRequestException('Informe a escola que deseja acessar.');
    }

    const [superuser, school] = await Promise.all([
      this.prisma.user.findUnique({
        where: {
          id: currentUser.userId,
        },
        select: {
          id: true,
          name: true,
          email: true,
          username: true,
          cpf: true,
          fotoUrl: true,
          isActive: true,
          isActivated: true,
        },
      }),
      this.prisma.school.findUnique({
        where: {
          id: targetSchoolId.trim(),
        },
        select: {
          id: true,
          name: true,
          plan: true,
          trialEndsAt: true,
        },
      }),
    ]);

    if (!superuser) {
      throw new ForbiddenException('Superusuário não encontrado.');
    }

    if (!school) {
      throw new BadRequestException('Escola não encontrada.');
    }

    if (
      school.plan === 'TESTE_15_DIAS' &&
      school.trialEndsAt &&
      school.trialEndsAt < new Date()
    ) {
      throw new UnauthorizedException(
        'Período de teste expirado. Entre em contato com o suporte.',
      );
    }

    const payload = {
      sub: superuser.id,
      email: superuser.email,
      role: UserRole.ADMIN_ESCOLA,
      schoolId: school.id,
      isSuperuserMaintenance: true,
      originalRole: UserRole.SUPERUSUARIO,
    };

    return {
      access_token: await this.jwtService.signAsync(payload),
      user: {
        id: superuser.id,
        name: superuser.name,
        email: superuser.email,
        username: superuser.username || null,
        cpf: superuser.cpf || null,
        role: UserRole.ADMIN_ESCOLA,
        fotoUrl: superuser.fotoUrl || null,
        schoolId: school.id,
        plan: school.plan || 'BASICO',
        isActive: superuser.isActive,
        isActivated: superuser.isActivated,
        isSuperuserMaintenance: true,
        originalRole: UserRole.SUPERUSUARIO,
        maintenanceSchoolName: school.name,
      },
    };
  }

  async register(data: {
    name: string;
    email: string;
    password: string;
    role: UserRole;
    schoolId?: string;
  }) {
    throw new ForbiddenException(
      'Cadastro público desativado por segurança. Use convite por e-mail ou criação autenticada.',
    );
  }

  async registerByAdmin(
    currentUser: {
      userId: string;
      role: UserRole;
      schoolId?: string | null;
    },
    data: {
      name: string;
      email: string;
      username?: string;
      password: string;
      role: UserRole;
      schoolId?: string;
    },
  ) {
    if (!data.name || !data.name.trim()) {
      throw new BadRequestException('Nome é obrigatório');
    }

    if (!data.email || !data.email.trim()) {
      throw new BadRequestException('E-mail é obrigatório');
    }

    if (!data.password || data.password.trim().length < 6) {
      throw new BadRequestException('A senha deve ter pelo menos 6 caracteres');
    }

    if (!data.role) {
      throw new BadRequestException('Perfil é obrigatório');
    }

    const normalizedEmail = data.email.trim().toLowerCase();
    const existingUser = await this.usersService.findByEmail(normalizedEmail);

    if (existingUser) {
      throw new BadRequestException('Já existe usuário com este e-mail');
    }

    if (currentUser.role === 'SUPERUSUARIO') {
      const allowedRolesForSuperuser: UserRole[] = [
        UserRole.SUPERUSUARIO,
        UserRole.ADMIN_ESCOLA,
        UserRole.FINANCEIRO,
        UserRole.GESTOR,
        UserRole.COORDENADOR,
        UserRole.SECRETARIA,
        UserRole.AUXILIAR,
        UserRole.PROFESSOR,
        UserRole.RESPONSAVEL,
        UserRole.ALUNO,
      ];

      if (!allowedRolesForSuperuser.includes(data.role)) {
        throw new ForbiddenException(
          'Superusuário não pode criar usuário com este perfil.',
        );
      }

      if (data.role !== UserRole.SUPERUSUARIO) {
        if (!data.schoolId || !data.schoolId.trim()) {
          throw new BadRequestException(
            'Selecione a escola para criar este usuário.',
          );
        }

        const school = await this.prisma.school.findUnique({
          where: { id: data.schoolId.trim() },
          select: { id: true },
        });

        if (!school) {
          throw new BadRequestException('Escola não encontrada.');
        }
      }

      const passwordHash = await bcrypt.hash(data.password.trim(), 10);

      return this.usersService.create({
        name: data.name.trim(),
        email: normalizedEmail,
        username: data.username,
        passwordHash,
        role: data.role,
        schoolId:
          data.role === UserRole.SUPERUSUARIO ? undefined : data.schoolId?.trim(),
        isActivated: true,
        activationToken: null,
        activationExpires: null,
      });
    }

    if (
      currentUser.role !== UserRole.ADMIN_ESCOLA &&
      currentUser.role !== UserRole.SECRETARIA
    ) {
      throw new ForbiddenException(
        'Apenas admin ou secretaria da escola pode usar esta rota',
      );
    }

    if (!currentUser.schoolId) {
      throw new ForbiddenException('Usuário sem escola vinculada');
    }

    const allowedRolesForAdmin: UserRole[] = [
      'FINANCEIRO',
      'GESTOR',
      'COORDENADOR',
      'SECRETARIA',
      'AUXILIAR',
      'PROFESSOR',
      'RESPONSAVEL',
      'ALUNO',
    ];

    if (
      currentUser.role === UserRole.SECRETARIA &&
      (data.role === UserRole.ADMIN_ESCOLA ||
        data.role === UserRole.GESTOR ||
        data.role === UserRole.FINANCEIRO ||
        data.role === UserRole.SECRETARIA)
    ) {
      throw new ForbiddenException(
        'Secretaria só pode criar COORDENADOR, AUXILIAR, PROFESSOR, RESPONSAVEL ou ALUNO',
      );
    }

    if (!allowedRolesForAdmin.includes(data.role)) {
      throw new ForbiddenException(
        'Admin da escola só pode criar FINANCEIRO, GESTOR, COORDENADOR, SECRETARIA, AUXILIAR, PROFESSOR, RESPONSAVEL ou ALUNO',
      );
    }

    const passwordHash = await bcrypt.hash(data.password.trim(), 10);

    return this.usersService.create({
      name: data.name.trim(),
      email: normalizedEmail,
      username: data.username,
      passwordHash,
      role: data.role,
      schoolId: currentUser.schoolId,
      isActivated: true,
      activationToken: null,
      activationExpires: null,
    });
  }

  async activateAccount(token: string, newPassword: string) {
    if (!token || !token.trim()) {
      throw new BadRequestException('Token de ativação é obrigatório');
    }

    if (!newPassword || newPassword.trim().length < 6) {
      throw new BadRequestException(
        'A nova senha deve ter pelo menos 6 caracteres',
      );
    }

    const user = await this.usersService.findByActivationToken(token.trim());

    if (!user) {
      throw new BadRequestException('Token de ativação inválido');
    }

    if (!user.isActive) {
      throw new ForbiddenException('Usuário bloqueado');
    }

    if (user.isActivated) {
      throw new BadRequestException('Esta conta já foi ativada');
    }

    if (!user.activationExpires) {
      throw new BadRequestException('Token de ativação inválido');
    }

    const now = new Date();

    if (user.activationExpires < now) {
      throw new BadRequestException('Token de ativação expirado');
    }

    const passwordHash = await bcrypt.hash(newPassword.trim(), 10);

    const activatedUser = await this.usersService.activateUser(
      user.id,
      passwordHash,
    );

    return {
      message: 'Conta ativada com sucesso',
      user: {
        id: activatedUser.id,
        name: activatedUser.name,
        email: activatedUser.email,
        role: activatedUser.role,
        schoolId: activatedUser.schoolId,
        isActive: activatedUser.isActive,
        isActivated: activatedUser.isActivated,
      },
    };
  }

  async resetPassword(userId: string, newPassword: string) {
    throw new ForbiddenException(
      'Rota pública de reset desativada por segurança. Use /auth/reset-password-secure.',
    );
  }

  async resetPasswordSecure(
    currentUser: {
      userId: string;
      role: UserRole;
      schoolId?: string | null;
    },
    targetUserId: string,
    newPassword: string,
  ) {
    if (!targetUserId || !targetUserId.trim()) {
      throw new BadRequestException('userId é obrigatório');
    }

    if (!newPassword || newPassword.trim().length < 6) {
      throw new BadRequestException(
        'A nova senha deve ter pelo menos 6 caracteres',
      );
    }

    const targetUser = await this.usersService.findById(targetUserId);

    if (!targetUser) {
      throw new BadRequestException('Usuário alvo não encontrado');
    }

    if (currentUser.role === 'SUPERUSUARIO') {
      const passwordHash = await bcrypt.hash(newPassword.trim(), 10);
      return this.usersService.updatePassword(targetUserId, passwordHash);
    }

    if (currentUser.role === 'ADMIN_ESCOLA') {
      if (!currentUser.schoolId) {
        throw new ForbiddenException('Admin sem escola vinculada');
      }

      if (targetUser.schoolId !== currentUser.schoolId) {
        throw new ForbiddenException(
          'Você só pode resetar senha de usuários da sua escola',
        );
      }

      if (targetUser.role === 'SUPERUSUARIO') {
        throw new ForbiddenException(
          'Admin da escola não pode alterar senha de superusuário',
        );
      }

      const passwordHash = await bcrypt.hash(newPassword.trim(), 10);
      return this.usersService.updatePassword(targetUserId, passwordHash);
    }

    throw new ForbiddenException('Sem permissão para resetar senha');
  }
}
