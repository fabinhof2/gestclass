import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CalendarioLetivoAbrangencia, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type AuthData = {
  userId: string;
  userRole: UserRole;
  userSchoolId?: string | null;
};

type PlanejamentoInput = {
  aulaId?: string;
  data: string;
  conteudo?: string;
  objetivo?: string;
  metodologia?: string;
  atividades?: string;
  anexoUrl?: string;
};

const DIA_SEMANA: Record<number, string> = {
  0: 'DOM',
  1: 'SEG',
  2: 'TER',
  3: 'QUA',
  4: 'QUI',
  5: 'SEX',
  6: 'SAB',
};

const AULA_AVULSA_HORARIO = '00:00';

@Injectable()
export class ConteudoDoDiaService {
  constructor(private readonly prisma: PrismaService) {}

  private isGestao(role: UserRole) {
    return (
      role === UserRole.SUPERUSUARIO ||
      role === UserRole.ADMIN_ESCOLA ||
      role === UserRole.GESTOR ||
      role === UserRole.SECRETARIA
    );
  }

  private validarAno(ano: number) {
    if (!Number.isInteger(ano) || ano < 2020 || ano > 2100) {
      throw new BadRequestException('Informe um ano letivo válido.');
    }

    return ano;
  }

  private normalizarData(data: string) {
    const normalizada = new Date(`${data}T00:00:00.000Z`);

    if (Number.isNaN(normalizada.getTime())) {
      throw new BadRequestException('Data inválida no planejamento.');
    }

    return normalizada;
  }

  private isoData(data: Date) {
    return data.toISOString().slice(0, 10);
  }

  private eventoAtingeTurma(
    evento: {
      abrangencia: CalendarioLetivoAbrangencia;
      turmaId?: string | null;
      turmasExcecao?: Array<{ turmaId: string }>;
    },
    turmaId: string,
  ) {
    if (evento.abrangencia === CalendarioLetivoAbrangencia.ESCOLA_INTEIRA) {
      return true;
    }

    if (evento.abrangencia === CalendarioLetivoAbrangencia.APENAS_TURMA) {
      return evento.turmaId === turmaId;
    }

    if (
      evento.abrangencia ===
      CalendarioLetivoAbrangencia.ESCOLA_INTEIRA_EXCETO_TURMA
    ) {
      const turmaExcetuada =
        evento.turmasExcecao?.some((item) => item.turmaId === turmaId) || false;

      return !turmaExcetuada;
    }

    return false;
  }

  private async buscarTurmaProfessor(data: AuthData & { turmaProfessorId: string }) {
    if (!data.turmaProfessorId) {
      throw new BadRequestException('Informe a disciplina/turma.');
    }

    const turmaProfessor = await this.prisma.turmaProfessor.findFirst({
      where: {
        id: data.turmaProfessorId,
        ...(data.userRole === UserRole.PROFESSOR ? { professorId: data.userId } : {}),
        ...(data.userRole === UserRole.SUPERUSUARIO
          ? {}
          : { turma: { schoolId: data.userSchoolId || '' } }),
      },
      include: {
        professor: {
          select: {
            id: true,
            name: true,
          },
        },
        turma: {
          include: {
            school: {
              select: {
                id: true,
                name: true,
                logoUrl: true,
              },
            },
          },
        },
        aulas: {
          orderBy: [
            {
              diaSemana: 'asc',
            },
            {
              horaInicio: 'asc',
            },
          ],
        },
      },
    });

    if (!turmaProfessor) {
      throw new NotFoundException('Disciplina/turma nao encontrada para este usuario.');
    }

    if (
      data.userRole === UserRole.PROFESSOR &&
      turmaProfessor.professor.id !== data.userId
    ) {
      throw new ForbiddenException(
        'Professor sem modulacao nesta turma/disciplina.',
      );
    }

    return turmaProfessor;
  }

