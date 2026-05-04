import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { FrequenciaStatus, PeriodoAvaliacao, UserRole } from "@prisma/client";
import { PrismaService } from "src/prisma/prisma.service";
import * as bcrypt from "bcrypt";
import { FinanceiroService } from "src/financeiro/financeiro.service";
import { ComunicacaoService } from "src/comunicacao/comunicacao.service";

@Injectable()
export class AlunosService {
  constructor(
    private prisma: PrismaService,
    private financeiroService: FinanceiroService,
    private comunicacaoService: ComunicacaoService
  ) {}

  private async findAlunoUserByEmailOrName(data: {
    schoolId: string;
    alunoEmail?: string;
    alunoName: string;
  }) {
    const emailNormalizado = data.alunoEmail?.trim().toLowerCase();

    if (emailNormalizado) {
      return this.prisma.user.findUnique({
        where: {
          email: emailNormalizado,
        },
      });
    }

    return this.prisma.user.findFirst({
      where: {
        role: "ALUNO",
        schoolId: data.schoolId,
        name: data.alunoName,
      },
    });
  }

  private async upsertAlunoUser(data: {
    schoolId: string;
    alunoName: string;
    alunoEmail?: string;
    alunoPassword?: string;
    alunoAtivo?: boolean;
  }) {
    const emailNormalizado = data.alunoEmail?.trim().toLowerCase();

    if (!emailNormalizado) {
      return null;
    }

    const userExistente = await this.prisma.user.findUnique({
      where: {
        email: emailNormalizado,
      },
    });

    const isActive = data.alunoAtivo ?? true;
    const nomeUsuario = data.alunoName.trim();

    if (userExistente) {
      if (userExistente.role !== "ALUNO") {
        throw new BadRequestException(
          "JÃ¡ existe um usuÃ¡rio com este e-mail e ele nÃ£o Ã© do tipo ALUNO."
        );
      }

      if (userExistente.schoolId !== data.schoolId) {
        throw new BadRequestException(
          "JÃ¡ existe um aluno com este e-mail vinculado a outra escola."
        );
      }

      const updateData: any = {
        name: nomeUsuario,
        schoolId: data.schoolId,
        isActive,
        isActivated: true,
      };

      if (data.alunoPassword?.trim()) {
        updateData.passwordHash = await bcrypt.hash(data.alunoPassword.trim(), 10);
      }

      return this.prisma.user.update({
        where: {
          id: userExistente.id,
        },
        data: updateData,
      });
    }

    if (!data.alunoPassword?.trim()) {
      throw new BadRequestException(
        "Informe a senha do aluno ao cadastrar um e-mail de acesso."
      );
    }

    const passwordHash = await bcrypt.hash(data.alunoPassword.trim(), 10);

    return this.prisma.user.create({
      data: {
        name: nomeUsuario,
        email: emailNormalizado,
        passwordHash,
        role: "ALUNO",
        schoolId: data.schoolId,
        isActive,
        isActivated: true,
        activationToken: null,
        activationExpires: null,
      },
    });
  }

