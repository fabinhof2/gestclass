import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ComunicacaoPostTipo, Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const STAFF_ROLES: UserRole[] = [
  UserRole.ADMIN_ESCOLA,
  UserRole.GESTOR,
  UserRole.COORDENADOR,
  UserRole.SECRETARIA,
  UserRole.PROFESSOR,
];

const GESTAO_ROLES: UserRole[] = [
  UserRole.ADMIN_ESCOLA,
  UserRole.GESTOR,
  UserRole.COORDENADOR,
  UserRole.SECRETARIA,
];

const SOCIAL_POST_RETENTION_DAYS = 4;
const SOCIAL_CLEAN_MIN_AGE_HOURS = 24;
const COLABORADORES_GROUP_NAME = 'Colaboradores';
type ComunicacaoReacaoTipoValue = 'LIKE' | 'DISLIKE';

@Injectable()
export class ComunicacaoService {
  constructor(private readonly prisma: PrismaService) {}

  private isGestao(role: UserRole) {
    return GESTAO_ROLES.includes(role) || role === UserRole.SUPERUSUARIO;
  }

  private canManageMembers(role: UserRole) {
    return STAFF_ROLES.includes(role) || role === UserRole.SUPERUSUARIO;
  }

  private canBroadcastToSchool(role: UserRole) {
    return (
      role === UserRole.ADMIN_ESCOLA ||
      role === UserRole.GESTOR ||
      role === UserRole.SECRETARIA
    );
  }

  private canResetSocialPosts(role: UserRole) {
    return (
      role === UserRole.SUPERUSUARIO ||
      role === UserRole.ADMIN_ESCOLA ||
      role === UserRole.GESTOR ||
      role === UserRole.SECRETARIA
    );
  }

  private canModeratePosts(role: UserRole) {
    return (
      role === UserRole.ADMIN_ESCOLA ||
      role === UserRole.GESTOR ||
      role === UserRole.SECRETARIA
    );
  }

  private canAppearInTurmaCommunity(role: UserRole) {
    return (
      role === UserRole.ALUNO ||
      role === UserRole.PROFESSOR ||
      role === UserRole.COORDENADOR
    );
  }

  private moderationMessage() {
    return 'postagem excluida pelo moderador';
  }

  private moderationSuspensionMessage() {
    return 'Suspensao de 48 horas por postagem removida pela moderacao.';
  }

  private socialCutoffDate(days: number) {
    return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  }

  private socialCleanCutoffDate() {
    return new Date(Date.now() - SOCIAL_CLEAN_MIN_AGE_HOURS * 60 * 60 * 1000);
  }

