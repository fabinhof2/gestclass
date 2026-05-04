import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, UserRole } from "@prisma/client";
import { PrismaService } from "src/prisma/prisma.service";

@Injectable()
export class AulasService {
  constructor(private prisma: PrismaService) {}

  private getUserId(user: any) {
    return user?.id || user?.userId || user?.sub;
  }

  private resolveSchoolId(user: any, selectedSchoolId?: string) {
    const isSuperuser = user?.role === UserRole.SUPERUSUARIO;
    const schoolId = isSuperuser ? selectedSchoolId : user?.schoolId;

    if (!schoolId) {
      throw new ForbiddenException("Nenhuma escola selecionada.");
    }

    return schoolId;
  }

  private normalizeHorarioRulesPayload(payload?: {
    officialConfigs?: Record<string, unknown>;
    turmaOverrides?: Record<string, unknown>;
  } | null) {
    return {
      officialConfigs:
        payload?.officialConfigs &&
        typeof payload.officialConfigs === "object" &&
        !Array.isArray(payload.officialConfigs)
          ? payload.officialConfigs
          : {},
      turmaOverrides:
        payload?.turmaOverrides &&
        typeof payload.turmaOverrides === "object" &&
        !Array.isArray(payload.turmaOverrides)
          ? payload.turmaOverrides
          : {},
    };
  }

