import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  SolicitacaoStatus,
  SolicitacaoTipo,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type AuthUser = {
  id?: string;
  userId?: string;
  sub?: string;
  role: UserRole;
  schoolId?: string | null;
};

const SOLICITACOES_ROLES: UserRole[] = [
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

@Injectable()
export class SolicitacoesService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly PROTOCOLO_DIGITOS_INICIAIS = 5;
  private readonly PROTOCOLO_TENTATIVAS = 40;

  private getUserId(user: AuthUser) {
    const userId = user.id || user.userId || user.sub;
    if (!userId) throw new ForbiddenException('Usuario nao autenticado.');
    return userId;
  }

  private getSchoolId(user: AuthUser) {
    if (!user.schoolId) {
      throw new ForbiddenException('Usuario sem escola vinculada.');
    }
    return user.schoolId;
  }

  private canUseSolicitacoes(role: UserRole) {
    return SOLICITACOES_ROLES.includes(role) || role === UserRole.SUPERUSUARIO;
  }

  private canAtenderSolicitacoes(role: UserRole) {
    return (
      role === UserRole.SECRETARIA ||
      role === UserRole.GESTOR ||
      role === UserRole.SUPERUSUARIO
    );
  }

  private podeSelecionarAluno(role: UserRole) {
    return (
      role === UserRole.ADMIN_ESCOLA ||
      role === UserRole.GESTOR ||
      role === UserRole.SECRETARIA ||
      role === UserRole.RESPONSAVEL ||
      role === UserRole.SUPERUSUARIO
    );
  }

  private assertCanUse(user: AuthUser) {
    if (!this.canUseSolicitacoes(user.role)) {
      throw new ForbiddenException('Sem permissao para acessar solicitacoes.');
    }
  }

  private async getSolicitacaoAcessivel(user: AuthUser, id: string) {
    this.assertCanUse(user);
    const userId = this.getUserId(user);
    const schoolId = this.getSchoolId(user);

    const solicitacao = await this.prisma.solicitacao.findFirst({
      where: { id, schoolId },
      include: {
        aluno: { include: { turma: true } },
        solicitante: {
          select: { id: true, name: true, email: true, role: true },
        },
      },
    });

    if (!solicitacao) {
      throw new NotFoundException('Solicitacao nao encontrada.');
    }

    if (
      !this.canAtenderSolicitacoes(user.role) &&
      solicitacao.solicitanteId !== userId
    ) {
      throw new ForbiddenException(
        'Sem permissao para editar ou excluir esta solicitacao.',
      );
    }

    return solicitacao;
  }

  private getAnoProtocolo(data: Date) {
    return data.getFullYear();
  }

  private getCapacidadePorDigitos(digitos: number) {
    if (digitos <= 1) return 10;
    return 9 * 10 ** (digitos - 1);
  }

  private getIntervaloPorDigitos(digitos: number) {
    if (digitos <= 1) {
      return { min: 0, max: 9 };
    }

    return {
      min: 10 ** (digitos - 1),
      max: 10 ** digitos - 1,
    };
  }

  private gerarNumeroAleatorio(min: number, max: number) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  private async gerarProtocoloAnual(
    tx: Prisma.TransactionClient,
    dataBase: Date,
  ) {
    const ano = this.getAnoProtocolo(dataBase);
    const grupos = await tx.solicitacao.groupBy({
      by: ['protocoloDigitos'],
      where: {
        protocoloAno: ano,
        protocoloNumero: { not: null },
        protocoloDigitos: { not: null },
      },
      _count: {
        _all: true,
      },
    });

    const usadosPorDigitos = new Map<number, number>();
    grupos.forEach((grupo) => {
      if (typeof grupo.protocoloDigitos === 'number') {
        usadosPorDigitos.set(grupo.protocoloDigitos, grupo._count._all);
      }
    });

    let digitos = this.PROTOCOLO_DIGITOS_INICIAIS;
    while (
      (usadosPorDigitos.get(digitos) || 0) >=
      this.getCapacidadePorDigitos(digitos)
    ) {
      digitos += 1;
    }

    const { min, max } = this.getIntervaloPorDigitos(digitos);

    for (let tentativa = 0; tentativa < this.PROTOCOLO_TENTATIVAS; tentativa += 1) {
      const numero = String(this.gerarNumeroAleatorio(min, max));
      const existente = await tx.solicitacao.findFirst({
        where: {
          protocoloAno: ano,
          protocoloNumero: numero,
        },
        select: { id: true },
      });

      if (!existente) {
        return {
          ano,
          digitos,
          numero,
        };
      }
    }

    throw new BadRequestException(
      'Nao foi possivel gerar um protocolo unico. Tente novamente.',
    );
  }

  private async getAlunoAcessivel(user: AuthUser, alunoId: string) {
    const userId = this.getUserId(user);
    const schoolId = this.getSchoolId(user);

    const baseWhere = {
      id: alunoId,
      schoolId,
    };

    if (
      user.role === UserRole.SECRETARIA ||
      user.role === UserRole.ADMIN_ESCOLA ||
      user.role === UserRole.GESTOR ||
      user.role === UserRole.SUPERUSUARIO
    ) {
      return this.prisma.aluno.findFirst({
        where: baseWhere,
        include: { turma: true },
      });
    }

    if (user.role === UserRole.PROFESSOR) {
      return this.prisma.aluno.findFirst({
        where: {
          ...baseWhere,
          turma: {
            professores: {
              some: { professorId: userId },
            },
          },
        },
        include: { turma: true },
      });
    }

    if (user.role === UserRole.RESPONSAVEL) {
      return this.prisma.aluno.findFirst({
        where: {
          ...baseWhere,
          responsaveis: {
            some: { responsavelId: userId },
          },
        },
        include: { turma: true },
      });
    }

    return null;
  }

  async listarAlunos(user: AuthUser) {
    this.assertCanUse(user);
    const userId = this.getUserId(user);
    const schoolId = this.getSchoolId(user);

    const where =
      user.role === UserRole.SECRETARIA ||
      user.role === UserRole.ADMIN_ESCOLA ||
      user.role === UserRole.GESTOR ||
      user.role === UserRole.SUPERUSUARIO
        ? { schoolId }
        : user.role === UserRole.PROFESSOR
          ? {
              schoolId,
              turma: {
                professores: {
                  some: { professorId: userId },
                },
              },
            }
          : {
              schoolId,
              responsaveis: {
                some: { responsavelId: userId },
              },
            };

    const alunos = await this.prisma.aluno.findMany({
      where,
      include: {
        turma: true,
      },
      orderBy: [{ name: 'asc' }],
    });

    return alunos.map((aluno) => ({
      id: aluno.id,
      name: aluno.name,
      matricula: aluno.matricula,
      turma: aluno.turma
        ? {
            id: aluno.turma.id,
            name: aluno.turma.name,
            turno: aluno.turma.turno,
          }
        : null,
    }));
  }

  async listar(user: AuthUser) {
    this.assertCanUse(user);
    const userId = this.getUserId(user);
    const schoolId = this.getSchoolId(user);

    const where = this.canAtenderSolicitacoes(user.role)
      ? { schoolId }
      : { schoolId, solicitanteId: userId };

    return this.prisma.solicitacao.findMany({
      where,
      include: {
        aluno: { include: { turma: true } },
        solicitante: {
          select: { id: true, name: true, email: true, role: true },
        },
        recebidoPor: {
          select: { id: true, name: true, role: true },
        },
        respondidoPor: {
          select: { id: true, name: true, role: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async criar(
    user: AuthUser,
    data: {
      alunoId?: string;
      tipo?: SolicitacaoTipo;
      especificacao?: string;
      descricao?: string;
    },
  ) {
    this.assertCanUse(user);
    const userId = this.getUserId(user);
    const schoolId = this.getSchoolId(user);
    const alunoId = String(data.alunoId || '').trim();
    const descricao = String(data.descricao || '').trim();
    const especificacao = String(data.especificacao || '').trim();
    const tipo = data.tipo;

    if (!tipo) throw new BadRequestException('Selecione o tipo de solicitacao.');
    if (!descricao) throw new BadRequestException('Descreva a solicitacao.');

    let alunoConnectId: string | undefined;

    if (this.podeSelecionarAluno(user.role) && !alunoId) {
      throw new BadRequestException('Selecione o aluno.');
    }

    if (alunoId) {
      const aluno = await this.getAlunoAcessivel(user, alunoId);
      if (!aluno) {
        throw new ForbiddenException('Sem permissao para solicitar por este aluno.');
      }
      alunoConnectId = aluno.id;
    }

    for (let tentativa = 0; tentativa < this.PROTOCOLO_TENTATIVAS; tentativa += 1) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          const agora = new Date();
          const protocolo = await this.gerarProtocoloAnual(tx, agora);

          return tx.solicitacao.create({
            data: {
              schoolId,
              alunoId: alunoConnectId,
              solicitanteId: userId,
              protocoloAno: protocolo.ano,
              protocoloDigitos: protocolo.digitos,
              protocoloNumero: protocolo.numero,
              tipo,
              especificacao: especificacao || null,
              descricao,
              createdAt: agora,
            },
            include: {
              aluno: { include: { turma: true } },
              solicitante: {
                select: { id: true, name: true, email: true, role: true },
              },
            },
          });
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          continue;
        }

        throw error;
      }
    }

    throw new BadRequestException(
      'Nao foi possivel concluir a solicitacao com protocolo unico.',
    );
  }

  async atualizar(
    user: AuthUser,
    id: string,
    data: {
      alunoId?: string;
      tipo?: SolicitacaoTipo;
      especificacao?: string;
      descricao?: string;
    },
  ) {
    const solicitacao = await this.getSolicitacaoAcessivel(user, id);
    const alunoId = String(data.alunoId || '').trim();
    const descricao = String(data.descricao || '').trim();
    const especificacao = String(data.especificacao || '').trim();
    const tipo = data.tipo;

    if (!tipo) throw new BadRequestException('Selecione o tipo de solicitacao.');
    if (!descricao) throw new BadRequestException('Descreva a solicitacao.');

    let alunoConnectId: string | null | undefined = solicitacao.alunoId;

    if (this.podeSelecionarAluno(user.role)) {
      if (!alunoId) {
        throw new BadRequestException('Selecione o aluno.');
      }

      const aluno = await this.getAlunoAcessivel(user, alunoId);
      if (!aluno) {
        throw new ForbiddenException('Sem permissao para solicitar por este aluno.');
      }
      alunoConnectId = aluno.id;
    }

    return this.prisma.solicitacao.update({
      where: { id },
      data: {
        alunoId: alunoConnectId,
        tipo,
        especificacao: especificacao || null,
        descricao,
        status:
          solicitacao.status === SolicitacaoStatus.RESPONDIDA
            ? SolicitacaoStatus.RESPONDIDA
            : SolicitacaoStatus.ENVIADA,
        resposta:
          solicitacao.status === SolicitacaoStatus.RESPONDIDA
            ? solicitacao.resposta
            : null,
        anexoUrl:
          solicitacao.status === SolicitacaoStatus.RESPONDIDA
            ? solicitacao.anexoUrl
            : null,
        anexoNome:
          solicitacao.status === SolicitacaoStatus.RESPONDIDA
            ? solicitacao.anexoNome
            : null,
        anexoMime:
          solicitacao.status === SolicitacaoStatus.RESPONDIDA
            ? solicitacao.anexoMime
            : null,
        receivedAt:
          solicitacao.status === SolicitacaoStatus.RESPONDIDA
            ? solicitacao.receivedAt
            : null,
        recebidoPorId:
          solicitacao.status === SolicitacaoStatus.RESPONDIDA
            ? solicitacao.recebidoPorId
            : null,
        respondedAt:
          solicitacao.status === SolicitacaoStatus.RESPONDIDA
            ? solicitacao.respondedAt
            : null,
        respondidoPorId:
          solicitacao.status === SolicitacaoStatus.RESPONDIDA
            ? solicitacao.respondidoPorId
            : null,
      },
      include: {
        aluno: { include: { turma: true } },
        solicitante: {
          select: { id: true, name: true, email: true, role: true },
        },
      },
    });
  }

  async excluir(user: AuthUser, id: string) {
    await this.getSolicitacaoAcessivel(user, id);
    await this.prisma.solicitacao.delete({
      where: { id },
    });

    return { success: true };
  }

  async marcarRecebida(user: AuthUser, id: string) {
    if (!this.canAtenderSolicitacoes(user.role)) {
      throw new ForbiddenException(
        'Apenas a secretaria ou a diretoria podem receber solicitacoes.',
      );
    }

    const userId = this.getUserId(user);
    const schoolId = this.getSchoolId(user);
    const solicitacao = await this.prisma.solicitacao.findFirst({
      where: { id, schoolId },
    });

    if (!solicitacao) throw new NotFoundException('Solicitacao nao encontrada.');

    return this.prisma.solicitacao.update({
      where: { id },
      data: {
        status:
          solicitacao.status === SolicitacaoStatus.RESPONDIDA
            ? SolicitacaoStatus.RESPONDIDA
            : SolicitacaoStatus.RECEBIDA,
        recebidoPorId: userId,
        receivedAt: new Date(),
      },
    });
  }

  async responder(
    user: AuthUser,
    id: string,
    data: {
      resposta?: string;
      anexoUrl?: string;
      anexoNome?: string;
      anexoMime?: string;
    },
  ) {
    if (!this.canAtenderSolicitacoes(user.role)) {
      throw new ForbiddenException(
        'Apenas a secretaria ou a diretoria podem responder solicitacoes.',
      );
    }

    const userId = this.getUserId(user);
    const schoolId = this.getSchoolId(user);
    const resposta = String(data.resposta || '').trim();

    if (!resposta && !data.anexoUrl) {
      throw new BadRequestException('Informe uma resposta ou anexe um arquivo.');
    }

    const solicitacao = await this.prisma.solicitacao.findFirst({
      where: { id, schoolId },
    });

    if (!solicitacao) throw new NotFoundException('Solicitacao nao encontrada.');

    return this.prisma.solicitacao.update({
      where: { id },
      data: {
        status: SolicitacaoStatus.RESPONDIDA,
        resposta: resposta || solicitacao.resposta,
        anexoUrl: data.anexoUrl || solicitacao.anexoUrl,
        anexoNome: data.anexoNome || solicitacao.anexoNome,
        anexoMime: data.anexoMime || solicitacao.anexoMime,
        respondidoPorId: userId,
        respondedAt: new Date(),
        recebidoPorId: solicitacao.recebidoPorId || userId,
        receivedAt: solicitacao.receivedAt || new Date(),
      },
    });
  }
}
