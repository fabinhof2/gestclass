import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import {
  FinanceiroCobrancaStatus,
  FrequenciaStatus,
  SchoolPlan,
  SchoolStatus,
  SolicitacaoStatus,
  TipoAvaliacao,
  UserRole,
  Prisma,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';

const schoolUserSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  isActive: true,
  isActivated: true,
  schoolId: true,
  createdAt: true,
  updatedAt: true,
} as const;

const INADIMPLENCIA_ASSINATURA_DIAS = 45;
const BLOQUEIO_ASSINATURA_DIAS = 60;

function normalizeSchoolAdminUsername(value?: string | null) {
  const username = String(value || '').trim().toLowerCase();

  return username || null;
}

function normalizeSchoolAdminCpf(value?: string | null) {
  const cpf = String(value || '').replace(/\D/g, '');

  return cpf || null;
}

function isValidSchoolAdminUsername(username: string | null) {
  if (!username) return false;

  if (username.length < 3) {
    throw new BadRequestException('O usuario do admin deve ter pelo menos 3 caracteres.');
  }

  if (!/^[a-z0-9._-]+$/.test(username)) {
    throw new BadRequestException(
      'Use apenas letras, numeros, ponto, hifen ou underline no usuario do admin.',
    );
  }

  return true;
}

@Injectable()
export class SchoolsService {
  private readonly logger = new Logger(SchoolsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
  ) {}

  private getDataLimiteInadimplenciaAssinatura() {
    const data = new Date();
    data.setDate(data.getDate() - INADIMPLENCIA_ASSINATURA_DIAS);
    return data;
  }

  private getDataLimiteBloqueioAssinatura() {
    const data = new Date();
    data.setDate(data.getDate() - BLOQUEIO_ASSINATURA_DIAS);
    return data;
  }

