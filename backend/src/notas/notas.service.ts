import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  PeriodoAvaliacao,
  TipoAtividadeNota,
  TipoComposicaoNota,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type TipoAvaliacaoSchool = 'BIMESTRAL' | 'TRIMESTRAL';

@Injectable()
export class NotasService {
  constructor(private readonly prisma: PrismaService) {}

  private isNotaAutomaticaOnline(item: any) {
    const observacao = String(item?.observacao || '').toLowerCase();

    return (
      (observacao.includes('automaticamente') && observacao.includes('online')) ||
      (Array.isArray(item?.atividadeModelo?.avaliacoesOnlineOrigem) &&
        item.atividadeModelo.avaliacoesOnlineOrigem.length > 0)
    );
  }

  private async consolidarNotasAutomaticasDuplicadas(itens: any[]) {
    const grupos = new Map<string, any[]>();

    for (const item of itens) {
      if (!this.isNotaAutomaticaOnline(item)) continue;

      const origemId = item.atividadeModelo?.avaliacoesOnlineOrigem?.[0]?.id;
      const chaveOrigem =
        origemId ||
        [
          'legacy-online',
          item.alunoId,
          item.turmaProfessorId,
          item.periodo,
          item.turmaProfessor?.disciplina,
          item.atividadeModelo?.titulo,
          item.atividadeModelo?.tipoAtividade,
        ].join('|');

      const grupo = grupos.get(chaveOrigem) || [];
      grupo.push(item);
      grupos.set(chaveOrigem, grupo);
    }

    const idsParaRemover: string[] = [];

    for (const grupo of grupos.values()) {
      if (grupo.length <= 1) continue;

      const ordenados = grupo.slice().sort((a, b) => {
        const dataA = new Date(a.updatedAt || a.createdAt || 0).getTime();
        const dataB = new Date(b.updatedAt || b.createdAt || 0).getTime();

        return dataB - dataA || String(b.id).localeCompare(String(a.id));
      });

      idsParaRemover.push(...ordenados.slice(1).map((item) => item.id));
    }

    if (idsParaRemover.length) {
      await this.prisma.avaliacaoItem.deleteMany({
        where: {
          id: {
            in: idsParaRemover,
          },
        },
      });
    }

    const idsRemovidos = new Set(idsParaRemover);
    return itens.filter((item) => !idsRemovidos.has(item.id));
  }
  private validarPeriodoPorTipoAvaliacao(
    tipoAvaliacao: TipoAvaliacaoSchool,
    periodo: PeriodoAvaliacao,
  ) {
    if (
      tipoAvaliacao === 'TRIMESTRAL' &&
      periodo === PeriodoAvaliacao.QUARTO
    ) {
      throw new BadRequestException(
        'Escolas trimestrais não possuem quarto período.',
      );
    }
  }

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
            school: {
              select: {
                id: true,
                tipoAvaliacao: true,
                mediaAprovacao: true,
              },
            },
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

  private normalizarNumero(valor: number, campo: string) {
    const numero = Number(valor);

    if (Number.isNaN(numero)) {
      throw new BadRequestException(`O campo ${campo} precisa ser numérico.`);
    }

    return numero;
  }

  private calcularNotaConsiderada(
    nota: number,
    notaRecuperacao?: number | null,
  ) {
    if (typeof notaRecuperacao !== 'number' || Number.isNaN(notaRecuperacao)) {
      return Number(nota.toFixed(2));
    }

    return Number(Math.max(nota, notaRecuperacao).toFixed(2));
  }

  private calcularNotaFinal(
    itens: Array<{ notaConsiderada: number }>,
    tipoComposicao: TipoComposicaoNota,
  ) {
    if (!itens.length) {
      return 0;
    }

    const soma = itens.reduce((acc, item) => acc + item.notaConsiderada, 0);

    if (tipoComposicao === 'SOMATORIO') {
      return Number(soma.toFixed(2));
    }

    return Number((soma / itens.length).toFixed(2));
  }

  private async buscarAlunoDoUsuario(data: {
    userId: string;
    userSchoolId?: string | null;
  }) {
    if (!data.userSchoolId) {
      throw new ForbiddenException('Aluno sem escola vinculada.');
    }

    const usuario = await this.prisma.user.findUnique({
      where: {
        id: data.userId,
      },
      select: {
        id: true,
        name: true,
        role: true,
        schoolId: true,
      },
    });

    const nomeUsuario = String(usuario?.name || '').trim();

    if (!usuario || usuario.role !== UserRole.ALUNO) {
      throw new NotFoundException(
        'Usuário aluno não encontrado para consulta de notas.',
      );
    }

    const aluno = await this.prisma.aluno.findFirst({
      where: {
        schoolId: data.userSchoolId,
        userId: usuario.id,
      },
      select: {
        id: true,
        status: true,
      },
    });

    if (!aluno) {
      throw new NotFoundException(
        `Registro de aluno não encontrado para o usuário "${nomeUsuario}".`,
      );
    }

    if (String(aluno.status || '').toUpperCase() !== 'ATIVO') {
      throw new ForbiddenException('Aluno inativo não pode consultar notas.');
    }

    return aluno;
  }