  async create(data: {
    name: string;
    matricula?: string;
    responsavel?: string;
    turmaId: string;
    schoolId: string;
    responsavelNome?: string;
    responsavelEmail?: string;
    responsavelTelefone?: string;
    responsavelEndereco?: string;
    parentesco?: string;
    responsavelFinanceiro?: boolean;
    alunoEmail?: string;
    alunoPassword?: string;
    alunoAtivo?: boolean;
  }) {
    const turma = await this.prisma.turma.findFirst({
      where: {
        id: data.turmaId,
        schoolId: data.schoolId,
      },
    });

    if (!turma) {
      throw new NotFoundException("Turma nÃ£o encontrada para esta escola.");
    }

    const matriculaNormalizada = data.matricula?.trim();
    const alunoEmailNormalizado = data.alunoEmail?.trim().toLowerCase();

    if (matriculaNormalizada) {
      const matriculaExistente = await this.prisma.aluno.findFirst({
        where: {
          matricula: matriculaNormalizada,
          schoolId: data.schoolId,
        },
        select: {
          id: true,
          name: true,
        },
      });

      if (matriculaExistente) {
        throw new BadRequestException(
          `JÃ¡ existe um aluno com a matrÃ­cula "${matriculaNormalizada}" nesta escola.`
        );
      }
    }

    if (alunoEmailNormalizado) {
      const usuarioComMesmoEmail = await this.prisma.user.findUnique({
        where: {
          email: alunoEmailNormalizado,
        },
        include: {
          alunoPerfil: {
            select: {
              id: true,
            },
          },
        },
      });

      if (usuarioComMesmoEmail) {
        if (usuarioComMesmoEmail.role !== "ALUNO") {
          throw new BadRequestException(
            "JÃ¡ existe um usuÃ¡rio com este e-mail e ele nÃ£o Ã© do tipo ALUNO."
          );
        }

        if (usuarioComMesmoEmail.schoolId !== data.schoolId) {
          throw new BadRequestException(
            "JÃ¡ existe um aluno com este e-mail vinculado a outra escola."
          );
        }

        if (usuarioComMesmoEmail.alunoPerfil) {
          throw new BadRequestException(
            "JÃ¡ existe um aluno com este e-mail nesta escola."
          );
        }
      }
    }

    const aluno = await this.prisma.aluno.create({
      data: {
        name: data.name,
        matricula: matriculaNormalizada,
        responsavel: data.responsavel || data.responsavelNome,
        turmaId: data.turmaId,
        schoolId: data.schoolId,
        status: data.alunoAtivo === false ? "INATIVO" : "ATIVO",
      },
      include: {
        turma: true,
      },
    });

    if (alunoEmailNormalizado) {
      const alunoUser = await this.upsertAlunoUser({
        schoolId: data.schoolId,
        alunoName: data.name,
        alunoEmail: alunoEmailNormalizado,
        alunoPassword: data.alunoPassword,
        alunoAtivo: data.alunoAtivo,
      });

      if (alunoUser) {
        await this.prisma.aluno.update({
          where: {
            id: aluno.id,
          },
          data: {
            userId: alunoUser.id,
          },
        });
      }
    }

    const nomeResponsavel = data.responsavelNome?.trim();
    const emailResponsavel = data.responsavelEmail?.trim().toLowerCase();
    const telefoneResponsavel = data.responsavelTelefone?.trim();
    const enderecoResponsavel = data.responsavelEndereco?.trim();
    const parentesco = data.parentesco?.trim();
    const responsavelFinanceiro = !!data.responsavelFinanceiro;

    const temAlgumDadoDeResponsavel =
      !!nomeResponsavel ||
      !!emailResponsavel ||
      !!telefoneResponsavel ||
      !!enderecoResponsavel ||
      !!parentesco ||
      responsavelFinanceiro;

    if (!temAlgumDadoDeResponsavel) {
      await this.comunicacaoService.syncGrupoTurmaMembers({
        turmaId: data.turmaId,
        schoolId: data.schoolId,
        createdById: aluno.userId || null,
      });
      await this.financeiroService.gerarCobrancaAlunoMes(aluno.id, data.schoolId);
      return this.findByIdWithRelations(aluno.id, data.schoolId);
    }

    if (!nomeResponsavel) {
      throw new BadRequestException(
        "Informe o nome do responsÃ¡vel para vincular ao aluno."
      );
    }

    let responsavelUser: any = null;

    if (emailResponsavel) {
      responsavelUser = await this.prisma.user.findUnique({
        where: {
          email: emailResponsavel,
        },
      });

      if (responsavelUser && responsavelUser.role !== "RESPONSAVEL") {
        throw new BadRequestException(
          "JÃ¡ existe um usuÃ¡rio com este e-mail e ele nÃ£o Ã© do tipo RESPONSAVEL."
        );
      }

      if (responsavelUser && responsavelUser.schoolId !== data.schoolId) {
        throw new BadRequestException(
          "JÃ¡ existe um responsÃ¡vel com este e-mail vinculado a outra escola."
        );
      }
    }

    if (!responsavelUser && nomeResponsavel) {
      responsavelUser = await this.prisma.user.findFirst({
        where: {
          name: nomeResponsavel,
          role: "RESPONSAVEL",
          schoolId: data.schoolId,
        },
      });
    }

    if (!responsavelUser) {
      const emailParaCadastro =
        emailResponsavel || `responsavel.${aluno.id}@placeholder.local`;

      responsavelUser = await this.prisma.user.create({
        data: {
          name: nomeResponsavel,
          email: emailParaCadastro,
          passwordHash: "PENDENTE_CADASTRO",
          role: "RESPONSAVEL",
          schoolId: data.schoolId,
          phone: telefoneResponsavel,
          address: enderecoResponsavel,
          isActive: true,
          isActivated: false,
        },
      });
    } else {
      responsavelUser = await this.prisma.user.update({
        where: {
          id: responsavelUser.id,
        },
        data: {
          name: nomeResponsavel,
          phone: telefoneResponsavel || responsavelUser.phone,
          address: enderecoResponsavel || responsavelUser.address,
          schoolId: data.schoolId,
        },
      });
    }

    const vinculoExistente = await this.prisma.alunoResponsavel.findFirst({
      where: {
        alunoId: aluno.id,
        responsavelId: responsavelUser.id,
      },
    });

    if (!vinculoExistente) {
      await this.prisma.alunoResponsavel.create({
        data: {
          alunoId: aluno.id,
          responsavelId: responsavelUser.id,
          parentesco: parentesco || undefined,
          isFinanceiro: responsavelFinanceiro,
        },
      });
    }

    await this.comunicacaoService.syncGrupoTurmaMembers({
      turmaId: data.turmaId,
      schoolId: data.schoolId,
      createdById: aluno.userId || responsavelUser.id || null,
    });

    await this.financeiroService.gerarCobrancaAlunoMes(aluno.id, data.schoolId);

    return this.findByIdWithRelations(aluno.id, data.schoolId);
  }

