import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ForumAtividadeTipo,
  ForumEnqueteModoEscolha,
  ForumEnqueteVisibilidadeResultado,
  ForumEntregaStatus,
  Prisma,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const FORUM_ROLES: UserRole[] = [
  UserRole.ADMIN_ESCOLA,
  UserRole.GESTOR,
  UserRole.COORDENADOR,
  UserRole.SECRETARIA,
  UserRole.PROFESSOR,
  UserRole.RESPONSAVEL,
  UserRole.ALUNO,
];

const STAFF_ROLES: UserRole[] = [
  UserRole.ADMIN_ESCOLA,
  UserRole.GESTOR,
  UserRole.COORDENADOR,
  UserRole.SECRETARIA,
  UserRole.PROFESSOR,
];

type AuthUser = {
  userId: string;
  userRole: UserRole;
  userSchoolId?: string | null;
};

type UploadedForumFile = {
  url?: string;
  name?: string;
  mime?: string;
};

@Injectable()
export class ForumService {
  constructor(private readonly prisma: PrismaService) {}

  private canManage(role: UserRole) {
    return STAFF_ROLES.includes(role) || role === UserRole.SUPERUSUARIO;
  }

  private assertResponsavelSomenteLeitura(role: UserRole) {
    if (role === UserRole.RESPONSAVEL) {
      throw new ForbiddenException(
        'Responsaveis acompanham o forum em modo somente leitura.',
      );
    }
  }

  private async getSchoolId(user: AuthUser) {
    if (user.userRole === UserRole.SUPERUSUARIO && user.userSchoolId) {
      return user.userSchoolId;
    }

    if (!user.userSchoolId) {
      const found = await this.prisma.user.findUnique({
        where: { id: user.userId },
        select: { schoolId: true },
      });

      if (found?.schoolId) return found.schoolId;
    }

    if (!user.userSchoolId) {
      throw new ForbiddenException('Usuário sem escola vinculada.');
    }

    return user.userSchoolId;
  }

  private assertForumAccess(role: UserRole) {
    if (role !== UserRole.SUPERUSUARIO && !FORUM_ROLES.includes(role)) {
      throw new ForbiddenException('Você não tem acesso ao fórum.');
    }
  }

  private async getTurmaIds(user: AuthUser, schoolId: string) {
    if (this.canManage(user.userRole)) {
      const turmas = await this.prisma.turma.findMany({
        where: { schoolId },
        select: { id: true },
      });
      return turmas.map((turma) => turma.id);
    }

    if (user.userRole === UserRole.ALUNO) {
      const alunos = await this.prisma.aluno.findMany({
        where: { schoolId, userId: user.userId, status: 'ATIVO' },
        select: { turmaId: true },
      });
      return alunos.map((aluno) => aluno.turmaId);
    }

    if (user.userRole === UserRole.RESPONSAVEL) {
      const alunos = await this.prisma.aluno.findMany({
        where: {
          schoolId,
          responsaveis: {
            some: { responsavelId: user.userId },
          },
        },
        select: { turmaId: true },
      });
      return alunos.map((aluno) => aluno.turmaId);
    }

    return [];
  }

  private async getAlunoUserIdsDoResponsavel(user: AuthUser, schoolId: string) {
    if (user.userRole !== UserRole.RESPONSAVEL) return [];

    const alunos = await this.prisma.aluno.findMany({
      where: {
        schoolId,
        status: 'ATIVO',
        userId: { not: null },
        responsaveis: {
          some: { responsavelId: user.userId },
        },
      },
      select: { userId: true },
    });

    return alunos
      .map((aluno) => aluno.userId)
      .filter((userId): userId is string => Boolean(userId));
  }

  private async assertTurmaAccess(user: AuthUser, turmaId?: string | null) {
    const schoolId = await this.getSchoolId(user);
    if (!turmaId) return schoolId;

    const turma = await this.prisma.turma.findFirst({
      where: { id: turmaId, schoolId },
      select: { id: true },
    });

    if (!turma) throw new NotFoundException('Turma não encontrada.');

    if (!this.canManage(user.userRole)) {
      const turmaIds = await this.getTurmaIds(user, schoolId);
      if (!turmaIds.includes(turmaId)) {
        throw new ForbiddenException('Você não participa desta turma.');
      }
    }

    return schoolId;
  }

