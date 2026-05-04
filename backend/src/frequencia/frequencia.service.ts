import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CalendarioLetivoAbrangencia,
  CalendarioLetivoTipo,
  FrequenciaStatus,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class FrequenciaService {
  constructor(private readonly prisma: PrismaService) {}

  private async buscarTurmaProfessorValido(
    turmaProfessorId: string,
    schoolId: string,
  ) {
    const turmaProfessor = await this.prisma.turmaProfessor.findFirst({
      where: {
        id: turmaProfessorId,
        turma: {
          schoolId,
        },
      },
      include: {
        turma: {
          select: {
            id: true,
            name: true,
            schoolId: true,
          },
        },
        professor: {
          select: {
            id: true,
            name: true,
            role: true,
            schoolId: true,
          },
        },
      },
    });

    if (!turmaProfessor) {
      throw new NotFoundException(
        'Vínculo de professor com turma/disciplina não encontrado.',
      );
    }

    return turmaProfessor;
  }

  private normalizarData(dataLancamento: string) {
    const dataNormalizada = new Date(`${dataLancamento}T00:00:00.000Z`);

    if (Number.isNaN(dataNormalizada.getTime())) {
      throw new BadRequestException('Data inválida para frequência.');
    }

    return dataNormalizada;
  }

  private obterDataAtualISO() {
    const hoje = new Date();
    const ano = hoje.getFullYear();
    const mes = String(hoje.getMonth() + 1).padStart(2, '0');
    const dia = String(hoje.getDate()).padStart(2, '0');
    return `${ano}-${mes}-${dia}`;
  }

  private obterIntervaloMes(mesReferencia: string) {
    const match = /^(\d{4})-(\d{2})$/.exec(mesReferencia);

    if (!match) {
      throw new BadRequestException('Mês inválido. Use o formato YYYY-MM.');
    }

    const ano = Number(match[1]);
    const mes = Number(match[2]);

    if (mes < 1 || mes > 12) {
      throw new BadRequestException('Mês inválido. Use um mês entre 01 e 12.');
    }

    const inicio = new Date(Date.UTC(ano, mes - 1, 1, 0, 0, 0, 0));
    const fim = new Date(Date.UTC(ano, mes, 0, 23, 59, 59, 999));

    return { inicio, fim, ano, mes };
  }

    private validarGestaoCalendario(userRole: UserRole, userSchoolId?: string | null) {
    if (
      userRole !== UserRole.SUPERUSUARIO &&
      userRole !== UserRole.ADMIN_ESCOLA &&
      userRole !== UserRole.GESTOR &&
      userRole !== UserRole.SECRETARIA
    ) {
      throw new ForbiddenException(
        'Somente a gestão pode gerenciar o calendário letivo da frequência.',
      );
    }

    if (userRole !== UserRole.SUPERUSUARIO && !userSchoolId) {
      throw new ForbiddenException('Usuário sem escola vinculada.');
    }
  }

  private normalizarIntervaloDatas(dataInicio: string, dataFim: string) {
    const inicio = new Date(`${dataInicio}T00:00:00.000Z`);
    const fim = new Date(`${dataFim}T23:59:59.999Z`);

    if (Number.isNaN(inicio.getTime()) || Number.isNaN(fim.getTime())) {
      throw new BadRequestException('Período inválido.');
    }

    if (inicio.getTime() > fim.getTime()) {
      throw new BadRequestException(
        'A data inicial não pode ser maior do que a data final.',
      );
    }

    return { inicio, fim };
  }

  private eventoAtingeTurma(
    evento: {
      abrangencia: CalendarioLetivoAbrangencia;
      turmaId?: string | null;
      turmasExcecao?: Array<{
        turmaId: string;
      }>;
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
      const turmaEstaNasExcecoes =
        evento.turmasExcecao?.some((item) => item.turmaId === turmaId) || false;

      return !turmaEstaNasExcecoes;
    }

    return false;
  }

  private async validarTurmaDaEscola(schoolId: string, turmaId?: string) {
  if (!turmaId) return null;

  const turma = await this.prisma.turma.findFirst({
    where: {
      id: turmaId,
      schoolId,
    },
    select: {
      id: true,
      name: true,
      schoolId: true,
    },
  });

  if (!turma) {
    throw new NotFoundException('Turma não encontrada para esta escola.');
  }

  return turma;
}

  private async validarTurmasDaEscola(schoolId: string, turmaIds: string[]) {
    if (!turmaIds.length) return [];

    const turmas = await this.prisma.turma.findMany({
      where: {
        schoolId,
        id: {
          in: turmaIds,
        },
      },
      select: {
        id: true,
        name: true,
        turno: true,
        schoolId: true,
      },
    });

    if (turmas.length !== turmaIds.length) {
      throw new NotFoundException(
        'Uma ou mais turmas informadas não pertencem a esta escola.',
      );
    }

    return turmas;
  }

  private async buscarBloqueioCalendarioParaTurmaEData(data: {
    schoolId: string;
    turmaId: string;
    dataReferencia: Date;
  }) {
    const eventos = await this.prisma.calendarioLetivo.findMany({
      where: {
        schoolId: data.schoolId,
        dataInicio: {
          lte: data.dataReferencia,
        },
        dataFim: {
          gte: data.dataReferencia,
        },
      },
      include: {
        turmasExcecao: {
          select: {
            turmaId: true,
          },
        },
      },
      orderBy: [
        {
          dataInicio: 'asc',
        },
        {
          createdAt: 'asc',
        },
      ],
    });

    const eventoAplicavel = eventos.find((evento) =>
      this.eventoAtingeTurma(
        {
          abrangencia: evento.abrangencia,
          turmaId: evento.turmaId,
          turmasExcecao: evento.turmasExcecao,
        },
        data.turmaId,
      ),
    );

    if (!eventoAplicavel) {
      return null;
    }

    return {
      id: eventoAplicavel.id,
      tipo: eventoAplicavel.tipo,
      abrangencia: eventoAplicavel.abrangencia,
      motivo: eventoAplicavel.motivo,
      dataInicio: eventoAplicavel.dataInicio,
      dataFim: eventoAplicavel.dataFim,
      turmaId: eventoAplicavel.turmaId,
    };
  }

  async listarTurmasDaEscola(data: {
    userRole: UserRole;
    userSchoolId?: string | null;
  }) {
    this.validarGestaoCalendario(data.userRole, data.userSchoolId);

    return this.prisma.turma.findMany({
      where: {
        schoolId: data.userSchoolId || '',
      },
      select: {
        id: true,
        name: true,
        turno: true,
      },
      orderBy: [
        {
          name: 'asc',
        },
        {
          turno: 'asc',
        },
      ],
    });
  }

  async listarCalendarioLetivo(data: {
    userId: string;
    userRole: UserRole;
    userSchoolId?: string | null;
    mesReferencia: string;
    turmaId?: string;
  }) {
    this.validarGestaoCalendario(data.userRole, data.userSchoolId);

    const { inicio, fim } = this.obterIntervaloMes(data.mesReferencia);

    if (data.userRole !== UserRole.SUPERUSUARIO && data.turmaId) {
      await this.validarTurmaDaEscola(data.userSchoolId || '', data.turmaId);
    }

    const eventos = await this.prisma.calendarioLetivo.findMany({
      where: {
        schoolId: data.userSchoolId || '',
        dataInicio: {
          lte: fim,
        },
        dataFim: {
          gte: inicio,
        },
      },
      include: {
        turma: {
          select: {
            id: true,
            name: true,
            turno: true,
          },
        },
        turmasExcecao: {
          include: {
            turma: {
              select: {
                id: true,
                name: true,
                turno: true,
              },
            },
          },
        },
    createdBy: {
      select: {
        id: true,
        name: true,
        role: true,
      },
    },
  },
      orderBy: [
        {
          dataInicio: 'asc',
        },
        {
          motivo: 'asc',
        },
      ],
    });

    const filtrados = data.turmaId
      ? eventos.filter((evento) =>
          this.eventoAtingeTurma(
            {
              abrangencia: evento.abrangencia,
              turmaId: evento.turmaId,
              turmasExcecao: evento.turmasExcecao.map((item) => ({
                turmaId: item.turmaId,
              })),
            },
            data.turmaId!,
          ),
        )
      : eventos;

    return filtrados.map((evento) => ({
      id: evento.id,
      tipo: evento.tipo,
      abrangencia: evento.abrangencia,
      motivo: evento.motivo,
      dataInicio: evento.dataInicio,
      dataFim: evento.dataFim,
      turmaId: evento.turmaId,
      turma: evento.turma,
      turmasExcecao: evento.turmasExcecao.map((item) => ({
        id: item.id,
        turmaId: item.turmaId,
        turma: item.turma,
      })),
      createdBy: evento.createdBy,
    }));
  }

  async criarCalendarioLetivo(data: {
    userId: string;
    userRole: UserRole;
    userSchoolId?: string | null;
    tipo: CalendarioLetivoTipo;
    abrangencia: CalendarioLetivoAbrangencia;
    motivo: string;
    dataInicio: string;
    dataFim: string;
    turmaId?: string;
    turmasExcecaoIds?: string[];
  }) {
    this.validarGestaoCalendario(data.userRole, data.userSchoolId);

    const schoolId = data.userSchoolId || '';
    const { inicio, fim } = this.normalizarIntervaloDatas(
      data.dataInicio,
      data.dataFim,
    );

    const exigeTurmaPrincipal =
  data.abrangencia === CalendarioLetivoAbrangencia.APENAS_TURMA;

    const exigeTurmasExcecao =
      data.abrangencia ===
      CalendarioLetivoAbrangencia.ESCOLA_INTEIRA_EXCETO_TURMA;

    if (exigeTurmaPrincipal && !data.turmaId) {
      throw new BadRequestException(
        'Selecione a turma quando a abrangência for apenas turma.',
      );
    }

    if (!exigeTurmaPrincipal && data.turmaId) {
      throw new BadRequestException(
        'Não informe turma principal para esta abrangência.',
      );
    }

    const turmasExcecaoIds = Array.from(
      new Set((data.turmasExcecaoIds || []).filter(Boolean)),
    );

    if (exigeTurmasExcecao && !turmasExcecaoIds.length) {
      throw new BadRequestException(
        'Selecione pelo menos uma turma de exceção.',
      );
    }

    if (!exigeTurmasExcecao && turmasExcecaoIds.length) {
      throw new BadRequestException(
        'Turmas de exceção só podem ser usadas em "escola inteira, menos turma".',
      );
    }

    if (data.turmaId) {
      await this.validarTurmaDaEscola(schoolId, data.turmaId);
    }

    if (turmasExcecaoIds.length) {
      await this.validarTurmasDaEscola(schoolId, turmasExcecaoIds);
    }

    return this.prisma.calendarioLetivo.create({
      data: {
        schoolId,
        turmaId: data.turmaId || null,
        tipo: data.tipo,
        abrangencia: data.abrangencia,
        motivo: data.motivo,
        dataInicio: inicio,
        dataFim: fim,
        createdById: data.userId,
        turmasExcecao: {
          create: turmasExcecaoIds.map((turmaId) => ({
            turmaId,
          })),
        },
      },
      include: {
        turma: {
          select: {
            id: true,
            name: true,
            turno: true,
          },
        },
        turmasExcecao: {
          include: {
            turma: {
              select: {
                id: true,
                name: true,
                turno: true,
              },
            },
          },
        },
        createdBy: {
          select: {
            id: true,
            name: true,
            role: true,
          },
        },
      },
    });
  }

  async excluirCalendarioLetivo(data: {
    id: string;
    userRole: UserRole;
    userSchoolId?: string | null;
  }) {
    this.validarGestaoCalendario(data.userRole, data.userSchoolId);

    const where =
      data.userRole === UserRole.SUPERUSUARIO
        ? { id: data.id }
        : { id: data.id, schoolId: data.userSchoolId || '' };

    const evento = await this.prisma.calendarioLetivo.findFirst({
      where,
      select: {
        id: true,
      },
    });

    if (!evento) {
      throw new NotFoundException('Evento do calendário letivo não encontrado.');
    }

    return this.prisma.calendarioLetivo.delete({
      where: {
        id: evento.id,
      },
    });
  }

  private consolidarStatusDiario(
    registrosDia: Array<{
      status: FrequenciaStatus;
      faltaJustificada: boolean;
    }>,
  ) {
    const totalPresencas = registrosDia.filter(
      (item) => item.status === FrequenciaStatus.PRESENTE,
    ).length;

    const totalFaltas = registrosDia.filter(
      (item) => item.status === FrequenciaStatus.FALTA,
    ).length;

    const statusConsolidado =
      registrosDia.length === 0
        ? null
        : totalFaltas > totalPresencas
          ? FrequenciaStatus.FALTA
          : FrequenciaStatus.PRESENTE;

    const faltas = registrosDia.filter(
      (item) => item.status === FrequenciaStatus.FALTA,
    );

    const faltaJustificada =
      statusConsolidado === FrequenciaStatus.FALTA &&
      faltas.length > 0 &&
      faltas.every((item) => item.faltaJustificada);

    return {
      totalPresencas,
      totalFaltas,
      statusConsolidado,
      faltaJustificada,
    };
  }

  private async resolverAlunoDaVisaoPropria(data: {
    userId: string;
    userRole: UserRole;
    userSchoolId?: string | null;
    alunoIdSelecionado?: string;
  }) {
    if (data.userRole !== UserRole.ALUNO && data.userRole !== UserRole.RESPONSAVEL) {
      throw new ForbiddenException('Sem permissão para acessar esta visualização.');
    }

    const usuario = await this.prisma.user.findUnique({
      where: {
        id: data.userId,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        schoolId: true,
      },
    });

    if (!usuario) {
      throw new NotFoundException('Usuário não encontrado.');
    }

    const schoolId = usuario.schoolId || data.userSchoolId || '';

    if (!schoolId) {
      throw new ForbiddenException('Usuário sem escola vinculada.');
    }

    if (data.userRole === UserRole.ALUNO) {
      const aluno = await this.prisma.aluno.findFirst({
        where: {
          schoolId,
          name: usuario.name,
        },
        include: {
          turma: {
            select: {
              id: true,
              name: true,
              turno: true,
              school: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
        },
      });

      if (!aluno) {
        throw new NotFoundException('Aluno vinculado ao usuário não encontrado.');
      }

      return {
        aluno,
        alunosDisponiveis: [
          {
            id: aluno.id,
            name: aluno.name,
            matricula: aluno.matricula,
            turmaNome: aluno.turma.name,
          },
        ],
      };
    }

    const vinculos = await this.prisma.alunoResponsavel.findMany({
      where: {
        responsavelId: data.userId,
      },
      include: {
        aluno: {
          include: {
            turma: {
              select: {
                id: true,
                name: true,
                turno: true,
                school: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: {
        aluno: {
          name: 'asc',
        },
      },
    });

    if (!vinculos.length) {
      throw new NotFoundException(
        'Nenhum aluno vinculado a este responsável foi encontrado.',
      );
    }

    const alunoSelecionado =
      vinculos.find((item) => item.alunoId === data.alunoIdSelecionado)?.aluno ||
      vinculos[0].aluno;

    return {
      aluno: alunoSelecionado,
      alunosDisponiveis: vinculos.map((item) => ({
        id: item.aluno.id,
        name: item.aluno.name,
        matricula: item.aluno.matricula,
        turmaNome: item.aluno.turma.name,
      })),
    };
  }

  async listarMinhasDisciplinas(data: {
    userId: string;
    userRole: UserRole;
    userSchoolId?: string | null;
  }) {
    if (
      data.userRole !== UserRole.PROFESSOR &&
      data.userRole !== UserRole.SUPERUSUARIO &&
      data.userRole !== UserRole.ADMIN_ESCOLA &&
      data.userRole !== UserRole.GESTOR &&
      data.userRole !== UserRole.SECRETARIA
    ) {
      throw new ForbiddenException(
        'Sem permissão para acessar esta listagem.',
      );
    }

    if (data.userRole !== UserRole.SUPERUSUARIO && !data.userSchoolId) {
      throw new ForbiddenException('Usuário sem escola vinculada.');
    }

    return this.prisma.turmaProfessor.findMany({
      where:
        data.userRole === UserRole.PROFESSOR
          ? {
              professorId: data.userId,
              turma: {
                schoolId: data.userSchoolId!,
              },
            }
          : {
              turma: {
                schoolId: data.userSchoolId || '',
              },
            },
      select: {
        id: true,
        disciplina: true,
        cargaHoraria: true,
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
          turma: {
            name: 'asc',
          },
        },
        {
          disciplina: 'asc',
        },
      ],
    });
  }

  async listarAlunosDaDisciplinaPorData(data: {
    userId: string;
    userRole: UserRole;
    userSchoolId?: string | null;
    turmaProfessorId: string;
    dataLancamento: string;
  }) {
    if (
      data.userRole !== UserRole.PROFESSOR &&
      data.userRole !== UserRole.GESTOR &&
      data.userRole !== UserRole.ADMIN_ESCOLA &&
      data.userRole !== UserRole.SECRETARIA &&
      data.userRole !== UserRole.SUPERUSUARIO
    ) {
      throw new ForbiddenException(
        'Sem permissão para acessar esta listagem de frequência.',
      );
    }

    if (data.userRole !== UserRole.SUPERUSUARIO && !data.userSchoolId) {
      throw new ForbiddenException('Usuário sem escola vinculada.');
    }

    const turmaProfessor = await this.buscarTurmaProfessorValido(
      data.turmaProfessorId,
      data.userSchoolId || '',
    );

    if (
      data.userRole === UserRole.PROFESSOR &&
      turmaProfessor.professorId !== data.userId
    ) {
      throw new ForbiddenException(
        'Você só pode acessar as disciplinas vinculadas a você.',
      );
    }

    const dataNormalizada = this.normalizarData(data.dataLancamento);

    const bloqueioCalendario = await this.buscarBloqueioCalendarioParaTurmaEData({
      schoolId: turmaProfessor.turma.schoolId,
      turmaId: turmaProfessor.turmaId,
      dataReferencia: dataNormalizada,
    });

    const alunos = await this.prisma.aluno.findMany({
      where: {
        turmaId: turmaProfessor.turmaId,
        schoolId: turmaProfessor.turma.schoolId,
      },
      select: {
        id: true,
        name: true,
        matricula: true,
        status: true,
      },
      orderBy: {
        name: 'asc',
      },
    });

    const alunoIds = alunos.map((aluno) => aluno.id);

    const frequencias = await this.prisma.frequencia.findMany({
      where: {
        turmaProfessorId: data.turmaProfessorId,
        schoolId: turmaProfessor.turma.schoolId,
        dataLancamento: dataNormalizada,
        alunoId: {
          in: alunoIds,
        },
      },
      orderBy: {
        alunoId: 'asc',
      },
    });

    return {
      turmaProfessor: {
        id: turmaProfessor.id,
        disciplina: turmaProfessor.disciplina,
        turmaId: turmaProfessor.turmaId,
        turmaNome: turmaProfessor.turma.name,
      },
      dataLancamento: data.dataLancamento,
      bloqueioCalendario,
      alunos,
      frequencias: frequencias.map((item) => ({
        id: item.id,
        alunoId: item.alunoId,
        turmaProfessorId: item.turmaProfessorId,
        dataLancamento: item.dataLancamento,
        status: item.status,
        faltaJustificada: item.faltaJustificada,
        observacao: item.observacao,
      })),
    };
  }

  async listarResumoMensalTurma(data: {
    userId: string;
    userRole: UserRole;
    userSchoolId?: string | null;
    turmaProfessorId: string;
    mesReferencia: string;
  }) {
    if (
      data.userRole !== UserRole.PROFESSOR &&
      data.userRole !== UserRole.GESTOR &&
      data.userRole !== UserRole.ADMIN_ESCOLA &&
      data.userRole !== UserRole.SECRETARIA &&
      data.userRole !== UserRole.SUPERUSUARIO
    ) {
      throw new ForbiddenException(
        'Sem permissão para acessar o resumo mensal de frequência.',
      );
    }

    if (data.userRole !== UserRole.SUPERUSUARIO && !data.userSchoolId) {
      throw new ForbiddenException('Usuário sem escola vinculada.');
    }

    const turmaProfessor = await this.buscarTurmaProfessorValido(
      data.turmaProfessorId,
      data.userSchoolId || '',
    );

    if (
      data.userRole === UserRole.PROFESSOR &&
      turmaProfessor.professorId !== data.userId
    ) {
      throw new ForbiddenException(
        'Você só pode acessar as disciplinas vinculadas a você.',
      );
    }

    const { inicio, fim, ano, mes } = this.obterIntervaloMes(data.mesReferencia);

    const alunos = await this.prisma.aluno.findMany({
      where: {
        turmaId: turmaProfessor.turmaId,
        schoolId: turmaProfessor.turma.schoolId,
      },
      select: {
        id: true,
        name: true,
        matricula: true,
        status: true,
      },
      orderBy: {
        name: 'asc',
      },
    });

    const alunoIds = alunos.map((aluno) => aluno.id);

    const frequencias = await this.prisma.frequencia.findMany({
      where: {
        turmaProfessorId: data.turmaProfessorId,
        schoolId: turmaProfessor.turma.schoolId,
        alunoId: {
          in: alunoIds,
        },
        dataLancamento: {
          gte: inicio,
          lte: fim,
        },
      },
      orderBy: [{ dataLancamento: 'asc' }, { alunoId: 'asc' }],
    });

    const quantidadeDiasNoMes = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
    const dias = Array.from({ length: quantidadeDiasNoMes }, (_, index) => index + 1);

    return {
      turmaProfessor: {
        id: turmaProfessor.id,
        disciplina: turmaProfessor.disciplina,
        turmaId: turmaProfessor.turmaId,
        turmaNome: turmaProfessor.turma.name,
      },
      mesReferencia: data.mesReferencia,
      dias,
      alunos,
      frequencias: frequencias.map((item) => ({
        id: item.id,
        alunoId: item.alunoId,
        dia: item.dataLancamento.getUTCDate(),
        status: item.status,
        faltaJustificada: item.faltaJustificada,
        observacao: item.observacao,
      })),
    };
  }

  async visualizarMinhaFrequencia(data: {
    userId: string;
    userRole: UserRole;
    userSchoolId?: string | null;
    mesReferencia: string;
    alunoIdSelecionado?: string;
  }) {
    if (data.userRole !== UserRole.ALUNO && data.userRole !== UserRole.RESPONSAVEL) {
      throw new ForbiddenException('Sem permissão para acessar esta visualização.');
    }

    const { aluno, alunosDisponiveis } = await this.resolverAlunoDaVisaoPropria({
      userId: data.userId,
      userRole: data.userRole,
      userSchoolId: data.userSchoolId,
      alunoIdSelecionado: data.alunoIdSelecionado,
    });

    const { inicio, fim, ano, mes } = this.obterIntervaloMes(data.mesReferencia);

    const frequencias = await this.prisma.frequencia.findMany({
      where: {
        alunoId: aluno.id,
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
        {
          dataLancamento: 'asc',
        },
        {
          turmaProfessor: {
            disciplina: 'asc',
          },
        },
      ],
    });

    const quantidadeDiasNoMes = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
    const dias = Array.from({ length: quantidadeDiasNoMes }, (_, index) => index + 1);

    const porDisciplinaMap = new Map<
      string,
      {
        turmaProfessorId: string;
        disciplina: string;
        registros: Array<{
          id: string;
          dia: number;
          status: FrequenciaStatus;
          faltaJustificada: boolean;
          observacao?: string | null;
        }>;
      }
    >();

    for (const item of frequencias) {
      const chave = item.turmaProfessor.disciplina;

      if (!porDisciplinaMap.has(chave)) {
        porDisciplinaMap.set(chave, {
          turmaProfessorId: item.turmaProfessor.id,
          disciplina: item.turmaProfessor.disciplina,
          registros: [],
        });
      }

      porDisciplinaMap.get(chave)!.registros.push({
        id: item.id,
        dia: item.dataLancamento.getUTCDate(),
        status: item.status,
        faltaJustificada: item.faltaJustificada,
        observacao: item.observacao,
      });
    }

    const diario = dias.map((dia) => {
      const registrosDia = frequencias
        .filter((item) => item.dataLancamento.getUTCDate() === dia)
        .map((item) => ({
          status: item.status,
          faltaJustificada: item.faltaJustificada,
        }));

      const consolidado = this.consolidarStatusDiario(registrosDia);

      return {
        dia,
        totalPresencas: consolidado.totalPresencas,
        totalFaltas: consolidado.totalFaltas,
        statusConsolidado: consolidado.statusConsolidado,
        faltaJustificada: consolidado.faltaJustificada,
      };
    });

    const eventosCalendario = await this.prisma.calendarioLetivo.findMany({
      where: {
        schoolId: aluno.schoolId,
        dataInicio: {
          lte: fim,
        },
        dataFim: {
          gte: inicio,
        },
      },
      include: {
        turma: {
          select: {
            id: true,
            name: true,
            turno: true,
          },
        },
        turmasExcecao: {
          include: {
            turma: {
              select: {
                id: true,
                name: true,
                turno: true,
              },
            },
          },
        },
      },
      orderBy: [
        {
          dataInicio: 'asc',
        },
      ],
    });

    const eventosAplicados = eventosCalendario
      .filter((evento) =>
        this.eventoAtingeTurma(
          {
            abrangencia: evento.abrangencia,
            turmaId: evento.turmaId,
            turmasExcecao: evento.turmasExcecao.map((item) => ({
              turmaId: item.turmaId,
            })),
          },
          aluno.turmaId,
        ),
      )
      .map((evento) => ({
        id: evento.id,
        tipo: evento.tipo,
        abrangencia: evento.abrangencia,
        motivo: evento.motivo,
        dataInicio: evento.dataInicio,
        dataFim: evento.dataFim,
        turmaId: evento.turmaId,
        turma: evento.turma,
        turmasExcecao: evento.turmasExcecao.map((item) => ({
          id: item.id,
          turmaId: item.turmaId,
          turma: item.turma,
        })),
      }));

    return {
      aluno: {
        id: aluno.id,
        name: aluno.name,
        matricula: aluno.matricula,
        status: aluno.status,
      },
      turma: {
        id: aluno.turma.id,
        name: aluno.turma.name,
        turno: aluno.turma.turno,
      },
      escola: {
        id: aluno.turma.school.id,
        name: aluno.turma.school.name,
      },
      mesReferencia: data.mesReferencia,
      dias,
      alunosDisponiveis,
      diario,
      eventosCalendario: eventosAplicados,
      porDisciplina: Array.from(porDisciplinaMap.values()).sort((a, b) =>
        a.disciplina.localeCompare(b.disciplina),
      ),
    };
  }

  async frequenciaDoDia(data: {
    userId: string;
    userRole: UserRole;
    userSchoolId?: string | null;
    alunoIdSelecionado?: string;
  }) {
    if (data.userRole !== UserRole.ALUNO && data.userRole !== UserRole.RESPONSAVEL) {
      throw new ForbiddenException('Sem permissão para acessar esta visualização.');
    }

    const { aluno, alunosDisponiveis } = await this.resolverAlunoDaVisaoPropria({
      userId: data.userId,
      userRole: data.userRole,
      userSchoolId: data.userSchoolId,
      alunoIdSelecionado: data.alunoIdSelecionado,
    });

    const hoje = new Date();
    const diaSemana = hoje.getDay();
    const dataReferencia = this.obterDataAtualISO();

    if (diaSemana === 0 || diaSemana === 6) {
      return {
        dataReferencia,
        ehFimDeSemana: true,
        semLancamento: false,
        aluno: {
          id: aluno.id,
          name: aluno.name,
          matricula: aluno.matricula,
        },
        turma: {
          id: aluno.turma.id,
          name: aluno.turma.name,
          turno: aluno.turma.turno,
        },
        alunosDisponiveis,
        totalAulas: 0,
        totalPresencasDisciplinas: 0,
        totalFaltasDisciplinas: 0,
        statusConsolidado: null,
        faltaJustificada: false,
        disciplinas: [],
      };
    }

    const dataNormalizada = this.normalizarData(dataReferencia);

    const frequencias = await this.prisma.frequencia.findMany({
      where: {
        alunoId: aluno.id,
        dataLancamento: dataNormalizada,
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
          disciplina: 'asc',
        },
      },
    });

    const consolidado = this.consolidarStatusDiario(
      frequencias.map((item) => ({
        status: item.status,
        faltaJustificada: item.faltaJustificada,
      })),
    );

    const eventoCalendario = await this.buscarBloqueioCalendarioParaTurmaEData({
      schoolId: aluno.schoolId,
      turmaId: aluno.turmaId,
      dataReferencia: dataNormalizada,
    });

    return {
      dataReferencia,
      ehFimDeSemana: false,
      semLancamento: frequencias.length === 0,
      aluno: {
        id: aluno.id,
        name: aluno.name,
        matricula: aluno.matricula,
      },
      turma: {
        id: aluno.turma.id,
        name: aluno.turma.name,
        turno: aluno.turma.turno,
      },
      alunosDisponiveis,
      totalAulas: frequencias.length,
      totalPresencasDisciplinas: consolidado.totalPresencas,
      totalFaltasDisciplinas: consolidado.totalFaltas,
      statusConsolidado: consolidado.statusConsolidado,
      faltaJustificada: consolidado.faltaJustificada,
      eventoCalendario,
      disciplinas: frequencias.map((item) => ({
        id: item.id,
        disciplina: item.turmaProfessor.disciplina,
        status: item.status,
        faltaJustificada: item.faltaJustificada,
        observacao: item.observacao,
      })),
    };
  }

  async lancarFrequencia(data: {
    userId: string;
    userRole: UserRole;
    userSchoolId?: string | null;
    alunoId: string;
    turmaProfessorId: string;
    dataLancamento: string;
    status: FrequenciaStatus;
    observacao?: string;
    faltaJustificada?: boolean;
  }) {
    if (data.userRole !== UserRole.PROFESSOR) {
      throw new ForbiddenException(
        'Somente professores podem lançar frequência.',
      );
    }

    if (!data.userSchoolId) {
      throw new ForbiddenException('Professor sem escola vinculada.');
    }

    if (data.faltaJustificada) {
      throw new ForbiddenException(
        'Professor não pode marcar falta justificada.',
      );
    }

    const aluno = await this.prisma.aluno.findFirst({
      where: {
        id: data.alunoId,
        schoolId: data.userSchoolId,
      },
      select: {
        id: true,
        turmaId: true,
      },
    });

    if (!aluno) {
      throw new NotFoundException('Aluno não encontrado.');
    }

    const turmaProfessor = await this.buscarTurmaProfessorValido(
      data.turmaProfessorId,
      data.userSchoolId,
    );

    if (turmaProfessor.professorId !== data.userId) {
      throw new ForbiddenException(
        'Você só pode lançar frequência da sua própria disciplina.',
      );
    }

    if (turmaProfessor.turmaId !== aluno.turmaId) {
      throw new BadRequestException(
        'Este professor/disciplina não pertence à turma do aluno.',
      );
    }

    const dataNormalizada = this.normalizarData(data.dataLancamento);

    const bloqueioCalendario = await this.buscarBloqueioCalendarioParaTurmaEData({
      schoolId: data.userSchoolId,
      turmaId: turmaProfessor.turmaId,
      dataReferencia: dataNormalizada,
    });

    if (bloqueioCalendario) {
      throw new BadRequestException(
        `Não é possível lançar frequência nesta data. Motivo: ${bloqueioCalendario.motivo}.`,
      );
    }

    return this.prisma.frequencia.upsert({
      where: {
        alunoId_turmaProfessorId_dataLancamento: {
          alunoId: data.alunoId,
          turmaProfessorId: data.turmaProfessorId,
          dataLancamento: dataNormalizada,
        },
      },
      update: {
        status: data.status,
        faltaJustificada: false,
        observacao: data.observacao?.trim() || null,
        professorId: data.userId,
        schoolId: data.userSchoolId,
      },
      create: {
        alunoId: data.alunoId,
        turmaProfessorId: data.turmaProfessorId,
        schoolId: data.userSchoolId,
        professorId: data.userId,
        dataLancamento: dataNormalizada,
        status: data.status,
        faltaJustificada: false,
        observacao: data.observacao?.trim() || null,
      },
      include: {
        aluno: {
          select: {
            id: true,
            name: true,
          },
        },
        turmaProfessor: {
          select: {
            id: true,
            disciplina: true,
          },
        },
      },
    });
  }

  async lancarFrequenciaEmMassa(data: {
    userId: string;
    userRole: UserRole;
    userSchoolId?: string | null;
    turmaProfessorId: string;
    dataLancamento: string;
    lancamentos: Array<{
      alunoId: string;
      status: FrequenciaStatus;
      observacao?: string;
      faltaJustificada?: boolean;
    }>;
  }) {
    if (
      data.userRole !== UserRole.PROFESSOR &&
      data.userRole !== UserRole.SUPERUSUARIO &&
      data.userRole !== UserRole.ADMIN_ESCOLA &&
      data.userRole !== UserRole.GESTOR &&
      data.userRole !== UserRole.SECRETARIA
    ) {
      throw new ForbiddenException(
        'Sem permissão para lançar frequência.',
      );
    }

    if (data.userRole !== UserRole.SUPERUSUARIO && !data.userSchoolId) {
      throw new ForbiddenException('Usuário sem escola vinculada.');
    }

    if (!data.lancamentos.length) {
      throw new BadRequestException(
        'Informe pelo menos um lançamento de frequência.',
      );
    }

    const turmaProfessor = await this.buscarTurmaProfessorValido(
      data.turmaProfessorId,
      data.userSchoolId || '',
    );

    if (
      data.userRole === UserRole.PROFESSOR &&
      turmaProfessor.professorId !== data.userId
    ) {
      throw new ForbiddenException(
        'Você só pode lançar frequência da sua própria disciplina.',
      );
    }

    const dataNormalizada = this.normalizarData(data.dataLancamento);

    const bloqueioCalendario = await this.buscarBloqueioCalendarioParaTurmaEData({
      schoolId: turmaProfessor.turma.schoolId,
      turmaId: turmaProfessor.turmaId,
      dataReferencia: dataNormalizada,
    });

    if (bloqueioCalendario) {
      throw new BadRequestException(
        `Não é possível lançar frequência nesta data. Motivo: ${bloqueioCalendario.motivo}.`,
      );
    }

    const alunos = await this.prisma.aluno.findMany({
      where: {
        turmaId: turmaProfessor.turmaId,
        schoolId: turmaProfessor.turma.schoolId,
      },
      select: {
        id: true,
        name: true,
        turmaId: true,
      },
    });

    const alunosMap = new Map(alunos.map((aluno) => [aluno.id, aluno]));

    const frequenciasExistentes = await this.prisma.frequencia.findMany({
      where: {
        turmaProfessorId: data.turmaProfessorId,
        schoolId: turmaProfessor.turma.schoolId,
        dataLancamento: dataNormalizada,
        alunoId: {
          in: data.lancamentos.map((item) => item.alunoId),
        },
      },
      select: {
        id: true,
        alunoId: true,
        status: true,
        faltaJustificada: true,
      },
    });

    const frequenciasExistentesMap = new Map(
      frequenciasExistentes.map((item) => [item.alunoId, item]),
    );

    for (const lancamento of data.lancamentos) {
      const aluno = alunosMap.get(lancamento.alunoId);

      if (!aluno) {
        throw new BadRequestException(
          `Aluno inválido informado no lançamento: ${lancamento.alunoId}`,
        );
      }
    }

    const resultados = await this.prisma.$transaction(
      data.lancamentos.map((lancamento) => {
        const frequenciaExistente = frequenciasExistentesMap.get(lancamento.alunoId);

        const professorTentandoAlterarRegistroJustificado =
          data.userRole === UserRole.PROFESSOR &&
          frequenciaExistente?.faltaJustificada;

        if (professorTentandoAlterarRegistroJustificado && frequenciaExistente) {
          return this.prisma.frequencia.update({
            where: {
              id: frequenciaExistente.id,
            },
            data: {},
            include: {
              aluno: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          });
        }

        return this.prisma.frequencia.upsert({
          where: {
            alunoId_turmaProfessorId_dataLancamento: {
              alunoId: lancamento.alunoId,
              turmaProfessorId: data.turmaProfessorId,
              dataLancamento: dataNormalizada,
            },
          },
          update: {
            status: lancamento.status,
            faltaJustificada:
              lancamento.status === FrequenciaStatus.FALTA
                ? Boolean(lancamento.faltaJustificada)
                : false,
            observacao: lancamento.observacao?.trim() || null,
            professorId: turmaProfessor.professorId,
            schoolId: turmaProfessor.turma.schoolId,
          },
          create: {
            alunoId: lancamento.alunoId,
            turmaProfessorId: data.turmaProfessorId,
            schoolId: turmaProfessor.turma.schoolId,
            professorId: turmaProfessor.professorId,
            dataLancamento: dataNormalizada,
            status: lancamento.status,
            faltaJustificada:
              lancamento.status === FrequenciaStatus.FALTA
                ? Boolean(lancamento.faltaJustificada)
                : false,
            observacao: lancamento.observacao?.trim() || null,
          },
          include: {
            aluno: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        });
      }),
    );

    return {
      message: 'Frequência salva com sucesso.',
      totalLancamentos: resultados.length,
      dataLancamento: data.dataLancamento,
      itens: resultados.map((item) => ({
        id: item.id,
        alunoId: item.alunoId,
        alunoNome: item.aluno.name,
        status: item.status,
        faltaJustificada: item.faltaJustificada,
        observacao: item.observacao,
      })),
    };
  }

  async atualizarFaltaJustificada(data: {
    userId: string;
    userRole: UserRole;
    userSchoolId?: string | null;
    frequenciaId: string;
    faltaJustificada: boolean;
  }) {
    if (
      data.userRole !== UserRole.SUPERUSUARIO &&
      data.userRole !== UserRole.ADMIN_ESCOLA &&
      data.userRole !== UserRole.GESTOR &&
      data.userRole !== UserRole.SECRETARIA
    ) {
      throw new ForbiddenException(
        'Somente gestão pode marcar falta justificada.',
      );
    }

    const whereFrequencia =
      data.userRole === UserRole.SUPERUSUARIO
        ? { id: data.frequenciaId }
        : { id: data.frequenciaId, schoolId: data.userSchoolId || '' };

    const frequencia = await this.prisma.frequencia.findFirst({
      where: whereFrequencia,
    });

    if (!frequencia) {
      throw new NotFoundException('Registro de frequência não encontrado.');
    }

    if (frequencia.status !== FrequenciaStatus.FALTA && data.faltaJustificada) {
      throw new BadRequestException(
        'Somente faltas podem ser marcadas como justificadas.',
      );
    }

    return this.prisma.frequencia.update({
      where: {
        id: frequencia.id,
      },
      data: {
        faltaJustificada:
          frequencia.status === FrequenciaStatus.FALTA
            ? data.faltaJustificada
            : false,
      },
      include: {
        aluno: {
          select: {
            id: true,
            name: true,
          },
        },
        turmaProfessor: {
          select: {
            id: true,
            disciplina: true,
          },
        },
      },
    });
  }

  async resumoFrequenciaPorAluno(data: {
    alunoId: string;
    schoolId?: string | null;
    isSuperuser?: boolean;
  }) {
    const whereAluno = data.isSuperuser
      ? { id: data.alunoId }
      : { id: data.alunoId, schoolId: data.schoolId || '' };

    const aluno = await this.prisma.aluno.findFirst({
      where: whereAluno,
      select: {
        id: true,
      },
    });

    if (!aluno) {
      throw new NotFoundException('Aluno não encontrado.');
    }

    const frequencias = await this.prisma.frequencia.findMany({
      where: {
        alunoId: aluno.id,
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
        {
          turmaProfessor: {
            disciplina: 'asc',
          },
        },
        {
          dataLancamento: 'asc',
        },
      ],
    });

    const resumoPorDisciplina: Record<
      string,
      {
        disciplina: string;
        totalPresencas: number;
        totalFaltas: number;
        totalFaltasJustificadas: number;
      }
    > = {};

    for (const item of frequencias) {
      const disciplina = item.turmaProfessor.disciplina;

      if (!resumoPorDisciplina[disciplina]) {
        resumoPorDisciplina[disciplina] = {
          disciplina,
          totalPresencas: 0,
          totalFaltas: 0,
          totalFaltasJustificadas: 0,
        };
      }

      if (item.status === FrequenciaStatus.PRESENTE) {
        resumoPorDisciplina[disciplina].totalPresencas += 1;
      }

      if (item.status === FrequenciaStatus.FALTA) {
        resumoPorDisciplina[disciplina].totalFaltas += 1;

        if (item.faltaJustificada) {
          resumoPorDisciplina[disciplina].totalFaltasJustificadas += 1;
        }
      }
    }

    return Object.values(resumoPorDisciplina);
  }
}