  async listarMinhasDisciplinas(data: {
    userId: string;
    userRole: UserRole;
    userSchoolId?: string | null;
  }) {
    if (data.userRole !== UserRole.PROFESSOR) {
      throw new ForbiddenException(
        'Somente professores podem acessar esta listagem.',
      );
    }

    if (!data.userSchoolId) {
      throw new ForbiddenException('Professor sem escola vinculada.');
    }

    return this.prisma.turmaProfessor.findMany({
      where: {
        professorId: data.userId,
        turma: {
          schoolId: data.userSchoolId,
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
            school: {
              select: {
                tipoAvaliacao: true,
              },
            },
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

  async listarAlunosDaDisciplinaParaLancamento(data: {
    userId: string;
    userRole: UserRole;
    userSchoolId?: string | null;
    turmaProfessorId: string;
    periodo: PeriodoAvaliacao;
  }) {
    if (data.userRole !== UserRole.PROFESSOR) {
      throw new ForbiddenException(
        'Somente professores podem acessar esta listagem.',
      );
    }

    if (!data.userSchoolId) {
      throw new ForbiddenException('Professor sem escola vinculada.');
    }

    const turmaProfessor = await this.buscarTurmaProfessorValido(
      data.turmaProfessorId,
      data.userSchoolId,
    );

    if (turmaProfessor.professorId !== data.userId) {
      throw new ForbiddenException(
        'Você só pode acessar as disciplinas vinculadas a você.',
      );
    }

    this.validarPeriodoPorTipoAvaliacao(
      turmaProfessor.turma.school.tipoAvaliacao,
      data.periodo,
    );

    const alunos = await this.prisma.aluno.findMany({
      where: {
        turmaId: turmaProfessor.turmaId,
        schoolId: data.userSchoolId,
      },
      select: {
        id: true,
        name: true,
        matricula: true,
        status: true,
        turmaId: true,
      },
      orderBy: {
        name: 'asc',
      },
    });

    const alunoIds = alunos.map((aluno) => aluno.id);

    const atividadesModelos =
      await this.prisma.atividadeAvaliacaoModelo.findMany({
        where: {
          turmaProfessorId: turmaProfessor.id,
          periodo: data.periodo,
          professorId: data.userId,
          schoolId: data.userSchoolId,
        },
        orderBy: [{ ordem: 'asc' }, { createdAt: 'asc' }],
      });

    const itens = await this.prisma.avaliacaoItem.findMany({
      where: {
        turmaProfessorId: turmaProfessor.id,
        periodo: data.periodo,
        alunoId: {
          in: alunoIds,
        },
        professorId: data.userId,
        schoolId: data.userSchoolId,
      },
      include: {
        atividadeModelo: {
          select: {
            id: true,
            titulo: true,
            tipoAtividade: true,
            tipoComposicao: true,
            valorMaximo: true,
            ordem: true,
            permiteRecuperacao: true,
            enviadoBoletim: true,
          },
        },
      },
      orderBy: [
        {
          atividadeModelo: {
            ordem: 'asc',
          },
        },
        {
          createdAt: 'asc',
        },
      ],
    });

    const notasBoletim = await this.prisma.notaBoletim.findMany({
      where: {
        turmaProfessorId: turmaProfessor.id,
        periodo: data.periodo,
        alunoId: {
          in: alunoIds,
        },
        professorId: data.userId,
        schoolId: data.userSchoolId,
      },
      select: {
        id: true,
        alunoId: true,
        tipoComposicao: true,
        notaFinal: true,
        enviadoBoletim: true,
        observacao: true,
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
        tipoAvaliacao: turmaProfessor.turma.school.tipoAvaliacao,
      },
      alunos,
      atividadesModelos: atividadesModelos.map((item) => ({
        id: item.id,
        periodo: item.periodo,
        tipoComposicao: item.tipoComposicao,
        tipoAtividade: item.tipoAtividade,
        titulo: item.titulo,
        valorMaximo: Number(item.valorMaximo),
        ordem: item.ordem,
        permiteRecuperacao: item.permiteRecuperacao,
        enviadoBoletim: item.enviadoBoletim,
      })),
      itens: itens.map((item) => ({
        id: item.id,
        alunoId: item.alunoId,
        atividadeModeloId: item.atividadeModeloId,
        periodo: item.periodo,
        nota: Number(item.nota),
        notaRecuperacao:
          item.notaRecuperacao === null ? null : Number(item.notaRecuperacao),
        notaConsiderada: Number(item.notaConsiderada),
        observacao: item.observacao,
        enviadoBoletim: item.enviadoBoletim,
        atividadeModelo: {
          id: item.atividadeModelo.id,
          titulo: item.atividadeModelo.titulo,
          tipoAtividade: item.atividadeModelo.tipoAtividade,
          tipoComposicao: item.atividadeModelo.tipoComposicao,
          valorMaximo: Number(item.atividadeModelo.valorMaximo),
          ordem: item.atividadeModelo.ordem,
          permiteRecuperacao: item.atividadeModelo.permiteRecuperacao,
          enviadoBoletim: item.atividadeModelo.enviadoBoletim,
        },
      })),
      notasBoletim: notasBoletim.map((item) => ({
        ...item,
        notaFinal: Number(item.notaFinal),
      })),
    };
  }

  async salvarRascunhoNotasEmMassa(data: {
    userId: string;
    userRole: UserRole;
    userSchoolId?: string | null;
    turmaProfessorId: string;
    periodo: PeriodoAvaliacao;
    tipoComposicao: TipoComposicaoNota;
    observacaoGeral?: string;
    atividades: Array<{
      ordem: number;
      tipoAtividade: TipoAtividadeNota;
      titulo: string;
      valorMaximo: number;
      permiteRecuperacao: boolean;
    }>;
    lancamentos: Array<{
      alunoId: string;
      observacao?: string;
      itens: Array<{
        ordem: number;
        nota: number;
        notaRecuperacao?: number | null;
        observacao?: string;
      }>;
    }>;
  }) {
    if (data.userRole !== UserRole.PROFESSOR) {
      throw new ForbiddenException('Somente professores podem salvar notas.');
    }

    if (!data.userSchoolId) {
      throw new ForbiddenException('Professor sem escola vinculada.');
    }

    if (!data.atividades.length) {
      throw new BadRequestException(
        'Informe pelo menos uma atividade para salvar.',
      );
    }

    if (!data.lancamentos.length) {
      throw new BadRequestException(
        'Informe pelo menos um aluno para lançar notas.',
      );
    }

    const turmaProfessor = await this.buscarTurmaProfessorValido(
      data.turmaProfessorId,
      data.userSchoolId,
    );

    if (turmaProfessor.professorId !== data.userId) {
      throw new ForbiddenException(
        'Você só pode lançar notas da sua própria disciplina.',
      );
    }

    this.validarPeriodoPorTipoAvaliacao(
      turmaProfessor.turma.school.tipoAvaliacao,
      data.periodo,
    );

    const alunos = await this.prisma.aluno.findMany({
      where: {
        turmaId: turmaProfessor.turmaId,
        schoolId: data.userSchoolId,
      },
      select: {
        id: true,
        name: true,
        turmaId: true,
      },
    });

    const alunosMap = new Map(alunos.map((aluno) => [aluno.id, aluno]));

    const ordens = new Set<number>();

    for (const atividade of data.atividades) {
      const titulo = atividade.titulo.trim();

      if (!titulo) {
        throw new BadRequestException(
          'Toda atividade precisa ter um título.',
        );
      }

      if (ordens.has(atividade.ordem)) {
        throw new BadRequestException(
          'Cada atividade precisa ter uma ordem única.',
        );
      }

      ordens.add(atividade.ordem);

      const valorMaximo = this.normalizarNumero(
        atividade.valorMaximo,
        `valorMaximo da atividade ${atividade.titulo}`,
      );

      if (valorMaximo <= 0) {
        throw new BadRequestException(
          'O valor máximo da atividade precisa ser maior que zero.',
        );
      }
    }

    for (const lancamento of data.lancamentos) {
      const aluno = alunosMap.get(lancamento.alunoId);

      if (!aluno) {
        throw new BadRequestException(
          `Aluno inválido informado no lançamento: ${lancamento.alunoId}`,
        );
      }

      for (const item of lancamento.itens) {
        if (!ordens.has(item.ordem)) {
          throw new BadRequestException(
            'Existe lançamento vinculado a uma atividade inexistente.',
          );
        }

        const atividade = data.atividades.find(
          (atividadeAtual) => atividadeAtual.ordem === item.ordem,
        );

        if (!atividade) {
          throw new BadRequestException(
            'Atividade não encontrada para um dos lançamentos.',
          );
        }

        const nota = this.normalizarNumero(
          item.nota,
          `nota da atividade ${atividade.titulo}`,
        );
        const valorMaximo = Number(atividade.valorMaximo);

        if (nota < 0 || nota > valorMaximo) {
          throw new BadRequestException(
            `A nota da atividade "${atividade.titulo}" deve estar entre 0 e ${valorMaximo}.`,
          );
        }

        if (atividade.permiteRecuperacao) {
          if (
            item.notaRecuperacao !== undefined &&
            item.notaRecuperacao !== null
          ) {
            const notaRecuperacao = this.normalizarNumero(
              item.notaRecuperacao,
              `nota de recuperação da atividade ${atividade.titulo}`,
            );

            if (notaRecuperacao < 0 || notaRecuperacao > valorMaximo) {
              throw new BadRequestException(
                `A recuperação da atividade "${atividade.titulo}" deve estar entre 0 e ${valorMaximo}.`,
              );
            }
          }
        }
      }
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.avaliacaoItem.deleteMany({
        where: {
          turmaProfessorId: data.turmaProfessorId,
          periodo: data.periodo,
          professorId: data.userId,
          schoolId: data.userSchoolId!,
          enviadoBoletim: false,
        },
      });

      await tx.atividadeAvaliacaoModelo.deleteMany({
        where: {
          turmaProfessorId: data.turmaProfessorId,
          periodo: data.periodo,
          professorId: data.userId,
          schoolId: data.userSchoolId!,
          enviadoBoletim: false,
        },
      });

      const atividadesCriadas = await Promise.all(
        data.atividades
          .sort((a, b) => a.ordem - b.ordem)
          .map((atividade) =>
            tx.atividadeAvaliacaoModelo.create({
              data: {
                turmaProfessorId: data.turmaProfessorId,
                schoolId: data.userSchoolId!,
                professorId: data.userId,
                periodo: data.periodo,
                tipoComposicao: data.tipoComposicao,
                tipoAtividade: atividade.tipoAtividade,
                titulo: atividade.titulo.trim(),
                valorMaximo: Number(atividade.valorMaximo),
                ordem: atividade.ordem,
                permiteRecuperacao: atividade.permiteRecuperacao,
                enviadoBoletim: false,
              },
            }),
          ),
      );

      const atividadesMap = new Map(
        atividadesCriadas.map((atividade) => [atividade.ordem, atividade]),
      );

      const itensCriados: Array<{
        id: string;
        alunoId: string;
        atividadeModeloId: string;
        nota: number;
        notaRecuperacao: number | null;
        notaConsiderada: number;
        observacao: string | null;
        enviadoBoletim: boolean;
      }> = [];

      const notasBoletimCriadas: Array<{
        alunoId: string;
        notaFinal: number;
        tipoComposicao: TipoComposicaoNota;
        enviadoBoletim: boolean;
        observacao: string | null;
      }> = [];

      for (const lancamento of data.lancamentos) {
        const itensDoAlunoOrdenados = lancamento.itens
          .slice()
          .sort((a, b) => a.ordem - b.ordem);

        const itensNormalizados: Array<{
          ordem: number;
          nota: number;
          notaRecuperacao: number | null;
          notaConsiderada: number;
          observacao: string | null;
        }> = [];

        for (const item of itensDoAlunoOrdenados) {
          const atividadeModelo = atividadesMap.get(item.ordem);

          if (!atividadeModelo) {
            throw new BadRequestException(
              'Atividade criada não encontrada para salvar os itens.',
            );
          }

          const nota = Number(Number(item.nota).toFixed(2));
          const notaRecuperacao =
            atividadeModelo.permiteRecuperacao &&
            item.notaRecuperacao !== undefined &&
            item.notaRecuperacao !== null
              ? Number(Number(item.notaRecuperacao).toFixed(2))
              : null;

          const notaConsiderada = this.calcularNotaConsiderada(
            nota,
            notaRecuperacao,
          );

          const criado = await tx.avaliacaoItem.create({
            data: {
              atividadeModeloId: atividadeModelo.id,
              alunoId: lancamento.alunoId,
              turmaProfessorId: data.turmaProfessorId,
              schoolId: data.userSchoolId!,
              professorId: data.userId,
              periodo: data.periodo,
              nota,
              notaRecuperacao,
              notaConsiderada,
              observacao: item.observacao?.trim() || null,
              enviadoBoletim: false,
            },
          });

          itensCriados.push({
            id: criado.id,
            alunoId: criado.alunoId,
            atividadeModeloId: criado.atividadeModeloId,
            nota: Number(criado.nota),
            notaRecuperacao:
              criado.notaRecuperacao === null
                ? null
                : Number(criado.notaRecuperacao),
            notaConsiderada: Number(criado.notaConsiderada),
            observacao: criado.observacao,
            enviadoBoletim: criado.enviadoBoletim,
          });

          itensNormalizados.push({
            ordem: item.ordem,
            nota,
            notaRecuperacao,
            notaConsiderada,
            observacao: item.observacao?.trim() || null,
          });
        }

        const notaFinal = this.calcularNotaFinal(
          itensNormalizados.map((item) => ({
            notaConsiderada: item.notaConsiderada,
          })),
          data.tipoComposicao,
        );

        const notaBoletim = await tx.notaBoletim.upsert({
          where: {
            alunoId_turmaProfessorId_periodo: {
              alunoId: lancamento.alunoId,
              turmaProfessorId: data.turmaProfessorId,
              periodo: data.periodo,
            },
          },
          update: {
            tipoComposicao: data.tipoComposicao,
            notaFinal,
            observacao:
              lancamento.observacao?.trim() ||
              data.observacaoGeral?.trim() ||
              null,
            professorId: data.userId,
            schoolId: data.userSchoolId!,
            enviadoBoletim: false,
          },
          create: {
            alunoId: lancamento.alunoId,
            turmaProfessorId: data.turmaProfessorId,
            schoolId: data.userSchoolId!,
            professorId: data.userId,
            periodo: data.periodo,
            tipoComposicao: data.tipoComposicao,
            notaFinal,
            observacao:
              lancamento.observacao?.trim() ||
              data.observacaoGeral?.trim() ||
              null,
            enviadoBoletim: false,
          },
        });

        notasBoletimCriadas.push({
          alunoId: notaBoletim.alunoId,
          notaFinal: Number(notaBoletim.notaFinal),
          tipoComposicao: notaBoletim.tipoComposicao,
          enviadoBoletim: notaBoletim.enviadoBoletim,
          observacao: notaBoletim.observacao,
        });
      }

      return {
        message: 'Rascunho das notas salvo com sucesso.',
        atividadesModelos: atividadesCriadas.map((item) => ({
          id: item.id,
          ordem: item.ordem,
          titulo: item.titulo,
          tipoAtividade: item.tipoAtividade,
          tipoComposicao: item.tipoComposicao,
          valorMaximo: Number(item.valorMaximo),
          permiteRecuperacao: item.permiteRecuperacao,
          enviadoBoletim: item.enviadoBoletim,
        })),
        itens: itensCriados,
        notasBoletim: notasBoletimCriadas,
      };
    });
  }

  async enviarNotasParaBoletimEmMassa(data: {
    userId: string;
    userRole: UserRole;
    userSchoolId?: string | null;
    turmaProfessorId: string;
    periodo: PeriodoAvaliacao;
  }) {
    if (data.userRole !== UserRole.PROFESSOR) {
      throw new ForbiddenException('Somente professores podem enviar notas.');
    }

    if (!data.userSchoolId) {
      throw new ForbiddenException('Professor sem escola vinculada.');
    }

    const turmaProfessor = await this.buscarTurmaProfessorValido(
      data.turmaProfessorId,
      data.userSchoolId,
    );

    if (turmaProfessor.professorId !== data.userId) {
      throw new ForbiddenException(
        'Você só pode enviar as notas da sua própria disciplina.',
      );
    }

    const atividadesExistentes =
      await this.prisma.atividadeAvaliacaoModelo.count({
        where: {
          turmaProfessorId: data.turmaProfessorId,
          periodo: data.periodo,
          professorId: data.userId,
          schoolId: data.userSchoolId,
        },
      });

    const notasBoletimExistentes = await this.prisma.notaBoletim.count({
      where: {
        turmaProfessorId: data.turmaProfessorId,
        periodo: data.periodo,
        professorId: data.userId,
        schoolId: data.userSchoolId,
      },
    });

    if (!atividadesExistentes || !notasBoletimExistentes) {
      throw new NotFoundException(
        'Nenhum rascunho de notas foi encontrado para envio.',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.atividadeAvaliacaoModelo.updateMany({
        where: {
          turmaProfessorId: data.turmaProfessorId,
          periodo: data.periodo,
          professorId: data.userId,
          schoolId: data.userSchoolId!,
        },
        data: {
          enviadoBoletim: true,
        },
      });

      await tx.avaliacaoItem.updateMany({
        where: {
          turmaProfessorId: data.turmaProfessorId,
          periodo: data.periodo,
          professorId: data.userId,
          schoolId: data.userSchoolId!,
        },
        data: {
          enviadoBoletim: true,
        },
      });

      await tx.notaBoletim.updateMany({
        where: {
          turmaProfessorId: data.turmaProfessorId,
          periodo: data.periodo,
          professorId: data.userId,
          schoolId: data.userSchoolId!,
        },
        data: {
          enviadoBoletim: true,
        },
      });
    });

    return {
      message: 'Notas enviadas ao boletim com sucesso.',
    };
  }

    async cancelarEnvioNotasParaBoletimEmMassa(data: {
    userId: string;
    userRole: UserRole;
    userSchoolId?: string | null;
    turmaProfessorId: string;
    periodo: PeriodoAvaliacao;
  }) {
    if (data.userRole !== UserRole.PROFESSOR) {
      throw new ForbiddenException(
        'Somente professores podem cancelar o envio das notas.',
      );
    }

    if (!data.userSchoolId) {
      throw new ForbiddenException('Professor sem escola vinculada.');
    }

    const turmaProfessor = await this.buscarTurmaProfessorValido(
      data.turmaProfessorId,
      data.userSchoolId,
    );

    if (turmaProfessor.professorId !== data.userId) {
      throw new ForbiddenException(
        'Você só pode cancelar o envio das notas da sua própria disciplina.',
      );
    }

    const notasEnviadas = await this.prisma.notaBoletim.count({
      where: {
        turmaProfessorId: data.turmaProfessorId,
        periodo: data.periodo,
        professorId: data.userId,
        schoolId: data.userSchoolId,
        enviadoBoletim: true,
      },
    });

    if (!notasEnviadas) {
      throw new NotFoundException(
        'Nenhuma nota enviada ao boletim foi encontrada para cancelamento.',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.atividadeAvaliacaoModelo.updateMany({
        where: {
          turmaProfessorId: data.turmaProfessorId,
          periodo: data.periodo,
          professorId: data.userId,
          schoolId: data.userSchoolId!,
        },
        data: {
          enviadoBoletim: false,
        },
      });

      await tx.avaliacaoItem.updateMany({
        where: {
          turmaProfessorId: data.turmaProfessorId,
          periodo: data.periodo,
          professorId: data.userId,
          schoolId: data.userSchoolId!,
        },
        data: {
          enviadoBoletim: false,
        },
      });

      await tx.notaBoletim.updateMany({
        where: {
          turmaProfessorId: data.turmaProfessorId,
          periodo: data.periodo,
          professorId: data.userId,
          schoolId: data.userSchoolId!,
        },
        data: {
          enviadoBoletim: false,
        },
      });
    });

    return {
      message:
        'Envio ao boletim cancelado com sucesso. As notas voltaram para edição do professor.',
    };
  }

  async visualizarBoletimAluno(data: {
    userId?: string;
    userRole: UserRole;
    userSchoolId?: string | null;
    alunoId: string;
  }) {
    if (
      data.userRole !== UserRole.ADMIN_ESCOLA &&
      data.userRole !== UserRole.GESTOR &&
      data.userRole !== UserRole.SECRETARIA &&
      data.userRole !== UserRole.SUPERUSUARIO &&
      data.userRole !== UserRole.RESPONSAVEL &&
      data.userRole !== UserRole.ALUNO
    ) {
      throw new ForbiddenException('Sem permissão para visualizar boletim.');
    }

    const whereAluno =
      data.userRole === UserRole.SUPERUSUARIO
        ? { id: data.alunoId }
        : { id: data.alunoId, schoolId: data.userSchoolId || '' };

    const aluno = await this.prisma.aluno.findFirst({
      where: whereAluno,
      include: {
        turma: {
          include: {
            school: {
              select: {
                id: true,
                name: true,
                tipoAvaliacao: true,
                mediaAprovacao: true,
              },
            },
          },
        },
      },
    });

    if (!aluno) {
      throw new NotFoundException('Aluno não encontrado.');
    }

    if (data.userRole === UserRole.ALUNO && aluno.userId !== data.userId) {
      throw new ForbiddenException('Aluno sem permissão para visualizar este boletim.');
    }

    if (data.userRole === UserRole.RESPONSAVEL) {
      const vinculo = await this.prisma.alunoResponsavel.findFirst({
        where: {
          alunoId: aluno.id,
          responsavelId: data.userId || '',
        },
        select: {
          id: true,
        },
      });

      if (!vinculo) {
        throw new ForbiddenException('Responsável sem permissão para visualizar este boletim.');
      }
    }

    const notas = await this.prisma.notaBoletim.findMany({
      where: {
        alunoId: aluno.id,
        enviadoBoletim: true,
      },
      include: {
        turmaProfessor: {
          select: {
            id: true,
            disciplina: true,
            professor: {
              select: {
                id: true,
                name: true,
              },
            },
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
          periodo: 'asc',
        },
      ],
    });

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

    const periodosPermitidos =
      aluno.turma.school.tipoAvaliacao === 'TRIMESTRAL'
        ? ['PRIMEIRO', 'SEGUNDO', 'TERCEIRO']
        : ['PRIMEIRO', 'SEGUNDO', 'TERCEIRO', 'QUARTO'];

    const boletimPorDisciplina: Record<
      string,
      {
        turmaProfessorId: string;
        disciplina: string;
        professor?: string;
        notas: Record<string, number | null>;
        media: number | null;
        totalPresencas: number;
        totalFaltas: number;
        situacao: string;
      }
    > = {};

    for (const nota of notas) {
      const disciplina = nota.turmaProfessor.disciplina;

      if (!boletimPorDisciplina[disciplina]) {
        const notasBase: Record<string, number | null> = {};

        for (const periodo of periodosPermitidos) {
          notasBase[periodo] = null;
        }

        boletimPorDisciplina[disciplina] = {
          turmaProfessorId: nota.turmaProfessor.id,
          disciplina,
          professor: nota.turmaProfessor.professor?.name,
          notas: notasBase,
          media: null,
          totalPresencas: 0,
          totalFaltas: 0,
          situacao: 'Cursando',
        };
      }

      boletimPorDisciplina[disciplina].notas[nota.periodo] = Number(
        nota.notaFinal,
      );
    }

    for (const item of frequencias) {
      const disciplina = item.turmaProfessor.disciplina;

      if (!boletimPorDisciplina[disciplina]) {
        const notasBase: Record<string, number | null> = {};

        for (const periodo of periodosPermitidos) {
          notasBase[periodo] = null;
        }

        boletimPorDisciplina[disciplina] = {
          turmaProfessorId: item.turmaProfessor.id,
          disciplina,
          professor: undefined,
          notas: notasBase,
          media: null,
          totalPresencas: 0,
          totalFaltas: 0,
          situacao: 'Cursando',
        };
      }

      if (item.status === 'PRESENTE') {
        boletimPorDisciplina[disciplina].totalPresencas += 1;
      }

      if (item.status === 'FALTA') {
        boletimPorDisciplina[disciplina].totalFaltas += 1;
      }
    }

    for (const disciplina of Object.keys(boletimPorDisciplina)) {
      const valores = Object.values(boletimPorDisciplina[disciplina].notas)
        .filter((valor): valor is number => typeof valor === 'number');

      const divisor = periodosPermitidos.length;
      const mediaAprovacao = Number(aluno.turma.school.mediaAprovacao);

      boletimPorDisciplina[disciplina].media = valores.length
        ? Number(
            (valores.reduce((acc, valor) => acc + valor, 0) / divisor).toFixed(
              2,
            ),
          )
        : null;

      boletimPorDisciplina[disciplina].situacao =
        boletimPorDisciplina[disciplina].media !== null &&
        boletimPorDisciplina[disciplina].media! >= mediaAprovacao
          ? 'Aprovado'
          : 'Cursando';
    }

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
        tipoAvaliacao: aluno.turma.school.tipoAvaliacao,
        mediaAprovacao: Number(aluno.turma.school.mediaAprovacao),
      },
      periodosPermitidos,
      disciplinas: Object.values(boletimPorDisciplina),
    };
  }

  async visualizarMeuBoletimAluno(data: {
    userId: string;
    userRole: UserRole;
    userSchoolId?: string | null;
  }) {
    if (data.userRole !== UserRole.ALUNO) {
      throw new ForbiddenException('Somente alunos podem acessar meu boletim.');
    }

    const aluno = await this.buscarAlunoDoUsuario({
      userId: data.userId,
      userSchoolId: data.userSchoolId,
    });

    return this.visualizarBoletimAluno({
      userId: data.userId,
      userRole: data.userRole,
      userSchoolId: data.userSchoolId,
      alunoId: aluno.id,
    });
  }
  async listarTurmasComAlunosParaBoletim(data: {
    userRole: UserRole;
    userSchoolId?: string | null;
  }) {
    if (
      data.userRole !== UserRole.ADMIN_ESCOLA &&
      data.userRole !== UserRole.GESTOR &&
      data.userRole !== UserRole.SECRETARIA &&
      data.userRole !== UserRole.SUPERUSUARIO
    ) {
      throw new ForbiddenException(
        'Somente gestão pode acessar a listagem do boletim.',
      );
    }

    const whereTurma =
      data.userRole === UserRole.SUPERUSUARIO
        ? {}
        : { schoolId: data.userSchoolId || '' };

    return this.prisma.turma.findMany({
      where: whereTurma,
      select: {
        id: true,
        name: true,
        turno: true,
        alunos: {
          select: {
            id: true,
            name: true,
            matricula: true,
            status: true,
          },
          orderBy: {
            name: 'asc',
          },
        },
      },
      orderBy: {
        name: 'asc',
      },
    });
  }

  async visualizarMinhasNotasAluno(data: {
    userId: string;
    userRole: UserRole;
    userSchoolId?: string | null;
  }) {
    if (data.userRole !== UserRole.ALUNO) {
      throw new ForbiddenException('Somente alunos podem acessar minhas notas.');
    }

    const aluno = await this.buscarAlunoDoUsuario({
      userId: data.userId,
      userSchoolId: data.userSchoolId,
    });

    return this.visualizarNotasDetalhadasAluno({
      userId: data.userId,
      userRole: data.userRole,
      userSchoolId: data.userSchoolId,
      alunoId: aluno.id,
    });
  }

  async listarAlunosResponsavel(data: {
    userId: string;
    userRole: UserRole;
    userSchoolId?: string | null;
  }) {
    if (data.userRole !== UserRole.RESPONSAVEL) {
      throw new ForbiddenException(
        'Somente responsáveis podem acessar esta listagem.',
      );
    }

    if (!data.userSchoolId) {
      throw new ForbiddenException('Responsável sem escola vinculada.');
    }

    const vinculos = await this.prisma.alunoResponsavel.findMany({
      where: {
        responsavelId: data.userId,
        aluno: {
          schoolId: data.userSchoolId,
        },
      },
      select: {
        parentesco: true,
        isFinanceiro: true,
        aluno: {
          select: {
            id: true,
            name: true,
            matricula: true,
            status: true,
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
      orderBy: {
        aluno: {
          name: 'asc',
        },
      },
    });

    return vinculos.map((vinculo) => ({
      ...vinculo.aluno,
      parentesco: vinculo.parentesco,
      isFinanceiro: vinculo.isFinanceiro,
    }));
  }

  async visualizarNotasDetalhadasAluno(data: {
    userId?: string;
    userRole: UserRole;
    userSchoolId?: string | null;
    alunoId: string;
  }) {
    if (
      data.userRole !== UserRole.ALUNO &&
      data.userRole !== UserRole.RESPONSAVEL &&
      data.userRole !== UserRole.ADMIN_ESCOLA &&
      data.userRole !== UserRole.GESTOR &&
      data.userRole !== UserRole.SECRETARIA &&
      data.userRole !== UserRole.SUPERUSUARIO
    ) {
      throw new ForbiddenException('Sem permissão para visualizar notas.');
    }

    const whereAluno =
      data.userRole === UserRole.SUPERUSUARIO
        ? { id: data.alunoId }
        : { id: data.alunoId, schoolId: data.userSchoolId || '' };

    const aluno = await this.prisma.aluno.findFirst({
      where: whereAluno,
      include: {
        turma: {
          include: {
            school: {
              select: {
                id: true,
                name: true,
                tipoAvaliacao: true,
                mediaAprovacao: true,
              },
            },
          },
        },
      },
    });

    if (!aluno) {
      throw new NotFoundException('Aluno não encontrado.');
    }

    if (data.userRole === UserRole.ALUNO && aluno.userId !== data.userId) {
      throw new ForbiddenException(
        'Aluno sem permissão para visualizar estas notas.',
      );
    }

    if (data.userRole === UserRole.RESPONSAVEL) {
      const vinculo = await this.prisma.alunoResponsavel.findFirst({
        where: {
          alunoId: aluno.id,
          responsavelId: data.userId || '',
        },
        select: {
          id: true,
        },
      });

      if (!vinculo) {
        throw new ForbiddenException(
          'Responsável sem vínculo com este aluno.',
        );
      }
    }
    const itens = await this.prisma.avaliacaoItem.findMany({
      where: {
        alunoId: aluno.id,
      },
      include: {
        atividadeModelo: {
          select: {
            id: true,
            titulo: true,
            tipoAtividade: true,
            tipoComposicao: true,
            valorMaximo: true,
            ordem: true,
            permiteRecuperacao: true,
            avaliacoesOnlineOrigem: {
              select: {
                id: true,
              },
              take: 1,
            },
          },
        },
        turmaProfessor: {
          select: {
            id: true,
            disciplina: true,
            professor: {
              select: {
                id: true,
                name: true,
              },
            },
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
          periodo: 'asc',
        },
        {
          atividadeModelo: {
            ordem: 'asc',
          },
        },
      ],
    });

    const itensConsolidados = await this.consolidarNotasAutomaticasDuplicadas(itens);

    return {
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
      escola: {
        id: aluno.turma.school.id,
        name: aluno.turma.school.name,
        tipoAvaliacao: aluno.turma.school.tipoAvaliacao,
        mediaAprovacao: Number(aluno.turma.school.mediaAprovacao),
      },
      itens: itensConsolidados.map((item) => ({
        id: item.id,
        periodo: item.periodo,
        nota: Number(item.nota),
        notaRecuperacao:
          item.notaRecuperacao === null ? null : Number(item.notaRecuperacao),
        notaConsiderada: Number(item.notaConsiderada),
        observacao: item.observacao,
        enviadoBoletim: item.enviadoBoletim,
        disciplina: item.turmaProfessor.disciplina,
        professor: item.turmaProfessor.professor?.name,
        atividadeModeloId: item.atividadeModeloId,
        ordem: item.atividadeModelo.ordem,
        tipoComposicao: item.atividadeModelo.tipoComposicao,
        tipoAtividade: item.atividadeModelo.tipoAtividade,
        titulo: item.atividadeModelo.titulo,
        valorMaximo: Number(item.atividadeModelo.valorMaximo),
        permiteRecuperacao: item.atividadeModelo.permiteRecuperacao,
      })),
    };
  }
}

