import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { PrismaService } from "src/prisma/prisma.service";

@Injectable()
export class TurmaProfessorService {
  constructor(private prisma: PrismaService) {}

  private normalizeDisciplina(value?: string | null) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toUpperCase();
  }

  private async ensureTurmaFromSchool(turmaId: string, schoolId: string) {
    if (!turmaId?.trim()) {
      throw new BadRequestException("Selecione a turma.");
    }

    const turma = await this.prisma.turma.findFirst({
      where: {
        id: turmaId.trim(),
        schoolId,
      },
      select: {
        id: true,
      },
    });

    if (!turma) {
      throw new NotFoundException("Turma nao encontrada para esta escola.");
    }

    return turma;
  }

  private async resolveDisciplinaData(data: {
    schoolId: string;
    turmaId: string;
    disciplinaId?: string | null;
    disciplina?: string;
    cargaHoraria?: number;
  }) {
    if (data.disciplinaId?.trim()) {
      const disciplinaBase = await this.prisma.disciplinaTurma.findFirst({
        where: {
          id: data.disciplinaId.trim(),
          schoolId: data.schoolId,
          turmaId: data.turmaId,
        },
        select: {
          id: true,
          nome: true,
          cargaHoraria: true,
        },
      });

      if (!disciplinaBase) {
        throw new NotFoundException(
          "Disciplina nao encontrada para a turma selecionada.",
        );
      }

      return {
        disciplinaId: disciplinaBase.id,
        disciplina: disciplinaBase.nome,
        cargaHoraria:
          Number.isFinite(Number(data.cargaHoraria)) && Number(data.cargaHoraria) > 0
            ? Number(data.cargaHoraria)
            : disciplinaBase.cargaHoraria,
      };
    }

    const disciplina = data.disciplina?.trim();
    const cargaHoraria = Number(data.cargaHoraria);

    if (!disciplina) {
      throw new BadRequestException("Informe a disciplina.");
    }

    if (!Number.isFinite(cargaHoraria) || cargaHoraria <= 0) {
      throw new BadRequestException("Informe uma carga horaria valida.");
    }

    return {
      disciplinaId: null,
      disciplina,
      cargaHoraria,
    };
  }

  private async ensureDisciplinaAvailable(params: {
    schoolId: string;
    turmaId: string;
    disciplina: string;
    excludeId?: string;
  }) {
    const existing = await this.prisma.turmaProfessor.findMany({
      where: {
        turmaId: params.turmaId,
        turma: {
          schoolId: params.schoolId,
        },
        ...(params.excludeId ? { id: { not: params.excludeId } } : {}),
      },
      select: {
        id: true,
        disciplina: true,
        professor: {
          select: {
            id: true,
            name: true,
          },
        },
        turma: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    const conflito = existing.find(
      (item) =>
        this.normalizeDisciplina(item.disciplina) ===
        this.normalizeDisciplina(params.disciplina),
    );

    if (conflito) {
      throw new BadRequestException(
        `A turma ${conflito.turma.name} ja possui professor vinculado para a disciplina ${params.disciplina}: ${conflito.professor.name}.`,
      );
    }
  }

  private async syncDisciplinaCargaHoraria(params: {
    disciplinaId?: string | null;
    cargaHoraria: number;
    turmaId: string;
    schoolId: string;
  }) {
    if (!params.disciplinaId) return;

    await this.prisma.disciplinaTurma.updateMany({
      where: {
        id: params.disciplinaId,
        turmaId: params.turmaId,
        schoolId: params.schoolId,
      },
      data: {
        cargaHoraria: params.cargaHoraria,
      },
    });
  }

  async create(data: {
    schoolId: string;
    turmaId: string;
    professorId: string;
    disciplinaId?: string | null;
    disciplina: string;
    cargaHoraria: number;
    diasSemana: string[];
  }) {
    const turma = await this.ensureTurmaFromSchool(data.turmaId, data.schoolId);
    const professor = await this.prisma.user.findFirst({
      where: {
        id: data.professorId,
        role: UserRole.PROFESSOR,
        schoolId: data.schoolId,
      },
      select: {
        id: true,
      },
    });

    if (!professor) {
      throw new NotFoundException("Professor nao encontrado para esta escola.");
    }

    const disciplinaData = await this.resolveDisciplinaData({
      schoolId: data.schoolId,
      turmaId: turma.id,
      disciplinaId: data.disciplinaId,
      disciplina: data.disciplina,
      cargaHoraria: data.cargaHoraria,
    });

    await this.ensureDisciplinaAvailable({
      schoolId: data.schoolId,
      turmaId: turma.id,
      disciplina: disciplinaData.disciplina,
    });

    await this.syncDisciplinaCargaHoraria({
      disciplinaId: disciplinaData.disciplinaId,
      cargaHoraria: disciplinaData.cargaHoraria,
      turmaId: turma.id,
      schoolId: data.schoolId,
    });

    return this.prisma.turmaProfessor.create({
      data: {
        turmaId: turma.id,
        professorId: professor.id,
        disciplinaId: disciplinaData.disciplinaId,
        disciplina: disciplinaData.disciplina,
        cargaHoraria: disciplinaData.cargaHoraria,
        diasSemana: Array.isArray(data.diasSemana) ? data.diasSemana : [],
      },
    });
  }

  async findAll(data: { schoolId: string }) {
    return this.prisma.turmaProfessor.findMany({
      where: {
        turma: {
          schoolId: data.schoolId,
        },
      },
      include: {
        professor: true,
        disciplinaBase: true,
        turma: {
          select: {
            id: true,
            name: true,
            turno: true,
          },
        },
      },
      orderBy: [
        { professor: { name: "asc" } },
        { disciplina: "asc" },
        { turma: { name: "asc" } },
      ],
    });
  }

  async findByTurma(
    turmaId: string,
    data: {
      schoolId: string;
      userId?: string;
      userRole?: UserRole;
    },
  ) {
    await this.ensureTurmaFromSchool(turmaId, data.schoolId);

    if (data.userRole === UserRole.PROFESSOR) {
      const ownProfessorLink = await this.prisma.turmaProfessor.findFirst({
        where: {
          turmaId,
          professorId: data.userId,
        },
        select: {
          id: true,
        },
      });

      if (!ownProfessorLink) {
        throw new ForbiddenException(
          "Voce nao tem permissao para visualizar esta turma.",
        );
      }
    }

    return this.prisma.turmaProfessor.findMany({
      where: { turmaId },
      include: {
        professor: true,
        disciplinaBase: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });
  }

  async update(
    id: string,
    data: {
      schoolId: string;
      turmaId: string;
      professorId: string;
      disciplinaId?: string | null;
      disciplina: string;
      cargaHoraria: number;
      diasSemana: string[];
    },
  ) {
    const existing = await this.prisma.turmaProfessor.findFirst({
      where: {
        id,
        turma: {
          schoolId: data.schoolId,
        },
      },
    });

    if (!existing) {
      throw new NotFoundException("Modulacao nao encontrada.");
    }

    const turma = await this.ensureTurmaFromSchool(data.turmaId, data.schoolId);
    const professor = await this.prisma.user.findFirst({
      where: {
        id: data.professorId,
        role: UserRole.PROFESSOR,
        schoolId: data.schoolId,
      },
      select: {
        id: true,
      },
    });

    if (!professor) {
      throw new NotFoundException("Professor nao encontrado para esta escola.");
    }

    const disciplinaData = await this.resolveDisciplinaData({
      schoolId: data.schoolId,
      turmaId: turma.id,
      disciplinaId: data.disciplinaId,
      disciplina: data.disciplina,
      cargaHoraria: data.cargaHoraria,
    });

    await this.ensureDisciplinaAvailable({
      schoolId: data.schoolId,
      turmaId: turma.id,
      disciplina: disciplinaData.disciplina,
      excludeId: existing.id,
    });

    await this.syncDisciplinaCargaHoraria({
      disciplinaId: disciplinaData.disciplinaId,
      cargaHoraria: disciplinaData.cargaHoraria,
      turmaId: turma.id,
      schoolId: data.schoolId,
    });

    return this.prisma.turmaProfessor.update({
      where: { id },
      data: {
        turmaId: turma.id,
        professorId: professor.id,
        disciplinaId: disciplinaData.disciplinaId,
        disciplina: disciplinaData.disciplina,
        cargaHoraria: disciplinaData.cargaHoraria,
        diasSemana: Array.isArray(data.diasSemana) ? data.diasSemana : [],
      },
    });
  }

  async syncByProfessorDisciplina(data: {
    schoolId: string;
    professorId: string;
    disciplina: string;
    itens: Array<{
      turmaId: string;
      disciplinaId?: string | null;
      cargaHoraria: number;
    }>;
  }) {
    const professor = await this.prisma.user.findFirst({
      where: {
        id: data.professorId,
        role: UserRole.PROFESSOR,
        schoolId: data.schoolId,
      },
      select: {
        id: true,
      },
    });

    if (!professor) {
      throw new NotFoundException("Professor nao encontrado para esta escola.");
    }

    const disciplina = data.disciplina?.trim();
    if (!disciplina) {
      throw new BadRequestException("Informe a disciplina.");
    }

    if (!Array.isArray(data.itens) || data.itens.length === 0) {
      throw new BadRequestException("Selecione ao menos uma turma.");
    }

    const itens = Array.from(
      new Map(
        data.itens.map((item) => [
          String(item?.turmaId || "").trim(),
          {
            turmaId: String(item?.turmaId || "").trim(),
            disciplinaId: item?.disciplinaId ? String(item.disciplinaId).trim() : null,
            cargaHoraria: Number(item?.cargaHoraria),
          },
        ]),
      ).values(),
    );

    const invalidItem = itens.find(
      (item) =>
        !item.turmaId ||
        !Number.isFinite(item.cargaHoraria) ||
        item.cargaHoraria <= 0,
    );

    if (invalidItem) {
      throw new BadRequestException(
        "Todas as turmas selecionadas precisam ter carga horaria valida.",
      );
    }

    const turmaIds = itens.map((item) => item.turmaId);

    const turmas = await this.prisma.turma.findMany({
      where: {
        id: {
          in: turmaIds,
        },
        schoolId: data.schoolId,
      },
      select: {
        id: true,
        name: true,
      },
    });

    if (turmas.length !== turmaIds.length) {
      throw new NotFoundException("Uma ou mais turmas nao pertencem a esta escola.");
    }

    const turmasById = new Map(turmas.map((item) => [item.id, item]));

    const disciplinasBase = await this.prisma.disciplinaTurma.findMany({
      where: {
        schoolId: data.schoolId,
        id: {
          in: itens
            .map((item) => item.disciplinaId)
            .filter((value): value is string => Boolean(value)),
        },
      },
      select: {
        id: true,
        turmaId: true,
        nome: true,
      },
    });

    const disciplinasBaseById = new Map(
      disciplinasBase.map((item) => [item.id, item]),
    );

    const invalidDisciplinaBase = itens.find((item) => {
      if (!item.disciplinaId) return false;
      const disciplinaBase = disciplinasBaseById.get(item.disciplinaId);
      return (
        !disciplinaBase ||
        disciplinaBase.turmaId !== item.turmaId ||
        this.normalizeDisciplina(disciplinaBase.nome) !==
          this.normalizeDisciplina(disciplina)
      );
    });

    if (invalidDisciplinaBase) {
      throw new BadRequestException(
        "Existe turma selecionada com disciplina invalida para esta modulacao.",
      );
    }

    const existentesMesmoGrupo = await this.prisma.turmaProfessor.findMany({
      where: {
        professorId: professor.id,
        turma: {
          schoolId: data.schoolId,
        },
      },
      include: {
        turma: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    const existentesDoProfessor = existentesMesmoGrupo.filter(
      (item) =>
        this.normalizeDisciplina(item.disciplina) ===
        this.normalizeDisciplina(disciplina),
    );

    const conflitos = await this.prisma.turmaProfessor.findMany({
      where: {
        turmaId: {
          in: turmaIds,
        },
        turma: {
          schoolId: data.schoolId,
        },
      },
      include: {
        professor: {
          select: {
            id: true,
            name: true,
          },
        },
        turma: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    const conflitoReal = conflitos.find(
      (item) =>
        item.professorId !== professor.id &&
        this.normalizeDisciplina(item.disciplina) ===
          this.normalizeDisciplina(disciplina),
    );

    if (conflitoReal) {
      throw new BadRequestException(
        `Conflito encontrado antes de salvar: a turma ${conflitoReal.turma.name} ja esta vinculada a ${conflitoReal.professor.name} em ${conflitoReal.disciplina}.`,
      );
    }

    const targetTurmaIds = new Set(turmaIds);

    await this.prisma.$transaction(async (tx) => {
      for (const item of itens) {
        const disciplinaBase = item.disciplinaId
          ? disciplinasBaseById.get(item.disciplinaId)
          : null;

        if (disciplinaBase) {
          await tx.disciplinaTurma.update({
            where: {
              id: disciplinaBase.id,
            },
            data: {
              cargaHoraria: item.cargaHoraria,
            },
          });
        }

        const existing = existentesDoProfessor.find(
          (candidate) => candidate.turmaId === item.turmaId,
        );

        if (existing) {
          await tx.turmaProfessor.update({
            where: {
              id: existing.id,
            },
            data: {
              professorId: professor.id,
              disciplinaId: disciplinaBase?.id || null,
              disciplina: disciplinaBase?.nome || disciplina,
              cargaHoraria: item.cargaHoraria,
            },
          });
          continue;
        }

        await tx.turmaProfessor.create({
          data: {
            turmaId: item.turmaId,
            professorId: professor.id,
            disciplinaId: disciplinaBase?.id || null,
            disciplina: disciplinaBase?.nome || disciplina,
            cargaHoraria: item.cargaHoraria,
            diasSemana: [],
          },
        });
      }

      const removidos = existentesDoProfessor
        .filter((item) => !targetTurmaIds.has(item.turmaId))
        .map((item) => item.id);

      if (removidos.length > 0) {
        await tx.turmaProfessor.deleteMany({
          where: {
            id: {
              in: removidos,
            },
          },
        });
      }
    });

    return this.findAll({ schoolId: data.schoolId });
  }

  async remove(id: string, data: { schoolId: string }) {
    const existing = await this.prisma.turmaProfessor.findFirst({
      where: {
        id,
        turma: {
          schoolId: data.schoolId,
        },
      },
    });

    if (!existing) {
      throw new NotFoundException("Modulacao nao encontrada.");
    }

    await this.prisma.turmaProfessor.delete({
      where: { id },
    });

    return {
      message: "Modulacao excluida com sucesso.",
    };
  }
}