  private whereByAccess(user: AuthUser, schoolId: string, turmaId?: string) {
    const base: Prisma.ForumTopicoWhereInput = { schoolId };
    if (turmaId) return { ...base, turmaId };
    return base;
  }

  private toPublicEnquete(enquete: any, user: AuthUser) {
    const userVoted = enquete.votos?.length > 0;
    const encerradaPorPrazo =
      enquete.encerramentoEm && new Date(enquete.encerramentoEm) <= new Date();
    const concluida = Boolean(enquete.concluidaEm) || Boolean(encerradaPorPrazo);
    const resultsVisible =
      this.canManage(user.userRole) ||
      enquete.visibilidadeResultado ===
        ForumEnqueteVisibilidadeResultado.IMEDIATO ||
      (enquete.visibilidadeResultado ===
        ForumEnqueteVisibilidadeResultado.APOS_VOTO &&
        userVoted) ||
      concluida;

    return {
      ...enquete,
      concluidaEm: enquete.concluidaEm || (encerradaPorPrazo ? enquete.encerramentoEm : null),
      encerradaPorPrazo,
      resultadosVisiveis: resultsVisible,
      totalVotos: resultsVisible
        ? enquete.opcoes.reduce(
            (total: number, opcao: any) => total + opcao.votos.length,
            0,
          )
        : 0,
      opcoes: enquete.opcoes.map((opcao: any) => ({
        ...opcao,
        votos: resultsVisible ? opcao.votos : [],
      })),
    };
  }