  private periodoDateRange(periodo: PeriodoAvaliacao, ano?: number) {
    const year = Number.isInteger(ano) ? Number(ano) : new Date().getFullYear();
    const ranges: Record<PeriodoAvaliacao, [number, number]> = {
      PRIMEIRO: [0, 2],
      SEGUNDO: [3, 5],
      TERCEIRO: [6, 8],
      QUARTO: [9, 11],
    };
    const [startMonth, endMonth] = ranges[periodo];

    return {
      inicio: new Date(Date.UTC(year, startMonth, 1, 0, 0, 0, 0)),
      fim: new Date(Date.UTC(year, endMonth + 1, 0, 23, 59, 59, 999)),
    };
  }

  async update(data: {
    id: string;
    schoolId?: string;
    isSuperuser?: boolean;
    name: string;
    matricula?: string;
    responsavel?: string;
    turmaId: string;
    responsavelNome?: string;
    responsavelEmail?: string;
    responsavelTelefone?: string;
    responsavelEndereco?: string;
    parentesco?: string;
    responsavelFinanceiro?: boolean;
    alunoEmail?: string;
    alunoPassword?: string;
    alunoAtivo?: boolean;
  }) {
    const alunoAtual = await this.prisma.aluno.findFirst({
      where: data.isSuperuser
        ? { id: data.id }
        : { id: data.id, schoolId: data.schoolId },
      include: {
        user: true,
        responsaveis: {
          include: {
            responsavel: true,
          },
        },
      },
    });

    if (!alunoAtual) {
      throw new NotFoundException("Aluno nÃ£o encontrado.");
    }

    const schoolIdValido = alunoAtual.schoolId;

    const turma = await this.prisma.turma.findFirst({
      where: {
        id: data.turmaId,
        schoolId: schoolIdValido,
      },
    });

    if (!turma) {
      throw new NotFoundException("Turma nÃ£o encontrada para esta escola.");
    }

    const matriculaNormalizada = data.matricula?.trim();
    const alunoEmailNormalizado = data.alunoEmail?.trim().toLowerCase();

    if (matriculaNormalizada) {
      const matriculaExistente = await this.prisma.aluno.findFirst({
        where: {
          matricula: matriculaNormalizada,
          schoolId: schoolIdValido,
          NOT: {
            id: data.id,
          },
        },
        select: {
          id: true,
          name: true,
        },
      });

      if (matriculaExistente) {
        throw new BadRequestException(
          `JÃ¡ existe outro aluno com a matrÃ­cula "${matriculaNormalizada}" nesta escola.`
        );
      }
    }

    if (alunoEmailNormalizado) {
      const usuarioComMesmoEmail = await this.prisma.user.findUnique({
        where: {
          email: alunoEmailNormalizado,
        },
        include: {
          alunoPerfil: {
            select: {
              id: true,
            },
          },
        },
      });

      if (
        usuarioComMesmoEmail &&
        usuarioComMesmoEmail.role !== "ALUNO"
      ) {
        throw new BadRequestException(
          "JÃ¡ existe um usuÃ¡rio com este e-mail e ele nÃ£o Ã© do tipo ALUNO."
        );
      }

      if (
        usuarioComMesmoEmail &&
        usuarioComMesmoEmail.schoolId !== schoolIdValido
      ) {
        throw new BadRequestException(
          "JÃ¡ existe um aluno com este e-mail vinculado a outra escola."
        );
      }

      if (
        usuarioComMesmoEmail?.alunoPerfil &&
        usuarioComMesmoEmail.alunoPerfil.id !== data.id
      ) {
        throw new BadRequestException(
          "JÃ¡ existe outro aluno usando este e-mail nesta escola."
        );
      }
    }

    await this.prisma.aluno.update({
      where: { id: data.id },
      data: {
        name: data.name,
        matricula: matriculaNormalizada,
        responsavel: data.responsavel || data.responsavelNome,
        turmaId: data.turmaId,
        status: data.alunoAtivo === false ? "INATIVO" : "ATIVO",
      },
    });

    if (alunoEmailNormalizado) {
      const alunoUser = await this.upsertAlunoUser({
        schoolId: schoolIdValido,
        alunoName: data.name,
        alunoEmail: alunoEmailNormalizado,
        alunoPassword: data.alunoPassword,
        alunoAtivo: data.alunoAtivo,
      });

      if (alunoUser) {
        await this.prisma.aluno.update({
          where: {
            id: data.id,
          },
          data: {
            userId: alunoUser.id,
          },
        });
      }
    } else {
      const usuarioAluno =
        alunoAtual.user ||
        (await this.findAlunoUserByEmailOrName({
          schoolId: schoolIdValido,
          alunoName: alunoAtual.name,
        }));

      if (usuarioAluno && usuarioAluno.role === "ALUNO") {
        await this.prisma.user.update({
          where: {
            id: usuarioAluno.id,
          },
          data: {
            name: data.name,
            isActive: data.alunoAtivo === false ? false : true,
          },
        });
      }
    }

    const nomeResponsavel = data.responsavelNome?.trim();
    const emailResponsavel = data.responsavelEmail?.trim().toLowerCase();
    const telefoneResponsavel = data.responsavelTelefone?.trim();
    const enderecoResponsavel = data.responsavelEndereco?.trim();
    const parentesco = data.parentesco?.trim();
    const responsavelFinanceiro = !!data.responsavelFinanceiro;

    const temAlgumDadoDeResponsavel =
      !!nomeResponsavel ||
      !!emailResponsavel ||
      !!telefoneResponsavel ||
      !!enderecoResponsavel ||
      !!parentesco ||
      responsavelFinanceiro;

    if (!temAlgumDadoDeResponsavel) {
      await this.comunicacaoService.syncGrupoTurmaMembers({
        turmaId: data.turmaId,
        schoolId: schoolIdValido,
        createdById: alunoAtual.userId || null,
      });

      if (alunoAtual.turmaId !== data.turmaId) {
        await this.comunicacaoService.syncGrupoTurmaMembers({
          turmaId: alunoAtual.turmaId,
          schoolId: schoolIdValido,
          createdById: alunoAtual.userId || null,
        });
      }

      return this.findByIdWithRelations(data.id, schoolIdValido);
    }

    if (!nomeResponsavel) {
      throw new BadRequestException(
        "Informe o nome do responsÃ¡vel para vincular ao aluno."
      );
    }

    let responsavelUser: any = null;

    if (emailResponsavel) {
      responsavelUser = await this.prisma.user.findUnique({
        where: {
          email: emailResponsavel,
        },
      });

      if (responsavelUser && responsavelUser.role !== "RESPONSAVEL") {
        throw new BadRequestException(
          "JÃ¡ existe um usuÃ¡rio com este e-mail e ele nÃ£o Ã© do tipo RESPONSAVEL."
        );
      }

      if (responsavelUser && responsavelUser.schoolId !== schoolIdValido) {
        throw new BadRequestException(
          "JÃ¡ existe um responsÃ¡vel com este e-mail vinculado a outra escola."
        );
      }
    }

    if (!responsavelUser && nomeResponsavel) {
      responsavelUser = await this.prisma.user.findFirst({
        where: {
          name: nomeResponsavel,
          role: "RESPONSAVEL",
          schoolId: schoolIdValido,
        },
      });
    }

    const vinculoAtual = alunoAtual.responsaveis?.[0] || null;
    const responsavelAtual = vinculoAtual?.responsavel || null;

    if (!responsavelUser) {
      if (
        responsavelAtual &&
        responsavelAtual.role === "RESPONSAVEL" &&
        responsavelAtual.schoolId === schoolIdValido
      ) {
        const emailDesejado =
          emailResponsavel ||
          (responsavelAtual.email?.includes("@placeholder.local")
            ? responsavelAtual.email
            : responsavelAtual.email);

        if (emailDesejado && emailDesejado !== responsavelAtual.email) {
          const outroUsuarioComMesmoEmail = await this.prisma.user.findUnique({
            where: {
              email: emailDesejado,
            },
          });

          if (
            outroUsuarioComMesmoEmail &&
            outroUsuarioComMesmoEmail.id !== responsavelAtual.id
          ) {
            if (outroUsuarioComMesmoEmail.role !== "RESPONSAVEL") {
              throw new BadRequestException(
                "JÃ¡ existe um usuÃ¡rio com este e-mail e ele nÃ£o Ã© do tipo RESPONSAVEL."
              );
            }

            if (outroUsuarioComMesmoEmail.schoolId !== schoolIdValido) {
              throw new BadRequestException(
                "JÃ¡ existe um responsÃ¡vel com este e-mail vinculado a outra escola."
              );
            }

            responsavelUser = outroUsuarioComMesmoEmail;
          }
        }

        if (!responsavelUser) {
          responsavelUser = await this.prisma.user.update({
            where: {
              id: responsavelAtual.id,
            },
            data: {
              name: nomeResponsavel,
              email:
                emailResponsavel ||
                responsavelAtual.email ||
                `responsavel.${data.id}@placeholder.local`,
              phone: telefoneResponsavel || responsavelAtual.phone,
              address: enderecoResponsavel || responsavelAtual.address,
              schoolId: schoolIdValido,
            },
          });
        }
      } else {
        const emailParaCadastro =
          emailResponsavel || `responsavel.${data.id}@placeholder.local`;

        responsavelUser = await this.prisma.user.create({
          data: {
            name: nomeResponsavel,
            email: emailParaCadastro,
            passwordHash: "PENDENTE_CADASTRO",
            role: "RESPONSAVEL",
            schoolId: schoolIdValido,
            phone: telefoneResponsavel,
            address: enderecoResponsavel,
            isActive: true,
            isActivated: false,
          },
        });
      }
    } else {
      responsavelUser = await this.prisma.user.update({
        where: {
          id: responsavelUser.id,
        },
        data: {
          name: nomeResponsavel,
          phone: telefoneResponsavel || responsavelUser.phone,
          address: enderecoResponsavel || responsavelUser.address,
          schoolId: schoolIdValido,
        },
      });
    }

    await this.prisma.alunoResponsavel.deleteMany({
      where: {
        alunoId: data.id,
        NOT: {
          responsavelId: responsavelUser.id,
        },
      },
    });

    const vinculoExistente = await this.prisma.alunoResponsavel.findFirst({
      where: {
        alunoId: data.id,
        responsavelId: responsavelUser.id,
      },
    });

    if (!vinculoExistente) {
      await this.prisma.alunoResponsavel.create({
        data: {
          alunoId: data.id,
          responsavelId: responsavelUser.id,
          parentesco: parentesco || undefined,
          isFinanceiro: responsavelFinanceiro,
        },
      });
    } else {
      await this.prisma.alunoResponsavel.update({
        where: {
          id: vinculoExistente.id,
        },
        data: {
          parentesco: parentesco || undefined,
          isFinanceiro: responsavelFinanceiro,
        },
      });
    }

    await this.comunicacaoService.syncGrupoTurmaMembers({
      turmaId: data.turmaId,
      schoolId: schoolIdValido,
      createdById: alunoAtual.userId || responsavelUser?.id || null,
    });

    if (alunoAtual.turmaId !== data.turmaId) {
      await this.comunicacaoService.syncGrupoTurmaMembers({
        turmaId: alunoAtual.turmaId,
        schoolId: schoolIdValido,
        createdById: alunoAtual.userId || responsavelUser?.id || null,
      });
    }

    return this.findByIdWithRelations(data.id, schoolIdValido);
  }