  private async gerarAulasDoAno(data: {
    turmaProfessor: Awaited<ReturnType<ConteudoDoDiaService['buscarTurmaProfessor']>>;
    ano: number;
  }) {
    const inicio = new Date(Date.UTC(data.ano, 0, 1));
    const fim = new Date(Date.UTC(data.ano, 11, 31, 23, 59, 59, 999));

    const eventos = await this.prisma.calendarioLetivo.findMany({
      where: {
        schoolId: data.turmaProfessor.turma.schoolId,
        dataInicio: {
          lte: fim,
        },
        dataFim: {
          gte: inicio,
        },
      },
      include: {
        turmasExcecao: {
          select: {
            turmaId: true,
          },
        },
      },
    });

    const aulas = data.turmaProfessor.aulas.filter(
      (aula) =>
        aula.turmaProfessorId &&
        !(
          aula.horaInicio === AULA_AVULSA_HORARIO &&
          aula.horaFim === AULA_AVULSA_HORARIO
        ),
    );
    const planejaveis: Array<{
      aulaId: string;
      data: string;
      diaSemana: string;
      horaInicio: string;
      horaFim: string;
      bloqueado: boolean;
      motivoBloqueio?: string;
    }> = [];

    for (
      let cursor = new Date(inicio);
      cursor.getTime() <= fim.getTime();
      cursor.setUTCDate(cursor.getUTCDate() + 1)
    ) {
      const diaSemana = DIA_SEMANA[cursor.getUTCDay()];
      const aulasDoDia = aulas.filter((aula) => aula.diaSemana === diaSemana);

      if (!aulasDoDia.length) continue;

      const evento = eventos.find((item) => {
        const atingeData =
          item.dataInicio.getTime() <= cursor.getTime() &&
          item.dataFim.getTime() >= cursor.getTime();

        return (
          atingeData &&
          this.eventoAtingeTurma(
            {
              abrangencia: item.abrangencia,
              turmaId: item.turmaId,
              turmasExcecao: item.turmasExcecao,
            },
            data.turmaProfessor.turmaId,
          )
        );
      });

      for (const aula of aulasDoDia) {
        planejaveis.push({
          aulaId: aula.id,
          data: this.isoData(cursor),
          diaSemana,
          horaInicio: aula.horaInicio,
          horaFim: aula.horaFim,
          bloqueado: Boolean(evento),
          motivoBloqueio: evento?.motivo,
        });
      }
    }

    return planejaveis;
  }

