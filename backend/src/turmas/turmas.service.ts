import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { PrismaService } from "src/prisma/prisma.service";
import { ComunicacaoService } from "src/comunicacao/comunicacao.service";

@Injectable()
export class TurmasService {
  constructor(
    private prisma: PrismaService,
    private readonly comunicacaoService: ComunicacaoService
  ) {}

  async create(data: {
    name: string;
    turno?: string;
    schoolId: string;
  }) {
    if (!data.name?.trim()) {
      throw new BadRequestException("Informe o nome da turma.");
    }

    return this.prisma.turma.create({
      data: {
        ...data,
        name: data.name.trim(),
      },
    });
  }

  async update(
    id: string,
    data: {
      schoolId: string;
      name?: string;
      turno?: string;
    },
  ) {
    if (!id?.trim()) {
      throw new BadRequestException("Turma nao informada.");
    }

    const turma = await this.prisma.turma.findFirst({
      where: {
        id: id.trim(),
        schoolId: data.schoolId,
      },
      select: {
        id: true,
      },
    });

    if (!turma) {
      throw new BadRequestException("Turma nao encontrada.");
    }

    const updateData: { name?: string; turno?: string } = {};

    if (data.name !== undefined) {
      if (!data.name.trim()) {
        throw new BadRequestException("Informe o nome da turma.");
      }

      updateData.name = data.name.trim();
    }

    if (data.turno !== undefined) {
      updateData.turno = data.turno;
    }

    return this.prisma.turma.update({
      where: {
        id: turma.id,
      },
      data: updateData,
    });
  }