  private async getGestorAnalytics(schoolId: string) {
    const [school, turmas, alunos, notasBoletim, cobrancas, frequencias, financeiroConfig] =
      await Promise.all([
        this.prisma.school.findUnique({
          where: { id: schoolId },
          select: {
            mediaAprovacao: true,
          },
        }),
        this.prisma.turma.findMany({
          where: { schoolId },
          select: {
            id: true,
            name: true,
            turno: true,
          },
          orderBy: [{ name: 'asc' }, { turno: 'asc' }],
        }),
        this.prisma.aluno.findMany({
          where: { schoolId },
          select: {
            id: true,
            name: true,
            turmaId: true,
            turma: {
              select: {
                name: true,
                turno: true,
              },
            },
          },
          orderBy: [{ name: 'asc' }],
        }),
        this.prisma.notaBoletim.findMany({
          where: {
            schoolId,
          },
          select: {
            alunoId: true,
            notaFinal: true,
          },
        }),
        this.prisma.financeiroCobranca.findMany({
          where: {
            schoolId,
          },
          select: {
            alunoId: true,
            status: true,
          },
        }),
        this.prisma.frequencia.findMany({
          where: {
            schoolId,
          },
          select: {
            alunoId: true,
            status: true,
            turmaProfessor: {
              select: {
                turmaId: true,
              },
            },
          },
        }),
        this.prisma.financeiroConfiguracao.findUnique({
          where: { schoolId },
          select: {
            gestorAccessEnabled: true,
            secretariaAccessEnabled: true,
          },
        }),
      ]);

    const mediaAprovacao = Number(school?.mediaAprovacao ?? 7);
    const totalAlunos = alunos.length;
    const alunoMap = new Map(
      alunos.map((aluno) => [
        aluno.id,
        {
          id: aluno.id,
          name: aluno.name,
          turmaId: aluno.turmaId,
          turmaNome: aluno.turma.name,
          turno: aluno.turma.turno,
        },
      ]),
    );
    const mediasPorAluno = new Map<
      string,
      { turmaId: string; soma: number; quantidade: number }
    >();

    for (const nota of notasBoletim) {
      const alunoInfo = alunoMap.get(nota.alunoId);
      const valorNota = Number(nota.notaFinal);

      if (!alunoInfo || Number.isNaN(valorNota)) {
        continue;
      }

      const atualAluno = mediasPorAluno.get(nota.alunoId);
      if (atualAluno) {
        atualAluno.soma += valorNota;
        atualAluno.quantidade += 1;
      } else {
        mediasPorAluno.set(nota.alunoId, {
          turmaId: alunoInfo.turmaId,
          soma: valorNota,
          quantidade: 1,
        });
      }
    }

    const alunosPorTurmaComMedia = new Map<
      string,
      Array<{
        id: string;
        name: string;
        media: number;
      }>
    >();

    for (const [alunoId, aluno] of mediasPorAluno.entries()) {
      const alunoInfo = alunoMap.get(alunoId);
      const mediaAluno = aluno.quantidade
        ? Number((aluno.soma / aluno.quantidade).toFixed(2))
        : 0;

      if (!alunoInfo) {
        continue;
      }

      if (!alunosPorTurmaComMedia.has(aluno.turmaId)) {
        alunosPorTurmaComMedia.set(aluno.turmaId, []);
      }

      alunosPorTurmaComMedia.get(aluno.turmaId)!.push({
        id: alunoId,
        name: alunoInfo.name,
        media: mediaAluno,
      });
    }

    const defasagemPorTurma = turmas.map((turma) => {
      const alunosDaTurma = alunosPorTurmaComMedia.get(turma.id) || [];
      const alunosAbaixoDaMedia = alunosDaTurma
        .filter((aluno) => aluno.media < mediaAprovacao)
        .sort((a, b) => a.media - b.media || a.name.localeCompare(b.name));
      const alunosComNotas = alunosDaTurma.length;
      const alunosEmDefasagem = alunosAbaixoDaMedia.length;
      const percentualDefasagem = alunosComNotas
        ? Number(((alunosEmDefasagem / alunosComNotas) * 100).toFixed(1))
        : 0;

      return {
        turmaId: turma.id,
        turmaNome: turma.name,
        turno: turma.turno,
        alunosComNotas,
        alunosEmDefasagem,
        percentualDefasagem,
        alunos: alunosAbaixoDaMedia,
      };
    });

    const extremosNotasPorTurma = turmas
      .map((turma) => {
        const alunosDaTurma = (alunosPorTurmaComMedia.get(turma.id) || []).sort(
          (a, b) => b.media - a.media || a.name.localeCompare(b.name),
        );

        if (!alunosDaTurma.length) {
          return {
            turmaId: turma.id,
            turmaNome: turma.name,
            turno: turma.turno,
            maiorNota: null,
            menorNota: null,
            quantidadeLancamentos: 0,
            alunosMaiorNota: [],
            alunosAbaixoDaMedia: [],
          };
        }

        const maiorNota = alunosDaTurma[0].media;
        const alunosMaiorNota = alunosDaTurma.filter(
          (aluno) => aluno.media === maiorNota,
        );
        const alunosAbaixoDaMedia = alunosDaTurma
          .filter((aluno) => aluno.media < mediaAprovacao)
          .sort((a, b) => a.media - b.media || a.name.localeCompare(b.name));
        const menorNota =
          alunosAbaixoDaMedia.length > 0 ? alunosAbaixoDaMedia[0].media : null;

        return {
          turmaId: turma.id,
          turmaNome: turma.name,
          turno: turma.turno,
          maiorNota: Number(maiorNota.toFixed(2)),
          menorNota:
            menorNota === null ? null : Number(menorNota.toFixed(2)),
          quantidadeLancamentos: alunosDaTurma.length,
          alunosMaiorNota,
          alunosAbaixoDaMedia,
        };
      })
      .filter((item) => item.quantidadeLancamentos > 0);

    const faltasPorAlunoTurma = new Map<
      string,
      Map<string, { faltas: number; presencas: number }>
    >();
    const resumoFrequenciaPorTurma = new Map<
      string,
      { presencas: number; faltas: number }
    >();

    for (const frequencia of frequencias) {
      const turmaId = frequencia.turmaProfessor.turmaId;
      const statusAtual = resumoFrequenciaPorTurma.get(turmaId) || {
        presencas: 0,
        faltas: 0,
      };

      if (frequencia.status === FrequenciaStatus.FALTA) {
        statusAtual.faltas += 1;
      } else {
        statusAtual.presencas += 1;
      }

      resumoFrequenciaPorTurma.set(turmaId, statusAtual);

      if (!faltasPorAlunoTurma.has(turmaId)) {
        faltasPorAlunoTurma.set(turmaId, new Map());
      }

      const faltasDaTurma = faltasPorAlunoTurma.get(turmaId)!;
      const atualAluno = faltasDaTurma.get(frequencia.alunoId) || {
        faltas: 0,
        presencas: 0,
      };

      if (frequencia.status === FrequenciaStatus.FALTA) {
        atualAluno.faltas += 1;
      } else {
        atualAluno.presencas += 1;
      }

      faltasDaTurma.set(frequencia.alunoId, atualAluno);
    }

    const frequenciaPorTurma = turmas.map((turma) => {
      const resumoTurma = resumoFrequenciaPorTurma.get(turma.id) || {
        presencas: 0,
        faltas: 0,
      };
      const totalRegistros = resumoTurma.presencas + resumoTurma.faltas;
      const percentualPresencas = totalRegistros
        ? Number(((resumoTurma.presencas / totalRegistros) * 100).toFixed(1))
        : 0;
      const percentualFaltas = totalRegistros
        ? Number(((resumoTurma.faltas / totalRegistros) * 100).toFixed(1))
        : 0;
      const alunosComMaisFaltas = Array.from(
        (faltasPorAlunoTurma.get(turma.id) || new Map()).entries(),
      )
        .map(([alunoId, resumoAluno]) => {
          const alunoInfo = alunoMap.get(alunoId);

          if (!alunoInfo) return null;

          return {
            id: alunoId,
            name: alunoInfo.name,
            faltas: resumoAluno.faltas,
            presencas: resumoAluno.presencas,
          };
        })
        .filter((aluno): aluno is NonNullable<typeof aluno> => Boolean(aluno))
        .sort((a, b) => b.faltas - a.faltas || a.name.localeCompare(b.name))
        .slice(0, 5);

      return {
        turmaId: turma.id,
        turmaNome: turma.name,
        turno: turma.turno,
        totalRegistros,
        totalPresencas: resumoTurma.presencas,
        totalFaltas: resumoTurma.faltas,
        percentualPresencas,
        percentualFaltas,
        alunosComMaisFaltas,
      };
    });

    const alunosInadimplentes = new Set<string>();

    for (const cobranca of cobrancas) {
      if (cobranca.status === FinanceiroCobrancaStatus.ATRASADO) {
        alunosInadimplentes.add(cobranca.alunoId);
      }
    }

    const inadimplentes = alunosInadimplentes.size;
    const adimplentes = Math.max(totalAlunos - inadimplentes, 0);
    const financeiroGestorEnabled = Boolean(
      financeiroConfig?.gestorAccessEnabled ?? true,
    );
    const financeiroSecretariaEnabled = Boolean(
      financeiroConfig?.secretariaAccessEnabled ?? true,
    );
    const inadimplentesLista = alunos
      .filter((aluno) => alunosInadimplentes.has(aluno.id))
      .map((aluno) => ({
        id: aluno.id,
        name: aluno.name,
        turmaNome: aluno.turma.name,
        turno: aluno.turma.turno,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
    const adimplentesLista = alunos
      .filter((aluno) => !alunosInadimplentes.has(aluno.id))
      .map((aluno) => ({
        id: aluno.id,
        name: aluno.name,
        turmaNome: aluno.turma.name,
        turno: aluno.turma.turno,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return {
      mediaAprovacao,
      defasagemPorTurma,
      frequenciaPorTurma,
      extremosNotasPorTurma,
      financeiroGestorEnabled,
      financeiroSecretariaEnabled,
      financeiroAlunos: {
        totalAlunos: financeiroGestorEnabled ? totalAlunos : 0,
        inadimplentes: financeiroGestorEnabled ? inadimplentes : 0,
        adimplentes: financeiroGestorEnabled ? adimplentes : 0,
        inadimplentesLista: financeiroGestorEnabled ? inadimplentesLista : [],
        adimplentesLista: financeiroGestorEnabled ? adimplentesLista : [],
      },
    };
  }

  private async atualizarInadimplenciaPorAssinaturas() {
    try {
      const agora = new Date();
      const limiteInadimplencia = this.getDataLimiteInadimplenciaAssinatura();
      const limiteBloqueio = this.getDataLimiteBloqueioAssinatura();

      await this.prisma.financeiroAssinaturaCobranca.updateMany({
        where: {
          status: FinanceiroCobrancaStatus.PENDENTE,
          vencimento: {
            lt: agora,
          },
        },
        data: {
          status: FinanceiroCobrancaStatus.ATRASADO,
        },
      });

      const escolasComBloqueio =
        await this.prisma.financeiroAssinaturaCobranca.findMany({
          where: {
            status: {
              in: [
                FinanceiroCobrancaStatus.PENDENTE,
                FinanceiroCobrancaStatus.ATRASADO,
              ],
            },
            vencimento: {
              lt: limiteBloqueio,
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

      if (blockedSchoolIds.length > 0) {
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

      const escolasComAtrasoGrave =
        await this.prisma.financeiroAssinaturaCobranca.findMany({
          where: {
            status: {
              in: [
                FinanceiroCobrancaStatus.PENDENTE,
                FinanceiroCobrancaStatus.ATRASADO,
              ],
            },
            vencimento: {
              lt: limiteInadimplencia,
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

      const schoolIds = escolasComAtrasoGrave.map((item) => item.schoolId);
      const delinquentSchoolIds = schoolIds.filter(
        (schoolId) => !blockedSchoolIds.includes(schoolId),
      );

      if (delinquentSchoolIds.length > 0) {
        await this.prisma.school.updateMany({
          where: {
            id: {
              in: delinquentSchoolIds,
            },
            status: {
              notIn: [SchoolStatus.CANCELADA, SchoolStatus.SUSPENSA],
            },
          },
          data: {
            status: SchoolStatus.INADIMPLENTE,
          },
        });
      }

      await this.prisma.school.updateMany({
        where: {
          status: SchoolStatus.INADIMPLENTE,
          id:
            delinquentSchoolIds.length > 0
              ? {
                  notIn: delinquentSchoolIds,
                }
              : undefined,
        },
        data: {
          status: SchoolStatus.ATIVA,
        },
      });
    } catch (error) {
      this.logger.warn(
        'Falha ao atualizar inadimplência por assinaturas; seguindo com a listagem de escolas.',
      );
      this.logger.debug(String(error));
    }
  }

  async findAll() {
    await this.atualizarInadimplenciaPorAssinaturas();

    return this.prisma.school.findMany({
      include: {
        users: {
          select: schoolUserSelect,
        },
        userSchoolLinks: {
          include: {
            user: {
              select: schoolUserSelect,
            },
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findById(id: string) {
    return this.prisma.school.findUnique({
      where: { id },
      include: {
        users: {
          select: schoolUserSelect,
        },
        userSchoolLinks: {
          include: {
            user: {
              select: schoolUserSelect,
            },
          },
        },
      },
    });
  }

  async getDashboardSummary(data: {
    userRole: UserRole;
    userSchoolId?: string | null;
  }) {
    const onlineThreshold = new Date(Date.now() - 5 * 60 * 1000);

    if (data.userRole === UserRole.SUPERUSUARIO) {
      await this.atualizarInadimplenciaPorAssinaturas();

      const [
        totalSchools,
        activeSchools,
        trialSchools,
        delinquentSchools,
        totalUsers,
        totalAlunos,
        totalFuncionarios,
      ] = await Promise.all([
        this.prisma.school.count(),
        this.prisma.school.count({ where: { status: SchoolStatus.ATIVA } }),
        this.prisma.school.count({ where: { plan: SchoolPlan.TESTE_15_DIAS } }),
        this.prisma.school.count({
          where: { status: SchoolStatus.INADIMPLENTE },
        }),
        this.prisma.user.count({
          where: {
            role: {
              not: UserRole.SUPERUSUARIO,
            },
          },
        }),
        this.prisma.aluno.count(),
        this.prisma.user.count({
          where: {
            role: {
              in: [
                UserRole.ADMIN_ESCOLA,
                UserRole.FINANCEIRO,
                UserRole.GESTOR,
                UserRole.COORDENADOR,
                UserRole.SECRETARIA,
                UserRole.AUXILIAR,
                UserRole.PROFESSOR,
              ],
            },
          },
        }),
      ]);

      return {
        scope: 'global',
        totalSchools,
        activeSchools,
        trialSchools,
        delinquentSchools,
        totalUsers,
        totalAlunos,
        totalFuncionarios,
      };
    }

    const schoolId = data.userSchoolId;

    if (!schoolId) {
      return {
        scope: 'school',
        schoolId: null,
        alunosMatriculados: 0,
        turmasAtivas: 0,
        totalFuncionarios: 0,
        avaliacoesPeriodo: 0,
        avaliacoesOnline: 0,
        mediaGeral: null,
        solicitacoesPendentes: 0,
        cobrancasPendentes: 0,
        valorPendente: 0,
        financeiroSecretariaEnabled: true,
        usuariosOnline: 0,
      };
    }

    const inicioMes = new Date();
    inicioMes.setDate(1);
    inicioMes.setHours(0, 0, 0, 0);

    const [
      alunosMatriculados,
      turmasAtivas,
      funcionarios,
      avaliacoesPeriodo,
      avaliacoesOnline,
      mediaGeral,
      solicitacoesPendentes,
      cobrancasPendentes,
      cobrancasPendentesValor,
      financeiroConfig,
      gestorAnalytics,
      usuariosOnline,
    ] = await Promise.all([
      this.prisma.aluno.count({ where: { schoolId } }),
      this.prisma.turma.count({ where: { schoolId } }),
      this.prisma.user.findMany({
        where: {
          role: {
            in: [
              UserRole.ADMIN_ESCOLA,
              UserRole.FINANCEIRO,
              UserRole.GESTOR,
              UserRole.COORDENADOR,
              UserRole.SECRETARIA,
              UserRole.AUXILIAR,
              UserRole.PROFESSOR,
            ],
          },
          OR: [
            { schoolId },
            {
              schoolLinks: {
                some: {
                  schoolId,
                },
              },
            },
          ],
        },
        select: {
          id: true,
        },
        distinct: ['id'],
      }),
      this.prisma.atividadeAvaliacaoModelo.count({
        where: {
          schoolId,
          createdAt: {
            gte: inicioMes,
          },
        },
      }),
      this.prisma.avaliacaoOnline.count({
        where: {
          schoolId,
          createdAt: {
            gte: inicioMes,
          },
        },
      }),
      this.prisma.notaBoletim.aggregate({
        where: {
          schoolId,
        },
        _avg: {
          notaFinal: true,
        },
      }),
      this.prisma.solicitacao.count({
        where: {
          schoolId,
          status: {
            not: SolicitacaoStatus.RESPONDIDA,
          },
        },
      }),
      this.prisma.financeiroCobranca.count({
        where: {
          schoolId,
          status: {
            in: [
              FinanceiroCobrancaStatus.PENDENTE,
              FinanceiroCobrancaStatus.ATRASADO,
            ],
          },
        },
      }),
      this.prisma.financeiroCobranca.aggregate({
        where: {
          schoolId,
          status: {
            in: [
              FinanceiroCobrancaStatus.PENDENTE,
              FinanceiroCobrancaStatus.ATRASADO,
            ],
          },
        },
        _sum: {
          valor: true,
        },
      }),
      this.prisma.financeiroConfiguracao.findUnique({
        where: { schoolId },
        select: {
          secretariaAccessEnabled: true,
        },
      }),
      data.userRole === UserRole.GESTOR
        ? this.getGestorAnalytics(schoolId)
        : Promise.resolve(null),
      this.prisma.user.count({
        where: {
          isActive: true,
          lastActiveAt: {
            gte: onlineThreshold,
          },
          OR: [
            { schoolId },
            {
              schoolLinks: {
                some: {
                  schoolId,
                },
              },
            },
          ],
        },
      }),
    ]);

    return {
      scope: 'school',
      schoolId,
      alunosMatriculados,
      turmasAtivas,
      totalFuncionarios: funcionarios.length,
      avaliacoesPeriodo: avaliacoesPeriodo + avaliacoesOnline,
      avaliacoesOnline,
      mediaGeral:
        mediaGeral._avg.notaFinal === null
          ? null
          : Number(mediaGeral._avg.notaFinal),
      solicitacoesPendentes,
      cobrancasPendentes,
      valorPendente: Number(cobrancasPendentesValor._sum.valor || 0),
      financeiroSecretariaEnabled: Boolean(
        financeiroConfig?.secretariaAccessEnabled ?? true,
      ),
      usuariosOnline,
      gestorAnalytics: gestorAnalytics || undefined,
    };
  }

  async findAccessibleByUser(data: {
    userId: string;
    userRole: UserRole;
    userSchoolId?: string | null;
  }) {
    if (data.userRole === UserRole.SUPERUSUARIO) {
      return this.findAll();
    }

    if (data.userRole === UserRole.ADMIN_ESCOLA) {
      return this.prisma.school.findMany({
        where: {
          OR: [
            { id: data.userSchoolId || '' },
            {
              userSchoolLinks: {
                some: {
                  userId: data.userId,
                },
              },
            },
          ],
        },
        include: {
          users: {
            select: schoolUserSelect,
          },
          userSchoolLinks: {
            include: {
              user: {
                select: schoolUserSelect,
              },
            },
          },
        },
        orderBy: {
          name: 'asc',
        },
      });
    }

    if (data.userSchoolId) {
      const school = await this.findById(data.userSchoolId);
      return school ? [school] : [];
    }

    return [];
  }

  async userCanAccessSchool(data: {
    userId: string;
    userRole: UserRole;
    userSchoolId?: string | null;
    targetSchoolId: string;
  }) {
    if (data.userRole === UserRole.SUPERUSUARIO) {
      return true;
    }

    if (data.userRole === UserRole.ADMIN_ESCOLA) {
      if (data.userSchoolId === data.targetSchoolId) {
        return true;
      }

      const vinculo = await this.prisma.userSchoolLink.findFirst({
        where: {
          userId: data.userId,
          schoolId: data.targetSchoolId,
        },
        select: {
          id: true,
        },
      });

      return Boolean(vinculo);
    }

    return data.userSchoolId === data.targetSchoolId;
  }

  async findUsersBySchoolId(schoolId: string) {
    return this.prisma.user.findMany({
      where: {
        OR: [
          { schoolId },
          {
            schoolLinks: {
              some: {
                schoolId,
              },
            },
          },
        ],
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        isActivated: true,
        schoolId: true,
        createdAt: true,
        updatedAt: true,
        school: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            logoUrl: true,
            status: true,
            plan: true,
            trialEndsAt: true,
            tipoAvaliacao: true,
            mediaAprovacao: true,
            createdAt: true,
            updatedAt: true,
          },
        },
        schoolLinks: {
          select: {
            id: true,
            schoolId: true,
            school: {
              select: {
                id: true,
                name: true,
                email: true,
                phone: true,
                logoUrl: true,
                status: true,
                plan: true,
                trialEndsAt: true,
                tipoAvaliacao: true,
                mediaAprovacao: true,
                createdAt: true,
                updatedAt: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  private sanitizeUsersForAdminBackup(users: any[]) {
    return users.map((user) => ({
      ...user,
      passwordHash: undefined,
      activationToken: undefined,
      activationExpires: undefined,
    }));
  }

  private mapUserId(
    value: string | null | undefined,
    userIdMap: Map<string, string>,
  ) {
    if (!value) {
      return value ?? null;
    }

    return userIdMap.get(value) || value;
  }

  private async exportFullSchoolSnapshot(schoolId: string) {
    const [
      school,
      users,
      userSchoolLinks,
      horarioConfiguracao,
      turmas,
      disciplinasTurma,
      turmaProfessores,
      aulas,
      alunos,
      alunoDocumentos,
      responsavelDocumentos,
      alunoResponsaveis,
      solicitacoes,
      financeiroConfiguracao,
      financeiroCobrancas,
      assinaturaCobrancas,
      financeiroNotasFiscais,
      atividadeModelos,
      avaliacaoItens,
      notasBoletim,
      frequencias,
      calendariosLetivos,
      calendarioLetivoTurmaExcecoes,
      professorAgendas,
      avaliacoesOnline,
      avaliacoesOnlinePerguntas,
      avaliacoesOnlineAlternativas,
      avaliacoesOnlineTentativas,
      avaliacoesOnlineRespostas,
      planosAnuaisConteudo,
      planejamentosDiariosConteudo,
      comunicacaoGrupos,
      comunicacaoGrupoMembros,
      comunicacaoPosts,
      comunicacaoComentarios,
      comunicacaoReacoes,
      comunicacaoMensagens,
      forumTopicos,
      forumComentarios,
      forumAtividades,
      forumEntregas,
      forumEnquetes,
      forumEnqueteOpcoes,
      forumEnqueteVotos,
    ] = await Promise.all([
      this.prisma.school.findUnique({ where: { id: schoolId } }),
      this.prisma.user.findMany({
        where: {
          OR: [
            { schoolId },
            { schoolLinks: { some: { schoolId } } },
          ],
        },
        orderBy: [{ role: 'asc' }, { name: 'asc' }],
      }),
      this.prisma.userSchoolLink.findMany({
        where: { schoolId },
        orderBy: [{ createdAt: 'asc' }],
      }),
      this.prisma.schoolHorarioConfiguracao.findUnique({
        where: { schoolId },
      }),
      this.prisma.turma.findMany({
        where: { schoolId },
        orderBy: [{ name: 'asc' }, { turno: 'asc' }],
      }),
      this.prisma.disciplinaTurma.findMany({
        where: { schoolId },
        orderBy: [{ serie: 'asc' }, { nome: 'asc' }],
      }),
      this.prisma.turmaProfessor.findMany({
        where: { turma: { schoolId } },
        orderBy: [{ createdAt: 'asc' }],
      }),
      this.prisma.aula.findMany({
        where: { turma: { schoolId } },
        orderBy: [{ diaSemana: 'asc' }, { horaInicio: 'asc' }],
      }),
      this.prisma.aluno.findMany({
        where: { schoolId },
        orderBy: [{ name: 'asc' }],
      }),
      this.prisma.alunoDocumento.findMany({
        where: { aluno: { schoolId } },
        orderBy: [{ createdAt: 'asc' }],
      }),
      this.prisma.responsavelDocumento.findMany({
        where: {
          responsavel: {
            OR: [
              { schoolId },
              { schoolLinks: { some: { schoolId } } },
            ],
          },
        },
        orderBy: [{ createdAt: 'asc' }],
      }),
      this.prisma.alunoResponsavel.findMany({
        where: { aluno: { schoolId } },
        orderBy: [{ createdAt: 'asc' }],
      }),
      this.prisma.solicitacao.findMany({
        where: { schoolId },
        orderBy: [{ createdAt: 'asc' }],
      }),
      this.prisma.financeiroConfiguracao.findUnique({
        where: { schoolId },
      }),
      this.prisma.financeiroCobranca.findMany({
        where: { schoolId },
        orderBy: [{ createdAt: 'asc' }],
      }),
      this.prisma.financeiroAssinaturaCobranca.findMany({
        where: { schoolId },
        orderBy: [{ createdAt: 'asc' }],
      }),
      this.prisma.financeiroNotaFiscal.findMany({
        where: {
          OR: [
            { schoolId },
            { cobranca: { schoolId } },
            { assinaturaCobranca: { schoolId } },
          ],
        },
        orderBy: [{ createdAt: 'asc' }],
      }),
      this.prisma.atividadeAvaliacaoModelo.findMany({
        where: { schoolId },
        orderBy: [{ createdAt: 'asc' }],
      }),
      this.prisma.avaliacaoItem.findMany({
        where: { schoolId },
        orderBy: [{ createdAt: 'asc' }],
      }),
      this.prisma.notaBoletim.findMany({
        where: { schoolId },
        orderBy: [{ createdAt: 'asc' }],
      }),
      this.prisma.frequencia.findMany({
        where: { schoolId },
        orderBy: [{ createdAt: 'asc' }],
      }),
      this.prisma.calendarioLetivo.findMany({
        where: { schoolId },
        orderBy: [{ dataInicio: 'asc' }, { createdAt: 'asc' }],
      }),
      this.prisma.calendarioLetivoTurmaExcecao.findMany({
        where: { calendarioLetivo: { schoolId } },
        orderBy: [{ createdAt: 'asc' }],
      }),
      this.prisma.professorAgenda.findMany({
        where: { schoolId },
        orderBy: [{ data: 'asc' }, { createdAt: 'asc' }],
      }),
      this.prisma.avaliacaoOnline.findMany({
        where: { schoolId },
        orderBy: [{ createdAt: 'asc' }],
      }),
      this.prisma.avaliacaoOnlinePergunta.findMany({
        where: { avaliacaoOnline: { schoolId } },
        orderBy: [{ createdAt: 'asc' }],
      }),
      this.prisma.avaliacaoOnlineAlternativa.findMany({
        where: { pergunta: { avaliacaoOnline: { schoolId } } },
        orderBy: [{ createdAt: 'asc' }],
      }),
      this.prisma.avaliacaoOnlineTentativa.findMany({
        where: { schoolId },
        orderBy: [{ createdAt: 'asc' }],
      }),
      this.prisma.avaliacaoOnlineResposta.findMany({
        where: { schoolId },
        orderBy: [{ createdAt: 'asc' }],
      }),
      this.prisma.planoAnualConteudo.findMany({
        where: { schoolId },
        orderBy: [{ createdAt: 'asc' }],
      }),
      this.prisma.planejamentoDiarioConteudo.findMany({
        where: { schoolId },
        orderBy: [{ data: 'asc' }, { createdAt: 'asc' }],
      }),
      this.prisma.comunicacaoGrupo.findMany({
        where: { schoolId },
        orderBy: [{ createdAt: 'asc' }],
      }),
      this.prisma.comunicacaoGrupoMembro.findMany({
        where: { grupo: { schoolId } },
        orderBy: [{ createdAt: 'asc' }],
      }),
      this.prisma.comunicacaoPost.findMany({
        where: { schoolId },
        orderBy: [{ createdAt: 'asc' }],
      }),
      this.prisma.comunicacaoComentario.findMany({
        where: { schoolId },
        orderBy: [{ createdAt: 'asc' }],
      }),
      this.prisma.comunicacaoReacao.findMany({
        where: { schoolId },
        orderBy: [{ createdAt: 'asc' }],
      }),
      this.prisma.comunicacaoMensagem.findMany({
        where: { schoolId },
        orderBy: [{ createdAt: 'asc' }],
      }),
      this.prisma.forumTopico.findMany({
        where: { schoolId },
        orderBy: [{ createdAt: 'asc' }],
      }),
      this.prisma.forumComentario.findMany({
        where: { schoolId },
        orderBy: [{ createdAt: 'asc' }],
      }),
      this.prisma.forumAtividade.findMany({
        where: { schoolId },
        orderBy: [{ createdAt: 'asc' }],
      }),
      this.prisma.forumEntrega.findMany({
        where: { schoolId },
        orderBy: [{ createdAt: 'asc' }],
      }),
      this.prisma.forumEnquete.findMany({
        where: { schoolId },
        orderBy: [{ createdAt: 'asc' }],
      }),
      this.prisma.forumEnqueteOpcao.findMany({
        where: { enquete: { schoolId } },
      }),
      this.prisma.forumEnqueteVoto.findMany({
        where: { schoolId },
        orderBy: [{ createdAt: 'asc' }],
      }),
    ]);

    return {
      schemaVersion: 'gestclass-school-snapshot-v1',
      school,
      users,
      userSchoolLinks,
      horarioConfiguracao,
      turmas,
      disciplinasTurma,
      turmaProfessores,
      aulas,
      alunos,
      alunoDocumentos,
      responsavelDocumentos,
      alunoResponsaveis,
      solicitacoes,
      financeiroConfiguracao,
      financeiroCobrancas,
      assinaturaCobrancas,
      financeiroNotasFiscais,
      atividadeModelos,
      avaliacaoItens,
      notasBoletim,
      frequencias,
      calendariosLetivos,
      calendarioLetivoTurmaExcecoes,
      professorAgendas,
      avaliacoesOnline,
      avaliacoesOnlinePerguntas,
      avaliacoesOnlineAlternativas,
      avaliacoesOnlineTentativas,
      avaliacoesOnlineRespostas,
      planosAnuaisConteudo,
      planejamentosDiariosConteudo,
      comunicacaoGrupos,
      comunicacaoGrupoMembros,
      comunicacaoPosts,
      comunicacaoComentarios,
      comunicacaoReacoes,
      comunicacaoMensagens,
      forumTopicos,
      forumComentarios,
      forumAtividades,
      forumEntregas,
      forumEnquetes,
      forumEnqueteOpcoes,
      forumEnqueteVotos,
    };
  }

  private isValidRole(role: string) {
    return [
      'GESTOR',
      'COORDENADOR',
      'SECRETARIA',
      'AUXILIAR',
      'PROFESSOR',
      'RESPONSAVEL',
      'ALUNO',
      'ADMIN_ESCOLA',
      'SUPERUSUARIO',
    ].includes(String(role || '').trim().toUpperCase());
  }

  private isValidTurno(turno: string) {
    return ['MANHA', 'TARDE', 'NOITE', 'INTEGRAL'].includes(
      String(turno || '').trim().toUpperCase(),
    );
  }

  private isValidAlunoStatus(status: string) {
    return ['ATIVO', 'INATIVO'].includes(
      String(status || '').trim().toUpperCase(),
    );
  }

  private isValidDiaSemana(dia: string) {
    return [
      'SEGUNDA',
      'TERCA',
      'QUARTA',
      'QUINTA',
      'SEXTA',
      'SABADO',
      'DOMINGO',
    ].includes(String(dia || '').trim().toUpperCase());
  }

  private isHoraValida(valor: string) {
    return /^([01]\d|2[0-3]):([0-5]\d)$/.test(String(valor || '').trim());
  }

  private async gerarHashSenha(senha?: string) {
    const senhaFinal = String(senha || '').trim();

    if (!senhaFinal) {
      throw new BadRequestException(
        'Senha obrigatoria para criar um novo acesso.',
      );
    }

    return bcrypt.hash(senhaFinal, 10);
  }

  private mapImportSummary(result: {
    created: any[];
    updated?: any[];
    skipped: any[];
    failed: any[];
  }) {
    return {
      criados: result.created.length,
      atualizados: result.updated?.length || 0,
      ignorados: result.skipped.length,
      falhas: result.failed.length,
    };
  }

  private async upsertAlunoUserByEmail(data: {
    schoolId: string;
    alunoName: string;
    alunoEmail?: string;
    alunoPassword?: string;
    alunoAtivo?: boolean;
    fotoUrl?: string | null;
  }) {
    const emailNormalizado = String(data.alunoEmail || '')
      .trim()
      .toLowerCase();

    if (!emailNormalizado) {
      return null;
    }

    const existente = await this.prisma.user.findUnique({
      where: { email: emailNormalizado },
      include: {
        alunoPerfil: {
          select: {
            id: true,
          },
        },
      },
    });

    const passwordHash = data.alunoPassword?.trim()
      ? await this.gerarHashSenha(data.alunoPassword)
      : null;

    if (!existente) {
      if (!passwordHash) {
        throw new BadRequestException(
          `alunoPassword e obrigatoria para criar um novo acesso para ${emailNormalizado}.`,
        );
      }

      return this.prisma.user.create({
        data: {
          name: data.alunoName.trim(),
          email: emailNormalizado,
          passwordHash,
          role: 'ALUNO',
          schoolId: data.schoolId,
          isActive: data.alunoAtivo !== false,
          isActivated: true,
          activationToken: null,
          activationExpires: null,
          fotoUrl: data.fotoUrl || null,
        },
      });
    }

    if (existente.role !== 'ALUNO') {
      throw new BadRequestException(
        `Já existe um usuário com o e-mail ${emailNormalizado} e ele não é ALUNO.`,
      );
    }

    if (existente.schoolId !== data.schoolId) {
      throw new BadRequestException(
        `Já existe um aluno com o e-mail ${emailNormalizado} vinculado a outra escola.`,
      );
    }

    return this.prisma.user.update({
      where: { id: existente.id },
      data: {
        name: data.alunoName.trim(),
        isActive: data.alunoAtivo !== false,
        fotoUrl: data.fotoUrl || existente.fotoUrl || null,
        ...(passwordHash ? { passwordHash } : {}),
      },
    });
  }

  async exportSchoolBackup(data: {
    schoolId: string;
    requesterRole: UserRole;
  }) {
    const snapshot = await this.exportFullSchoolSnapshot(data.schoolId);
    const school = await this.prisma.school.findUnique({
      where: { id: data.schoolId },
      include: {
        userSchoolLinks: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                role: true,
                isActive: true,
                isActivated: true,
                schoolId: true,
                createdAt: true,
                updatedAt: true,
              },
            },
          },
        },
      },
    });

    if (!school) {
      throw new BadRequestException('Escola n�o encontrada.');
    }

    const [
      turmas,
      users,
      alunos,
      alunoResponsaveis,
      turmaProfessores,
      aulas,
      calendarios,
      financeiroConfiguracao,
    ] = await Promise.all([
      this.prisma.turma.findMany({
        where: { schoolId: data.schoolId },
        orderBy: [{ name: 'asc' }, { turno: 'asc' }],
      }),
      this.prisma.user.findMany({
        where: {
          OR: [
            { schoolId: data.schoolId },
            {
              schoolLinks: {
                some: {
                  schoolId: data.schoolId,
                },
              },
            },
          ],
        },
        include: {
          schoolLinks: {
            select: {
              id: true,
              schoolId: true,
            },
          },
          responsavelDocumentos: true,
        },
        orderBy: [{ role: 'asc' }, { name: 'asc' }],
      }),
      this.prisma.aluno.findMany({
        where: { schoolId: data.schoolId },
        include: {
          turma: true,
          documentos: true,
          responsaveis: {
            include: {
              responsavel: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  phone: true,
                  address: true,
                  cpf: true,
                  identidade: true,
                  fotoUrl: true,
                  schoolId: true,
                  isActive: true,
                  isActivated: true,
                  createdAt: true,
                  updatedAt: true,
                },
              },
            },
          },
        },
        orderBy: [{ name: 'asc' }],
      }),
      this.prisma.alunoResponsavel.findMany({
        where: {
          aluno: {
            schoolId: data.schoolId,
          },
        },
        include: {
          aluno: {
            select: {
              id: true,
              name: true,
              matricula: true,
              turmaId: true,
              schoolId: true,
            },
          },
          responsavel: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
              address: true,
              cpf: true,
              identidade: true,
              fotoUrl: true,
              schoolId: true,
              isActive: true,
              isActivated: true,
            },
          },
        },
        orderBy: [{ createdAt: 'asc' }],
      }),
      this.prisma.turmaProfessor.findMany({
        where: {
          turma: {
            schoolId: data.schoolId,
          },
        },
        include: {
          turma: true,
          professor: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
              phone: true,
              address: true,
              cpf: true,
              identidade: true,
              fotoUrl: true,
              schoolId: true,
              isActive: true,
              isActivated: true,
              createdAt: true,
              updatedAt: true,
            },
          },
        },
        orderBy: [{ disciplina: 'asc' }],
      }),
      this.prisma.aula.findMany({
        where: {
          turma: {
            schoolId: data.schoolId,
          },
        },
        include: {
          turma: true,
          turmaProfessor: {
            include: {
              professor: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  role: true,
                },
              },
            },
          },
        },
        orderBy: [{ diaSemana: 'asc' }, { horaInicio: 'asc' }],
      }),
      this.prisma.calendarioLetivo.findMany({
        where: { schoolId: data.schoolId },
        include: {
          turma: true,
          createdBy: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
            },
          },
          turmasExcecao: {
            include: {
              turma: true,
            },
          },
        },
        orderBy: [{ dataInicio: 'asc' }, { motivo: 'asc' }],
      }),
      this.prisma.financeiroConfiguracao.findUnique({
        where: { schoolId: data.schoolId },
      }),
    ]);

    const usersExportados =
      data.requesterRole === UserRole.SUPERUSUARIO
        ? users
        : this.sanitizeUsersForAdminBackup(users);

    return {
      meta: {
        exportedAt: new Date().toISOString(),
        version: 'gestclass-backup-v2',
        visibility:
          data.requesterRole === UserRole.SUPERUSUARIO
            ? 'full_superuser'
            : 'sanitized_admin',
        schoolId: data.schoolId,
        totalTurmas: snapshot.turmas.length,
        totalUsers: snapshot.users.length,
        totalAlunos: snapshot.alunos.length,
        totalAlunoResponsaveis: snapshot.alunoResponsaveis.length,
        totalDisciplinasTurma: snapshot.disciplinasTurma.length,
        totalTurmaProfessores: snapshot.turmaProfessores.length,
        totalAulas: snapshot.aulas.length,
        totalCalendariosLetivos: snapshot.calendariosLetivos.length,
        totalComunicacaoMensagens: snapshot.comunicacaoMensagens.length,
        incluiConfiguracaoHorarios: Boolean(snapshot.horarioConfiguracao),
      },
      school: {
        id: school.id,
        name: school.name,
        email: school.email,
        phone: school.phone,
        logoUrl: school.logoUrl,
        status: school.status,
        plan: school.plan,
        tipoAvaliacao: school.tipoAvaliacao,
        mediaAprovacao: Number(school.mediaAprovacao),
        trialEndsAt: school.trialEndsAt,
        createdAt: school.createdAt,
        updatedAt: school.updatedAt,
      },
      schoolAdminLinks: school.userSchoolLinks.map((item) => ({
        id: item.id,
        schoolId: item.schoolId,
        user: item.user,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      })),
      turmas,
      users: usersExportados,
      alunos,
      alunoResponsaveis,
      turmaProfessores,
      aulas,
      calendariosLetivos: calendarios,
      financeiroConfiguracao,
      snapshot:
        data.requesterRole === UserRole.SUPERUSUARIO
          ? snapshot
          : {
              ...snapshot,
              users: this.sanitizeUsersForAdminBackup(snapshot.users),
            },
    };
  }

  async exportImportTemplate(data: {
    schoolId: string;
    requesterRole: UserRole;
  }) {
    const school = await this.prisma.school.findUnique({
      where: { id: data.schoolId },
      select: {
        id: true,
        name: true,
        tipoAvaliacao: true,
        mediaAprovacao: true,
      },
    });

    if (!school) {
      throw new BadRequestException('Escola n�o encontrada.');
    }

    return {
      meta: {
        generatedAt: new Date().toISOString(),
        version: 'gestclass-import-template-v2',
        schoolId: school.id,
        schoolName: school.name,
        tipoAvaliacao: school.tipoAvaliacao,
        mediaAprovacao: Number(school.mediaAprovacao),
        generatedForRole: data.requesterRole,
      },
      instrucoesGerais: [
        'Preencha os blocos com os dados que deseja importar.',
        'Os exemplos abaixo servem apenas como modelo e podem ser apagados.',
        'Na importação real, turmas devem ser cadastradas antes de alunos.',
        'Responsáveis podem ser reaproveitados por mais de um aluno.',
        'Os vínculos aluno-responsável devem usar matrícula do aluno e e-mail do responsável.',
        'Perfis aceitos em usuários: GESTOR, COORDENADOR, SECRETARIA, AUXILIAR, PROFESSOR, RESPONSAVEL, ALUNO.',
        'Turnos recomendados: MANHA, TARDE, NOITE, INTEGRAL.',
        'Status de aluno recomendados: ATIVO, INATIVO.',
        'Em responsávelFinanceiro use true ou false.',
        'Em alunoAtivo e usuarioAtivo use true ou false.',
        'Em usuarioPassword, responsavelPassword e alunoPassword, informe senha apenas quando quiser criar um novo acesso.',
        'Se o registro ja existir, a senha pode ficar vazia para manter a atual.',
        'A importação inteligente atualiza registros existentes quando encontrar coincidência por chave principal.',
      ],
      turmas: [
        {
          nome: '6º Ano A',
          turno: 'MANHA',
        },
      ],
      usuarios: [
        {
          nome: 'Maria da Silva',
          email: 'maria@escola.com',
          role: 'SECRETARIA',
          usuarioAtivo: true,
          usuarioPassword: 'DefinaUmaSenhaForte!2026',
          telefone: '(61)99999-0001',
          endereco: 'Rua Exemplo, 100',
          cpf: '',
          identidade: '',
        },
      ],
      responsaveis: [
        {
          nome: 'Carlos Pereira',
          email: 'carlos.responsavel@teste.com',
          responsavelPassword: 'DefinaUmaSenhaForte!2026',
          telefone: '(61)99999-1000',
          endereco: 'Rua das Flores, 10',
          cpf: '123.456.789-00',
          identidade: 'MG-12.345.678',
          fotoUrl: '',
        },
      ],
      alunos: [
        {
          nome: 'Ana Beatriz',
          matricula: '20260001',
          turmaNome: '6º Ano A',
          status: 'ATIVO',
          alunoEmail: 'ana.aluna@teste.com',
          alunoPassword: 'DefinaUmaSenhaForte!2026',
          alunoAtivo: true,
          fotoUrl: '',
        },
      ],
      alunoResponsaveis: [
        {
          matriculaAluno: '20260001',
          emailResponsavel: 'carlos.responsavel@teste.com',
          parentesco: 'Pai',
          responsavelFinanceiro: true,
        },
      ],
      modulacaoProfessores: [
        {
          turmaNome: '6º Ano A',
          professorEmail: 'joao.professor@escola.com',
          disciplina: 'Matemática',
          cargaHoraria: 5,
        },
      ],
      aulasHorarios: [
        {
          turmaNome: '6º Ano A',
          disciplina: 'Matemática',
          professorEmail: 'joao.professor@escola.com',
          diaSemana: 'SEGUNDA',
          horaInicio: '07:00',
          horaFim: '07:50',
        },
      ],
      observacoes: {
        ordemRecomendadaDeImportacao: [
          'turmas',
          'usuarios',
          'responsaveis',
          'alunos',
          'alunoResponsaveis',
          'modulacaoProfessores',
          'aulasHorarios',
        ],
        camposUnicosImportantes: {
          turma: ['nome'],
          usuario: ['email'],
          responsavel: ['email'],
          aluno: ['matricula'],
        },
      },
    };
  }

  async validateImportTemplate(data: {
    schoolId: string;
    payload: any;
  }) {
    const school = await this.prisma.school.findUnique({
      where: { id: data.schoolId },
      select: {
        id: true,
        name: true,
      },
    });

    if (!school) {
      throw new BadRequestException('Escola n�o encontrada.');
    }

    const payload = data.payload || {};
    const errors: string[] = [];
    const warnings: string[] = [];

    const turmas = Array.isArray(payload.turmas) ? payload.turmas : [];
    const usuarios = Array.isArray(payload.usuarios) ? payload.usuarios : [];
    const responsaveis = Array.isArray(payload.responsaveis)
      ? payload.responsaveis
      : [];
    const alunos = Array.isArray(payload.alunos) ? payload.alunos : [];
    const alunoResponsaveis = Array.isArray(payload.alunoResponsaveis)
      ? payload.alunoResponsaveis
      : [];
    const modulacaoProfessores = Array.isArray(payload.modulacaoProfessores)
      ? payload.modulacaoProfessores
      : [];
    const aulasHorarios = Array.isArray(payload.aulasHorarios)
      ? payload.aulasHorarios
      : [];

    if (!payload || typeof payload !== 'object') {
      throw new BadRequestException('Arquivo de importação inválido.');
    }

    const turmaNames = new Set<string>();
    const usuarioEmails = new Set<string>();
    const responsavelEmails = new Set<string>();
    const alunoMatriculas = new Set<string>();

    turmas.forEach((item, index) => {
      const nome = String(item?.nome || '').trim();
      const turno = String(item?.turno || '').trim().toUpperCase();

      if (!nome) {
        errors.push(`turmas[${index}]: nome é obrigatório.`);
      }

      if (!turno) {
        errors.push(`turmas[${index}]: turno é obrigatório.`);
      } else if (!this.isValidTurno(turno)) {
        errors.push(`turmas[${index}]: turno inválido (${turno}).`);
      }

      if (nome) {
        const key = nome.toLowerCase();
        if (turmaNames.has(key)) {
          warnings.push(`turmas[${index}]: turma duplicada no arquivo (${nome}).`);
        } else {
          turmaNames.add(key);
        }
      }
    });

    usuarios.forEach((item, index) => {
      const nome = String(item?.nome || '').trim();
      const email = String(item?.email || '').trim().toLowerCase();
      const role = String(item?.role || '').trim().toUpperCase();

      if (!nome) {
        errors.push(`usuarios[${index}]: nome é obrigatório.`);
      }

      if (!email) {
        errors.push(`usuarios[${index}]: email é obrigatório.`);
      }

      if (!role) {
        errors.push(`usuarios[${index}]: role é obrigatório.`);
      } else if (!this.isValidRole(role)) {
        errors.push(`usuarios[${index}]: role inválido (${role}).`);
      }

      if (email) {
        if (usuarioEmails.has(email)) {
          warnings.push(`usuarios[${index}]: email duplicado no arquivo (${email}).`);
        } else {
          usuarioEmails.add(email);
        }
      }
    });

    responsaveis.forEach((item, index) => {
      const nome = String(item?.nome || '').trim();
      const email = String(item?.email || '').trim().toLowerCase();

      if (!nome) {
        errors.push(`responsaveis[${index}]: nome é obrigatório.`);
      }

      if (!email) {
        errors.push(`responsaveis[${index}]: email é obrigatório.`);
      }

      if (email) {
        if (responsavelEmails.has(email)) {
          warnings.push(
            `responsaveis[${index}]: email duplicado no arquivo (${email}).`,
          );
        } else {
          responsavelEmails.add(email);
        }
      }
    });

    alunos.forEach((item, index) => {
      const nome = String(item?.nome || '').trim();
      const matricula = String(item?.matricula || '').trim();
      const turmaNome = String(item?.turmaNome || '').trim();
      const status = String(item?.status || '').trim().toUpperCase();

      if (!nome) {
        errors.push(`alunos[${index}]: nome é obrigatório.`);
      }

      if (!matricula) {
        errors.push(`alunos[${index}]: matrícula é obrigatória.`);
      }

      if (!turmaNome) {
        errors.push(`alunos[${index}]: turmaNome é obrigatório.`);
      } else if (!turmaNames.has(turmaNome.toLowerCase())) {
        warnings.push(
          `alunos[${index}]: turma "${turmaNome}" não está no bloco turmas do arquivo.`,
        );
      }

      if (!status) {
        errors.push(`alunos[${index}]: status é obrigatório.`);
      } else if (!this.isValidAlunoStatus(status)) {
        errors.push(`alunos[${index}]: status inválido (${status}).`);
      }

      if (matricula) {
        if (alunoMatriculas.has(matricula)) {
          warnings.push(
            `alunos[${index}]: matrícula duplicada no arquivo (${matricula}).`,
          );
        } else {
          alunoMatriculas.add(matricula);
        }
      }
    });

    alunoResponsaveis.forEach((item, index) => {
      const matriculaAluno = String(item?.matriculaAluno || '').trim();
      const emailResponsavel = String(item?.emailResponsavel || '')
        .trim()
        .toLowerCase();

      if (!matriculaAluno) {
        errors.push(
          `alunoResponsaveis[${index}]: matriculaAluno é obrigatória.`,
        );
      } else if (!alunoMatriculas.has(matriculaAluno)) {
        warnings.push(
          `alunoResponsaveis[${index}]: matrícula ${matriculaAluno} não encontrada no bloco alunos.`,
        );
      }

      if (!emailResponsavel) {
        errors.push(
          `alunoResponsaveis[${index}]: emailResponsavel é obrigatório.`,
        );
      } else if (!responsavelEmails.has(emailResponsavel)) {
        warnings.push(
          `alunoResponsaveis[${index}]: responsável ${emailResponsavel} não encontrado no bloco responsaveis.`,
        );
      }
    });

    modulacaoProfessores.forEach((item, index) => {
      const turmaNome = String(item?.turmaNome || '').trim();
      const professorEmail = String(item?.professorEmail || '')
        .trim()
        .toLowerCase();
      const disciplina = String(item?.disciplina || '').trim();
      const cargaHoraria = Number(item?.cargaHoraria);

      if (!turmaNome) {
        errors.push(
          `modulacaoProfessores[${index}]: turmaNome é obrigatório.`,
        );
      } else if (!turmaNames.has(turmaNome.toLowerCase())) {
        warnings.push(
          `modulacaoProfessores[${index}]: turma "${turmaNome}" não encontrada no bloco turmas.`,
        );
      }

      if (!professorEmail) {
        errors.push(
          `modulacaoProfessores[${index}]: professorEmail é obrigatório.`,
        );
      } else if (!usuarioEmails.has(professorEmail)) {
        warnings.push(
          `modulacaoProfessores[${index}]: professor ${professorEmail} não encontrado no bloco usuarios.`,
        );
      }

      if (!disciplina) {
        errors.push(
          `modulacaoProfessores[${index}]: disciplina é obrigatória.`,
        );
      }

      if (!Number.isFinite(cargaHoraria) || cargaHoraria <= 0) {
        errors.push(
          `modulacaoProfessores[${index}]: cargaHoraria deve ser maior que zero.`,
        );
      }
    });

    aulasHorarios.forEach((item, index) => {
      const turmaNome = String(item?.turmaNome || '').trim();
      const disciplina = String(item?.disciplina || '').trim();
      const diaSemana = String(item?.diaSemana || '').trim().toUpperCase();
      const horaInicio = String(item?.horaInicio || '').trim();
      const horaFim = String(item?.horaFim || '').trim();

      if (!turmaNome) {
        errors.push(`aulasHorarios[${index}]: turmaNome é obrigatório.`);
      } else if (!turmaNames.has(turmaNome.toLowerCase())) {
        warnings.push(
          `aulasHorarios[${index}]: turma "${turmaNome}" não encontrada no bloco turmas.`,
        );
      }

      if (!disciplina) {
        errors.push(`aulasHorarios[${index}]: disciplina é obrigatória.`);
      }

      if (!diaSemana) {
        errors.push(`aulasHorarios[${index}]: diaSemana é obrigatório.`);
      } else if (!this.isValidDiaSemana(diaSemana)) {
        errors.push(
          `aulasHorarios[${index}]: diaSemana inválido (${diaSemana}).`,
        );
      }

      if (!horaInicio) {
        errors.push(`aulasHorarios[${index}]: horaInicio é obrigatória.`);
      } else if (!this.isHoraValida(horaInicio)) {
        errors.push(
          `aulasHorarios[${index}]: horaInicio inválida (${horaInicio}).`,
        );
      }

      if (!horaFim) {
        errors.push(`aulasHorarios[${index}]: horaFim é obrigatória.`);
      } else if (!this.isHoraValida(horaFim)) {
        errors.push(`aulasHorarios[${index}]: horaFim inválida (${horaFim}).`);
      }
    });

    return {
      meta: {
        validatedAt: new Date().toISOString(),
        version: 'gestclass-import-validation-v1',
        schoolId: school.id,
        schoolName: school.name,
      },
      summary: {
        isValid: errors.length === 0,
        totalErrors: errors.length,
        totalWarnings: warnings.length,
      },
      totals: {
        turmas: turmas.length,
        usuarios: usuarios.length,
        responsaveis: responsaveis.length,
        alunos: alunos.length,
        alunoResponsaveis: alunoResponsaveis.length,
        modulacaoProfessores: modulacaoProfessores.length,
        aulasHorarios: aulasHorarios.length,
      },
      errors,
      warnings,
    };
  }

  async importTurmasFromTemplate(data: {
    schoolId: string;
    payload: any;
  }) {
    const school = await this.prisma.school.findUnique({
      where: { id: data.schoolId },
      select: {
        id: true,
        name: true,
      },
    });

    if (!school) {
      throw new BadRequestException('Escola n�o encontrada.');
    }

    const validation = await this.validateImportTemplate({
      schoolId: data.schoolId,
      payload: data.payload,
    });

    if (!validation.summary.isValid) {
      throw new BadRequestException(
        'O arquivo possui erros de validação. Corrija antes de importar.',
      );
    }

    const turmas = Array.isArray(data.payload?.turmas) ? data.payload.turmas : [];

    const created: Array<{ nome: string; turno: string; id: string }> = [];
    const updated: Array<{ nome: string; turno: string; id: string }> = [];
    const skipped: Array<{ nome: string; motivo: string }> = [];
    const failed: Array<{ nome: string; motivo: string }> = [];

    for (const item of turmas) {
      const nome = String(item?.nome || '').trim();
      const turno = String(item?.turno || '').trim().toUpperCase();

      if (!nome || !turno) {
        failed.push({
          nome: nome || '(sem nome)',
          motivo: 'Dados obrigatórios ausentes.',
        });
        continue;
      }

      const existente = await this.prisma.turma.findFirst({
        where: {
          schoolId: data.schoolId,
          name: nome,
        },
      });

      if (!existente) {
        try {
          const novaTurma = await this.prisma.turma.create({
            data: {
              name: nome,
              turno,
              schoolId: data.schoolId,
            },
          });

          created.push({
            id: novaTurma.id,
            nome: novaTurma.name,
            turno: novaTurma.turno || '',
          });
        } catch (error: any) {
          failed.push({
            nome,
            motivo: error?.message || 'Erro ao criar turma.',
          });
        }

        continue;
      }

      if ((existente.turno || '') === turno) {
        skipped.push({
          nome,
          motivo: `Turma já existe e já está com o turno ${turno}.`,
        });
        continue;
      }

      try {
        const turmaAtualizada = await this.prisma.turma.update({
          where: { id: existente.id },
          data: {
            turno,
          },
        });

        updated.push({
          id: turmaAtualizada.id,
          nome: turmaAtualizada.name,
          turno: turmaAtualizada.turno || '',
        });
      } catch (error: any) {
        failed.push({
          nome,
          motivo: error?.message || 'Erro ao atualizar turma.',
        });
      }
    }

    return {
      meta: {
        importedAt: new Date().toISOString(),
        version: 'gestclass-import-turmas-v2',
        schoolId: school.id,
        schoolName: school.name,
      },
      summary: {
        totalRecebidas: turmas.length,
        totalCriadas: created.length,
        totalAtualizadas: updated.length,
        totalIgnoradas: skipped.length,
        totalFalhas: failed.length,
      },
      created,
      updated,
      skipped,
      failed,
    };
  }

  async importAllFromTemplate(data: { schoolId: string; payload: any }) {
    const school = await this.prisma.school.findUnique({
      where: { id: data.schoolId },
      select: {
        id: true,
        name: true,
      },
    });

    if (!school) {
      throw new BadRequestException('Escola n�o encontrada.');
    }

    const validation = await this.validateImportTemplate({
      schoolId: data.schoolId,
      payload: data.payload,
    });

    if (!validation.summary.isValid) {
      throw new BadRequestException(
        'O arquivo possui erros de validação. Corrija antes de importar tudo.',
      );
    }

    const payload = data.payload || {};
    const turmas = Array.isArray(payload.turmas) ? payload.turmas : [];
    const usuarios = Array.isArray(payload.usuarios) ? payload.usuarios : [];
    const responsaveis = Array.isArray(payload.responsaveis)
      ? payload.responsaveis
      : [];
    const alunos = Array.isArray(payload.alunos) ? payload.alunos : [];
    const alunoResponsaveis = Array.isArray(payload.alunoResponsaveis)
      ? payload.alunoResponsaveis
      : [];
    const modulacaoProfessores = Array.isArray(payload.modulacaoProfessores)
      ? payload.modulacaoProfessores
      : [];
    const aulasHorarios = Array.isArray(payload.aulasHorarios)
      ? payload.aulasHorarios
      : [];

    const resultado = {
      meta: {
        importedAt: new Date().toISOString(),
        version: 'gestclass-import-completo-v2',
        schoolId: school.id,
        schoolName: school.name,
      },
      turmas: {
        created: [] as any[],
        updated: [] as any[],
        skipped: [] as any[],
        failed: [] as any[],
      },
      usuarios: {
        created: [] as any[],
        updated: [] as any[],
        skipped: [] as any[],
        failed: [] as any[],
      },
      responsaveis: {
        created: [] as any[],
        updated: [] as any[],
        skipped: [] as any[],
        failed: [] as any[],
      },
      alunos: {
        created: [] as any[],
        updated: [] as any[],
        skipped: [] as any[],
        failed: [] as any[],
      },
      alunoResponsaveis: {
        created: [] as any[],
        updated: [] as any[],
        skipped: [] as any[],
        failed: [] as any[],
      },
      modulacaoProfessores: {
        created: [] as any[],
        updated: [] as any[],
        skipped: [] as any[],
        failed: [] as any[],
      },
      aulasHorarios: {
        created: [] as any[],
        updated: [] as any[],
        skipped: [] as any[],
        failed: [] as any[],
      },
      summary: {
        turmas: {},
        usuarios: {},
        responsaveis: {},
        alunos: {},
        alunoResponsaveis: {},
        modulacaoProfessores: {},
        aulasHorarios: {},
      } as Record<string, any>,
      overview: {
        criados: 0,
        atualizados: 0,
        ignorados: 0,
        falhas: 0,
      },
    };

    for (const item of turmas) {
      const nome = String(item?.nome || '').trim();
      const turno = String(item?.turno || '').trim().toUpperCase();

      if (!nome || !turno) {
        resultado.turmas.failed.push({
          nome: nome || '(sem nome)',
          motivo: 'Dados obrigatórios ausentes.',
        });
        continue;
      }

      const existente = await this.prisma.turma.findFirst({
        where: {
          schoolId: data.schoolId,
          name: nome,
        },
      });

      if (!existente) {
        try {
          const novaTurma = await this.prisma.turma.create({
            data: {
              name: nome,
              turno,
              schoolId: data.schoolId,
            },
          });

          resultado.turmas.created.push({
            id: novaTurma.id,
            nome: novaTurma.name,
            turno: novaTurma.turno,
          });
        } catch (error: any) {
          resultado.turmas.failed.push({
            nome,
            motivo: error?.message || 'Erro ao criar turma.',
          });
        }

        continue;
      }

      if ((existente.turno || '') === turno) {
        resultado.turmas.skipped.push({
          nome,
          motivo: `Turma já existe e já está com o turno ${turno}.`,
        });
        continue;
      }

      try {
        const turmaAtualizada = await this.prisma.turma.update({
          where: { id: existente.id },
          data: { turno },
        });

        resultado.turmas.updated.push({
          id: turmaAtualizada.id,
          nome: turmaAtualizada.name,
          turno: turmaAtualizada.turno,
        });
      } catch (error: any) {
        resultado.turmas.failed.push({
          nome,
          motivo: error?.message || 'Erro ao atualizar turma.',
        });
      }
    }

    for (const item of usuarios) {
      const nome = String(item?.nome || '').trim();
      const email = String(item?.email || '').trim().toLowerCase();
      const role = String(item?.role || '').trim().toUpperCase() as UserRole;
      const usuarioAtivo = item?.usuarioAtivo !== false;
      const telefone = String(item?.telefone || '').trim() || null;
      const endereco = String(item?.endereco || '').trim() || null;
      const cpf = String(item?.cpf || '').trim() || null;
      const identidade = String(item?.identidade || '').trim() || null;

      if (!nome || !email || !role) {
        resultado.usuarios.failed.push({
          email: email || '(sem email)',
          motivo: 'Nome, email e role são obrigatórios.',
        });
        continue;
      }

      if (role === 'RESPONSAVEL' || role === 'ALUNO') {
        resultado.usuarios.skipped.push({
          email,
          motivo: `Role ${role} é importada nos blocos específicos.`,
        });
        continue;
      }

      const existente = await this.prisma.user.findUnique({
        where: { email },
      });

      try {
        const passwordHash = item?.usuarioPassword?.trim()
          ? await this.gerarHashSenha(item?.usuarioPassword)
          : null;

        if (!existente) {
          if (!passwordHash) {
            resultado.usuarios.failed.push({
              email,
              motivo:
                'usuarioPassword e obrigatoria para criar um novo usuario.',
            });
            continue;
          }

          const novoUsuario = await this.prisma.user.create({
            data: {
              name: nome,
              email,
              passwordHash,
              role,
              schoolId: data.schoolId,
              isActive: usuarioAtivo,
              isActivated: true,
              activationToken: null,
              activationExpires: null,
              phone: telefone,
              address: endereco,
              cpf,
              identidade,
            },
          });

          resultado.usuarios.created.push({
            id: novoUsuario.id,
            nome: novoUsuario.name,
            email: novoUsuario.email,
            role: novoUsuario.role,
          });

          continue;
        }

        if (existente.role === 'RESPONSAVEL' || existente.role === 'ALUNO') {
          resultado.usuarios.failed.push({
            email,
            motivo: `O e-mail ${email} já existe com role incompatível (${existente.role}).`,
          });
          continue;
        }

        const dadosMudaram =
          existente.name !== nome ||
          existente.role !== role ||
          existente.schoolId !== data.schoolId ||
          existente.isActive !== usuarioAtivo ||
          (existente.phone || null) !== telefone ||
          (existente.address || null) !== endereco ||
          (existente.cpf || null) !== cpf ||
          (existente.identidade || null) !== identidade ||
          Boolean(passwordHash);

        if (!dadosMudaram) {
          resultado.usuarios.skipped.push({
            email,
            motivo: 'Usuário já existe e já está atualizado.',
          });
          continue;
        }

        const usuarioAtualizado = await this.prisma.user.update({
          where: { id: existente.id },
          data: {
            name: nome,
            role,
            schoolId: data.schoolId,
            isActive: usuarioAtivo,
            phone: telefone,
            address: endereco,
            cpf,
            identidade,
            ...(passwordHash ? { passwordHash } : {}),
          },
        });

        resultado.usuarios.updated.push({
          id: usuarioAtualizado.id,
          nome: usuarioAtualizado.name,
          email: usuarioAtualizado.email,
          role: usuarioAtualizado.role,
        });
      } catch (error: any) {
        resultado.usuarios.failed.push({
          email,
          motivo: error?.message || 'Erro ao criar/atualizar usuário.',
        });
      }
    }

    for (const item of responsaveis) {
      const nome = String(item?.nome || '').trim();
      const email = String(item?.email || '').trim().toLowerCase();
      const telefone = String(item?.telefone || '').trim() || null;
      const endereco = String(item?.endereco || '').trim() || null;
      const cpf = String(item?.cpf || '').trim() || null;
      const identidade = String(item?.identidade || '').trim() || null;
      const fotoUrl = String(item?.fotoUrl || '').trim() || null;

      if (!nome || !email) {
        resultado.responsaveis.failed.push({
          email: email || '(sem email)',
          motivo: 'Nome e email são obrigatórios.',
        });
        continue;
      }

      const existente = await this.prisma.user.findUnique({
        where: { email },
      });

      try {
        const passwordHash = item?.responsavelPassword?.trim()
          ? await this.gerarHashSenha(item?.responsavelPassword)
          : null;

        if (!existente) {
          if (!passwordHash) {
            resultado.responsaveis.failed.push({
              email,
              motivo:
                'responsavelPassword e obrigatoria para criar um novo responsavel.',
            });
            continue;
          }

          const novoResponsavel = await this.prisma.user.create({
            data: {
              name: nome,
              email,
              passwordHash,
              role: 'RESPONSAVEL',
              schoolId: data.schoolId,
              isActive: true,
              isActivated: true,
              activationToken: null,
              activationExpires: null,
              phone: telefone,
              address: endereco,
              cpf,
              identidade,
              fotoUrl,
            },
          });

          resultado.responsaveis.created.push({
            id: novoResponsavel.id,
            nome: novoResponsavel.name,
            email: novoResponsavel.email,
          });

          continue;
        }

        if (existente.role !== 'RESPONSAVEL') {
          resultado.responsaveis.failed.push({
            email,
            motivo: `O e-mail ${email} já existe com role incompatível (${existente.role}).`,
          });
          continue;
        }

        const dadosMudaram =
          existente.name !== nome ||
          existente.schoolId !== data.schoolId ||
          (existente.phone || null) !== telefone ||
          (existente.address || null) !== endereco ||
          (existente.cpf || null) !== cpf ||
          (existente.identidade || null) !== identidade ||
          (existente.fotoUrl || null) !== fotoUrl ||
          Boolean(passwordHash);

        if (!dadosMudaram) {
          resultado.responsaveis.skipped.push({
            email,
            motivo: 'Responsável já existe e já está atualizado.',
          });
          continue;
        }

        const responsavelAtualizado = await this.prisma.user.update({
          where: { id: existente.id },
          data: {
            name: nome,
            schoolId: data.schoolId,
            phone: telefone,
            address: endereco,
            cpf,
            identidade,
            fotoUrl,
            ...(passwordHash ? { passwordHash } : {}),
          },
        });

        resultado.responsaveis.updated.push({
          id: responsavelAtualizado.id,
          nome: responsavelAtualizado.name,
          email: responsavelAtualizado.email,
        });
      } catch (error: any) {
        resultado.responsaveis.failed.push({
          email,
          motivo: error?.message || 'Erro ao criar/atualizar responsável.',
        });
      }
    }

    for (const item of alunos) {
      const nome = String(item?.nome || '').trim();
      const matricula = String(item?.matricula || '').trim();
      const turmaNome = String(item?.turmaNome || '').trim();
      const status = String(item?.status || '').trim().toUpperCase() || 'ATIVO';
      const alunoEmail = String(item?.alunoEmail || '').trim().toLowerCase();
      const alunoAtivo = item?.alunoAtivo !== false;
      const fotoUrl = String(item?.fotoUrl || '').trim() || null;

      if (!nome || !matricula || !turmaNome) {
        resultado.alunos.failed.push({
          matricula: matricula || '(sem matrícula)',
          motivo: 'Nome, matrícula e turma são obrigatórios.',
        });
        continue;
      }

      const turma = await this.prisma.turma.findFirst({
        where: {
          schoolId: data.schoolId,
          name: turmaNome,
        },
      });

      if (!turma) {
        resultado.alunos.failed.push({
          matricula,
          motivo: `Turma não encontrada (${turmaNome}).`,
        });
        continue;
      }

      try {
        let alunoUser: any = null;

        if (alunoEmail) {
          alunoUser = await this.upsertAlunoUserByEmail({
            schoolId: data.schoolId,
            alunoName: nome,
            alunoEmail,
            alunoPassword: item?.alunoPassword,
            alunoAtivo,
            fotoUrl,
          });
        }

        const alunoExistente = await this.prisma.aluno.findFirst({
          where: {
            schoolId: data.schoolId,
            matricula,
          },
        });

        if (!alunoExistente) {
          const novoAluno = await this.prisma.aluno.create({
            data: {
              name: nome,
              matricula,
              status,
              schoolId: data.schoolId,
              turmaId: turma.id,
              fotoUrl,
              userId: alunoUser?.id,
            },
          });

          resultado.alunos.created.push({
            id: novoAluno.id,
            nome: novoAluno.name,
            matricula: novoAluno.matricula,
          });

          continue;
        }

        const dadosMudaram =
          alunoExistente.name !== nome ||
          alunoExistente.status !== status ||
          alunoExistente.turmaId !== turma.id ||
          (alunoExistente.fotoUrl || null) !== fotoUrl;

        if (!dadosMudaram && !alunoEmail) {
          resultado.alunos.skipped.push({
            matricula,
            motivo: 'Aluno já existe e já está atualizado.',
          });
          continue;
        }

        const alunoAtualizado = await this.prisma.aluno.update({
          where: { id: alunoExistente.id },
          data: {
            name: nome,
            status,
            turmaId: turma.id,
            fotoUrl,
            userId: alunoUser?.id || alunoExistente.userId,
          },
        });

        resultado.alunos.updated.push({
          id: alunoAtualizado.id,
          nome: alunoAtualizado.name,
          matricula: alunoAtualizado.matricula,
        });
      } catch (error: any) {
        resultado.alunos.failed.push({
          matricula,
          motivo: error?.message || 'Erro ao criar/atualizar aluno.',
        });
      }
    }

    for (const item of alunoResponsaveis) {
      const matriculaAluno = String(item?.matriculaAluno || '').trim();
      const emailResponsavel = String(item?.emailResponsavel || '')
        .trim()
        .toLowerCase();
      const parentesco = String(item?.parentesco || '').trim() || null;
      const responsavelFinanceiro = item?.responsavelFinanceiro === true;

      if (!matriculaAluno || !emailResponsavel) {
        resultado.alunoResponsaveis.failed.push({
          matriculaAluno: matriculaAluno || '(sem matrícula)',
          motivo: 'matriculaAluno e emailResponsavel são obrigatórios.',
        });
        continue;
      }

      const aluno = await this.prisma.aluno.findFirst({
        where: {
          schoolId: data.schoolId,
          matricula: matriculaAluno,
        },
      });

      const responsavel = await this.prisma.user.findUnique({
        where: {
          email: emailResponsavel,
        },
      });

      if (!aluno) {
        resultado.alunoResponsaveis.failed.push({
          matriculaAluno,
          motivo: `Aluno não encontrado (${matriculaAluno}).`,
        });
        continue;
      }

      if (!responsavel) {
        resultado.alunoResponsaveis.failed.push({
          matriculaAluno,
          motivo: `Responsável não encontrado (${emailResponsavel}).`,
        });
        continue;
      }

      const vinculoExistente = await this.prisma.alunoResponsavel.findFirst({
        where: {
          alunoId: aluno.id,
          responsavelId: responsavel.id,
        },
      });

      try {
        if (!vinculoExistente) {
          const novoVinculo = await this.prisma.alunoResponsavel.create({
            data: {
              alunoId: aluno.id,
              responsavelId: responsavel.id,
              parentesco,
              isFinanceiro: responsavelFinanceiro,
            },
          });

          resultado.alunoResponsaveis.created.push({
            id: novoVinculo.id,
            matriculaAluno,
            emailResponsavel,
          });

          continue;
        }

        const dadosMudaram =
          (vinculoExistente.parentesco || null) !== parentesco ||
          Boolean(vinculoExistente.isFinanceiro) !== responsavelFinanceiro;

        if (!dadosMudaram) {
          resultado.alunoResponsaveis.skipped.push({
            matriculaAluno,
            motivo: 'Vínculo já existe e já está atualizado.',
          });
          continue;
        }

        const vinculoAtualizado = await this.prisma.alunoResponsavel.update({
          where: { id: vinculoExistente.id },
          data: {
            parentesco,
            isFinanceiro: responsavelFinanceiro,
          },
        });

        resultado.alunoResponsaveis.updated.push({
          id: vinculoAtualizado.id,
          matriculaAluno,
          emailResponsavel,
        });
      } catch (error: any) {
        resultado.alunoResponsaveis.failed.push({
          matriculaAluno,
          motivo: error?.message || 'Erro ao criar/atualizar vínculo.',
        });
      }
    }

    for (const item of modulacaoProfessores) {
      const turmaNome = String(item?.turmaNome || '').trim();
      const professorEmail = String(item?.professorEmail || '')
        .trim()
        .toLowerCase();
      const disciplina = String(item?.disciplina || '').trim();
      const cargaHoraria = Number(item?.cargaHoraria);

      if (
        !turmaNome ||
        !professorEmail ||
        !disciplina ||
        !Number.isFinite(cargaHoraria)
      ) {
        resultado.modulacaoProfessores.failed.push({
          professorEmail: professorEmail || '(sem email)',
          motivo: 'Dados obrigatórios ausentes na modulação.',
        });
        continue;
      }

      const turma = await this.prisma.turma.findFirst({
        where: {
          schoolId: data.schoolId,
          name: turmaNome,
        },
      });

      const professor = await this.prisma.user.findUnique({
        where: {
          email: professorEmail,
        },
      });

      if (!turma) {
        resultado.modulacaoProfessores.failed.push({
          professorEmail,
          motivo: `Turma não encontrada (${turmaNome}).`,
        });
        continue;
      }

      if (!professor) {
        resultado.modulacaoProfessores.failed.push({
          professorEmail,
          motivo: `Professor não encontrado (${professorEmail}).`,
        });
        continue;
      }

      const existente = await this.prisma.turmaProfessor.findFirst({
        where: {
          turmaId: turma.id,
          professorId: professor.id,
          disciplina,
        },
      });

      try {
        if (!existente) {
          const novaModulacao = await this.prisma.turmaProfessor.create({
            data: {
              turmaId: turma.id,
              professorId: professor.id,
              disciplina,
              cargaHoraria,
            },
          });

          resultado.modulacaoProfessores.created.push({
            id: novaModulacao.id,
            turmaNome,
            professorEmail,
            disciplina,
          });

          continue;
        }

        if (Number(existente.cargaHoraria) === cargaHoraria) {
          resultado.modulacaoProfessores.skipped.push({
            professorEmail,
            motivo: 'Modulação já existe e já está atualizada.',
          });
          continue;
        }

        const modulacaoAtualizada = await this.prisma.turmaProfessor.update({
          where: { id: existente.id },
          data: {
            cargaHoraria,
          },
        });

        resultado.modulacaoProfessores.updated.push({
          id: modulacaoAtualizada.id,
          turmaNome,
          professorEmail,
          disciplina,
        });
      } catch (error: any) {
        resultado.modulacaoProfessores.failed.push({
          professorEmail,
          motivo: error?.message || 'Erro ao criar/atualizar modulação.',
        });
      }
    }

    for (const item of aulasHorarios) {
      const turmaNome = String(item?.turmaNome || '').trim();
      const disciplina = String(item?.disciplina || '').trim();
      const professorEmail = String(item?.professorEmail || '')
        .trim()
        .toLowerCase();
      const diaSemana = String(item?.diaSemana || '').trim().toUpperCase();
      const horaInicio = String(item?.horaInicio || '').trim();
      const horaFim = String(item?.horaFim || '').trim();

      if (!turmaNome || !disciplina || !diaSemana || !horaInicio || !horaFim) {
        resultado.aulasHorarios.failed.push({
          turmaNome: turmaNome || '(sem turma)',
          motivo: 'Dados obrigatórios ausentes na aula.',
        });
        continue;
      }

      const turma = await this.prisma.turma.findFirst({
        where: {
          schoolId: data.schoolId,
          name: turmaNome,
        },
      });

      if (!turma) {
        resultado.aulasHorarios.failed.push({
          turmaNome,
          motivo: `Turma não encontrada (${turmaNome}).`,
        });
        continue;
      }

      let turmaProfessorId: string | null = null;

      if (professorEmail) {
        const professor = await this.prisma.user.findUnique({
          where: { email: professorEmail },
        });

        if (professor) {
          const turmaProfessor = await this.prisma.turmaProfessor.findFirst({
            where: {
              turmaId: turma.id,
              professorId: professor.id,
              disciplina,
            },
          });

          turmaProfessorId = turmaProfessor?.id || null;
        }
      }

      const aulaExistente = await this.prisma.aula.findFirst({
        where: {
          turmaId: turma.id,
          diaSemana,
          horaInicio,
          horaFim,
        },
      });

      try {
        if (!aulaExistente) {
          const novaAula = await this.prisma.aula.create({
            data: {
              turmaId: turma.id,
              disciplina,
              turmaProfessorId,
              diaSemana,
              horaInicio,
              horaFim,
            },
          });

          resultado.aulasHorarios.created.push({
            id: novaAula.id,
            turmaNome,
            disciplina,
            diaSemana,
            horaInicio,
            horaFim,
          });

          continue;
        }

        const dadosMudaram =
          (aulaExistente.turmaProfessorId || null) !== turmaProfessorId ||
          String(aulaExistente.disciplina || '') !== disciplina;

        if (!dadosMudaram) {
          resultado.aulasHorarios.skipped.push({
            turmaNome,
            motivo: 'Aula já existe e já está atualizada.',
          });
          continue;
        }

        const aulaAtualizada = await this.prisma.aula.update({
          where: { id: aulaExistente.id },
          data: {
            turmaProfessorId,
            disciplina,
          },
        });

        resultado.aulasHorarios.updated.push({
          id: aulaAtualizada.id,
          turmaNome,
          disciplina,
          diaSemana,
          horaInicio,
          horaFim,
        });
      } catch (error: any) {
        resultado.aulasHorarios.failed.push({
          turmaNome,
          motivo: error?.message || 'Erro ao criar/atualizar aula.',
        });
      }
    }

    resultado.summary.turmas = this.mapImportSummary(resultado.turmas);
    resultado.summary.usuarios = this.mapImportSummary(resultado.usuarios);
    resultado.summary.responsaveis = this.mapImportSummary(resultado.responsaveis);
    resultado.summary.alunos = this.mapImportSummary(resultado.alunos);
    resultado.summary.alunoResponsaveis = this.mapImportSummary(
      resultado.alunoResponsaveis,
    );
    resultado.summary.modulacaoProfessores = this.mapImportSummary(
      resultado.modulacaoProfessores,
    );
    resultado.summary.aulasHorarios = this.mapImportSummary(
      resultado.aulasHorarios,
    );

    const blocos = [
      resultado.turmas,
      resultado.usuarios,
      resultado.responsaveis,
      resultado.alunos,
      resultado.alunoResponsaveis,
      resultado.modulacaoProfessores,
      resultado.aulasHorarios,
    ];

    resultado.overview = blocos.reduce(
      (acc, bloco) => {
        acc.criados += bloco.created.length;
        acc.atualizados += bloco.updated.length;
        acc.ignorados += bloco.skipped.length;
        acc.falhas += bloco.failed.length;
        return acc;
      },
      { criados: 0, atualizados: 0, ignorados: 0, falhas: 0 },
    );

    return resultado;
  }

  private async restoreFullSchoolSnapshot(snapshot: any) {
    const schoolData = snapshot?.school;
    const warnings: string[] = [];

    if (!schoolData?.name) {
      throw new BadRequestException(
        'Arquivo de backup inv�lido. Snapshot da escola n�o encontrado.',
      );
    }

    const existingSchoolById = schoolData?.id
      ? await this.prisma.school.findUnique({
          where: { id: schoolData.id },
          select: { id: true, name: true },
        })
      : null;
    const normalizedSchoolEmail = String(schoolData?.email || '')
      .trim()
      .toLowerCase();
    const existingSchoolByEmail = normalizedSchoolEmail
      ? await this.prisma.school.findFirst({
          where: { email: normalizedSchoolEmail },
          select: { id: true, name: true },
        })
      : null;
    const existingSchoolByName = schoolData?.name
      ? await this.prisma.school.findFirst({
          where: { name: schoolData.name },
          select: { id: true, name: true },
        })
      : null;
    const existingSchool =
      existingSchoolById || existingSchoolByEmail || existingSchoolByName;

    if (existingSchool) {
      await this.deleteSchool(existingSchool.id);
      warnings.push(
        `A escola existente "${existingSchool.name}" foi substitu�da pelo snapshot do backup.`,
      );
    }

    const restoredSchool = await this.prisma.school.create({
      data: {
        id: schoolData.id,
        name: schoolData.name,
        email: schoolData.email || null,
        phone: schoolData.phone || null,
        logoUrl: schoolData.logoUrl || null,
        status: schoolData.status || SchoolStatus.TESTE_GRATIS,
        plan: schoolData.plan || SchoolPlan.BASICO,
        tipoAvaliacao: schoolData.tipoAvaliacao || TipoAvaliacao.BIMESTRAL,
        mediaAprovacao: Number(schoolData.mediaAprovacao ?? 7),
        trialEndsAt: schoolData.trialEndsAt
          ? new Date(schoolData.trialEndsAt)
          : null,
        createdAt: schoolData.createdAt
          ? new Date(schoolData.createdAt)
          : undefined,
        updatedAt: schoolData.updatedAt
          ? new Date(schoolData.updatedAt)
          : undefined,
      },
      select: { id: true, name: true },
    });

    const oldSchoolId = schoolData.id;
    const userIdMap = new Map<string, string>();
    const snapshotUsers = Array.isArray(snapshot.users) ? snapshot.users : [];

    for (const backupUser of snapshotUsers) {
      const existingById = backupUser?.id
        ? await this.prisma.user.findUnique({
            where: { id: backupUser.id },
          })
        : null;
      const existingByEmail =
        !existingById && backupUser?.email
          ? await this.prisma.user.findUnique({
              where: { email: String(backupUser.email).toLowerCase() },
            })
          : null;
      const existingUser = existingById || existingByEmail;

      const normalizedUsername =
        backupUser.username && String(backupUser.username).trim()
          ? String(backupUser.username).trim()
          : null;
      const normalizedCpf =
        backupUser.cpfNormalized && String(backupUser.cpfNormalized).trim()
          ? String(backupUser.cpfNormalized).trim()
          : backupUser.cpf && String(backupUser.cpf).trim()
            ? String(backupUser.cpf).replace(/\D/g, '')
            : null;

      let safeUsername = normalizedUsername;
      let safeCpfNormalized = normalizedCpf;

      if (normalizedUsername) {
        const usernameOwner = await this.prisma.user.findUnique({
          where: { username: normalizedUsername },
          select: { id: true },
        });

        if (usernameOwner && usernameOwner.id !== existingUser?.id) {
          safeUsername = existingUser?.username || null;
          warnings.push(
            `Login "${normalizedUsername}" já estava em uso e não foi reaplicado para ${backupUser.email}.`,
          );
        }
      }

      if (normalizedCpf) {
        const cpfOwner = await this.prisma.user.findFirst({
          where: { cpfNormalized: normalizedCpf },
          select: { id: true },
        });

        if (cpfOwner && cpfOwner.id !== existingUser?.id) {
          safeCpfNormalized = existingUser?.cpfNormalized || null;
          warnings.push(
            `CPF de ${backupUser.email} já estava em uso e não foi reaplicado.`,
          );
        }
      }

      if (!backupUser.passwordHash) {
        warnings.push(
          `Usuario ${backupUser.email} foi restaurado sem hash de senha no backup. Defina uma nova senha manualmente.`,
        );
      }

      const userData = {
        name: backupUser.name,
        email: String(backupUser.email).toLowerCase(),
        username: safeUsername,
        passwordHash:
          backupUser.passwordHash || (await this.gerarHashSenha(randomUUID())),
        role: backupUser.role,
        isActive: backupUser.isActive !== false,
        createdAt: backupUser.createdAt
          ? new Date(backupUser.createdAt)
          : undefined,
        updatedAt: backupUser.updatedAt
          ? new Date(backupUser.updatedAt)
          : undefined,
        phone: backupUser.phone || null,
        address: backupUser.address || null,
        cpf: backupUser.cpf || null,
        cpfNormalized: safeCpfNormalized,
        identidade: backupUser.identidade || null,
        fotoUrl: backupUser.fotoUrl || null,
        comunicacaoSuspensoAte: backupUser.comunicacaoSuspensoAte
          ? new Date(backupUser.comunicacaoSuspensoAte)
          : null,
        comunicacaoSuspensoMotivo:
          backupUser.comunicacaoSuspensoMotivo || null,
        schoolId:
          backupUser.schoolId === oldSchoolId
            ? restoredSchool.id
            : backupUser.schoolId || null,
        activationToken: backupUser.activationToken || null,
        activationExpires: backupUser.activationExpires
          ? new Date(backupUser.activationExpires)
          : null,
        isActivated: backupUser.isActivated !== false,
      };

      if (existingUser) {
        await this.prisma.user.update({
          where: { id: existingUser.id },
          data: userData,
        });
        userIdMap.set(backupUser.id, existingUser.id);
      } else {
        await this.prisma.user.create({
          data: {
            id: backupUser.id,
            ...userData,
          },
        });
        userIdMap.set(backupUser.id, backupUser.id);
      }
    }

    const createManyIfAny = async (delegate: any, data: any[]) => {
      if (!data.length) return;
      await delegate.createMany({ data });
    };

    await createManyIfAny(
      this.prisma.userSchoolLink,
      (Array.isArray(snapshot.userSchoolLinks) ? snapshot.userSchoolLinks : []).map(
        (item: any) => ({
          ...item,
          userId: this.mapUserId(item.userId, userIdMap),
          schoolId: restoredSchool.id,
        }),
      ),
    );

    if (snapshot.horarioConfiguracao) {
      await this.prisma.schoolHorarioConfiguracao.create({
        data: {
          ...snapshot.horarioConfiguracao,
          schoolId: restoredSchool.id,
        },
      });
    }

    await createManyIfAny(
      this.prisma.turma,
      (Array.isArray(snapshot.turmas) ? snapshot.turmas : []).map((item: any) => ({
        ...item,
        schoolId: restoredSchool.id,
      })),
    );

    await createManyIfAny(
      this.prisma.disciplinaTurma,
      (Array.isArray(snapshot.disciplinasTurma)
        ? snapshot.disciplinasTurma
        : []
      ).map((item: any) => ({
        ...item,
        schoolId: restoredSchool.id,
      })),
    );

    await createManyIfAny(
      this.prisma.turmaProfessor,
      (Array.isArray(snapshot.turmaProfessores)
        ? snapshot.turmaProfessores
        : []
      ).map((item: any) => ({
        ...item,
        professorId: this.mapUserId(item.professorId, userIdMap),
      })),
    );

    await createManyIfAny(
      this.prisma.aula,
      Array.isArray(snapshot.aulas) ? snapshot.aulas : [],
    );

    await createManyIfAny(
      this.prisma.aluno,
      (Array.isArray(snapshot.alunos) ? snapshot.alunos : []).map((item: any) => ({
        ...item,
        schoolId: restoredSchool.id,
        userId: this.mapUserId(item.userId, userIdMap),
      })),
    );

    await createManyIfAny(
      this.prisma.alunoDocumento,
      Array.isArray(snapshot.alunoDocumentos) ? snapshot.alunoDocumentos : [],
    );

    await createManyIfAny(
      this.prisma.responsavelDocumento,
      (Array.isArray(snapshot.responsavelDocumentos)
        ? snapshot.responsavelDocumentos
        : []
      ).map((item: any) => ({
        ...item,
        responsavelId: this.mapUserId(item.responsavelId, userIdMap),
      })),
    );

    await createManyIfAny(
      this.prisma.alunoResponsavel,
      (Array.isArray(snapshot.alunoResponsaveis)
        ? snapshot.alunoResponsaveis
        : []
      ).map((item: any) => ({
        ...item,
        responsavelId: this.mapUserId(item.responsavelId, userIdMap),
      })),
    );

    if (snapshot.financeiroConfiguracao) {
      await this.prisma.financeiroConfiguracao.create({
        data: {
          ...snapshot.financeiroConfiguracao,
          schoolId: restoredSchool.id,
        },
      });
    }

    await createManyIfAny(
      this.prisma.financeiroAssinaturaCobranca,
      (Array.isArray(snapshot.assinaturaCobrancas)
        ? snapshot.assinaturaCobrancas
        : []
      ).map((item: any) => ({
        ...item,
        schoolId: restoredSchool.id,
      })),
    );

    await createManyIfAny(
      this.prisma.financeiroCobranca,
      (Array.isArray(snapshot.financeiroCobrancas)
        ? snapshot.financeiroCobrancas
        : []
      ).map((item: any) => ({
        ...item,
        schoolId: restoredSchool.id,
        responsavelId: this.mapUserId(item.responsavelId, userIdMap),
      })),
    );

    await createManyIfAny(
      this.prisma.financeiroNotaFiscal,
      (Array.isArray(snapshot.financeiroNotasFiscais)
        ? snapshot.financeiroNotasFiscais
        : []
      ).map((item: any) => ({
        ...item,
        schoolId:
          item.schoolId === oldSchoolId ? restoredSchool.id : item.schoolId,
      })),
    );

    await createManyIfAny(
      this.prisma.solicitacao,
      (Array.isArray(snapshot.solicitacoes) ? snapshot.solicitacoes : []).map(
        (item: any) => ({
          ...item,
          schoolId: restoredSchool.id,
          solicitanteId: this.mapUserId(item.solicitanteId, userIdMap),
          recebidoPorId: this.mapUserId(item.recebidoPorId, userIdMap),
          respondidoPorId: this.mapUserId(item.respondidoPorId, userIdMap),
        }),
      ),
    );

    await createManyIfAny(
      this.prisma.atividadeAvaliacaoModelo,
      (Array.isArray(snapshot.atividadeModelos)
        ? snapshot.atividadeModelos
        : []
      ).map((item: any) => ({
        ...item,
        schoolId: restoredSchool.id,
        professorId: this.mapUserId(item.professorId, userIdMap),
      })),
    );

    await createManyIfAny(
      this.prisma.avaliacaoOnline,
      (Array.isArray(snapshot.avaliacoesOnline)
        ? snapshot.avaliacoesOnline
        : []
      ).map((item: any) => ({
        ...item,
        schoolId: restoredSchool.id,
        professorId: this.mapUserId(item.professorId, userIdMap),
      })),
    );

    await createManyIfAny(
      this.prisma.avaliacaoOnlinePergunta,
      Array.isArray(snapshot.avaliacoesOnlinePerguntas)
        ? snapshot.avaliacoesOnlinePerguntas
        : [],
    );

    await createManyIfAny(
      this.prisma.avaliacaoOnlineAlternativa,
      Array.isArray(snapshot.avaliacoesOnlineAlternativas)
        ? snapshot.avaliacoesOnlineAlternativas
        : [],
    );

    await createManyIfAny(
      this.prisma.avaliacaoOnlineTentativa,
      (Array.isArray(snapshot.avaliacoesOnlineTentativas)
        ? snapshot.avaliacoesOnlineTentativas
        : []
      ).map((item: any) => ({
        ...item,
        schoolId: restoredSchool.id,
        userAlunoId: this.mapUserId(item.userAlunoId, userIdMap),
      })),
    );

    await createManyIfAny(
      this.prisma.avaliacaoOnlineResposta,
      (Array.isArray(snapshot.avaliacoesOnlineRespostas)
        ? snapshot.avaliacoesOnlineRespostas
        : []
      ).map((item: any) => ({
        ...item,
        schoolId: restoredSchool.id,
        respondidoPorUserId: this.mapUserId(
          item.respondidoPorUserId,
          userIdMap,
        ),
        corrigidoPorUserId: this.mapUserId(item.corrigidoPorUserId, userIdMap),
      })),
    );

    await createManyIfAny(
      this.prisma.avaliacaoItem,
      (Array.isArray(snapshot.avaliacaoItens)
        ? snapshot.avaliacaoItens
        : []
      ).map((item: any) => ({
        ...item,
        schoolId: restoredSchool.id,
        professorId: this.mapUserId(item.professorId, userIdMap),
      })),
    );

    await createManyIfAny(
      this.prisma.notaBoletim,
      (Array.isArray(snapshot.notasBoletim) ? snapshot.notasBoletim : []).map(
        (item: any) => ({
          ...item,
          schoolId: restoredSchool.id,
          professorId: this.mapUserId(item.professorId, userIdMap),
        }),
      ),
    );

    await createManyIfAny(
      this.prisma.frequencia,
      (Array.isArray(snapshot.frequencias) ? snapshot.frequencias : []).map(
        (item: any) => ({
          ...item,
          schoolId: restoredSchool.id,
          professorId: this.mapUserId(item.professorId, userIdMap),
        }),
      ),
    );

    await createManyIfAny(
      this.prisma.calendarioLetivo,
      (Array.isArray(snapshot.calendariosLetivos)
        ? snapshot.calendariosLetivos
        : []
      ).map((item: any) => ({
        ...item,
        schoolId: restoredSchool.id,
        createdById: this.mapUserId(item.createdById, userIdMap),
      })),
    );

    await createManyIfAny(
      this.prisma.calendarioLetivoTurmaExcecao,
      Array.isArray(snapshot.calendarioLetivoTurmaExcecoes)
        ? snapshot.calendarioLetivoTurmaExcecoes
        : [],
    );

    await createManyIfAny(
      this.prisma.professorAgenda,
      (Array.isArray(snapshot.professorAgendas)
        ? snapshot.professorAgendas
        : []
      ).map((item: any) => ({
        ...item,
        schoolId: restoredSchool.id,
        professorId: this.mapUserId(item.professorId, userIdMap),
      })),
    );

    await createManyIfAny(
      this.prisma.planoAnualConteudo,
      (Array.isArray(snapshot.planosAnuaisConteudo)
        ? snapshot.planosAnuaisConteudo
        : []
      ).map((item: any) => ({
        ...item,
        schoolId: restoredSchool.id,
        professorId: this.mapUserId(item.professorId, userIdMap),
      })),
    );

    await createManyIfAny(
      this.prisma.planejamentoDiarioConteudo,
      (Array.isArray(snapshot.planejamentosDiariosConteudo)
        ? snapshot.planejamentosDiariosConteudo
        : []
      ).map((item: any) => ({
        ...item,
        schoolId: restoredSchool.id,
        professorId: this.mapUserId(item.professorId, userIdMap),
      })),
    );

    await createManyIfAny(
      this.prisma.comunicacaoGrupo,
      (Array.isArray(snapshot.comunicacaoGrupos)
        ? snapshot.comunicacaoGrupos
        : []
      ).map((item: any) => ({
        ...item,
        schoolId: restoredSchool.id,
        createdById: this.mapUserId(item.createdById, userIdMap),
      })),
    );

    await createManyIfAny(
      this.prisma.comunicacaoGrupoMembro,
      (Array.isArray(snapshot.comunicacaoGrupoMembros)
        ? snapshot.comunicacaoGrupoMembros
        : []
      ).map((item: any) => ({
        ...item,
        userId: this.mapUserId(item.userId, userIdMap),
        addedById: this.mapUserId(item.addedById, userIdMap),
      })),
    );

    await createManyIfAny(
      this.prisma.comunicacaoPost,
      (Array.isArray(snapshot.comunicacaoPosts)
        ? snapshot.comunicacaoPosts
        : []
      ).map((item: any) => ({
        ...item,
        schoolId: restoredSchool.id,
        authorId: this.mapUserId(item.authorId, userIdMap),
        moderadoPorId: this.mapUserId(item.moderadoPorId, userIdMap),
      })),
    );

    await createManyIfAny(
      this.prisma.comunicacaoComentario,
      (Array.isArray(snapshot.comunicacaoComentarios)
        ? snapshot.comunicacaoComentarios
        : []
      ).map((item: any) => ({
        ...item,
        schoolId: restoredSchool.id,
        authorId: this.mapUserId(item.authorId, userIdMap),
      })),
    );

    await createManyIfAny(
      this.prisma.comunicacaoReacao,
      (Array.isArray(snapshot.comunicacaoReacoes)
        ? snapshot.comunicacaoReacoes
        : []
      ).map((item: any) => ({
        ...item,
        schoolId: restoredSchool.id,
        userId: this.mapUserId(item.userId, userIdMap),
      })),
    );

    await createManyIfAny(
      this.prisma.comunicacaoMensagem,
      (Array.isArray(snapshot.comunicacaoMensagens)
        ? snapshot.comunicacaoMensagens
        : []
      ).map((item: any) => ({
        ...item,
        schoolId: restoredSchool.id,
        authorId: this.mapUserId(item.authorId, userIdMap),
      })),
    );

    await createManyIfAny(
      this.prisma.forumTopico,
      (Array.isArray(snapshot.forumTopicos) ? snapshot.forumTopicos : []).map(
        (item: any) => ({
          ...item,
          schoolId: restoredSchool.id,
          authorId: this.mapUserId(item.authorId, userIdMap),
        }),
      ),
    );

    await createManyIfAny(
      this.prisma.forumComentario,
      (Array.isArray(snapshot.forumComentarios)
        ? snapshot.forumComentarios
        : []
      ).map((item: any) => ({
        ...item,
        schoolId: restoredSchool.id,
        authorId: this.mapUserId(item.authorId, userIdMap),
      })),
    );

    await createManyIfAny(
      this.prisma.forumAtividade,
      (Array.isArray(snapshot.forumAtividades)
        ? snapshot.forumAtividades
        : []
      ).map((item: any) => ({
        ...item,
        schoolId: restoredSchool.id,
        professorId: this.mapUserId(item.professorId, userIdMap),
      })),
    );

    await createManyIfAny(
      this.prisma.forumEntrega,
      (Array.isArray(snapshot.forumEntregas)
        ? snapshot.forumEntregas
        : []
      ).map((item: any) => ({
        ...item,
        schoolId: restoredSchool.id,
        alunoId: this.mapUserId(item.alunoId, userIdMap),
      })),
    );

    await createManyIfAny(
      this.prisma.forumEnquete,
      (Array.isArray(snapshot.forumEnquetes)
        ? snapshot.forumEnquetes
        : []
      ).map((item: any) => ({
        ...item,
        schoolId: restoredSchool.id,
        authorId: this.mapUserId(item.authorId, userIdMap),
      })),
    );

    await createManyIfAny(
      this.prisma.forumEnqueteOpcao,
      Array.isArray(snapshot.forumEnqueteOpcoes)
        ? snapshot.forumEnqueteOpcoes
        : [],
    );

    await createManyIfAny(
      this.prisma.forumEnqueteVoto,
      (Array.isArray(snapshot.forumEnqueteVotos)
        ? snapshot.forumEnqueteVotos
        : []
      ).map((item: any) => ({
        ...item,
        schoolId: restoredSchool.id,
        userId: this.mapUserId(item.userId, userIdMap),
      })),
    );

    return {
      message: 'Backup completo restaurado com sucesso.',
      school: await this.findById(restoredSchool.id),
      warnings,
      importResult: null,
    };
  }

  private buildImportPayloadFromBackup(payload: any) {
    const backupUsers = Array.isArray(payload?.users) ? payload.users : [];
    const backupAlunos = Array.isArray(payload?.alunos) ? payload.alunos : [];
    const backupAlunoResponsaveis = Array.isArray(payload?.alunoResponsaveis)
      ? payload.alunoResponsaveis
      : [];
    const backupTurmas = Array.isArray(payload?.turmas) ? payload.turmas : [];
    const backupTurmaProfessores = Array.isArray(payload?.turmaProfessores)
      ? payload.turmaProfessores
      : [];
    const backupAulas = Array.isArray(payload?.aulas) ? payload.aulas : [];

    const userById = new Map<string, any>(
      backupUsers.map((user: any) => [String(user.id), user]),
    );

    return {
      turmas: backupTurmas.map((turma: any) => ({
        nome: turma.name,
        turno: turma.turno,
      })),
      usuarios: backupUsers
        .filter(
          (user: any) => user.role !== UserRole.RESPONSAVEL && user.role !== UserRole.ALUNO,
        )
        .map((user: any) => ({
          nome: user.name,
          email: user.email,
          role: user.role,
          usuarioAtivo: user.isActive !== false,
          telefone: user.phone || '',
          endereco: user.address || '',
          cpf: user.cpf || '',
          identidade: user.identidade || '',
        })),
      responsaveis: backupUsers
        .filter((user: any) => user.role === UserRole.RESPONSAVEL)
        .map((user: any) => ({
          nome: user.name,
          email: user.email,
          telefone: user.phone || '',
          endereco: user.address || '',
          cpf: user.cpf || '',
          identidade: user.identidade || '',
          fotoUrl: user.fotoUrl || '',
        })),
      alunos: backupAlunos.map((aluno: any) => ({
        nome: aluno.name,
        matricula: aluno.matricula,
        turmaNome: aluno.turma?.name || '',
        status: aluno.status || 'ATIVO',
        alunoEmail: userById.get(aluno.userId)?.email || '',
        alunoAtivo: userById.get(aluno.userId)?.isActive !== false,
        fotoUrl: aluno.fotoUrl || '',
      })),
      alunoResponsaveis: backupAlunoResponsaveis.map((vinculo: any) => ({
        matriculaAluno: vinculo.aluno?.matricula || '',
        emailResponsavel: vinculo.responsavel?.email || '',
        parentesco: vinculo.parentesco || '',
        responsavelFinanceiro: vinculo.isFinanceiro === true,
      })),
      modulacaoProfessores: backupTurmaProfessores.map((item: any) => ({
        turmaNome: item.turma?.name || '',
        professorEmail: item.professor?.email || '',
        disciplina: item.disciplina || '',
        cargaHoraria: Number(item.cargaHoraria || 0),
      })),
      aulasHorarios: backupAulas.map((aula: any) => ({
        turmaNome: aula.turma?.name || '',
        disciplina: aula.disciplina || '',
        professorEmail: aula.turmaProfessor?.professor?.email || '',
        diaSemana: aula.diaSemana || '',
        horaInicio: aula.horaInicio || '',
        horaFim: aula.horaFim || '',
      })),
    };
  }

  async restoreSchoolFromBackup(payload: any) {
    if (payload?.snapshot?.school) {
      return this.restoreFullSchoolSnapshot(payload.snapshot);
    }

    const backup = payload || {};
    const schoolData = backup?.school;
    const warnings: string[] = [];

    if (!schoolData?.name) {
      throw new BadRequestException(
        'Arquivo de backup inválido. Dados da escola não encontrados.',
      );
    }

    const existingSchoolById = schoolData?.id
      ? await this.prisma.school.findUnique({
          where: { id: schoolData.id },
          select: { id: true, name: true },
        })
      : null;
    const normalizedSchoolEmail = String(schoolData?.email || '')
      .trim()
      .toLowerCase();
    const existingSchoolByEmail = normalizedSchoolEmail
      ? await this.prisma.school.findFirst({
          where: {
            email: normalizedSchoolEmail,
          },
          select: { id: true, name: true },
        })
      : null;
    const existingSchoolByName = schoolData?.name
      ? await this.prisma.school.findFirst({
          where: {
            name: schoolData.name,
          },
          select: { id: true, name: true },
        })
      : null;

    const existingSchool =
      existingSchoolById || existingSchoolByEmail || existingSchoolByName;

    const schoolId = schoolData?.id || undefined;

    const restoredSchool = existingSchool
      ? await this.prisma.school.update({
          where: { id: existingSchool.id },
          data: {
            name: schoolData.name,
            email: schoolData.email || null,
            phone: schoolData.phone || null,
            logoUrl: schoolData.logoUrl || null,
            status: schoolData.status || SchoolStatus.TESTE_GRATIS,
            plan: schoolData.plan || SchoolPlan.BASICO,
            tipoAvaliacao: schoolData.tipoAvaliacao || TipoAvaliacao.BIMESTRAL,
            mediaAprovacao: Number(schoolData.mediaAprovacao ?? 7),
            trialEndsAt: schoolData.trialEndsAt
              ? new Date(schoolData.trialEndsAt)
              : null,
          },
          select: { id: true, name: true },
        })
      : await this.prisma.school.create({
          data: {
            ...(schoolId ? { id: schoolId } : {}),
            name: schoolData.name,
            email: schoolData.email || null,
            phone: schoolData.phone || null,
            logoUrl: schoolData.logoUrl || null,
            status: schoolData.status || SchoolStatus.TESTE_GRATIS,
            plan: schoolData.plan || SchoolPlan.BASICO,
            tipoAvaliacao: schoolData.tipoAvaliacao || TipoAvaliacao.BIMESTRAL,
            mediaAprovacao: Number(schoolData.mediaAprovacao ?? 7),
            trialEndsAt: schoolData.trialEndsAt
              ? new Date(schoolData.trialEndsAt)
              : null,
          },
          select: { id: true, name: true },
        });

    if (backup?.financeiroConfiguracao) {
      await this.prisma.financeiroConfiguracao.upsert({
        where: { schoolId: restoredSchool.id },
        update: {
          beneficiario: backup.financeiroConfiguracao.beneficiario || null,
          documento: backup.financeiroConfiguracao.documento || null,
          banco: backup.financeiroConfiguracao.banco || null,
          agencia: backup.financeiroConfiguracao.agencia || null,
          conta: backup.financeiroConfiguracao.conta || null,
          pixKey: backup.financeiroConfiguracao.pixKey || null,
          mensalidadePadrao: Number(
            backup.financeiroConfiguracao.mensalidadePadrao || 0,
          ),
          vencimentoDia: Number(
            backup.financeiroConfiguracao.vencimentoDia || 10,
          ),
          gestorAccessEnabled:
            backup.financeiroConfiguracao.gestorAccessEnabled !== false,
          secretariaAccessEnabled:
            backup.financeiroConfiguracao.secretariaAccessEnabled !== false,
          gateway: backup.financeiroConfiguracao.gateway || null,
          gatewayPublicKey:
            backup.financeiroConfiguracao.gatewayPublicKey || null,
          gatewayAccessToken:
            backup.financeiroConfiguracao.gatewayAccessToken || null,
          webhookUrl: backup.financeiroConfiguracao.webhookUrl || null,
          fiscalEnabled: backup.financeiroConfiguracao.fiscalEnabled === true,
          fiscalAmbiente:
            backup.financeiroConfiguracao.fiscalAmbiente || undefined,
          fiscalProvedor:
            backup.financeiroConfiguracao.fiscalProvedor || undefined,
          fiscalEndpointUrl:
            backup.financeiroConfiguracao.fiscalEndpointUrl || null,
          fiscalApiToken: backup.financeiroConfiguracao.fiscalApiToken || null,
          fiscalMunicipioIbge:
            backup.financeiroConfiguracao.fiscalMunicipioIbge || null,
          fiscalInscricaoMunicipal:
            backup.financeiroConfiguracao.fiscalInscricaoMunicipal || null,
          fiscalCnae: backup.financeiroConfiguracao.fiscalCnae || null,
          fiscalServicoCodigo:
            backup.financeiroConfiguracao.fiscalServicoCodigo || null,
          fiscalAliquotaIss: Number(
            backup.financeiroConfiguracao.fiscalAliquotaIss || 0,
          ),
          fiscalDescricaoPadrao:
            backup.financeiroConfiguracao.fiscalDescricaoPadrao || null,
          fiscalEmitirAutomaticamente:
            backup.financeiroConfiguracao.fiscalEmitirAutomaticamente === true,
        },
        create: {
          schoolId: restoredSchool.id,
          beneficiario: backup.financeiroConfiguracao.beneficiario || null,
          documento: backup.financeiroConfiguracao.documento || null,
          banco: backup.financeiroConfiguracao.banco || null,
          agencia: backup.financeiroConfiguracao.agencia || null,
          conta: backup.financeiroConfiguracao.conta || null,
          pixKey: backup.financeiroConfiguracao.pixKey || null,
          mensalidadePadrao: Number(
            backup.financeiroConfiguracao.mensalidadePadrao || 0,
          ),
          vencimentoDia: Number(
            backup.financeiroConfiguracao.vencimentoDia || 10,
          ),
          gestorAccessEnabled:
            backup.financeiroConfiguracao.gestorAccessEnabled !== false,
          secretariaAccessEnabled:
            backup.financeiroConfiguracao.secretariaAccessEnabled !== false,
          gateway: backup.financeiroConfiguracao.gateway || null,
          gatewayPublicKey:
            backup.financeiroConfiguracao.gatewayPublicKey || null,
          gatewayAccessToken:
            backup.financeiroConfiguracao.gatewayAccessToken || null,
          webhookUrl: backup.financeiroConfiguracao.webhookUrl || null,
          fiscalEnabled: backup.financeiroConfiguracao.fiscalEnabled === true,
          fiscalAmbiente:
            backup.financeiroConfiguracao.fiscalAmbiente || undefined,
          fiscalProvedor:
            backup.financeiroConfiguracao.fiscalProvedor || undefined,
          fiscalEndpointUrl:
            backup.financeiroConfiguracao.fiscalEndpointUrl || null,
          fiscalApiToken: backup.financeiroConfiguracao.fiscalApiToken || null,
          fiscalMunicipioIbge:
            backup.financeiroConfiguracao.fiscalMunicipioIbge || null,
          fiscalInscricaoMunicipal:
            backup.financeiroConfiguracao.fiscalInscricaoMunicipal || null,
          fiscalCnae: backup.financeiroConfiguracao.fiscalCnae || null,
          fiscalServicoCodigo:
            backup.financeiroConfiguracao.fiscalServicoCodigo || null,
          fiscalAliquotaIss: Number(
            backup.financeiroConfiguracao.fiscalAliquotaIss || 0,
          ),
          fiscalDescricaoPadrao:
            backup.financeiroConfiguracao.fiscalDescricaoPadrao || null,
          fiscalEmitirAutomaticamente:
            backup.financeiroConfiguracao.fiscalEmitirAutomaticamente === true,
        },
      });
    }

    const importPayload = this.buildImportPayloadFromBackup(backup);
    const importResult = await this.importAllFromTemplate({
      schoolId: restoredSchool.id,
      payload: importPayload,
    });

    const backupUsers = Array.isArray(backup?.users) ? backup.users : [];
    const backupAlunos = Array.isArray(backup?.alunos) ? backup.alunos : [];
    const backupCalendarios = Array.isArray(backup?.calendariosLetivos)
      ? backup.calendariosLetivos
      : [];
    const schoolAdminLinks = Array.isArray(backup?.schoolAdminLinks)
      ? backup.schoolAdminLinks
      : [];

    const restoredUsers = await this.prisma.user.findMany({
      where: {
        OR: [{ schoolId: restoredSchool.id }, { schoolLinks: { some: { schoolId: restoredSchool.id } } }],
      },
      include: {
        schoolLinks: true,
      },
    });
    const restoredUsersByEmail = new Map(
      restoredUsers.map((user) => [user.email.toLowerCase(), user]),
    );

    for (const backupUser of backupUsers) {
      const restoredUser = restoredUsersByEmail.get(
        String(backupUser?.email || '').toLowerCase(),
      );

      if (!restoredUser) {
        continue;
      }

      const normalizedUsername =
        backupUser.username && String(backupUser.username).trim()
          ? String(backupUser.username).trim()
          : null;
      const normalizedCpf =
        backupUser.cpfNormalized && String(backupUser.cpfNormalized).trim()
          ? String(backupUser.cpfNormalized).trim()
          : backupUser.cpf && String(backupUser.cpf).trim()
            ? String(backupUser.cpf).replace(/\D/g, '')
            : null;

      let safeUsername = normalizedUsername;
      let safeCpfNormalized = normalizedCpf;

      if (normalizedUsername) {
        const usernameOwner = await this.prisma.user.findUnique({
          where: { username: normalizedUsername },
          select: { id: true },
        });

        if (usernameOwner && usernameOwner.id !== restoredUser.id) {
          safeUsername = restoredUser.username || null;
          warnings.push(
            `Login "${normalizedUsername}" j� estava em uso e n�o foi reaplicado para ${backupUser.email}.`,
          );
        }
      }

      if (normalizedCpf) {
        const cpfOwner = await this.prisma.user.findFirst({
          where: {
            cpfNormalized: normalizedCpf,
          },
          select: { id: true },
        });

        if (cpfOwner && cpfOwner.id !== restoredUser.id) {
          safeCpfNormalized = restoredUser.cpfNormalized || null;
          warnings.push(
            `CPF de ${backupUser.email} j� estava em uso e n�o foi reaplicado.`,
          );
        }
      }

      await this.prisma.user.update({
        where: { id: restoredUser.id },
        data: {
          name: backupUser.name,
          role: backupUser.role,
          isActive: backupUser.isActive !== false,
          isActivated: backupUser.isActivated !== false,
          phone: backupUser.phone || null,
          address: backupUser.address || null,
          cpf: backupUser.cpf || null,
          cpfNormalized: safeCpfNormalized,
          identidade: backupUser.identidade || null,
          fotoUrl: backupUser.fotoUrl || null,
          username: safeUsername,
          passwordHash: backupUser.passwordHash || restoredUser.passwordHash,
          activationToken: backupUser.activationToken || null,
          activationExpires: backupUser.activationExpires
            ? new Date(backupUser.activationExpires)
            : null,
          comunicacaoSuspensoAte: backupUser.comunicacaoSuspensoAte
            ? new Date(backupUser.comunicacaoSuspensoAte)
            : null,
          comunicacaoSuspensoMotivo:
            backupUser.comunicacaoSuspensoMotivo || null,
          schoolId:
            backupUser.schoolId === schoolData.id
              ? restoredSchool.id
              : backupUser.schoolId || restoredUser.schoolId || null,
        },
      });
    }

    for (const link of schoolAdminLinks) {
      const email = String(link?.user?.email || '').toLowerCase();
      const restoredUser = restoredUsersByEmail.get(email);

      if (!restoredUser) {
        continue;
      }

      await this.prisma.userSchoolLink.upsert({
        where: {
          userId_schoolId: {
            userId: restoredUser.id,
            schoolId: restoredSchool.id,
          },
        },
        update: {},
        create: {
          userId: restoredUser.id,
          schoolId: restoredSchool.id,
        },
      });
    }

    const restoredAlunos = await this.prisma.aluno.findMany({
      where: { schoolId: restoredSchool.id },
      include: {
        documentos: true,
      },
    });
    const restoredAlunosByMatricula = new Map(
      restoredAlunos.map((aluno) => [String(aluno.matricula || ''), aluno]),
    );

    for (const backupAluno of backupAlunos) {
      const restoredAluno = restoredAlunosByMatricula.get(
        String(backupAluno?.matricula || ''),
      );

      if (!restoredAluno) {
        continue;
      }

      for (const documento of Array.isArray(backupAluno?.documentos)
        ? backupAluno.documentos
        : []) {
        const existente = restoredAluno.documentos.find(
          (item) =>
            item.tipo === documento.tipo &&
            item.nomeOriginal === documento.nomeOriginal &&
            item.arquivoUrl === documento.arquivoUrl,
        );

        if (existente) {
          continue;
        }

        await this.prisma.alunoDocumento.create({
          data: {
            alunoId: restoredAluno.id,
            tipo: documento.tipo,
            nomeOriginal: documento.nomeOriginal,
            arquivoUrl: documento.arquivoUrl,
            mimeType: documento.mimeType || null,
            observacao: documento.observacao || null,
          },
        });
      }
    }

    for (const backupUser of backupUsers) {
      if (backupUser.role !== UserRole.RESPONSAVEL) {
        continue;
      }

      const restoredUser = restoredUsersByEmail.get(
        String(backupUser?.email || '').toLowerCase(),
      );

      if (!restoredUser) {
        continue;
      }

      const existingDocs = await this.prisma.responsavelDocumento.findMany({
        where: { responsavelId: restoredUser.id },
      });

      for (const documento of Array.isArray(backupUser?.responsavelDocumentos)
        ? backupUser.responsavelDocumentos
        : []) {
        const existente = existingDocs.find(
          (item) =>
            item.tipo === documento.tipo &&
            item.nomeOriginal === documento.nomeOriginal &&
            item.arquivoUrl === documento.arquivoUrl,
        );

        if (existente) {
          continue;
        }

        await this.prisma.responsavelDocumento.create({
          data: {
            responsavelId: restoredUser.id,
            tipo: documento.tipo,
            nomeOriginal: documento.nomeOriginal,
            arquivoUrl: documento.arquivoUrl,
            mimeType: documento.mimeType || null,
            observacao: documento.observacao || null,
          },
        });
      }
    }

    for (const calendario of backupCalendarios) {
      const turmaNome = calendario?.turma?.name
        ? String(calendario.turma.name)
        : null;
      const createdByEmail = String(calendario?.createdBy?.email || '').toLowerCase();

      const turma =
        turmaNome
          ? await this.prisma.turma.findFirst({
              where: {
                schoolId: restoredSchool.id,
                name: turmaNome,
              },
            })
          : null;
      const createdBy = restoredUsersByEmail.get(createdByEmail);

      if (!createdBy) {
        continue;
      }

      const existente = await this.prisma.calendarioLetivo.findFirst({
        where: {
          schoolId: restoredSchool.id,
          tipo: calendario.tipo,
          abrangencia: calendario.abrangencia,
          motivo: calendario.motivo,
          dataInicio: new Date(calendario.dataInicio),
          dataFim: new Date(calendario.dataFim),
          turmaId: turma?.id || null,
        },
        include: {
          turmasExcecao: true,
        },
      });

      const restoredCalendario = existente
        ? existente
        : await this.prisma.calendarioLetivo.create({
            data: {
              schoolId: restoredSchool.id,
              turmaId: turma?.id || null,
              tipo: calendario.tipo,
              abrangencia: calendario.abrangencia,
              motivo: calendario.motivo,
              dataInicio: new Date(calendario.dataInicio),
              dataFim: new Date(calendario.dataFim),
              createdById: createdBy.id,
            },
            include: {
              turmasExcecao: true,
            },
          });

      for (const turmaExcecao of Array.isArray(calendario?.turmasExcecao)
        ? calendario.turmasExcecao
        : []) {
        const turmaExcecaoRestaurada = await this.prisma.turma.findFirst({
          where: {
            schoolId: restoredSchool.id,
            name: turmaExcecao?.turma?.name || '',
          },
        });

        if (!turmaExcecaoRestaurada) {
          continue;
        }

        await this.prisma.calendarioLetivoTurmaExcecao.upsert({
          where: {
            calendarioLetivoId_turmaId: {
              calendarioLetivoId: restoredCalendario.id,
              turmaId: turmaExcecaoRestaurada.id,
            },
          },
          update: {},
          create: {
            calendarioLetivoId: restoredCalendario.id,
            turmaId: turmaExcecaoRestaurada.id,
          },
        });
      }
    }

    return {
      message: existingSchool
        ? 'Backup restaurado com sucesso na escola existente.'
        : 'Backup restaurado com sucesso e escola recriada.',
      school: await this.findById(restoredSchool.id),
      importResult,
      warnings,
    };
  }

  async create(data: {
    name: string;
    email?: string;
    phone?: string;
    status?: SchoolStatus;
    plan?: SchoolPlan;
    tipoAvaliacao?: TipoAvaliacao;
    mediaAprovacao?: number;
    adminName?: string;
    adminIdentifier?: string;
    adminEmail?: string;
    adminPassword?: string;
  }) {
    if (!data.name || !data.name.trim()) {
      throw new BadRequestException('Nome da escola e obrigatorio.');
    }

    const adminIdentifier = String(
      data.adminIdentifier || data.adminEmail || '',
    ).trim();

    if (!adminIdentifier) {
      throw new BadRequestException(
        'Informe e-mail, usuario ou CPF do admin.',
      );
    }

    const normalizedAdminEmail = adminIdentifier.toLowerCase();
    const hasEmailFormat = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
      normalizedAdminEmail,
    );
    const normalizedAdminUsername = normalizeSchoolAdminUsername(adminIdentifier);
    const normalizedAdminCpf = normalizeSchoolAdminCpf(adminIdentifier);

    const existingAdmin = await this.usersService.findByLoginIdentifier(
      adminIdentifier,
    );

    if (existingAdmin && existingAdmin.role !== UserRole.ADMIN_ESCOLA) {
      throw new BadRequestException(
        'Ja existe um usuario com este identificador, mas ele nao e ADMIN_ESCOLA.',
      );
    }

    if (!existingAdmin) {
      if (!data.adminPassword || data.adminPassword.trim().length < 6) {
        throw new BadRequestException(
          'A senha de acesso do admin deve ter pelo menos 6 caracteres.',
        );
      }

      if (!hasEmailFormat && !normalizedAdminCpf) {
        isValidSchoolAdminUsername(normalizedAdminUsername);
      }
    }

    const selectedPlan = data.plan ?? 'TESTE_15_DIAS';
    const selectedTipoAvaliacao = data.tipoAvaliacao ?? 'BIMESTRAL';
    const selectedMediaAprovacao =
      data.mediaAprovacao === undefined ? 7 : Number(data.mediaAprovacao);

    if (
      !Number.isFinite(selectedMediaAprovacao) ||
      selectedMediaAprovacao < 0 ||
      selectedMediaAprovacao > 10
    ) {
      throw new BadRequestException(
        'A média de aprovação deve estar entre 0 e 10.',
      );
    }

    const derivedStatus =
      data.status ??
      (selectedPlan === 'TESTE_15_DIAS' ? 'TESTE_GRATIS' : 'ATIVA');

    const now = new Date();
    const trialEndsAt =
      selectedPlan === 'TESTE_15_DIAS'
        ? new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000)
        : null;

    const passwordHash =
      data.adminPassword && data.adminPassword.trim().length >= 6
        ? await bcrypt.hash(data.adminPassword.trim(), 10)
        : null;

    return this.prisma.$transaction(async (tx) => {
      const school = await tx.school.create({
        data: {
          name: data.name.trim(),
          email: data.email?.trim() || undefined,
          phone: data.phone?.trim() || undefined,
          status: derivedStatus,
          plan: selectedPlan,
          tipoAvaliacao: selectedTipoAvaliacao,
          mediaAprovacao: selectedMediaAprovacao,
          trialEndsAt,
        },
        include: {
          users: {
            select: schoolUserSelect,
          },
          userSchoolLinks: {
            include: {
              user: {
                select: schoolUserSelect,
              },
            },
          },
        },
      });

      let adminUser;

      if (existingAdmin) {
        await tx.userSchoolLink.upsert({
          where: {
            userId_schoolId: {
              userId: existingAdmin.id,
              schoolId: school.id,
            },
          },
          update: {},
          create: {
            userId: existingAdmin.id,
            schoolId: school.id,
          },
        });

        if (!existingAdmin.schoolId) {
          await tx.user.update({
            where: {
              id: existingAdmin.id,
            },
            data: {
              schoolId: school.id,
            },
          });
        }

        adminUser = await tx.user.findUnique({
          where: {
            id: existingAdmin.id,
          },
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            schoolId: true,
            isActive: true,
            isActivated: true,
            createdAt: true,
            updatedAt: true,
          },
        });
      } else {
        const schoolSlug =
          data.name
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '') || 'escola';

        const adminEmailForCreate = hasEmailFormat
          ? normalizedAdminEmail
          : `admin-${schoolSlug}-${Date.now()}@gestclass.local`;

        adminUser = await tx.user.create({
          data: {
            name:
              data.adminName?.trim() || `Administrador ${data.name.trim()}`,
            email: adminEmailForCreate,
            username:
              !hasEmailFormat && !normalizedAdminCpf
                ? normalizedAdminUsername
                : null,
            cpf: !hasEmailFormat && normalizedAdminCpf ? adminIdentifier : null,
            cpfNormalized:
              !hasEmailFormat && normalizedAdminCpf ? normalizedAdminCpf : null,
            passwordHash: passwordHash!,
            role: 'ADMIN_ESCOLA',
            schoolId: school.id,
            isActive: true,
            isActivated: true,
            activationToken: null,
            activationExpires: null,
            schoolLinks: {
              create: {
                schoolId: school.id,
              },
            },
          },
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            schoolId: true,
            isActive: true,
            isActivated: true,
            createdAt: true,
            updatedAt: true,
          },
        });
      }

      return {
        message: existingAdmin
          ? 'Escola criada e vinculada ao administrador existente com sucesso.'
          : 'Escola e administrador criados com sucesso.',
        school,
        adminUser,
      };
    });
  }

  async update(
    id: string,
    data: {
      name?: string;
      email?: string;
      phone?: string;
      status?: SchoolStatus;
      plan?: SchoolPlan;
      logoUrl?: string;
      tipoAvaliacao?: TipoAvaliacao;
      mediaAprovacao?: number;
    },
  ) {
    const currentSchool = await this.prisma.school.findUnique({
      where: { id },
      select: {
        status: true,
      },
    });

    if (!currentSchool) {
      throw new BadRequestException('Escola n�o encontrada.');
    }

    if (data.mediaAprovacao !== undefined) {
      const mediaAprovacao = Number(data.mediaAprovacao);

      if (
        !Number.isFinite(mediaAprovacao) ||
        mediaAprovacao < 0 ||
        mediaAprovacao > 10
      ) {
        throw new BadRequestException(
          'A média de aprovação deve estar entre 0 e 10.',
        );
      }
    }

    let derivedStatus = data.status;
    let trialEndsAt: Date | null | undefined = undefined;

    if (data.plan) {
      if (data.plan === 'TESTE_15_DIAS') {
        trialEndsAt = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000);

        if (!derivedStatus) {
          derivedStatus = 'TESTE_GRATIS';
        }
      } else {
        trialEndsAt = null;

        if (!derivedStatus && currentSchool.status === 'TESTE_GRATIS') {
          derivedStatus = 'ATIVA';
        }
      }
    }

    return this.prisma.school.update({
      where: { id },
      data: {
        name: data.name,
        email: data.email,
        phone: data.phone,
        status: derivedStatus,
        plan: data.plan,
        trialEndsAt,
        logoUrl: data.logoUrl,
        tipoAvaliacao: data.tipoAvaliacao,
        mediaAprovacao:
          data.mediaAprovacao === undefined
            ? undefined
            : Number(data.mediaAprovacao),
      },
      include: {
        users: {
          select: schoolUserSelect,
        },
        userSchoolLinks: {
          include: {
            user: {
              select: schoolUserSelect,
            },
          },
        },
      },
    });
  }

  async deleteSchool(schoolId: string) {
    const school = await this.prisma.school.findUnique({
      where: { id: schoolId },
      select: {
        id: true,
        name: true,
      },
    });

    if (!school) {
      throw new BadRequestException('Escola n�o encontrada.');
    }

    return this.prisma.$transaction(async (tx) => {
      const [users, turmas, turmaProfessores, alunos] = await Promise.all([
        tx.user.findMany({
          where: {
            OR: [
              { schoolId },
              {
                schoolLinks: {
                  some: {
                    schoolId,
                  },
                },
              },
            ],
          },
          select: {
            id: true,
            role: true,
            schoolId: true,
            schoolLinks: {
              select: {
                schoolId: true,
              },
            },
          },
        }),
        tx.turma.findMany({
          where: { schoolId },
          select: { id: true },
        }),
        tx.turmaProfessor.findMany({
          where: {
            turma: {
              schoolId,
            },
          },
          select: { id: true },
        }),
        tx.aluno.findMany({
          where: { schoolId },
          select: { id: true },
        }),
      ]);

      const turmaIds = turmas.map((turma) => turma.id);
      const turmaProfessorIds = turmaProfessores.map((item) => item.id);
      const alunoIds = alunos.map((aluno) => aluno.id);

      const usersToDelete = users.filter((user) => {
        if (user.role === UserRole.SUPERUSUARIO) {
          return false;
        }

        if (user.schoolId !== schoolId) {
          return false;
        }

        const remainingLinks = user.schoolLinks.filter(
          (link) => link.schoolId !== schoolId,
        );

        return remainingLinks.length === 0;
      });

      const usersToReassign = users.filter((user) => {
        if (user.schoolId !== schoolId) {
          return false;
        }

        return !usersToDelete.some((item) => item.id === user.id);
      });

      for (const user of usersToReassign) {
        const nextSchoolLink = user.schoolLinks.find(
          (link) => link.schoolId !== schoolId,
        );

        await tx.user.update({
          where: { id: user.id },
          data: {
            schoolId: nextSchoolLink?.schoolId ?? null,
          },
        });
      }

      if (turmaIds.length > 0) {
        await tx.aula.deleteMany({
          where: {
            turmaId: {
              in: turmaIds,
            },
          },
        });
      }

      if (turmaProfessorIds.length > 0) {
        await tx.turmaProfessor.deleteMany({
          where: {
            id: {
              in: turmaProfessorIds,
            },
          },
        });
      }

      if (alunoIds.length > 0) {
        await tx.aluno.deleteMany({
          where: {
            id: {
              in: alunoIds,
            },
          },
        });
      }

      if (turmaIds.length > 0) {
        await tx.turma.deleteMany({
          where: {
            id: {
              in: turmaIds,
            },
          },
        });
      }

      if (usersToDelete.length > 0) {
        await tx.user.deleteMany({
          where: {
            id: {
              in: usersToDelete.map((user) => user.id),
            },
          },
        });
      }

      await tx.school.delete({
        where: { id: schoolId },
      });

      return {
        message: 'Escola excluída com sucesso.',
        deletedSchoolId: school.id,
        deletedSchoolName: school.name,
      };
    });
  }
}