  async listarDisciplinas(data: AuthData) {
    if (data.userRole === UserRole.PROFESSOR && !data.userId) {
      throw new ForbiddenException('Professor nao identificado.');
    }

    if (data.userRole === UserRole.PROFESSOR && !data.userSchoolId) {
      throw new ForbiddenException('Professor sem escola vinculada.');
    }

    if (data.userRole !== UserRole.PROFESSOR && !this.isGestao(data.userRole)) {
      throw new ForbiddenException('Sem permissao para acessar planejamento.');
    }

    const where =
      data.userRole === UserRole.PROFESSOR
        ? {
            professorId: data.userId,
            turma: {
              schoolId: data.userSchoolId || '',
            },
          }
        : data.userRole === UserRole.SUPERUSUARIO
          ? {}
          : {
              turma: {
                schoolId: data.userSchoolId || '',
              },
            };

    const disciplinas = await this.prisma.turmaProfessor.findMany({
      where,
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
            turno: true,
          },
        },
      },
      orderBy: [
        {
          disciplina: 'asc',
        },
      ],
    });

    if (data.userRole === UserRole.PROFESSOR) {
      return disciplinas.filter((item) => item.professorId === data.userId);
    }

    return disciplinas;
  }
  async obterPlano(data: AuthData & { turmaProfessorId: string; ano: number }) {
    const ano = this.validarAno(data.ano);
    const turmaProfessor = await this.buscarTurmaProfessor(data);

    const plano = await this.prisma.planoAnualConteudo.findUnique({
      where: {
        turmaProfessorId_ano: {
          turmaProfessorId: turmaProfessor.id,
          ano,
        },
      },
      include: {
        planejamentos: {
          include: {
            aula: true,
          },
        },
      },
    });

    const aulasDoAno = await this.gerarAulasDoAno({ turmaProfessor, ano });
    const planejamentosPorChave = new Map<string, any>(
      (plano?.planejamentos || []).map((item) => [
        `${item.aulaId}|${this.isoData(item.data)}`,
        item,
      ]),
    );

    const aulasComPlano = aulasDoAno.map((aula) => {
      const planejamento = planejamentosPorChave.get(`${aula.aulaId}|${aula.data}`);

      return {
        ...aula,
        planejamento: planejamento
          ? {
              id: planejamento.id,
              conteudo: planejamento.conteudo,
              objetivo: planejamento.objetivo,
              metodologia: planejamento.metodologia,
              atividades: planejamento.atividades,
              anexoUrl: planejamento.anexoUrl,
            }
          : null,
      };
    });
    const chavesAulasDoAno = new Set(
      aulasDoAno.map((aula) => `${aula.aulaId}|${aula.data}`),
    );
    const planejamentosAvulsos = (plano?.planejamentos || [])
      .filter(
        (item) =>
          !chavesAulasDoAno.has(`${item.aulaId}|${this.isoData(item.data)}`),
      )
      .map((item) => ({
        aulaId: item.aulaId,
        data: this.isoData(item.data),
        diaSemana: item.aula.diaSemana,
        horaInicio: item.aula.horaInicio,
        horaFim: item.aula.horaFim,
        bloqueado: false,
        planejamento: {
          id: item.id,
          conteudo: item.conteudo,
          objetivo: item.objetivo,
          metodologia: item.metodologia,
          atividades: item.atividades,
          anexoUrl: item.anexoUrl,
        },
      }));

    return {
      plano: plano
        ? {
            id: plano.id,
            ano: plano.ano,
            conteudoGeral: plano.conteudoGeral,
            objetivoGeral: plano.objetivoGeral,
            metodologiaGeral: plano.metodologiaGeral,
            observacoes: plano.observacoes,
          }
        : null,
      turmaProfessor: {
        id: turmaProfessor.id,
        disciplina: turmaProfessor.disciplina,
        professor: turmaProfessor.professor,
        turma: turmaProfessor.turma,
      },
      aulas: [...aulasComPlano, ...planejamentosAvulsos].sort((a, b) => {
        if (a.data !== b.data) return a.data.localeCompare(b.data);
        return a.horaInicio.localeCompare(b.horaInicio);
      }),
    };
  }

  async salvarPlanejamentoDiario(
    data: AuthData & {
      turmaProfessorId: string;
      data: string;
      conteudo?: string;
      objetivo?: string;
      metodologia?: string;
      atividades?: string;
    },
  ) {
    if (data.userRole !== UserRole.PROFESSOR) {
      throw new ForbiddenException('Somente professores podem salvar planejamento.');
    }

    const dataAula = this.normalizarData(data.data);
    const ano = dataAula.getUTCFullYear();
    const diaSemana = DIA_SEMANA[dataAula.getUTCDay()];
    const turmaProfessor = await this.buscarTurmaProfessor({
      userId: data.userId,
      userRole: data.userRole,
      userSchoolId: data.userSchoolId,
      turmaProfessorId: data.turmaProfessorId,
    });
    const aulaExistente =
      turmaProfessor.aulas.find(
        (aula) =>
          aula.diaSemana === diaSemana &&
          !(
            aula.horaInicio === AULA_AVULSA_HORARIO &&
            aula.horaFim === AULA_AVULSA_HORARIO
          ),
      ) ||
      (await this.prisma.aula.findFirst({
        where: {
          turmaId: turmaProfessor.turmaId,
          turmaProfessorId: turmaProfessor.id,
          diaSemana,
          horaInicio: AULA_AVULSA_HORARIO,
          horaFim: AULA_AVULSA_HORARIO,
          disciplina: turmaProfessor.disciplina,
        },
      }));
    const aula =
      aulaExistente ||
      (await this.prisma.aula.create({
        data: {
          turmaId: turmaProfessor.turmaId,
          turmaProfessorId: turmaProfessor.id,
          diaSemana,
          horaInicio: AULA_AVULSA_HORARIO,
          horaFim: AULA_AVULSA_HORARIO,
          disciplina: turmaProfessor.disciplina,
        },
      }));
    const plano = await this.prisma.planoAnualConteudo.upsert({
      where: {
        turmaProfessorId_ano: {
          turmaProfessorId: turmaProfessor.id,
          ano,
        },
      },
      update: {},
      create: {
        turmaProfessorId: turmaProfessor.id,
        schoolId: turmaProfessor.turma.schoolId,
        professorId: data.userId,
        ano,
      },
    });

    await this.prisma.planejamentoDiarioConteudo.upsert({
      where: {
        turmaProfessorId_aulaId_data: {
          turmaProfessorId: turmaProfessor.id,
          aulaId: aula.id,
          data: dataAula,
        },
      },
      update: {
        conteudo: data.conteudo?.trim() || null,
        objetivo: data.objetivo?.trim() || null,
        metodologia: data.metodologia?.trim() || null,
        atividades: data.atividades?.trim() || null,
      },
      create: {
        planoAnualId: plano.id,
        turmaProfessorId: turmaProfessor.id,
        schoolId: turmaProfessor.turma.schoolId,
        professorId: data.userId,
        aulaId: aula.id,
        data: dataAula,
        conteudo: data.conteudo?.trim() || null,
        objetivo: data.objetivo?.trim() || null,
        metodologia: data.metodologia?.trim() || null,
        atividades: data.atividades?.trim() || null,
      },
    });

    return this.obterPlano({
      userId: data.userId,
      userRole: data.userRole,
      userSchoolId: data.userSchoolId,
      turmaProfessorId: turmaProfessor.id,
      ano,
    });
  }

  async salvarPlano(
    data: AuthData & {
      turmaProfessorId: string;
      ano: number;
      conteudoGeral?: string;
      objetivoGeral?: string;
      metodologiaGeral?: string;
      observacoes?: string;
      planejamentos: PlanejamentoInput[];
    },
  ) {
    if (data.userRole !== UserRole.PROFESSOR) {
      throw new ForbiddenException('Somente professores podem salvar planejamento.');
    }

    const ano = this.validarAno(data.ano);
    const turmaProfessor = await this.buscarTurmaProfessor(data);
    const aulasDoAno = await this.gerarAulasDoAno({ turmaProfessor, ano });
    const aulasPermitidas = new Set(
      aulasDoAno
        .filter((aula) => !aula.bloqueado)
        .map((aula) => `${aula.aulaId}|${aula.data}`),
    );

    const plano = await this.prisma.planoAnualConteudo.upsert({
      where: {
        turmaProfessorId_ano: {
          turmaProfessorId: turmaProfessor.id,
          ano,
        },
      },
      update: {
        conteudoGeral:
          data.conteudoGeral === undefined
            ? undefined
            : data.conteudoGeral.trim() || null,
        objetivoGeral:
          data.objetivoGeral === undefined
            ? undefined
            : data.objetivoGeral.trim() || null,
        metodologiaGeral:
          data.metodologiaGeral === undefined
            ? undefined
            : data.metodologiaGeral.trim() || null,
        observacoes:
          data.observacoes === undefined
            ? undefined
            : data.observacoes.trim() || null,
      },
      create: {
        turmaProfessorId: turmaProfessor.id,
        schoolId: turmaProfessor.turma.schoolId,
        professorId: data.userId,
        ano,
        conteudoGeral: data.conteudoGeral?.trim() || null,
        objetivoGeral: data.objetivoGeral?.trim() || null,
        metodologiaGeral: data.metodologiaGeral?.trim() || null,
        observacoes: data.observacoes?.trim() || null,
      },
    });

    for (const item of data.planejamentos) {
      const dataAula = this.normalizarData(item.data);
      if (!item.aulaId) continue;

      const chave = `${item.aulaId}|${this.isoData(dataAula)}`;

      if (!aulasPermitidas.has(chave)) continue;

      await this.prisma.planejamentoDiarioConteudo.upsert({
        where: {
          turmaProfessorId_aulaId_data: {
            turmaProfessorId: turmaProfessor.id,
            aulaId: item.aulaId,
            data: dataAula,
          },
        },
        update: {
          conteudo: item.conteudo?.trim() || null,
          objetivo: item.objetivo?.trim() || null,
          metodologia: item.metodologia?.trim() || null,
          atividades: item.atividades?.trim() || null,
          anexoUrl: item.anexoUrl?.trim() || null,
        },
        create: {
          planoAnualId: plano.id,
          turmaProfessorId: turmaProfessor.id,
          schoolId: turmaProfessor.turma.schoolId,
          professorId: data.userId,
          aulaId: item.aulaId,
          data: dataAula,
          conteudo: item.conteudo?.trim() || null,
          objetivo: item.objetivo?.trim() || null,
          metodologia: item.metodologia?.trim() || null,
          atividades: item.atividades?.trim() || null,
          anexoUrl: item.anexoUrl?.trim() || null,
        },
      });
    }

    return this.obterPlano({ ...data, ano });
  }

  async listarMeusConteudos(data: AuthData & { mes?: string; data?: string; alunoId?: string }) {
    if (!data.userSchoolId) {
      throw new ForbiddenException('Usuário sem escola vinculada.');
    }

    const dataMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(data.data || '');
    const match = /^(\d{4})-(\d{2})$/.exec(data.mes || '');
    const hoje = new Date();
    const ano = dataMatch ? Number(dataMatch[1]) : match ? Number(match[1]) : hoje.getFullYear();
    const mes = dataMatch ? Number(dataMatch[2]) : match ? Number(match[2]) : hoje.getMonth() + 1;
    const dia = dataMatch ? Number(dataMatch[3]) : null;
    const inicio = dia
      ? new Date(Date.UTC(ano, mes - 1, dia))
      : new Date(Date.UTC(ano, mes - 1, 1));
    const fim = dia
      ? new Date(Date.UTC(ano, mes - 1, dia, 23, 59, 59, 999))
      : new Date(Date.UTC(ano, mes, 0, 23, 59, 59, 999));

    let turmaIds: string[] = [];

    if (data.userRole === UserRole.ALUNO) {
      const aluno = await this.prisma.aluno.findFirst({
        where: {
          userId: data.userId,
          schoolId: data.userSchoolId,
        },
        select: {
          turmaId: true,
        },
      });

      turmaIds = aluno ? [aluno.turmaId] : [];
    } else if (data.userRole === UserRole.RESPONSAVEL) {
      const vinculos = await this.prisma.alunoResponsavel.findMany({
        where: {
          responsavelId: data.userId,
          aluno: {
            schoolId: data.userSchoolId,
            id: data.alunoId?.trim() || undefined,
          },
        },
        select: {
          aluno: {
            select: {
              turmaId: true,
            },
          },
        },
      });

      turmaIds = Array.from(new Set(vinculos.map((item) => item.aluno.turmaId)));
    }

    if (!turmaIds.length) return [];

    const planejamentos = await this.prisma.planejamentoDiarioConteudo.findMany({
      where: {
        schoolId: data.userSchoolId,
        data: {
          gte: inicio,
          lte: fim,
        },
        OR: [
          {
            conteudo: {
              not: null,
            },
          },
          {
            objetivo: {
              not: null,
            },
          },
          {
            metodologia: {
              not: null,
            },
          },
          {
            atividades: {
              not: null,
            },
          },
        ],
        turmaProfessor: {
          turmaId: {
            in: turmaIds,
          },
        },
      },
      include: {
        turmaProfessor: {
          include: {
            professor: {
              select: {
                name: true,
              },
            },
            turma: {
              select: {
                name: true,
                turno: true,
              },
            },
          },
        },
        aula: true,
      },
      orderBy: [
        {
          data: 'asc',
        },
        {
          aula: {
            horaInicio: 'asc',
          },
        },
      ],
    });

    return planejamentos.map((item) => ({
      id: item.id,
      data: this.isoData(item.data),
      conteudo: item.conteudo,
      objetivo: item.objetivo,
      metodologia: item.metodologia,
      atividades: item.atividades,
      planejado: Boolean(
        item.conteudo ||
          item.objetivo ||
          item.metodologia ||
          item.atividades,
      ),
      aula: {
        horaInicio: item.aula.horaInicio,
        horaFim: item.aula.horaFim,
      },
      turmaProfessor: {
        id: item.turmaProfessor.id,
        disciplina: item.turmaProfessor.disciplina,
        professor: item.turmaProfessor.professor,
        turma: item.turmaProfessor.turma,
      },
    }));
  }

  async listarMeuCalendario(data: AuthData & { mes?: string; alunoId?: string }) {
    if (!data.userSchoolId) {
      throw new ForbiddenException('Usuario sem escola vinculada.');
    }

    const match = /^(\d{4})-(\d{2})$/.exec(data.mes || '');
    const hoje = new Date();
    const ano = match ? Number(match[1]) : hoje.getFullYear();
    const mes = match ? Number(match[2]) : hoje.getMonth() + 1;
    const inicio = new Date(Date.UTC(ano, mes - 1, 1));
    const fim = new Date(Date.UTC(ano, mes, 0, 23, 59, 59, 999));

    let turmaIds: string[] = [];

    if (data.userRole === UserRole.ALUNO) {
      const aluno = await this.prisma.aluno.findFirst({
        where: {
          userId: data.userId,
          schoolId: data.userSchoolId,
        },
        select: {
          turmaId: true,
        },
      });

      turmaIds = aluno ? [aluno.turmaId] : [];
    } else if (data.userRole === UserRole.RESPONSAVEL) {
      const vinculos = await this.prisma.alunoResponsavel.findMany({
        where: {
          responsavelId: data.userId,
          aluno: {
            schoolId: data.userSchoolId,
            id: data.alunoId?.trim() || undefined,
          },
        },
        select: {
          aluno: {
            select: {
              turmaId: true,
            },
          },
        },
      });

      turmaIds = Array.from(new Set(vinculos.map((item) => item.aluno.turmaId)));
    }

    if (!turmaIds.length) return [];

    const turmasProfessor = await this.prisma.turmaProfessor.findMany({
      where: {
        turmaId: {
          in: turmaIds,
        },
        turma: {
          schoolId: data.userSchoolId,
        },
      },
      include: {
        professor: {
          select: {
            name: true,
          },
        },
        turma: {
          select: {
            name: true,
            turno: true,
          },
        },
        aulas: {
          where: {
            NOT: {
              horaInicio: AULA_AVULSA_HORARIO,
              horaFim: AULA_AVULSA_HORARIO,
            },
          },
        },
        planejamentosDiarios: {
          where: {
            data: {
              gte: inicio,
              lte: fim,
            },
          },
          include: {
            aula: true,
          },
        },
      },
    });

    const planejamentosPorChave = new Map<string, any>();

    for (const turmaProfessor of turmasProfessor) {
      for (const planejamento of turmaProfessor.planejamentosDiarios) {
        planejamentosPorChave.set(
          `${turmaProfessor.id}|${planejamento.aulaId}|${this.isoData(planejamento.data)}`,
          planejamento,
        );
      }
    }

    const itens: any[] = [];
    const chavesInseridas = new Set<string>();

    for (const turmaProfessor of turmasProfessor) {
      for (
        let cursor = new Date(inicio);
        cursor.getTime() <= fim.getTime();
        cursor.setUTCDate(cursor.getUTCDate() + 1)
      ) {
        const diaSemana = DIA_SEMANA[cursor.getUTCDay()];
        const aulasDoDia = turmaProfessor.aulas.filter(
          (aula) => aula.diaSemana === diaSemana,
        );

        for (const aula of aulasDoDia) {
          const dataAula = this.isoData(cursor);
          const chaveItem = `${turmaProfessor.id}|${aula.id}|${dataAula}`;
          const planejamento = planejamentosPorChave.get(
            chaveItem,
          );

          chavesInseridas.add(chaveItem);
          itens.push({
            id:
              planejamento?.id ||
              `${turmaProfessor.id}-${aula.id}-${dataAula}`,
            data: dataAula,
            conteudo: planejamento?.conteudo || null,
            objetivo: planejamento?.objetivo || null,
            metodologia: planejamento?.metodologia || null,
            atividades: planejamento?.atividades || null,
            planejado: Boolean(
              planejamento?.conteudo ||
                planejamento?.objetivo ||
                planejamento?.metodologia ||
                planejamento?.atividades,
            ),
            aula: {
              horaInicio: aula.horaInicio,
              horaFim: aula.horaFim,
            },
            turmaProfessor: {
              id: turmaProfessor.id,
              disciplina: turmaProfessor.disciplina,
              professor: turmaProfessor.professor,
              turma: turmaProfessor.turma,
            },
          });
        }
      }

      for (const planejamento of turmaProfessor.planejamentosDiarios) {
        const dataAula = this.isoData(planejamento.data);
        const chaveItem = `${turmaProfessor.id}|${planejamento.aulaId}|${dataAula}`;

        if (
          chavesInseridas.has(chaveItem) ||
          !(
            planejamento.conteudo ||
            planejamento.objetivo ||
            planejamento.metodologia ||
            planejamento.atividades
          )
        ) {
          continue;
        }

        chavesInseridas.add(chaveItem);
        itens.push({
          id: planejamento.id,
          data: dataAula,
          conteudo: planejamento.conteudo || null,
          objetivo: planejamento.objetivo || null,
          metodologia: planejamento.metodologia || null,
          atividades: planejamento.atividades || null,
          planejado: true,
          aula: {
            horaInicio: planejamento.aula.horaInicio,
            horaFim: planejamento.aula.horaFim,
          },
          turmaProfessor: {
            id: turmaProfessor.id,
            disciplina: turmaProfessor.disciplina,
            professor: turmaProfessor.professor,
            turma: turmaProfessor.turma,
          },
        });
      }
    }

    return itens.sort((a, b) => {
      if (a.data !== b.data) return a.data.localeCompare(b.data);
      return a.aula.horaInicio.localeCompare(b.aula.horaInicio);
    });
  }

  async obterImpressao(data: AuthData & { turmaProfessorId: string; ano: number }) {
    if (data.userRole !== UserRole.PROFESSOR && !this.isGestao(data.userRole)) {
      throw new ForbiddenException('Sem permissão para imprimir conteúdos.');
    }

    const ano = this.validarAno(data.ano);
    const turmaProfessor = await this.buscarTurmaProfessor(data);
    const planejamentos = await this.prisma.planejamentoDiarioConteudo.findMany({
      where: {
        turmaProfessorId: turmaProfessor.id,
        data: {
          gte: new Date(Date.UTC(ano, 0, 1)),
          lte: new Date(Date.UTC(ano, 11, 31, 23, 59, 59, 999)),
        },
        conteudo: {
          not: null,
        },
      },
      include: {
        aula: true,
      },
      orderBy: [
        {
          data: 'asc',
        },
        {
          aula: {
            horaInicio: 'asc',
          },
        },
      ],
    });

    return {
      escola: turmaProfessor.turma.school,
      turma: turmaProfessor.turma,
      professor: turmaProfessor.professor,
      disciplina: turmaProfessor.disciplina,
      ano,
      conteudos: planejamentos.map((item) => ({
        data: this.isoData(item.data),
        horaInicio: item.aula.horaInicio,
        horaFim: item.aula.horaFim,
        conteudo: item.conteudo,
      })),
    };
  }
}