  private isMissingReacoesTableError(error: unknown) {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: string }).code === 'P2010' &&
      'meta' in error &&
      typeof (error as { meta?: { code?: string } }).meta?.code === 'string' &&
      (error as { meta?: { code?: string } }).meta?.code === '42P01'
    );
  }

  private emptyReacoesResumo() {
    return {
      gostei: 0,
      naoGostei: 0,
      minhaReacao: null as ComunicacaoReacaoTipoValue | null,
    };
  }

  private async buscarModeracaoPorPosts(postIds: string[]) {
    const resumo = new Map<
      string,
      {
        moderadoAt: Date | null;
        motivoModeracao: string | null;
      }
    >();

    if (!postIds.length) {
      return resumo;
    }

    const rows = await this.prisma.$queryRaw<
      Array<{
        id: string;
        moderadoAt: Date | null;
        motivoModeracao: string | null;
      }>
    >(Prisma.sql`
      SELECT "id", "moderadoAt", "motivoModeracao"
      FROM "comunicacao_posts"
      WHERE "id" IN (${Prisma.join(postIds)})
    `);

    rows.forEach((row) => {
      resumo.set(row.id, {
        moderadoAt: row.moderadoAt || null,
        motivoModeracao: row.motivoModeracao || null,
      });
    });

    return resumo;
  }

  private async deleteSocialPosts(where: Prisma.ComunicacaoPostWhereInput) {
    const posts = await this.prisma.comunicacaoPost.findMany({
      where,
      select: { id: true },
    });
    const postIds = posts.map((post) => post.id);

    if (!postIds.length) {
      return 0;
    }

    try {
      await this.prisma.$transaction([
        this.prisma.$executeRaw(
          Prisma.sql`DELETE FROM "comunicacao_reacoes" WHERE "postId" IN (${Prisma.join(postIds)})`,
        ),
        this.prisma.comunicacaoComentario.deleteMany({
          where: { postId: { in: postIds } },
        }),
        this.prisma.comunicacaoPost.deleteMany({
          where: { id: { in: postIds } },
        }),
      ]);
    } catch (error) {
      if (!this.isMissingReacoesTableError(error)) {
        throw error;
      }

      await this.prisma.$transaction([
        this.prisma.comunicacaoComentario.deleteMany({
          where: { postId: { in: postIds } },
        }),
        this.prisma.comunicacaoPost.deleteMany({
          where: { id: { in: postIds } },
        }),
      ]);
    }

    return postIds.length;
  }

  private async deleteExpiredSocialPosts(schoolId: string, grupoId?: string) {
    return this.deleteSocialPosts({
      schoolId,
      ...(grupoId ? { grupoId } : {}),
      createdAt: { lt: this.socialCutoffDate(SOCIAL_POST_RETENTION_DAYS) },
    });
  }

  private normalizarPessoa<T extends { fotoUrl?: string | null; alunoPerfil?: { fotoUrl?: string | null } | null }>(
    pessoa: T,
  ) {
    const { alunoPerfil, ...rest } = pessoa as any;

    return {
      ...rest,
      fotoUrl: pessoa.fotoUrl || alunoPerfil?.fotoUrl || null,
    };
  }

  private async buscarSuspensaoUsuarios(userIds: string[]) {
    const ids = Array.from(new Set(userIds.filter(Boolean)));
    const resumo = new Map<
      string,
      {
        comunicacaoSuspensoAte: Date | null;
        comunicacaoSuspensoMotivo: string | null;
      }
    >();

    if (!ids.length) {
      return resumo;
    }

    const rows = await this.prisma.$queryRaw<
      Array<{
        id: string;
        comunicacaoSuspensoAte: Date | null;
        comunicacaoSuspensoMotivo: string | null;
      }>
    >(Prisma.sql`
      SELECT "id", "comunicacaoSuspensoAte", "comunicacaoSuspensoMotivo"
      FROM "users"
      WHERE "id" IN (${Prisma.join(ids)})
    `);

    rows.forEach((row) => {
      resumo.set(row.id, {
        comunicacaoSuspensoAte: row.comunicacaoSuspensoAte || null,
        comunicacaoSuspensoMotivo: row.comunicacaoSuspensoMotivo || null,
      });
    });

    return resumo;
  }

  private normalizarGrupo(
    grupo: any,
    suspensaoPorUsuario?: Map<
      string,
      {
        comunicacaoSuspensoAte: Date | null;
        comunicacaoSuspensoMotivo: string | null;
      }
    >,
  ) {
    const membros = (grupo.membros || []).map((membro: any) => ({
      ...membro,
      user: {
        ...this.normalizarPessoa(membro.user),
        ...(suspensaoPorUsuario?.get(membro.user.id) || {}),
      },
    }));

    return {
      ...grupo,
      ultimaMensagem: grupo.mensagens?.[0]
        ? this.normalizarMensagem(grupo.mensagens[0])
        : null,
      totalMensagens: Number(grupo?._count?.mensagens || 0),
      totalPosts: Number(grupo?._count?.posts || 0),
      membros:
        grupo.tipo === 'TURMA'
          ? membros.filter((membro: any) =>
              this.canAppearInTurmaCommunity(membro.user.role),
            )
          : membros,
    };
  }

  private normalizarPost(post: any) {
    return {
      ...post,
      paraTodosEscola: post.grupo?.nome === 'Todos da escola',
      author: this.normalizarPessoa(post.author),
      moderado: Boolean(post.moderadoAt),
      comentarios: (post.comentarios || []).map((comentario: any) => ({
        ...comentario,
        author: comentario.author
          ? this.normalizarPessoa(comentario.author)
          : comentario.author,
      })),
    };
  }

  private async buscarResumoReacoesPorPosts(postIds: string[], userId: string) {
    const resumo = new Map<
      string,
      {
        gostei: number;
        naoGostei: number;
        minhaReacao: ComunicacaoReacaoTipoValue | null;
      }
    >();

    if (!postIds.length) {
      return resumo;
    }

    let totais: Array<{
      postId: string;
      tipo: ComunicacaoReacaoTipoValue;
      total: number;
    }> = [];
    let minhasReacoes: Array<{
      postId: string;
      tipo: ComunicacaoReacaoTipoValue;
    }> = [];

    try {
      totais = await this.prisma.$queryRaw<
        Array<{ postId: string; tipo: ComunicacaoReacaoTipoValue; total: number }>
      >(Prisma.sql`
        SELECT "postId", "tipo", COUNT(*)::int AS "total"
        FROM "comunicacao_reacoes"
        WHERE "postId" IN (${Prisma.join(postIds)})
        GROUP BY "postId", "tipo"
      `);

      minhasReacoes = await this.prisma.$queryRaw<
        Array<{ postId: string; tipo: ComunicacaoReacaoTipoValue }>
      >(Prisma.sql`
        SELECT "postId", "tipo"
        FROM "comunicacao_reacoes"
        WHERE "postId" IN (${Prisma.join(postIds)})
          AND "userId" = ${userId}
      `);
    } catch (error) {
      if (!this.isMissingReacoesTableError(error)) {
        throw error;
      }
    }

    postIds.forEach((postId) => {
      resumo.set(postId, {
        gostei: 0,
        naoGostei: 0,
        minhaReacao: null,
      });
    });

    totais.forEach((item) => {
      const atual = resumo.get(item.postId);

      if (!atual) return;

      if (item.tipo === 'LIKE') {
        atual.gostei = Number(item.total || 0);
      } else if (item.tipo === 'DISLIKE') {
        atual.naoGostei = Number(item.total || 0);
      }
    });

    minhasReacoes.forEach((item) => {
      const atual = resumo.get(item.postId);

      if (!atual) return;
      atual.minhaReacao = item.tipo;
    });

    return resumo;
  }

  private async anexarReacoesNosPosts(posts: any[], userId: string) {
    const postIds = posts.map((post) => post.id);
    const [resumoPorPost, moderacaoPorPost] = await Promise.all([
      this.buscarResumoReacoesPorPosts(postIds, userId),
      this.buscarModeracaoPorPosts(postIds),
    ]);

    return posts.map((post) => ({
      ...this.normalizarPost({
        ...post,
        ...(moderacaoPorPost.get(post.id) || {}),
      }),
      reacoes: resumoPorPost.get(post.id) || this.emptyReacoesResumo(),
    }));
  }

  private normalizarMensagem(mensagem: any) {
    return {
      ...mensagem,
      author: this.normalizarPessoa(mensagem.author),
    };
  }

  private async getUsuario(userId: string) {
    const usuario = (await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        alunoPerfil: {
          select: {
            fotoUrl: true,
          },
        },
      },
    })) as any;

    if (!usuario) {
      throw new ForbiddenException('Usuario nao encontrado.');
    }

    const extras = await this.prisma.$queryRaw<
      Array<{
        comunicacaoSuspensoAte: Date | null;
        comunicacaoSuspensoMotivo: string | null;
      }>
    >(Prisma.sql`
      SELECT "comunicacaoSuspensoAte", "comunicacaoSuspensoMotivo"
      FROM "users"
      WHERE "id" = ${userId}
      LIMIT 1
    `);

    return {
      ...usuario,
      comunicacaoSuspensoAte: extras[0]?.comunicacaoSuspensoAte || null,
      comunicacaoSuspensoMotivo: extras[0]?.comunicacaoSuspensoMotivo || null,
    };
  }

  private async assertSchool(userSchoolId?: string | null) {
    if (!userSchoolId) {
      throw new ForbiddenException('Usuário sem escola vinculada.');
    }

    return userSchoolId;
  }

  private async findTurmasDoUsuario(data: {
    userId: string;
    userRole: UserRole;
    schoolId: string;
  }) {
    if (this.isGestao(data.userRole)) {
      return this.prisma.turma.findMany({
        where: { schoolId: data.schoolId },
        orderBy: { name: 'asc' },
      });
    }

    if (data.userRole === UserRole.PROFESSOR) {
      const vinculos = await this.prisma.turmaProfessor.findMany({
        where: {
          professorId: data.userId,
          turma: {
            schoolId: data.schoolId,
          },
        },
        include: {
          turma: true,
        },
        orderBy: {
          turma: {
            name: 'asc',
          },
        },
      });

      const porId = new Map(vinculos.map((item) => [item.turma.id, item.turma]));
      return Array.from(porId.values());
    }

    if (data.userRole === UserRole.ALUNO) {
      return this.prisma.turma.findMany({
        where: {
          schoolId: data.schoolId,
          alunos: {
            some: {
              userId: data.userId,
              status: 'ATIVO',
            },
          },
        },
        orderBy: { name: 'asc' },
      });
    }

    if (data.userRole === UserRole.RESPONSAVEL) {
      return this.prisma.turma.findMany({
        where: {
          schoolId: data.schoolId,
          alunos: {
            some: {
              responsaveis: {
                some: {
                  responsavelId: data.userId,
                },
              },
            },
          },
        },
        orderBy: { name: 'asc' },
      });
    }

    return [];
  }

  async syncGrupoTurmaMembers(data: {
    turmaId: string;
    schoolId: string;
    createdById?: string | null;
  }) {
    const turma = await this.prisma.turma.findFirst({
      where: {
        id: data.turmaId,
        schoolId: data.schoolId,
      },
      select: {
        id: true,
        name: true,
      },
    });

    if (!turma) {
      throw new NotFoundException('Turma não encontrada.');
    }

    let grupo = await this.prisma.comunicacaoGrupo.findFirst({
      where: {
        turmaId: turma.id,
        tipo: 'TURMA',
      },
    });

    if (!grupo) {
      grupo = await this.prisma.comunicacaoGrupo.create({
        data: {
          nome: `Comunidade ${turma.name}`,
          tipo: 'TURMA',
          schoolId: data.schoolId,
          turmaId: turma.id,
          createdById: data.createdById || null,
        },
      });
    }

    const [alunos, professores, coordenacao] = await Promise.all([
      this.prisma.aluno.findMany({
        where: {
          turmaId: turma.id,
          schoolId: data.schoolId,
          status: 'ATIVO',
          userId: {
            not: null,
          },
        },
        select: {
          userId: true,
        },
      }),
      this.prisma.turmaProfessor.findMany({
        where: {
          turmaId: turma.id,
        },
        select: {
          professorId: true,
        },
      }),
      this.prisma.user.findMany({
        where: {
          schoolId: data.schoolId,
          role: {
            in: [UserRole.COORDENADOR],
          },
          isActive: true,
        },
        select: {
          id: true,
        },
      }),
    ]);

    const membroIds = new Set<string>();
    alunos.forEach((item) => item.userId && membroIds.add(item.userId));
    professores.forEach((item) => membroIds.add(item.professorId));
    coordenacao.forEach((item) => membroIds.add(item.id));

    await Promise.all(
      Array.from(membroIds).map((userId) =>
        this.prisma.comunicacaoGrupoMembro.upsert({
          where: {
            grupoId_userId: {
              grupoId: grupo!.id,
              userId,
            },
          },
          update: {},
          create: {
            grupoId: grupo!.id,
            userId,
            addedById: data.createdById || null,
          },
        }),
      ),
    );

    await this.prisma.comunicacaoGrupoMembro.deleteMany({
      where: {
        grupoId: grupo.id,
        userId: {
          notIn: Array.from(membroIds),
        },
      },
    });

    return grupo;
  }

  private async ensureGrupoEscola(data: {
    schoolId: string;
    createdById: string;
  }) {
    let grupo = await this.prisma.comunicacaoGrupo.findFirst({
      where: {
        schoolId: data.schoolId,
        tipo: 'PERSONALIZADO',
        nome: 'Todos da escola',
      },
    });

    if (!grupo) {
      grupo = await this.prisma.comunicacaoGrupo.create({
        data: {
          nome: 'Todos da escola',
          tipo: 'PERSONALIZADO',
          schoolId: data.schoolId,
          createdById: data.createdById,
        },
      });
    }

    const usuarios = await this.prisma.user.findMany({
      where: {
        schoolId: data.schoolId,
        isActive: true,
      },
      select: {
        id: true,
      },
    });

    await Promise.all(
      usuarios.map((usuario) =>
        this.prisma.comunicacaoGrupoMembro.upsert({
          where: {
            grupoId_userId: {
              grupoId: grupo!.id,
              userId: usuario.id,
            },
          },
          update: {},
          create: {
            grupoId: grupo!.id,
            userId: usuario.id,
            addedById: data.createdById,
          },
        }),
      ),
    );

    return grupo;
  }

  private async ensureGrupoColaboradores(data: {
    schoolId: string;
    createdById: string;
  }) {
    const gruposExistentes = await this.prisma.comunicacaoGrupo.findMany({
      where: {
        schoolId: data.schoolId,
        tipo: 'PERSONALIZADO',
        nome: COLABORADORES_GROUP_NAME,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    let grupo = gruposExistentes[0] || null;

    if (!grupo) {
      grupo = await this.prisma.comunicacaoGrupo.create({
        data: {
          nome: COLABORADORES_GROUP_NAME,
          tipo: 'PERSONALIZADO',
          schoolId: data.schoolId,
          createdById: data.createdById,
        },
      });
    }

    const gruposDuplicados = gruposExistentes.slice(1);

    if (gruposDuplicados.length) {
      for (const grupoDuplicado of gruposDuplicados) {
        const membrosDuplicados =
          await this.prisma.comunicacaoGrupoMembro.findMany({
            where: {
              grupoId: grupoDuplicado.id,
            },
            select: {
              userId: true,
              addedById: true,
            },
          });

        await Promise.all(
          membrosDuplicados.map((membro) =>
            this.prisma.comunicacaoGrupoMembro.upsert({
              where: {
                grupoId_userId: {
                  grupoId: grupo!.id,
                  userId: membro.userId,
                },
              },
              update: {},
              create: {
                grupoId: grupo!.id,
                userId: membro.userId,
                addedById: membro.addedById || data.createdById,
              },
            }),
          ),
        );

        await this.prisma.$transaction([
          this.prisma.comunicacaoPost.updateMany({
            where: {
              grupoId: grupoDuplicado.id,
            },
            data: {
              grupoId: grupo.id,
            },
          }),
          this.prisma.comunicacaoMensagem.updateMany({
            where: {
              grupoId: grupoDuplicado.id,
            },
            data: {
              grupoId: grupo.id,
            },
          }),
          this.prisma.comunicacaoGrupoMembro.deleteMany({
            where: {
              grupoId: grupoDuplicado.id,
            },
          }),
          this.prisma.comunicacaoGrupo.delete({
            where: {
              id: grupoDuplicado.id,
            },
          }),
        ]);
      }
    }

    const professores = await this.prisma.user.findMany({
      where: {
        schoolId: data.schoolId,
        isActive: true,
        role: UserRole.PROFESSOR,
      },
      select: {
        id: true,
      },
    });

    const professorIds = professores.map((professor) => professor.id);

    await Promise.all(
      professorIds.map((userId) =>
        this.prisma.comunicacaoGrupoMembro.upsert({
          where: {
            grupoId_userId: {
              grupoId: grupo!.id,
              userId,
            },
          },
          update: {},
          create: {
            grupoId: grupo!.id,
            userId,
            addedById: data.createdById,
          },
        }),
      ),
    );

    await this.prisma.comunicacaoGrupoMembro.deleteMany({
      where: {
        grupoId: grupo.id,
        userId: {
          notIn: professorIds.length ? professorIds : ['__sem_professores__'],
        },
      },
    });

    return grupo;
  }

  private async assertGroupAccess(data: {
    grupoId: string;
    userId: string;
    userRole: UserRole;
    schoolId: string;
  }) {
    const grupo = await this.prisma.comunicacaoGrupo.findFirst({
      where: {
        id: data.grupoId,
        schoolId: data.schoolId,
      },
      select: {
        id: true,
        tipo: true,
        turmaId: true,
        membros: {
          where: {
            userId: data.userId,
          },
          select: {
            id: true,
          },
        },
      },
    });

    if (!grupo) {
      throw new NotFoundException('Grupo nao encontrado.');
    }

    if (data.userRole === UserRole.RESPONSAVEL && grupo.turmaId) {
      const turmas = await this.findTurmasDoUsuario({
        userId: data.userId,
        userRole: data.userRole,
        schoolId: data.schoolId,
      });

      if (turmas.some((turma) => turma.id === grupo.turmaId)) {
        return grupo;
      }
    }

    if (this.isGestao(data.userRole) || grupo.membros.length) {
      return grupo;
    }

    throw new ForbiddenException('Voce nao faz parte deste grupo.');
  }

  async listarGrupos(data: {
    userId: string;
    userRole: UserRole;
    userSchoolId?: string | null;
  }) {
    const schoolId = await this.assertSchool(data.userSchoolId);

    await this.deleteExpiredSocialPosts(schoolId);

    const grupoEscolaExistente = await this.prisma.comunicacaoGrupo.findFirst({
      where: {
        schoolId,
        tipo: 'PERSONALIZADO',
        nome: 'Todos da escola',
      },
      select: {
        id: true,
      },
    });

    if (grupoEscolaExistente) {
      await this.ensureGrupoEscola({
        schoolId,
        createdById: data.userId,
      });
    }

    await this.ensureGrupoColaboradores({
      schoolId,
      createdById: data.userId,
    });

    const turmas = await this.findTurmasDoUsuario({
      userId: data.userId,
      userRole: data.userRole,
      schoolId,
    });

    await Promise.all(
      turmas.map((turma) =>
        this.syncGrupoTurmaMembers({
          turmaId: turma.id,
          schoolId,
          createdById: data.userId,
        }),
      ),
    );

    const turmaIds = turmas.map((turma) => turma.id);
    const where = this.isGestao(data.userRole)
      ? { schoolId }
      : data.userRole === UserRole.RESPONSAVEL
        ? {
            schoolId,
            OR: [
              {
                membros: {
                  some: {
                    userId: data.userId,
                  },
                },
              },
              ...(turmaIds.length
                ? [
                    {
                      turmaId: {
                        in: turmaIds,
                      },
                    },
                  ]
                : []),
            ],
          }
        : {
            schoolId,
            membros: {
              some: {
                userId: data.userId,
              },
            },
          };

    const grupos = await this.prisma.comunicacaoGrupo.findMany({
      where,
      include: {
        turma: {
          select: {
            id: true,
            name: true,
            turno: true,
          },
        },
        membros: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                role: true,
                fotoUrl: true,
                alunoPerfil: {
                  select: {
                    fotoUrl: true,
                  },
                },
              },
            },
          },
          orderBy: {
            createdAt: 'asc',
          },
        },
        mensagens: {
          include: {
            author: {
              select: {
                id: true,
                name: true,
                role: true,
                fotoUrl: true,
                alunoPerfil: {
                  select: {
                    fotoUrl: true,
                  },
                },
              },
            },
          },
          orderBy: {
            createdAt: 'desc',
          },
          take: 1,
        },
        _count: {
          select: {
            posts: true,
            mensagens: true,
          },
        },
      },
      orderBy: [{ tipo: 'asc' }, { nome: 'asc' }],
    });

    const suspensaoPorUsuario = await this.buscarSuspensaoUsuarios(
      grupos.flatMap((grupo) =>
        (grupo.membros || []).map((membro: any) => membro.user?.id).filter(Boolean),
      ),
    );

    return grupos.map((grupo) => this.normalizarGrupo(grupo, suspensaoPorUsuario));
  }

  async listarCandidatos(data: {
    userId: string;
    userRole: UserRole;
    userSchoolId?: string | null;
    termo?: string;
  }) {
    const schoolId = await this.assertSchool(data.userSchoolId);

    if (!this.canManageMembers(data.userRole)) {
      throw new ForbiddenException('Aluno não pode adicionar membros.');
    }

    const termo = String(data.termo || '').trim();

    const candidatos = await this.prisma.user.findMany({
      where: {
        schoolId,
        isActive: true,
        role: {
          in: [
            UserRole.ALUNO,
            UserRole.PROFESSOR,
            UserRole.GESTOR,
            UserRole.COORDENADOR,
            UserRole.SECRETARIA,
            UserRole.ADMIN_ESCOLA,
          ],
        },
        ...(termo
          ? {
              OR: [
                { name: { contains: termo, mode: 'insensitive' as const } },
                { email: { contains: termo, mode: 'insensitive' as const } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        fotoUrl: true,
        alunoPerfil: {
          select: {
            fotoUrl: true,
          },
        },
      },
      orderBy: [{ role: 'asc' }, { name: 'asc' }],
      take: 30,
    });

    return candidatos.map((pessoa) => this.normalizarPessoa(pessoa));
  }

  async adicionarMembros(data: {
    userId: string;
    userRole: UserRole;
    userSchoolId?: string | null;
    grupoId: string;
    userIds: string[];
  }) {
    const schoolId = await this.assertSchool(data.userSchoolId);

    if (!this.canManageMembers(data.userRole)) {
      throw new ForbiddenException('Aluno não pode adicionar membros.');
    }

    await this.assertGroupAccess({
      grupoId: data.grupoId,
      userId: data.userId,
      userRole: data.userRole,
      schoolId,
    });

    const userIds = Array.from(
      new Set(data.userIds.map((id) => String(id || '').trim()).filter(Boolean)),
    );

    if (!userIds.length) {
      throw new BadRequestException('Informe ao menos uma pessoa.');
    }

    const usuarios = await this.prisma.user.findMany({
      where: {
        id: {
          in: userIds,
        },
        schoolId,
        isActive: true,
      },
      select: {
        id: true,
      },
    });

    await Promise.all(
      usuarios.map((usuario) =>
        this.prisma.comunicacaoGrupoMembro.upsert({
          where: {
            grupoId_userId: {
              grupoId: data.grupoId,
              userId: usuario.id,
            },
          },
          update: {},
          create: {
            grupoId: data.grupoId,
            userId: usuario.id,
            addedById: data.userId,
          },
        }),
      ),
    );

    return {
      message: 'Membros adicionados ao grupo.',
      adicionados: usuarios.length,
    };
  }

  async obterResumo(data: {
    userId: string;
    userRole: UserRole;
    userSchoolId?: string | null;
  }) {
    const schoolId = await this.assertSchool(data.userSchoolId);
    const grupos = await this.listarGrupos(data);
    const grupoIds = grupos.map((grupo) => grupo.id);

    if (!grupoIds.length) {
      return {
        social: 0,
        chat: 0,
        total: 0,
      };
    }

    const [social, chat] = await Promise.all([
      this.prisma.comunicacaoPost.count({
        where: {
          schoolId,
          grupoId: {
            in: grupoIds,
          },
        },
      }),
      this.prisma.comunicacaoMensagem.count({
        where: {
          schoolId,
          grupoId: {
            in: grupoIds,
          },
        },
      }),
    ]);

    return {
      social,
      chat,
      total: social + chat,
    };
  }

  async criarOuObterChatPrivado(data: {
    userId: string;
    userRole: UserRole;
    userSchoolId?: string | null;
    targetUserId: string;
  }) {
    const schoolId = await this.assertSchool(data.userSchoolId);
    const targetUserId = String(data.targetUserId || '').trim();

    if (!targetUserId || targetUserId === data.userId) {
      throw new BadRequestException('Pessoa inválida para chat privado.');
    }

    const alvo = await this.prisma.user.findFirst({
      where: {
        id: targetUserId,
        schoolId,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
      },
    });

    if (!alvo) {
      throw new NotFoundException('Pessoa não encontrada na escola.');
    }

    const candidatos = await this.prisma.comunicacaoGrupo.findMany({
      where: {
        schoolId,
        tipo: 'PERSONALIZADO',
        AND: [
          { membros: { some: { userId: data.userId } } },
          { membros: { some: { userId: targetUserId } } },
        ],
      },
      include: {
        membros: true,
      },
    });

    const existente = candidatos.find((grupo) => grupo.membros.length === 2);

    if (existente) {
      return existente;
    }

    const usuario = await this.getUsuario(data.userId);

    const grupoCriado = await this.prisma.comunicacaoGrupo.create({
      data: {
        nome: `Chat privado: ${usuario.name} e ${alvo.name}`,
        tipo: 'PERSONALIZADO',
        schoolId,
        createdById: data.userId,
        membros: {
          create: [
            {
              userId: data.userId,
              addedById: data.userId,
            },
            {
              userId: targetUserId,
              addedById: data.userId,
            },
          ],
        },
      },
      include: {
        membros: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                role: true,
                fotoUrl: true,
                alunoPerfil: {
                  select: {
                    fotoUrl: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    return this.normalizarGrupo(grupoCriado);
  }

  async listarPosts(data: {
    userId: string;
    userRole: UserRole;
    userSchoolId?: string | null;
    grupoId: string;
  }) {
    const schoolId = await this.assertSchool(data.userSchoolId);

    await this.assertGroupAccess({
      grupoId: data.grupoId,
      userId: data.userId,
      userRole: data.userRole,
      schoolId,
    });

    await this.deleteExpiredSocialPosts(schoolId, data.grupoId);

    const posts = await this.prisma.comunicacaoPost.findMany({
      where: {
        grupoId: data.grupoId,
        schoolId,
      },
      include: {
        grupo: {
          select: {
            id: true,
            nome: true,
            tipo: true,
            turmaId: true,
          },
        },
        author: {
          select: {
            id: true,
            name: true,
            role: true,
            fotoUrl: true,
            alunoPerfil: {
              select: {
                fotoUrl: true,
              },
            },
          },
        },
        comentarios: {
          include: {
            author: {
              select: {
                id: true,
                name: true,
                role: true,
                fotoUrl: true,
                alunoPerfil: {
                  select: {
                    fotoUrl: true,
                  },
                },
              },
            },
          },
          orderBy: {
            createdAt: 'asc',
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 60,
    });

    return this.anexarReacoesNosPosts(posts, data.userId);
  }

  async limparPosts(data: {
    userId: string;
    userRole: UserRole;
    userSchoolId?: string | null;
    grupoIds: string[];
    reset?: boolean;
  }) {
    const schoolId = await this.assertSchool(data.userSchoolId);
    const grupoIds = Array.from(
      new Set((data.grupoIds || []).map((grupoId) => String(grupoId || '').trim()).filter(Boolean)),
    );

    if (!grupoIds.length) {
      throw new BadRequestException('Selecione pelo menos uma turma ou grupo.');
    }

    if (data.reset && !this.canResetSocialPosts(data.userRole)) {
      throw new ForbiddenException(
        'Apenas administracao, gestao ou secretaria podem resetar publicacoes.',
      );
    }

    for (const grupoId of grupoIds) {
      await this.assertGroupAccess({
        grupoId,
        userId: data.userId,
        userRole: data.userRole,
        schoolId,
      });
    }

    const deleted = await this.deleteSocialPosts({
      schoolId,
      grupoId: { in: grupoIds },
      ...(data.reset
        ? {}
        : { createdAt: { lt: this.socialCleanCutoffDate() } }),
    });

    return {
      deleted,
      grupoIds,
      reset: Boolean(data.reset),
    };
  }

  async criarPost(data: {
    userId: string;
    userRole: UserRole;
    userSchoolId?: string | null;
    grupoId: string;
    texto?: string;
    tipo?: ComunicacaoPostTipo;
    mediaUrl?: string;
    mediaMime?: string;
    paraTodosEscola?: boolean;
  }) {
    const schoolId = await this.assertSchool(data.userSchoolId);
    const usuario = await this.getUsuario(data.userId);
    const texto = String(data.texto || '').trim();

    if (
      usuario.comunicacaoSuspensoAte &&
      usuario.comunicacaoSuspensoAte.getTime() > Date.now()
    ) {
      throw new ForbiddenException(
        usuario.comunicacaoSuspensoMotivo ||
          'Seu acesso a rede social esta suspenso por moderacao durante 48 horas.',
      );
    }

    if (data.userRole === UserRole.RESPONSAVEL) {
      throw new ForbiddenException(
        'Responsaveis acompanham a rede social em modo somente leitura.',
      );
    }

    
    if (!texto && !data.mediaUrl) {
      throw new BadRequestException('Escreva uma mensagem ou envie uma midia.');
    }

    if (data.tipo === ComunicacaoPostTipo.AVISO && data.userRole === UserRole.ALUNO) {
      throw new ForbiddenException('Aluno não pode publicar avisos.');
    }

    const grupoId = data.grupoId;

    await this.assertGroupAccess({
      grupoId,
      userId: data.userId,
      userRole: data.userRole,
      schoolId,
    });

    const post = await this.prisma.comunicacaoPost.create({
      data: {
        grupoId,
        schoolId,
        authorId: data.userId,
        tipo: data.tipo || ComunicacaoPostTipo.POST,
        texto: texto || null,
        mediaUrl: data.mediaUrl,
        mediaMime: data.mediaMime,
      },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            role: true,
            fotoUrl: true,
            alunoPerfil: {
              select: {
                fotoUrl: true,
              },
            },
          },
        },
        comentarios: true,
      },
    });

    return (await this.anexarReacoesNosPosts([post], data.userId))[0];
  }

  async editarPost(data: {
    userId: string;
    userRole: UserRole;
    userSchoolId?: string | null;
    postId: string;
    texto?: string;
    tipo?: ComunicacaoPostTipo;
  }) {
    const schoolId = await this.assertSchool(data.userSchoolId);
    const postAtual = await this.prisma.comunicacaoPost.findFirst({
      where: { id: data.postId, schoolId },
    });

    if (!postAtual) throw new NotFoundException('Publicação não encontrada.');

    if (postAtual.authorId !== data.userId) {
      throw new ForbiddenException('Você só pode editar a sua própria publicação.');
    }

    await this.assertGroupAccess({
      grupoId: postAtual.grupoId,
      userId: data.userId,
      userRole: data.userRole,
      schoolId,
    });

    const texto = String(data.texto || '').trim();
    const tipo = data.tipo || postAtual.tipo;

    if (tipo === ComunicacaoPostTipo.AVISO && data.userRole === UserRole.ALUNO) {
      throw new ForbiddenException('Aluno não pode publicar avisos.');
    }

    if (!texto && !postAtual.mediaUrl) {
      throw new BadRequestException('Escreva uma mensagem ou mantenha uma mídia.');
    }

    const post = await this.prisma.comunicacaoPost.update({
      where: { id: data.postId },
      data: {
        texto: texto || null,
        tipo,
      },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            role: true,
            fotoUrl: true,
            alunoPerfil: { select: { fotoUrl: true } },
          },
        },
        comentarios: {
          include: {
            author: {
              select: {
                id: true,
                name: true,
                role: true,
                fotoUrl: true,
                alunoPerfil: { select: { fotoUrl: true } },
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    return (await this.anexarReacoesNosPosts([post], data.userId))[0];
  }

  async excluirPost(data: {
    userId: string;
    userRole: UserRole;
    userSchoolId?: string | null;
    postId: string;
  }) {
    const schoolId = await this.assertSchool(data.userSchoolId);
    const post = await this.prisma.comunicacaoPost.findFirst({
      where: { id: data.postId, schoolId },
    });

    if (!post) throw new NotFoundException('Publicação não encontrada.');

    if (post.authorId !== data.userId) {
      throw new ForbiddenException('Você só pode excluir a sua própria publicação.');
    }

    await this.assertGroupAccess({
      grupoId: post.grupoId,
      userId: data.userId,
      userRole: data.userRole,
      schoolId,
    });

    try {
      await this.prisma.$executeRaw(
        Prisma.sql`DELETE FROM "comunicacao_reacoes" WHERE "postId" = ${data.postId}`,
      );
    } catch (error) {
      if (!this.isMissingReacoesTableError(error)) {
        throw error;
      }
    }

    await this.prisma.comunicacaoComentario.deleteMany({
      where: { postId: data.postId },
    });

    return this.prisma.comunicacaoPost.delete({
      where: { id: data.postId },
    });
  }

  async comentar(data: {
    userId: string;
    userRole: UserRole;
    userSchoolId?: string | null;
    postId: string;
    texto: string;
  }) {
    const schoolId = await this.assertSchool(data.userSchoolId);
    if (data.userRole === UserRole.RESPONSAVEL) {
      throw new ForbiddenException(
        'Responsaveis acompanham a rede social em modo somente leitura.',
      );
    }
    const usuario = await this.getUsuario(data.userId);
    const texto = String(data.texto || '').trim();

    if (!texto) {
      throw new BadRequestException('Comentario vazio.');
    }

    if (
      usuario.comunicacaoSuspensoAte &&
      usuario.comunicacaoSuspensoAte.getTime() > Date.now()
    ) {
      throw new ForbiddenException(
        usuario.comunicacaoSuspensoMotivo ||
          'Seu acesso a rede social esta suspenso por moderacao durante 48 horas.',
      );
    }

    const post = (await this.prisma.comunicacaoPost.findFirst({
      where: {
        id: data.postId,
        schoolId,
      },
    })) as any;

    if (!post) {
      throw new NotFoundException('Post nao encontrado.');
    }

    const moderacaoPorPost = await this.buscarModeracaoPorPosts([post.id]);
    const moderacao = moderacaoPorPost.get(post.id);

    await this.assertGroupAccess({
      grupoId: post.grupoId,
      userId: data.userId,
      userRole: data.userRole,
      schoolId,
    });

    if (moderacao?.moderadoAt) {
      throw new ForbiddenException('Esta publicacao foi moderada.');
    }

    const comentario = await this.prisma.comunicacaoComentario.create({
      data: {
        postId: data.postId,
        schoolId,
        authorId: data.userId,
        texto,
      },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            role: true,
            fotoUrl: true,
            alunoPerfil: {
              select: {
                fotoUrl: true,
              },
            },
          },
        },
      },
    });

    return {
      ...comentario,
      author: this.normalizarPessoa(comentario.author),
    };
  }

  async reagirPost(data: {
    userId: string;
    userRole: UserRole;
    userSchoolId?: string | null;
    postId: string;
    tipo: ComunicacaoReacaoTipoValue;
  }) {
    const schoolId = await this.assertSchool(data.userSchoolId);
    const tipo = data.tipo === 'DISLIKE' ? 'DISLIKE' : 'LIKE';
    const post = (await this.prisma.comunicacaoPost.findFirst({
      where: {
        id: data.postId,
        schoolId,
      },
    })) as any;

    if (!post) {
      throw new NotFoundException('Post nao encontrado.');
    }

    const moderacaoPorPost = await this.buscarModeracaoPorPosts([post.id]);
    const moderacao = moderacaoPorPost.get(post.id);

    await this.assertGroupAccess({
      grupoId: post.grupoId,
      userId: data.userId,
      userRole: data.userRole,
      schoolId,
    });

    if (moderacao?.moderadoAt) {
      throw new ForbiddenException('Esta publicacao foi moderada.');
    }

    let existentes: Array<{ id: string; tipo: ComunicacaoReacaoTipoValue }> = [];

    try {
      existentes = await this.prisma.$queryRaw<
        Array<{ id: string; tipo: ComunicacaoReacaoTipoValue }>
      >(Prisma.sql`
        SELECT "id", "tipo"
        FROM "comunicacao_reacoes"
        WHERE "postId" = ${data.postId}
          AND "userId" = ${data.userId}
        LIMIT 1
      `);
    } catch (error) {
      if (this.isMissingReacoesTableError(error)) {
        return {
          postId: data.postId,
          reacoes: this.emptyReacoesResumo(),
          unavailable: true,
        };
      }

      throw error;
    }

    const atual = existentes[0];

    if (!atual) {
      try {
        await this.prisma.$executeRaw(Prisma.sql`
          INSERT INTO "comunicacao_reacoes" (
            "id",
            "postId",
            "schoolId",
            "userId",
            "tipo",
            "createdAt",
            "updatedAt"
          ) VALUES (
            ${randomUUID()},
            ${data.postId},
            ${schoolId},
            ${data.userId},
            ${tipo}::"ComunicacaoReacaoTipo",
            NOW(),
            NOW()
          )
        `);
      } catch (error) {
        if (this.isMissingReacoesTableError(error)) {
          return {
            postId: data.postId,
            reacoes: this.emptyReacoesResumo(),
            unavailable: true,
          };
        }

        throw error;
      }
    } else if (atual.tipo === tipo) {
      try {
        await this.prisma.$executeRaw(
          Prisma.sql`DELETE FROM "comunicacao_reacoes" WHERE "id" = ${atual.id}`,
        );
      } catch (error) {
        if (this.isMissingReacoesTableError(error)) {
          return {
            postId: data.postId,
            reacoes: this.emptyReacoesResumo(),
            unavailable: true,
          };
        }

        throw error;
      }
    } else {
      try {
        await this.prisma.$executeRaw(Prisma.sql`
          UPDATE "comunicacao_reacoes"
          SET "tipo" = ${tipo}::"ComunicacaoReacaoTipo",
              "updatedAt" = NOW()
          WHERE "id" = ${atual.id}
        `);
      } catch (error) {
        if (this.isMissingReacoesTableError(error)) {
          return {
            postId: data.postId,
            reacoes: this.emptyReacoesResumo(),
            unavailable: true,
          };
        }

        throw error;
      }
    }

    const resumoPorPost = await this.buscarResumoReacoesPorPosts(
      [data.postId],
      data.userId,
    );

    return {
      postId: data.postId,
      reacoes: resumoPorPost.get(data.postId) || this.emptyReacoesResumo(),
    };
  }

  async moderarPost(data: {
    userId: string;
    userRole: UserRole;
    userSchoolId?: string | null;
    postId: string;
  }) {
    const schoolId = await this.assertSchool(data.userSchoolId);

    if (!this.canModeratePosts(data.userRole)) {
      throw new ForbiddenException('Voce nao tem permissao para moderar publicacoes.');
    }

    const post = (await this.prisma.comunicacaoPost.findFirst({
      where: {
        id: data.postId,
        schoolId,
      },
    })) as any;

    if (!post) {
      throw new NotFoundException('Post nao encontrado.');
    }

    const moderacaoPorPost = await this.buscarModeracaoPorPosts([post.id]);
    const moderacao = moderacaoPorPost.get(post.id);

    if (moderacao?.moderadoAt) {
      return {
        postId: post.id,
        alreadyModerated: true,
      };
    }

    const suspensoAte = new Date(Date.now() + 48 * 60 * 60 * 1000);

    await this.prisma.$transaction([
      this.prisma.$executeRaw(
        Prisma.sql`
          UPDATE "comunicacao_posts"
          SET "moderadoAt" = NOW(),
              "moderadoPorId" = ${data.userId},
              "moderadorRole" = ${data.userRole}::"UserRole",
              "motivoModeracao" = ${this.moderationMessage()},
              "updatedAt" = NOW()
          WHERE "id" = ${post.id}
        `,
      ),
      this.prisma.$executeRaw(
        Prisma.sql`
          UPDATE "users"
          SET "comunicacaoSuspensoAte" = ${suspensoAte},
              "comunicacaoSuspensoMotivo" = ${this.moderationSuspensionMessage()},
              "updatedAt" = NOW()
          WHERE "id" = ${post.authorId}
        `,
      ),
    ]);

    return {
      postId: post.id,
      authorId: post.authorId,
      suspensoAte: suspensoAte.toISOString(),
      message:
        'Postagem excluida pelo moderador. O autor ficou 48 horas sem poder postar.',
    };
  }

  async liberarAutorModerado(data: {
    userId: string;
    userRole: UserRole;
    userSchoolId?: string | null;
    authorId: string;
  }) {
    const schoolId = await this.assertSchool(data.userSchoolId);

    if (!this.canModeratePosts(data.userRole)) {
      throw new ForbiddenException('Voce nao tem permissao para liberar autores.');
    }

    const autor = await this.prisma.user.findFirst({
      where: {
        id: data.authorId,
        schoolId,
      },
      select: {
        id: true,
      },
    });

    if (!autor) {
      throw new NotFoundException('Autor nao encontrado.');
    }

    await this.prisma.$executeRaw(
      Prisma.sql`
        UPDATE "users"
        SET "comunicacaoSuspensoAte" = NULL,
            "comunicacaoSuspensoMotivo" = NULL,
            "updatedAt" = NOW()
        WHERE "id" = ${autor.id}
      `,
    );

    return {
      authorId: autor.id,
      released: true,
    };
  }

  async listarMensagens(data: {
    userId: string;
    userRole: UserRole;
    userSchoolId?: string | null;
    grupoId: string;
  }) {
    const schoolId = await this.assertSchool(data.userSchoolId);

    await this.assertGroupAccess({
      grupoId: data.grupoId,
      userId: data.userId,
      userRole: data.userRole,
      schoolId,
    });

    const mensagens = await this.prisma.comunicacaoMensagem.findMany({
      where: {
        grupoId: data.grupoId,
        schoolId,
      },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            role: true,
            fotoUrl: true,
            alunoPerfil: {
              select: {
                fotoUrl: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
      take: 200,
    });

    return mensagens.map((mensagem) => this.normalizarMensagem(mensagem));
  }

  async enviarMensagem(data: {
    userId: string;
    userRole: UserRole;
    userSchoolId?: string | null;
    grupoId: string;
    texto: string;
    mediaUrl?: string;
    mediaMime?: string;
    paraTodosEscola?: boolean;
  }) {
    const schoolId = await this.assertSchool(data.userSchoolId);
    const texto = String(data.texto || '').trim();

    if (!texto && !data.mediaUrl) {
      throw new BadRequestException('Mensagem vazia.');
    }

    let grupoId = data.grupoId;

    if (data.paraTodosEscola) {
      if (!this.canBroadcastToSchool(data.userRole)) {
        throw new ForbiddenException(
          'Apenas administrador, gestor ou secretaria podem enviar para todos.',
        );
      }

      const grupoEscola = await this.ensureGrupoEscola({
        schoolId,
        createdById: data.userId,
      });
      grupoId = grupoEscola.id;
    } else {
      await this.assertGroupAccess({
        grupoId,
        userId: data.userId,
        userRole: data.userRole,
        schoolId,
      });
    }

    const grupo = await this.prisma.comunicacaoGrupo.findFirst({
      where: {
        id: grupoId,
        schoolId,
      },
      select: {
        tipo: true,
        membros: {
          where: {
            userId: data.userId,
          },
          select: {
            id: true,
          },
        },
      },
    });

    if (
      grupo?.tipo === 'PERSONALIZADO' &&
      this.isGestao(data.userRole) &&
      !grupo.membros.length
    ) {
      throw new ForbiddenException(
        'A gestão pode apenas visualizar conversas privadas de terceiros.',
      );
    }

    const mensagemData: Prisma.ComunicacaoMensagemUncheckedCreateInput = {
      grupoId,
      schoolId,
      authorId: data.userId,
      texto,
      mediaUrl: data.mediaUrl,
      mediaMime: data.mediaMime,
    };

    const mensagem = await this.prisma.comunicacaoMensagem.create({
      data: mensagemData,
      include: {
        author: {
          select: {
            id: true,
            name: true,
            role: true,
            fotoUrl: true,
            alunoPerfil: {
              select: {
                fotoUrl: true,
              },
            },
          },
        },
      },
    });

    return this.normalizarMensagem(mensagem);
  }
}