  async findAll(data: {
    schoolId?: string;
    isSuperuser?: boolean;
    userId?: string;
    userRole?: UserRole;
  }) {
    let where: any =
      data.isSuperuser && data.schoolId
        ? { schoolId: data.schoolId }
        : data.schoolId
        ? { schoolId: data.schoolId }
        : null;

    if (!where) {
      throw new ForbiddenException("Nenhuma escola selecionada.");
    }

    if (data.userRole === UserRole.PROFESSOR) {
      where = {
        ...where,
        professores: {
          some: {
            professorId: data.userId,
          },
        },
      };
    }

    return this.prisma.turma.findMany({
      where,
      include: {
        alunos: {
          where: {
            status: "ATIVO",
          },
          select: {
            id: true,
            name: true,
            matricula: true,
            fotoUrl: true,
            userId: true,
            status: true,
          },
          orderBy: {
            name: "asc",
          },
        },
        professores: {
          include: {
            professor: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
          orderBy: {
            disciplina: "asc",
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async promoverAlunosEmMassa(data: {
    schoolId: string;
    turmaOrigemId: string;
    turmaDestinoId: string;
    alunoIds: string[];
    userId?: string;
  }) {
    if (!data.schoolId) {
      throw new ForbiddenException("Nenhuma escola selecionada.");
    }

    if (!data.turmaOrigemId?.trim()) {
      throw new BadRequestException("Informe a turma de origem.");
    }

    if (!data.turmaDestinoId?.trim()) {
      throw new BadRequestException("Informe a turma de destino.");
    }

    if (data.turmaOrigemId === data.turmaDestinoId) {
      throw new BadRequestException(
        "A turma de origem e a turma de destino não podem ser iguais."
      );
    }

    if (!Array.isArray(data.alunoIds) || data.alunoIds.length === 0) {
      throw new BadRequestException(
        "Selecione pelo menos um aluno para promover."
      );
    }

    const turmaOrigem = await this.prisma.turma.findFirst({
      where: {
        id: data.turmaOrigemId,
        schoolId: data.schoolId,
      },
    });

    if (!turmaOrigem) {
      throw new BadRequestException("Turma de origem não encontrada.");
    }

    const turmaDestino = await this.prisma.turma.findFirst({
      where: {
        id: data.turmaDestinoId,
        schoolId: data.schoolId,
      },
    });

    if (!turmaDestino) {
      throw new BadRequestException("Turma de destino não encontrada.");
    }

    const alunos = await this.prisma.aluno.findMany({
      where: {
        id: {
          in: data.alunoIds,
        },
        schoolId: data.schoolId,
      },
      select: {
        id: true,
        name: true,
        matricula: true,
        turmaId: true,
        userId: true,
      },
      orderBy: {
        name: "asc",
      },
    });

    const promoted: any[] = [];
    const skipped: any[] = [];
    const failed: any[] = [];

    for (const aluno of alunos) {
      if (aluno.turmaId !== data.turmaOrigemId) {
        skipped.push({
          nome: aluno.name,
          matricula: aluno.matricula,
          motivo: "O aluno não pertence mais à turma de origem selecionada.",
        });
        continue;
      }

      if (aluno.turmaId === data.turmaDestinoId) {
        skipped.push({
          nome: aluno.name,
          matricula: aluno.matricula,
          motivo: "O aluno já está na turma de destino.",
        });
        continue;
      }

      try {
        const atualizado = await this.prisma.$transaction(async (tx) => {
          const tentativas = await tx.avaliacaoOnlineTentativa.findMany({
            where: {
              alunoId: aluno.id,
              schoolId: data.schoolId,
            },
            select: {
              id: true,
            },
          });

          const tentativaIds = tentativas.map((tentativa) => tentativa.id);

          if (tentativaIds.length) {
            await tx.avaliacaoOnlineResposta.deleteMany({
              where: {
                tentativaId: {
                  in: tentativaIds,
                },
              },
            });

            await tx.avaliacaoOnlineTentativa.deleteMany({
              where: {
                id: {
                  in: tentativaIds,
                },
              },
            });
          }

          await tx.avaliacaoItem.deleteMany({
            where: {
              alunoId: aluno.id,
              schoolId: data.schoolId,
            },
          });

          await tx.notaBoletim.deleteMany({
            where: {
              alunoId: aluno.id,
              schoolId: data.schoolId,
            },
          });

          if (aluno.userId) {
            await tx.forumEnqueteVoto.deleteMany({
              where: {
                userId: aluno.userId,
                schoolId: data.schoolId,
              },
            });

            await tx.forumEntrega.deleteMany({
              where: {
                alunoId: aluno.userId,
                schoolId: data.schoolId,
              },
            });

            await tx.forumComentario.deleteMany({
              where: {
                authorId: aluno.userId,
                schoolId: data.schoolId,
              },
            });

            await tx.forumTopico.deleteMany({
              where: {
                authorId: aluno.userId,
                schoolId: data.schoolId,
              },
            });

            await tx.forumEnquete.deleteMany({
              where: {
                authorId: aluno.userId,
                schoolId: data.schoolId,
              },
            });
          }

          return tx.aluno.update({
            where: {
              id: aluno.id,
            },
            data: {
              turmaId: data.turmaDestinoId,
            },
            select: {
              id: true,
              name: true,
              matricula: true,
            },
          });
        });

        promoted.push({
          id: atualizado.id,
          nome: atualizado.name,
          matricula: atualizado.matricula,
          turmaOrigem: turmaOrigem.name,
          turmaDestino: turmaDestino.name,
        });
      } catch (error: any) {
        failed.push({
          nome: aluno.name,
          matricula: aluno.matricula,
          motivo: error?.message || "Erro ao promover aluno.",
        });
      }
    }

    const idsEncontrados = new Set(alunos.map((item) => item.id));
    const idsNaoEncontrados = data.alunoIds.filter((id) => !idsEncontrados.has(id));

    for (const id of idsNaoEncontrados) {
      failed.push({
        id,
        motivo: "Aluno não encontrado para esta escola.",
      });
    }

    await this.comunicacaoService.syncGrupoTurmaMembers({
      turmaId: data.turmaOrigemId,
      schoolId: data.schoolId,
      createdById: data.userId,
    });

    await this.comunicacaoService.syncGrupoTurmaMembers({
      turmaId: data.turmaDestinoId,
      schoolId: data.schoolId,
      createdById: data.userId,
    });

    return {
      meta: {
        promotedAt: new Date().toISOString(),
        schoolId: data.schoolId,
        turmaOrigemId: turmaOrigem.id,
        turmaOrigemNome: turmaOrigem.name,
        turmaDestinoId: turmaDestino.id,
        turmaDestinoNome: turmaDestino.name,
      },
      summary: {
        selecionados: data.alunoIds.length,
        promovidos: promoted.length,
        ignorados: skipped.length,
        falhas: failed.length,
      },
      promoted,
      skipped,
      failed,
    };
  }

  async remove(id: string, data: { schoolId: string }) {
    if (!id?.trim()) {
      throw new BadRequestException("Turma nao informada.");
    }

    const turma = await this.prisma.turma.findFirst({
      where: {
        id: id.trim(),
        schoolId: data.schoolId,
      },
      select: {
        id: true,
        name: true,
        _count: {
          select: {
            alunos: true,
            professores: true,
            aulas: true,
          },
        },
      },
    });

    if (!turma) {
      throw new BadRequestException("Turma nao encontrada.");
    }

    if (turma._count.alunos > 0) {
      throw new BadRequestException(
        "Nao e possivel excluir a turma enquanto houver alunos vinculados a ela.",
      );
    }

    if (turma._count.professores > 0) {
      throw new BadRequestException(
        "Nao e possivel excluir a turma enquanto houver professores modulados nela.",
      );
    }

    if (turma._count.aulas > 0) {
      throw new BadRequestException(
        "Nao e possivel excluir a turma enquanto houver aulas cadastradas para ela.",
      );
    }

    await this.prisma.turma.delete({
      where: {
        id: turma.id,
      },
    });

    return {
      message: `Turma "${turma.name}" excluida com sucesso.`,
    };
  }
}