  async deleteAluno(data: {
    id: string;
    schoolId?: string;
    isSuperuser?: boolean;
  }) {
    const aluno = await this.prisma.aluno.findFirst({
      where: data.isSuperuser
        ? { id: data.id }
        : { id: data.id, schoolId: data.schoolId },
      select: {
        id: true,
        name: true,
        schoolId: true,
        userId: true,
      },
    });

    if (!aluno) {
      throw new NotFoundException("Aluno nÃ£o encontrado.");
    }

    const usuarioAluno = aluno.userId
      ? await this.prisma.user.findUnique({
          where: {
            id: aluno.userId,
          },
        })
      : await this.findAlunoUserByEmailOrName({
          schoolId: aluno.schoolId,
          alunoName: aluno.name,
        });

    if (usuarioAluno && usuarioAluno.role === "ALUNO") {
      await this.prisma.user.delete({
        where: {
          id: usuarioAluno.id,
        },
      });
    }

    await this.prisma.aluno.delete({
      where: { id: data.id },
    });

    return {
      message: "Aluno excluÃ­do com sucesso.",
      alunoId: aluno.id,
      alunoNome: aluno.name,
    };
  }

  async searchResponsaveis(data: {
    schoolId: string;
    term: string;
  }) {
    const termo = data.term.trim();

    if (!termo) {
      return [];
    }

    return this.prisma.user.findMany({
      where: {
        schoolId: data.schoolId,
        role: "RESPONSAVEL",
        name: {
          contains: termo,
          mode: "insensitive",
        },
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        address: true,
      },
      orderBy: {
        name: "asc",
      },
      take: 10,
    });
  }