  private normalizeTurno(turno?: string | null) {
    const normalized = String(turno || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toUpperCase();

    if (["TARDE", "VESPERTINO"].includes(normalized)) return "TARDE";
    if (["NOITE", "NOTURNO"].includes(normalized)) return "NOITE";
    return "MANHA";
  }

  private timeToMinutes(time: string) {
    const [hours, minutes] = String(time || "").split(":").map(Number);

    if (Number.isNaN(hours) || Number.isNaN(minutes)) return 0;

    return hours * 60 + minutes;
  }

  private minutesToTime(totalMinutes: number) {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  }

  private buildHorarioConfigFromSlots(
    slots: Array<{ horaInicio: string; horaFim: string }>,
  ) {
    const uniqueSlots = Array.from(
      new Map(
        slots
          .filter((slot) => slot.horaInicio && slot.horaFim)
          .map((slot) => [`${slot.horaInicio}-${slot.horaFim}`, slot]),
      ).values(),
    ).sort(
      (a, b) =>
        this.timeToMinutes(a.horaInicio) - this.timeToMinutes(b.horaInicio) ||
        this.timeToMinutes(a.horaFim) - this.timeToMinutes(b.horaFim),
    );

    if (uniqueSlots.length === 0) return null;

    const durations = uniqueSlots.map(
      (slot) => this.timeToMinutes(slot.horaFim) - this.timeToMinutes(slot.horaInicio),
    );
    const duracaoAula = durations[0] || 50;
    const mesmoTempoAulas = durations.every((duration) => duration === duracaoAula);
    const ajustes = durations.reduce<Record<number, number>>((acc, duration, index) => {
      if (!mesmoTempoAulas && duration > 0) {
        acc[index] = duration;
      }

      return acc;
    }, {});
    const intervalos = uniqueSlots.slice(0, -1).flatMap((slot, index) => {
      const gap =
        this.timeToMinutes(uniqueSlots[index + 1].horaInicio) -
        this.timeToMinutes(slot.horaFim);

      if (gap <= 0) return [];

      return [
        {
          id: `intervalo-${index + 1}`,
          nome: "Intervalo",
          aposAula: index + 1,
          duracao: gap,
        },
      ];
    });

    return {
      inicio: uniqueSlots[0].horaInicio,
      fim: uniqueSlots[uniqueSlots.length - 1].horaFim,
      duracaoAula,
      mesmoTempoAulas,
      intervalos,
      ajustes,
    };
  }

  private async deriveHorarioConfigsFromAulas(schoolId: string) {
    const turmas = await this.prisma.turma.findMany({
      where: {
        schoolId,
        aulas: {
          some: {},
        },
      },
      select: {
        turno: true,
        aulas: {
          select: {
            horaInicio: true,
            horaFim: true,
          },
          orderBy: [{ horaInicio: "asc" }, { horaFim: "asc" }],
        },
      },
    });
    const slotsByTurno = new Map<string, Array<{ horaInicio: string; horaFim: string }>>();

    turmas.forEach((turma) => {
      const turno = this.normalizeTurno(turma.turno);
      const slots = slotsByTurno.get(turno) || [];
      slots.push(...turma.aulas);
      slotsByTurno.set(turno, slots);
    });

    return Array.from(slotsByTurno.entries()).reduce<Record<string, unknown>>(
      (acc, [turno, slots]) => {
        const config = this.buildHorarioConfigFromSlots(slots);

        if (config) {
          acc[turno] = config;
        }

        return acc;
      },
      {},
    );
  }

  private getAllowedHorarioReadRoles(): UserRole[] {
    return [
      UserRole.SUPERUSUARIO,
      UserRole.ADMIN_ESCOLA,
      UserRole.GESTOR,
      UserRole.SECRETARIA,
      UserRole.PROFESSOR,
      UserRole.RESPONSAVEL,
      UserRole.ALUNO,
    ];
  }

  private getAllowedHorarioWriteRoles(): UserRole[] {
    return [
      UserRole.SUPERUSUARIO,
      UserRole.ADMIN_ESCOLA,
      UserRole.GESTOR,
      UserRole.SECRETARIA,
    ];
  }

  private getTurmaSelect(
    aulasWhere?: Prisma.AulaWhereInput,
  ): Prisma.TurmaSelect {
    return {
      id: true,
      name: true,
      turno: true,
      aulas: {
        ...(aulasWhere ? { where: aulasWhere } : {}),
        orderBy: [{ diaSemana: "asc" }, { horaInicio: "asc" }],
        include: {
          turmaProfessor: {
            include: {
              professor: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                },
              },
            },
          },
        },
      },
    };
  }


  async findContextos(data: { user: any; selectedSchoolId?: string }) {
    const userRole = data.user?.role as UserRole;
    const userId = this.getUserId(data.user);
    const schoolId = this.resolveSchoolId(data.user, data.selectedSchoolId);
    const professorAulasWhere =
      userRole === UserRole.PROFESSOR
        ? {
            turmaProfessor: {
              professorId: userId,
            },
          }
        : undefined;
    const turmaSelect = this.getTurmaSelect(professorAulasWhere);
    const allowedRoles: UserRole[] = [
      UserRole.SUPERUSUARIO,
      UserRole.ADMIN_ESCOLA,
      UserRole.GESTOR,
      UserRole.SECRETARIA,
      UserRole.PROFESSOR,
      UserRole.RESPONSAVEL,
      UserRole.ALUNO,
    ];

    if (!allowedRoles.includes(userRole)) {
      throw new ForbiddenException("Sem permissao para consultar horarios.");
    }

    if (userRole === UserRole.ALUNO) {
      const aluno = await this.prisma.aluno.findFirst({
        where: {
          userId,
          schoolId,
          status: "ATIVO",
        },
        select: {
          id: true,
          name: true,
          turma: {
            select: turmaSelect,
          },
        },
      });

      if (!aluno?.turma) return [];

      return [
        {
          contextId: aluno.id,
          aluno: {
            id: aluno.id,
            name: aluno.name,
          },
          ...aluno.turma,
        },
      ];
    }

    if (userRole === UserRole.RESPONSAVEL) {
      const vinculos = await this.prisma.alunoResponsavel.findMany({
        where: {
          responsavelId: userId,
          aluno: {
            schoolId,
            status: "ATIVO",
          },
        },
        select: {
          aluno: {
            select: {
              id: true,
              name: true,
              turma: {
                select: turmaSelect,
              },
            },
          },
        },
        orderBy: {
          aluno: {
            name: "asc",
          },
        },
      });

      return vinculos
        .filter((vinculo) => vinculo.aluno?.turma)
        .map((vinculo) => ({
          contextId: vinculo.aluno.id,
          aluno: {
            id: vinculo.aluno.id,
            name: vinculo.aluno.name,
          },
          ...vinculo.aluno.turma,
        }));
    }

    const where: any = {
      schoolId,
    };

    if (userRole === UserRole.PROFESSOR) {
      where.OR = [
        {
          professores: {
            some: {
              professorId: userId,
            },
          },
        },
        {
          aulas: {
            some: {
              turmaProfessor: {
                professorId: userId,
              },
            },
          },
        },
      ];
    }

    return this.prisma.turma.findMany({
      where,
      select: turmaSelect,
      orderBy: {
        name: "asc",
      },
    });
  }

  async findHorarioRules(data: { user: any; selectedSchoolId?: string }) {
    const userRole = data.user?.role as UserRole;
    const schoolId = this.resolveSchoolId(data.user, data.selectedSchoolId);
    const allowedRoles = this.getAllowedHorarioReadRoles();

    if (!allowedRoles.includes(userRole)) {
      throw new ForbiddenException("Sem permissao para consultar configuracoes de horario.");
    }

    const config = await this.prisma.schoolHorarioConfiguracao.findUnique({
      where: { schoolId },
      select: {
        officialConfigsJson: true,
        turmaOverridesJson: true,
        moduladorDraftJson: true,
      },
    });

    const hasStoredConfig = Boolean(
      config &&
        (config.officialConfigsJson ||
          config.turmaOverridesJson ||
          config.moduladorDraftJson),
    );
    const derivedOfficialConfigs = hasStoredConfig
      ? {}
      : await this.deriveHorarioConfigsFromAulas(schoolId);
    const normalized = this.normalizeHorarioRulesPayload({
      officialConfigs: config?.officialConfigsJson
        ? JSON.parse(config.officialConfigsJson)
        : derivedOfficialConfigs,
      turmaOverrides: config?.turmaOverridesJson
        ? JSON.parse(config.turmaOverridesJson)
        : {},
    });

    return {
      ...normalized,
      hasStoredConfig:
        hasStoredConfig || Object.keys(derivedOfficialConfigs).length > 0,
    };
  }

  async saveHorarioRules(data: {
    user: any;
    selectedSchoolId?: string;
    officialConfigs?: Record<string, unknown>;
    turmaOverrides?: Record<string, unknown>;
  }) {
    const userRole = data.user?.role as UserRole;
    const schoolId = this.resolveSchoolId(data.user, data.selectedSchoolId);
    const allowedWriteRoles = this.getAllowedHorarioWriteRoles();

    if (!allowedWriteRoles.includes(userRole)) {
      throw new ForbiddenException("Sem permissao para salvar configuracoes de horario.");
    }

    const payload = this.normalizeHorarioRulesPayload({
      officialConfigs: data.officialConfigs,
      turmaOverrides: data.turmaOverrides,
    });

    const saved = await this.prisma.schoolHorarioConfiguracao.upsert({
      where: { schoolId },
      create: {
        schoolId,
        officialConfigsJson: JSON.stringify(payload.officialConfigs),
        turmaOverridesJson: JSON.stringify(payload.turmaOverrides),
      },
      update: {
        officialConfigsJson: JSON.stringify(payload.officialConfigs),
        turmaOverridesJson: JSON.stringify(payload.turmaOverrides),
      },
      select: {
        officialConfigsJson: true,
        turmaOverridesJson: true,
      },
    });

    return this.normalizeHorarioRulesPayload({
      officialConfigs: saved.officialConfigsJson
        ? JSON.parse(saved.officialConfigsJson)
        : {},
      turmaOverrides: saved.turmaOverridesJson
        ? JSON.parse(saved.turmaOverridesJson)
        : {},
    });
  }

  async findModuladorDraft(data: { user: any; selectedSchoolId?: string }) {
    const userRole = data.user?.role as UserRole;
    const schoolId = this.resolveSchoolId(data.user, data.selectedSchoolId);

    if (!this.getAllowedHorarioReadRoles().includes(userRole)) {
      throw new ForbiddenException("Sem permissao para consultar a grade do modulador.");
    }

    const config = await this.prisma.schoolHorarioConfiguracao.findUnique({
      where: { schoolId },
      select: {
        moduladorDraftJson: true,
      },
    });

    return config?.moduladorDraftJson ? JSON.parse(config.moduladorDraftJson) : null;
  }

  async saveModuladorDraft(data: {
    user: any;
    selectedSchoolId?: string;
    draft?: Record<string, unknown> | null;
  }) {
    const userRole = data.user?.role as UserRole;
    const schoolId = this.resolveSchoolId(data.user, data.selectedSchoolId);

    if (!this.getAllowedHorarioWriteRoles().includes(userRole)) {
      throw new ForbiddenException("Sem permissao para salvar a grade do modulador.");
    }

    const saved = await this.prisma.schoolHorarioConfiguracao.upsert({
      where: { schoolId },
      create: {
        schoolId,
        moduladorDraftJson: data.draft ? JSON.stringify(data.draft) : null,
      },
      update: {
        moduladorDraftJson: data.draft ? JSON.stringify(data.draft) : null,
      },
      select: {
        moduladorDraftJson: true,
      },
    });

    return saved.moduladorDraftJson ? JSON.parse(saved.moduladorDraftJson) : null;
  }

  async clearModuladorDraft(data: { user: any; selectedSchoolId?: string }) {
    return this.saveModuladorDraft({
      user: data.user,
      selectedSchoolId: data.selectedSchoolId,
      draft: null,
    });
  }

  async create(data: {
    turmaId: string;
    diaSemana: string;
    horaInicio: string;
    horaFim: string;
    turmaProfessorId?: string;
    disciplina?: string;
  }) {
    const { turmaId, diaSemana, horaInicio, horaFim, turmaProfessorId } = data;

    const aulasExistentes = await this.prisma.aula.findMany({
      where: {
        turmaId,
        diaSemana,
      },
    });

    const conflito = aulasExistentes.find((aula) => {
      return horaInicio < aula.horaFim && horaFim > aula.horaInicio;
    });

    if (conflito) {
      throw new BadRequestException(
        `Conflito de horário com ${conflito.disciplina} (${conflito.horaInicio} - ${conflito.horaFim})`,
      );
    }

    let disciplinaFinal = data.disciplina || "";

    if (turmaProfessorId) {
      const vinculacao = await this.prisma.turmaProfessor.findUnique({
        where: { id: turmaProfessorId },
        include: { professor: true },
      });

      if (!vinculacao) {
        throw new BadRequestException("Vínculo de professor não encontrado.");
      }

      const conflitosProfessor = await this.prisma.aula.findMany({
        where: {
          diaSemana,
          turmaProfessor: {
            professorId: vinculacao.professorId,
          },
        },
        include: {
          turmaProfessor: true,
        },
      });

      const conflitoProfessor = conflitosProfessor.find((aula) => {
        return horaInicio < aula.horaFim && horaFim > aula.horaInicio;
      });

      if (conflitoProfessor) {
        throw new BadRequestException(
          "Professor já possui aula neste horário em outra turma.",
        );
      }

      const totalAulasDaModulacao = await this.prisma.aula.count({
        where: {
          turmaProfessorId,
        },
      });

      if (totalAulasDaModulacao >= vinculacao.cargaHoraria) {
        throw new BadRequestException(
          `Esta modulação permite no máximo ${vinculacao.cargaHoraria} aulas por semana.`,
        );
      }

      disciplinaFinal = vinculacao.disciplina;
    }

    return this.prisma.aula.create({
      data: {
        turmaId,
        diaSemana,
        horaInicio,
        horaFim,
        turmaProfessorId: turmaProfessorId || null,
        disciplina: disciplinaFinal,
      },
    });
  }

  async findByTurma(data: {
    turmaId: string;
    user: any;
    selectedSchoolId?: string;
  }) {
    const userRole = data.user?.role as UserRole;
    const userId = this.getUserId(data.user);

    const where: Prisma.AulaWhereInput = {
      turmaId: data.turmaId,
    };

    if (userRole === UserRole.PROFESSOR) {
      where.turmaProfessor = {
        professorId: userId,
      };
    } else if (userRole !== UserRole.SUPERUSUARIO) {
      const schoolId = this.resolveSchoolId(data.user, data.selectedSchoolId);
      where.turma = {
        schoolId,
      };
    }

    return this.prisma.aula.findMany({
      where,
      orderBy: { horaInicio: "asc" },
      include: {
        turmaProfessor: {
          include: {
            professor: true,
          },
        },
      },
    });
  }

  async update(
    id: string,
    data: {
      turmaId: string;
      diaSemana: string;
      horaInicio: string;
      horaFim: string;
      turmaProfessorId?: string;
      disciplina?: string;
    },
  ) {
    const aulaAtual = await this.prisma.aula.findUnique({
      where: { id },
    });

    if (!aulaAtual) {
      throw new NotFoundException("Aula não encontrada.");
    }

    const { turmaId, diaSemana, horaInicio, horaFim, turmaProfessorId } = data;

    const aulasExistentes = await this.prisma.aula.findMany({
      where: {
        turmaId,
        diaSemana,
        NOT: {
          id,
        },
      },
    });

    const conflito = aulasExistentes.find((aula) => {
      return horaInicio < aula.horaFim && horaFim > aula.horaInicio;
    });

    if (conflito) {
      throw new BadRequestException(
        `Conflito de horário com ${conflito.disciplina} (${conflito.horaInicio} - ${conflito.horaFim})`,
      );
    }

    let disciplinaFinal = data.disciplina || "";

    if (turmaProfessorId) {
      const vinculacao = await this.prisma.turmaProfessor.findUnique({
        where: { id: turmaProfessorId },
      });

      if (!vinculacao) {
        throw new BadRequestException("Vínculo inválido.");
      }

      const conflitosProfessor = await this.prisma.aula.findMany({
        where: {
          diaSemana,
          turmaProfessor: {
            professorId: vinculacao.professorId,
          },
          NOT: {
            id,
          },
        },
        include: {
          turmaProfessor: true,
        },
      });

      const conflitoProfessor = conflitosProfessor.find((aula) => {
        return horaInicio < aula.horaFim && horaFim > aula.horaInicio;
      });

      if (conflitoProfessor) {
        throw new BadRequestException(
          "Professor já possui aula neste horário em outra turma.",
        );
      }

      const totalAulasDaModulacao = await this.prisma.aula.count({
        where: {
          turmaProfessorId,
          NOT: {
            id,
          },
        },
      });

      if (totalAulasDaModulacao >= vinculacao.cargaHoraria) {
        throw new BadRequestException(
          `Esta modulação permite no máximo ${vinculacao.cargaHoraria} aulas por semana.`,
        );
      }

      disciplinaFinal = vinculacao.disciplina;
    }

    return this.prisma.aula.update({
      where: { id },
      data: {
        turmaId,
        diaSemana,
        horaInicio,
        horaFim,
        turmaProfessorId: turmaProfessorId || null,
        disciplina: disciplinaFinal,
      },
    });
  }

  async remove(id: string) {
    return this.prisma.aula.delete({
      where: { id },
    });
  }
}