  async listarTurmas(user: AuthUser) {
    this.assertForumAccess(user.userRole);
    const schoolId = await this.getSchoolId(user);
    const turmaIds = await this.getTurmaIds(user, schoolId);

    return this.prisma.turma.findMany({
      where: this.canManage(user.userRole)
        ? { schoolId }
        : { id: { in: turmaIds }, schoolId },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, turno: true },
    });
  }

  async obterResumo(user: AuthUser) {
    this.assertForumAccess(user.userRole);
    const schoolId = await this.getSchoolId(user);
    const turmaIds = this.canManage(user.userRole)
      ? []
      : await this.getTurmaIds(user, schoolId);
    const alunoUserIds =
      user.userRole === UserRole.RESPONSAVEL
        ? await this.getAlunoUserIdsDoResponsavel(user, schoolId)
        : [];
    const turmaWhere: any =
      this.canManage(user.userRole) || turmaIds.length === 0
        ? {}
        : { OR: [{ turmaId: { in: turmaIds } }, { turmaId: null }] };
    const entregaWhere: Prisma.ForumEntregaWhereInput =
      user.userRole === UserRole.RESPONSAVEL
        ? { alunoId: { in: alunoUserIds } }
        : this.canManage(user.userRole)
          ? {}
          : { alunoId: user.userId };
    const [topicos, atividades, enquetes, entregasPendentes] = await Promise.all([
      this.prisma.forumTopico.count({ where: { schoolId, ...turmaWhere } }),
      this.prisma.forumAtividade.count({ where: { schoolId, ...turmaWhere } }),
      this.prisma.forumEnquete.count({ where: { schoolId, ...turmaWhere } }),
      this.prisma.forumEntrega.count({
        where: {
          schoolId,
          ...entregaWhere,
          status: { not: ForumEntregaStatus.CORRIGIDO },
        },
      }),
    ]);

    return { topicos, atividades, enquetes, entregasPendentes };
  }

  async listarTopicos(user: AuthUser, query: { turmaId?: string; disciplina?: string }) {
    this.assertForumAccess(user.userRole);
    const schoolId = await this.assertTurmaAccess(user, query.turmaId);
    const turmaIds = this.canManage(user.userRole)
      ? []
      : await this.getTurmaIds(user, schoolId);

    return this.prisma.forumTopico.findMany({
      where: {
        schoolId,
        OR: query.turmaId
          ? [{ turmaId: query.turmaId }]
          : this.canManage(user.userRole)
            ? undefined
            : [{ turmaId: { in: turmaIds } }, { turmaId: null }],
        disciplina: query.disciplina?.trim() || undefined,
      },
      include: {
        author: { select: { id: true, name: true, role: true, fotoUrl: true } },
        turma: { select: { id: true, name: true } },
        comentarios: {
          orderBy: { createdAt: 'asc' },
          include: {
            author: { select: { id: true, name: true, role: true, fotoUrl: true } },
          },
        },
      },
      orderBy: [{ fixado: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async criarTopico(
    user: AuthUser,
    data: { turmaId?: string; disciplina?: string; titulo?: string; conteudo?: string },
  ) {
    this.assertForumAccess(user.userRole);
    this.assertResponsavelSomenteLeitura(user.userRole);
    if (!data.titulo?.trim() || !data.conteudo?.trim()) {
      throw new BadRequestException('Informe título e conteúdo.');
    }

    const schoolId = await this.assertTurmaAccess(user, data.turmaId);

    return this.prisma.forumTopico.create({
      data: {
        schoolId,
        turmaId: data.turmaId || null,
        authorId: user.userId,
        disciplina: data.disciplina?.trim() || null,
        titulo: data.titulo.trim(),
        conteudo: data.conteudo.trim(),
        fixado: this.canManage(user.userRole),
      },
    });
  }

  async comentarTopico(user: AuthUser, topicoId: string, texto?: string) {
    this.assertForumAccess(user.userRole);
    this.assertResponsavelSomenteLeitura(user.userRole);
    if (!texto?.trim()) throw new BadRequestException('Informe o comentário.');

    const schoolId = await this.getSchoolId(user);
    const topico = await this.prisma.forumTopico.findFirst({
      where: { id: topicoId, schoolId },
      select: { id: true, turmaId: true },
    });
    if (!topico) throw new NotFoundException('Tópico não encontrado.');
    await this.assertTurmaAccess(user, topico.turmaId);

    return this.prisma.forumComentario.create({
      data: {
        topicoId,
        schoolId,
        authorId: user.userId,
        texto: texto.trim(),
      },
      include: {
        author: { select: { id: true, name: true, role: true, fotoUrl: true } },
      },
    });
  }

  async listarAtividades(user: AuthUser, query: { turmaId?: string; disciplina?: string }) {
    this.assertForumAccess(user.userRole);
    const schoolId = await this.assertTurmaAccess(user, query.turmaId);
    const turmaIds = this.canManage(user.userRole)
      ? []
      : await this.getTurmaIds(user, schoolId);
    const alunoUserIds =
      user.userRole === UserRole.RESPONSAVEL
        ? await this.getAlunoUserIdsDoResponsavel(user, schoolId)
        : [];

    return this.prisma.forumAtividade.findMany({
      where: {
        schoolId,
        OR: query.turmaId
          ? [{ turmaId: query.turmaId }, { turmaId: null }]
          : this.canManage(user.userRole)
            ? undefined
            : [{ turmaId: { in: turmaIds } }, { turmaId: null }],
        disciplina: query.disciplina?.trim() || undefined,
      },
      include: {
        turma: { select: { id: true, name: true } },
        professor: { select: { id: true, name: true, role: true } },
        entregas: {
          where:
            user.userRole === UserRole.RESPONSAVEL
              ? { alunoId: { in: alunoUserIds } }
              : undefined,
          include: {
            aluno: { select: { id: true, name: true, role: true, fotoUrl: true } },
          },
          orderBy: { updatedAt: 'desc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async criarAtividade(
    user: AuthUser,
    data: {
      turmaId?: string;
      disciplina?: string;
      titulo?: string;
      descricao?: string;
      tipo?: ForumAtividadeTipo;
      prazo?: string;
    },
    file?: UploadedForumFile,
  ) {
    if (!this.canManage(user.userRole)) {
      throw new ForbiddenException('Apenas professores e gestão criam atividades.');
    }
    if (!data.titulo?.trim() || !data.descricao?.trim()) {
      throw new BadRequestException('Informe título e descrição.');
    }

    const schoolId = await this.assertTurmaAccess(user, data.turmaId);

    return this.prisma.forumAtividade.create({
      data: {
        schoolId,
        turmaId: data.turmaId || null,
        professorId: user.userId,
        disciplina: data.disciplina?.trim() || null,
        titulo: data.titulo.trim(),
        descricao: data.descricao.trim(),
        tipo: data.tipo || ForumAtividadeTipo.MISTA,
        prazo: data.prazo ? new Date(data.prazo) : null,
        arquivoUrl: file?.url || null,
        arquivoNome: file?.name || null,
        arquivoMime: file?.mime || null,
      },
    });
  }

  async enviarEntrega(
    user: AuthUser,
    atividadeId: string,
    data: { texto?: string },
    file?: UploadedForumFile,
  ) {
    this.assertForumAccess(user.userRole);
    this.assertResponsavelSomenteLeitura(user.userRole);
    if (!data.texto?.trim() && !file?.url) {
      throw new BadRequestException('Digite uma resposta ou envie um arquivo.');
    }

    const schoolId = await this.getSchoolId(user);
    const atividade = await this.prisma.forumAtividade.findFirst({
      where: { id: atividadeId, schoolId },
      select: { id: true, turmaId: true },
    });
    if (!atividade) throw new NotFoundException('Atividade não encontrada.');
    await this.assertTurmaAccess(user, atividade.turmaId);

    return this.prisma.forumEntrega.upsert({
      where: { atividadeId_alunoId: { atividadeId, alunoId: user.userId } },
      create: {
        atividadeId,
        schoolId,
        alunoId: user.userId,
        texto: data.texto?.trim() || null,
        arquivoUrl: file?.url || null,
        arquivoNome: file?.name || null,
        arquivoMime: file?.mime || null,
        status: ForumEntregaStatus.ENTREGUE,
      },
      update: {
        texto: data.texto?.trim() || null,
        arquivoUrl: file?.url || undefined,
        arquivoNome: file?.name || undefined,
        arquivoMime: file?.mime || undefined,
        status: ForumEntregaStatus.ENTREGUE,
      },
    });
  }

  async listarEntregas(user: AuthUser, atividadeId?: string) {
    this.assertForumAccess(user.userRole);
    const schoolId = await this.getSchoolId(user);
    const alunoUserIds =
      user.userRole === UserRole.RESPONSAVEL
        ? await this.getAlunoUserIdsDoResponsavel(user, schoolId)
        : [];
    const alunoIdWhere =
      user.userRole === UserRole.RESPONSAVEL
        ? { in: alunoUserIds }
        : this.canManage(user.userRole)
          ? undefined
          : user.userId;

    return this.prisma.forumEntrega.findMany({
      where: {
        schoolId,
        atividadeId: atividadeId?.trim() || undefined,
        alunoId: alunoIdWhere,
      },
      include: {
        atividade: { select: { id: true, titulo: true, disciplina: true } },
        aluno: { select: { id: true, name: true, role: true, fotoUrl: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async corrigirEntrega(
    user: AuthUser,
    entregaId: string,
    data: { status?: ForumEntregaStatus; feedback?: string },
  ) {
    if (!this.canManage(user.userRole)) {
      throw new ForbiddenException('Apenas professores e gestão corrigem entregas.');
    }
    const schoolId = await this.getSchoolId(user);
    const entrega = await this.prisma.forumEntrega.findFirst({
      where: { id: entregaId, schoolId },
    });
    if (!entrega) throw new NotFoundException('Entrega não encontrada.');

    return this.prisma.forumEntrega.update({
      where: { id: entregaId },
      data: {
        status: data.status || ForumEntregaStatus.CORRIGIDO,
        feedback: data.feedback?.trim() || undefined,
      },
    });
  }

  async excluirEntrega(user: AuthUser, entregaId: string) {
    this.assertForumAccess(user.userRole);
    this.assertResponsavelSomenteLeitura(user.userRole);
    const schoolId = await this.getSchoolId(user);
    const entrega = await this.prisma.forumEntrega.findFirst({
      where: { id: entregaId, schoolId },
    });

    if (!entrega) throw new NotFoundException('Entrega não encontrada.');

    if (!this.canManage(user.userRole) && entrega.alunoId !== user.userId) {
      throw new ForbiddenException('Você só pode excluir a sua própria entrega.');
    }

    return this.prisma.forumEntrega.delete({
      where: { id: entregaId },
    });
  }

  async listarEnquetes(user: AuthUser, turmaId?: string) {
    this.assertForumAccess(user.userRole);
    const schoolId = await this.assertTurmaAccess(user, turmaId);
    const turmaIds = this.canManage(user.userRole)
      ? []
      : await this.getTurmaIds(user, schoolId);

    const enquetes = await this.prisma.forumEnquete.findMany({
      where: {
        schoolId,
        OR: turmaId
          ? [{ turmaId }, { turmaId: null }]
          : this.canManage(user.userRole)
            ? undefined
            : [{ turmaId: { in: turmaIds } }, { turmaId: null }],
      },
      include: {
        author: { select: { id: true, name: true, role: true } },
        turma: { select: { id: true, name: true } },
        opcoes: { include: { votos: true } },
        votos: { where: { userId: user.userId }, select: { opcaoId: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return enquetes.map((enquete) => this.toPublicEnquete(enquete, user));
  }

  async criarEnquete(
    user: AuthUser,
    data: {
      turmaId?: string;
      pergunta?: string;
      opcoes?: string[];
      modoEscolha?: ForumEnqueteModoEscolha;
      visibilidadeResultado?: ForumEnqueteVisibilidadeResultado;
      encerramentoEm?: string;
    },
  ) {
    if (!this.canManage(user.userRole)) {
      throw new ForbiddenException('Apenas professores e gestão criam enquetes.');
    }
    const turmaId = data.turmaId?.trim() || undefined;
    const opcoes = (data.opcoes || []).map((opcao) => opcao.trim()).filter(Boolean);
    if (!data.pergunta?.trim() || opcoes.length < 2) {
      throw new BadRequestException('Informe a pergunta e pelo menos duas opções.');
    }

    const schoolId = await this.assertTurmaAccess(user, turmaId);
    const encerramentoEm = data.encerramentoEm
      ? new Date(data.encerramentoEm)
      : null;

    if (encerramentoEm && encerramentoEm <= new Date()) {
      throw new BadRequestException('Informe um prazo futuro para a enquete.');
    }

    return this.prisma.forumEnquete.create({
      data: {
        schoolId,
        turmaId: turmaId || null,
        authorId: user.userId,
        pergunta: data.pergunta.trim(),
        modoEscolha: data.modoEscolha || ForumEnqueteModoEscolha.UNICA,
        visibilidadeResultado:
          data.visibilidadeResultado ||
          ForumEnqueteVisibilidadeResultado.IMEDIATO,
        encerramentoEm,
        opcoes: {
          create: opcoes.map((texto) => ({ texto })),
        },
      },
      include: { opcoes: true },
    });
  }

  private async votarEnqueteLegado(user: AuthUser, enqueteId: string, opcaoId?: string) {
    this.assertForumAccess(user.userRole);
    this.assertResponsavelSomenteLeitura(user.userRole);
    if (!opcaoId) throw new BadRequestException('Informe a opção.');

    const schoolId = await this.getSchoolId(user);
    const opcao = await this.prisma.forumEnqueteOpcao.findFirst({
      where: { id: opcaoId, enqueteId, enquete: { schoolId } },
      include: { enquete: { select: { turmaId: true } } },
    });
    if (!opcao) throw new NotFoundException('Opção não encontrada.');
    await this.assertTurmaAccess(user, opcao.enquete.turmaId);

    await this.prisma.forumEnqueteVoto.deleteMany({
      where: { enqueteId, userId: user.userId },
    });
    return this.prisma.forumEnqueteVoto.create({
      data: { enqueteId, opcaoId, schoolId, userId: user.userId },
    });
  }

  async votarEnquete(user: AuthUser, enqueteId: string, opcaoIds?: string[]) {
    this.assertForumAccess(user.userRole);
    this.assertResponsavelSomenteLeitura(user.userRole);
    const selectedIds = Array.from(
      new Set((opcaoIds || []).map((opcaoId) => opcaoId?.trim()).filter(Boolean)),
    );
    if (selectedIds.length === 0) throw new BadRequestException('Informe a opcao.');

    const schoolId = await this.getSchoolId(user);
    const enquete = await this.prisma.forumEnquete.findFirst({
      where: { id: enqueteId, schoolId },
      include: {
        opcoes: {
          where: { id: { in: selectedIds } },
          select: { id: true },
        },
      },
    });
    if (!enquete) throw new NotFoundException('Enquete nao encontrada.');
    if (
      enquete.concluidaEm ||
      (enquete.encerramentoEm && enquete.encerramentoEm <= new Date())
    ) {
      throw new BadRequestException('Esta enquete ja foi concluida.');
    }
    await this.assertTurmaAccess(user, enquete.turmaId);

    if (enquete.opcoes.length !== selectedIds.length) {
      throw new NotFoundException('Opcao nao encontrada.');
    }

    const finalIds =
      enquete.modoEscolha === ForumEnqueteModoEscolha.UNICA
        ? selectedIds.slice(0, 1)
        : selectedIds;

    await this.prisma.$transaction([
      this.prisma.forumEnqueteVoto.deleteMany({
        where: { enqueteId, userId: user.userId },
      }),
      this.prisma.forumEnqueteVoto.createMany({
        data: finalIds.map((opcaoId) => ({
          enqueteId,
          opcaoId,
          schoolId,
          userId: user.userId,
        })),
      }),
    ]);

    const updated = await this.prisma.forumEnquete.findUnique({
      where: { id: enqueteId },
      include: {
        author: { select: { id: true, name: true, role: true } },
        turma: { select: { id: true, name: true } },
        opcoes: { include: { votos: true } },
        votos: { where: { userId: user.userId }, select: { opcaoId: true } },
      },
    });

    return updated ? this.toPublicEnquete(updated, user) : null;
  }

  async concluirEnquete(user: AuthUser, enqueteId: string) {
    if (!this.canManage(user.userRole)) {
      throw new ForbiddenException('Apenas professores e gestao concluem enquetes.');
    }
    const schoolId = await this.getSchoolId(user);
    const enquete = await this.prisma.forumEnquete.findFirst({
      where: { id: enqueteId, schoolId },
      select: { id: true, turmaId: true },
    });

    if (!enquete) throw new NotFoundException('Enquete nao encontrada.');
    await this.assertTurmaAccess(user, enquete.turmaId);

    const updated = await this.prisma.forumEnquete.update({
      where: { id: enqueteId },
      data: { concluidaEm: new Date() },
      include: {
        author: { select: { id: true, name: true, role: true } },
        turma: { select: { id: true, name: true } },
        opcoes: { include: { votos: true } },
        votos: { where: { userId: user.userId }, select: { opcaoId: true } },
      },
    });

    return this.toPublicEnquete(updated, user);
  }

  async excluirEnquete(user: AuthUser, enqueteId: string) {
    if (!this.canManage(user.userRole)) {
      throw new ForbiddenException('Apenas professores e gestao excluem enquetes.');
    }
    const schoolId = await this.getSchoolId(user);
    const enquete = await this.prisma.forumEnquete.findFirst({
      where: { id: enqueteId, schoolId },
      select: { id: true, turmaId: true },
    });

    if (!enquete) throw new NotFoundException('Enquete nao encontrada.');
    await this.assertTurmaAccess(user, enquete.turmaId);

    return this.prisma.forumEnquete.delete({
      where: { id: enqueteId },
    });
  }
}