  async findAll(data: {
    schoolId?: string;
    isSuperuser?: boolean;
    userId?: string;
    userRole?: UserRole;
  }) {
    const where: any =
      data.isSuperuser && data.schoolId
        ? { schoolId: data.schoolId }
        : data.schoolId
        ? { schoolId: data.schoolId }
        : null;

    if (!where) {
      throw new ForbiddenException("UsuÃ¡rio sem escola vinculada.");
    }

    if (data.userRole === UserRole.PROFESSOR) {
      where.turma = {
        professores: {
          some: {
            professorId: data.userId,
          },
        },
      };
    }

    const alunos = await this.prisma.aluno.findMany({
      where,
      include: {
        user: true,
        turma: true,
        responsaveis: {
          include: {
            responsavel: {
              select: {
                id: true,
                name: true,
                email: true,
                phone: true,
                address: true,
                role: true,
                schoolId: true,
              },
            },
          },
        },
        documentos: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return Promise.all(
      alunos.map(async (aluno) => {
        const usuarioAluno =
          aluno.user ||
          (await this.findAlunoUserByEmailOrName({
            schoolId: aluno.schoolId,
            alunoName: aluno.name,
          }));

        return {
          ...aluno,
          alunoUserId:
            usuarioAluno?.role === "ALUNO" ? usuarioAluno.id : null,
          alunoEmail:
            usuarioAluno?.role === "ALUNO" ? usuarioAluno.email : "",
          alunoAtivo:
            usuarioAluno?.role === "ALUNO"
              ? usuarioAluno.isActive
              : String(aluno.status || "").toUpperCase() === "ATIVO",
        };
      })
    );
  }

  async getProfessorAlunoVisao(data: {
    alunoId: string;
    schoolId: string;
    professorId?: string;
    periodo?: PeriodoAvaliacao;
    ano?: number;
  }) {
    const periodo = data.periodo || PeriodoAvaliacao.PRIMEIRO;
    const { inicio, fim } = this.periodoDateRange(periodo, data.ano);
    const professorFilter = data.professorId
      ? {
          professorId: data.professorId,
        }
      : {};

    const aluno = await this.prisma.aluno.findFirst({
      where: {
        id: data.alunoId,
        schoolId: data.schoolId,
        ...(data.professorId
          ? {
              turma: {
                professores: {
                  some: {
                    professorId: data.professorId,
                  },
                },
              },
            }
          : {}),
      },
      include: {
        turma: {
          select: {
            id: true,
            name: true,
            turno: true,
            professores: {
              where: professorFilter,
              select: {
                id: true,
                disciplina: true,
                cargaHoraria: true,
              },
              orderBy: {
                disciplina: "asc",
              },
            },
          },
        },
      },
    });

    if (!aluno) {
      throw new NotFoundException(
        data.professorId
          ? "Aluno não encontrado para este professor."
          : "Aluno não encontrado.",
      );
    }

    const turmaProfessorIds = aluno.turma.professores.map((item) => item.id);

    const [itens, notasFinais, frequencias, agendamentos] = await Promise.all([
      this.prisma.avaliacaoItem.findMany({
        where: {
          alunoId: aluno.id,
          schoolId: data.schoolId,
          ...(data.professorId ? { professorId: data.professorId } : {}),
          turmaProfessorId: { in: turmaProfessorIds },
          periodo,
        },
        include: {
          atividadeModelo: {
            select: {
              id: true,
              titulo: true,
              tipoAtividade: true,
              valorMaximo: true,
              ordem: true,
            },
          },
          turmaProfessor: {
            select: {
              id: true,
              disciplina: true,
            },
          },
        },
        orderBy: [
          { turmaProfessor: { disciplina: "asc" } },
          { atividadeModelo: { ordem: "asc" } },
          { createdAt: "asc" },
        ],
      }),
      this.prisma.notaBoletim.findMany({
        where: {
          alunoId: aluno.id,
          schoolId: data.schoolId,
          ...(data.professorId ? { professorId: data.professorId } : {}),
          turmaProfessorId: { in: turmaProfessorIds },
          periodo,
        },
        include: {
          turmaProfessor: {
            select: {
              id: true,
              disciplina: true,
            },
          },
        },
        orderBy: {
          turmaProfessor: {
            disciplina: "asc",
          },
        },
      }),
      this.prisma.frequencia.findMany({
        where: {
          alunoId: aluno.id,
          schoolId: data.schoolId,
          ...(data.professorId ? { professorId: data.professorId } : {}),
          turmaProfessorId: { in: turmaProfessorIds },
          dataLancamento: {
            gte: inicio,
            lte: fim,
          },
        },
        include: {
          turmaProfessor: {
            select: {
              id: true,
              disciplina: true,
            },
          },
        },
        orderBy: [
          { dataLancamento: "desc" },
          { turmaProfessor: { disciplina: "asc" } },
        ],
      }),
      this.prisma.professorAgenda.findMany({
        where: {
          schoolId: data.schoolId,
          ...(data.professorId ? { professorId: data.professorId } : {}),
          turmaId: aluno.turmaId,
          data: {
            gte: inicio,
            lte: fim,
          },
        },
        orderBy: [{ data: "asc" }, { createdAt: "asc" }],
      }),
    ]);

    const faltas = frequencias.filter(
      (item) => item.status === FrequenciaStatus.FALTA
    );

    return {
      aluno: {
        id: aluno.id,
        name: aluno.name,
        matricula: aluno.matricula,
        turma: aluno.turma,
      },
      periodo,
      ano: data.ano || new Date().getFullYear(),
      disciplinas: aluno.turma.professores,
      notas: {
        itens,
        finais: notasFinais,
      },
      frequencias,
      resumoFrequencia: {
        total: frequencias.length,
        presencas: frequencias.filter(
          (item) => item.status === FrequenciaStatus.PRESENTE
        ).length,
        faltas: faltas.length,
        faltasJustificadas: faltas.filter((item) => item.faltaJustificada).length,
      },
      agendamentos,
    };
  }

  async updateStatus(data: {
    id: string;
    schoolId?: string;
    isSuperuser?: boolean;
    status: string;
  }) {
    const aluno = await this.prisma.aluno.findFirst({
      where: data.isSuperuser
        ? {
            id: data.id,
          }
        : {
            id: data.id,
            schoolId: data.schoolId,
          },
    });

    if (!aluno) {
      throw new NotFoundException("Aluno nÃ£o encontrado.");
    }

    const alunoAtualizado = await this.prisma.aluno.update({
      where: {
        id: data.id,
      },
      data: {
        status: data.status,
      },
      include: {
        user: true,
        turma: true,
        responsaveis: {
          include: {
            responsavel: {
              select: {
                id: true,
                name: true,
                email: true,
                phone: true,
                address: true,
                role: true,
                schoolId: true,
              },
            },
          },
        },
      },
    });

    const usuarioAluno =
      alunoAtualizado.user ||
      (await this.findAlunoUserByEmailOrName({
        schoolId: aluno.schoolId,
        alunoName: aluno.name,
      }));

    if (usuarioAluno && usuarioAluno.role === "ALUNO") {
      await this.prisma.user.update({
        where: {
          id: usuarioAluno.id,
        },
        data: {
          isActive: String(data.status || "").toUpperCase() === "ATIVO",
          name: alunoAtualizado.name,
        },
      });
    }

    return alunoAtualizado;
  }

  async updateFoto(data: {
    id: string;
    schoolId?: string;
    isSuperuser?: boolean;
    fotoUrl: string;
  }) {
    const aluno = await this.prisma.aluno.findFirst({
      where: data.isSuperuser
        ? { id: data.id }
        : { id: data.id, schoolId: data.schoolId },
    });

    if (!aluno) {
      throw new NotFoundException("Aluno nÃ£o encontrado.");
    }

    return this.prisma.aluno.update({
      where: { id: data.id },
      data: {
        fotoUrl: data.fotoUrl,
      },
    });
  }

  async listDocumentos(data: {
    id: string;
    schoolId?: string;
    isSuperuser?: boolean;
  }) {
    const aluno = await this.prisma.aluno.findFirst({
      where: data.isSuperuser
        ? { id: data.id }
        : { id: data.id, schoolId: data.schoolId },
    });

    if (!aluno) {
      throw new NotFoundException("Aluno nÃ£o encontrado.");
    }

    return this.prisma.alunoDocumento.findMany({
      where: {
        alunoId: data.id,
      },
      orderBy: {
        createdAt: "desc",
      },
    });
  }

  async createDocumento(data: {
    alunoId: string;
    schoolId?: string;
    isSuperuser?: boolean;
    tipo: any;
    nomeOriginal: string;
    arquivoUrl: string;
    mimeType?: string;
    observacao?: string;
  }) {
    const aluno = await this.prisma.aluno.findFirst({
      where: data.isSuperuser
        ? { id: data.alunoId }
        : { id: data.alunoId, schoolId: data.schoolId },
    });

    if (!aluno) {
      throw new NotFoundException("Aluno nÃ£o encontrado.");
    }

    return this.prisma.alunoDocumento.create({
      data: {
        alunoId: data.alunoId,
        tipo: data.tipo,
        nomeOriginal: data.nomeOriginal,
        arquivoUrl: data.arquivoUrl,
        mimeType: data.mimeType,
        observacao: data.observacao,
      },
    });
  }

  async findDocumentoById(data: {
    docId: string;
    schoolId: string;
  }) {
    const documento = await this.prisma.alunoDocumento.findFirst({
      where: {
        id: data.docId,
        aluno: {
          schoolId: data.schoolId,
        },
      },
      include: {
        aluno: {
          select: {
            id: true,
            name: true,
            schoolId: true,
          },
        },
      },
    });

    if (!documento) {
      throw new NotFoundException("Documento nÃ£o encontrado.");
    }

    return documento;
  }

  async deleteDocumento(data: {
    docId: string;
    schoolId: string;
  }) {
    const documento = await this.prisma.alunoDocumento.findFirst({
      where: {
        id: data.docId,
        aluno: {
          schoolId: data.schoolId,
        },
      },
      select: {
        id: true,
        arquivoUrl: true,
        nomeOriginal: true,
      },
    });

    if (!documento) {
      throw new NotFoundException("Documento nÃ£o encontrado.");
    }

    await this.prisma.alunoDocumento.delete({
      where: {
        id: data.docId,
      },
    });

    return {
      message: "Documento excluÃ­do com sucesso.",
      documentoId: documento.id,
      arquivoUrl: documento.arquivoUrl,
      nomeOriginal: documento.nomeOriginal,
    };
  }

  async findByIdWithRelations(id: string, schoolId: string) {
    const aluno = await this.prisma.aluno.findFirst({
      where: {
        id,
        schoolId,
      },
      include: {
        user: true,
        turma: true,
        responsaveis: {
          include: {
            responsavel: {
              select: {
                id: true,
                name: true,
                email: true,
                phone: true,
                address: true,
                role: true,
                schoolId: true,
              },
            },
          },
        },
        documentos: true,
      },
    });

    if (!aluno) {
      throw new NotFoundException("Aluno nÃ£o encontrado.");
    }

    const usuarioAluno =
      aluno.user ||
      (await this.findAlunoUserByEmailOrName({
        schoolId,
        alunoName: aluno.name,
      }));

    return {
      ...aluno,
      alunoUserId:
        usuarioAluno?.role === "ALUNO" ? usuarioAluno.id : null,
      alunoEmail:
        usuarioAluno?.role === "ALUNO" ? usuarioAluno.email : "",
      alunoAtivo:
        usuarioAluno?.role === "ALUNO"
          ? usuarioAluno.isActive
          : String(aluno.status || "").toUpperCase() === "ATIVO",
    };
  }
}

