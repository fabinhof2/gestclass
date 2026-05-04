import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  PeriodoAvaliacao,
  TipoComposicaoNota,
  TipoQuestaoOnline,
  UserRole,
} from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

type TipoAvaliacaoSchool = "BIMESTRAL" | "TRIMESTRAL";

@Injectable()
export class AvaliacoesOnlineService {
  constructor(private readonly prisma: PrismaService) {}

  private validarPeriodoPorTipoAvaliacao(
    tipoAvaliacao: TipoAvaliacaoSchool,
    periodo: PeriodoAvaliacao
  ) {
    if (
      tipoAvaliacao === "TRIMESTRAL" &&
      periodo === PeriodoAvaliacao.QUARTO
    ) {
      throw new BadRequestException(
        "Escolas trimestrais não possuem quarto período."
      );
    }
  }

  private decimalParaNumero(valor: any) {
    const numero = Number(valor);
    return Number.isNaN(numero) ? 0 : numero;
  }

  private calcularNotaFinal(
    itens: Array<{ notaConsiderada: number }>,
    tipoComposicao: TipoComposicaoNota
  ) {
    if (!itens.length) {
      return 0;
    }

    const soma = itens.reduce((acc, item) => acc + item.notaConsiderada, 0);

    if (tipoComposicao === "SOMATORIO") {
      return Number(soma.toFixed(2));
    }

    return Number((soma / itens.length).toFixed(2));
  }

  private async recalcularNotaBoletimPorPeriodo(
    tx: PrismaService | any,
    data: {
      alunoId: string;
      turmaProfessorId: string;
      schoolId: string;
      professorId: string;
      periodo: PeriodoAvaliacao;
      tipoComposicao: TipoComposicaoNota;
      observacao?: string;
    }
  ) {
    const itensPeriodo = await tx.avaliacaoItem.findMany({
      where: {
        alunoId: data.alunoId,
        turmaProfessorId: data.turmaProfessorId,
        schoolId: data.schoolId,
        periodo: data.periodo,
      },
      select: {
        notaConsiderada: true,
      },
    });

    if (!itensPeriodo.length) {
      await tx.notaBoletim.deleteMany({
        where: {
          alunoId: data.alunoId,
          turmaProfessorId: data.turmaProfessorId,
          schoolId: data.schoolId,
          periodo: data.periodo,
        },
      });

      return null;
    }

    const notaPeriodo = this.calcularNotaFinal(
      itensPeriodo.map((item) => ({
        notaConsiderada: this.decimalParaNumero(item.notaConsiderada),
      })),
      data.tipoComposicao
    );

    await tx.notaBoletim.upsert({
      where: {
        alunoId_turmaProfessorId_periodo: {
          alunoId: data.alunoId,
          turmaProfessorId: data.turmaProfessorId,
          periodo: data.periodo,
        },
      },
      update: {
        schoolId: data.schoolId,
        professorId: data.professorId,
        tipoComposicao: data.tipoComposicao,
        notaFinal: notaPeriodo,
        enviadoBoletim: true,
        observacao:
          data.observacao ||
          "Nota atualizada automaticamente por avaliação online.",
      },
      create: {
        alunoId: data.alunoId,
        turmaProfessorId: data.turmaProfessorId,
        schoolId: data.schoolId,
        professorId: data.professorId,
        periodo: data.periodo,
        tipoComposicao: data.tipoComposicao,
        notaFinal: notaPeriodo,
        enviadoBoletim: true,
        observacao:
          data.observacao ||
          "Nota gerada automaticamente por avaliação online.",
      },
    });

    return notaPeriodo;
  }

  private async removerNotaAutomaticaDaAvaliacaoOnline(
    tx: PrismaService | any,
    data: {
      avaliacaoId: string;
      alunoId: string;
      recalcularBoletim?: boolean;
    }
  ) {
    const avaliacao = await tx.avaliacaoOnline.findUnique({
      where: {
        id: data.avaliacaoId,
      },
      select: {
        id: true,
        atividadeModeloOrigemId: true,
        turmaProfessorId: true,
        schoolId: true,
        professorId: true,
        periodo: true,
        tipoComposicao: true,
        titulo: true,
      },
    });

    if (!avaliacao) {
      return null;
    }

    const modelosPossiveis = await tx.atividadeAvaliacaoModelo.findMany({
      where: {
        turmaProfessorId: avaliacao.turmaProfessorId,
        schoolId: avaliacao.schoolId,
        professorId: avaliacao.professorId,
        periodo: avaliacao.periodo,
        tipoAtividade: "PROVA",
        titulo: avaliacao.titulo,
      },
      select: {
        id: true,
      },
    });

    const atividadeModeloIds = Array.from(
      new Set(
        [
          avaliacao.atividadeModeloOrigemId,
          ...modelosPossiveis.map((modelo) => modelo.id),
        ].filter((id): id is string => Boolean(id))
      )
    );

    if (!atividadeModeloIds.length) {
      return null;
    }

    await tx.avaliacaoItem.deleteMany({
      where: {
        alunoId: data.alunoId,
        atividadeModeloId: {
          in: atividadeModeloIds,
        },
        observacao: {
          startsWith: "Nota gerada automaticamente",
        },
      },
    });

    if (data.recalcularBoletim) {
      return this.recalcularNotaBoletimPorPeriodo(tx, {
        alunoId: data.alunoId,
        turmaProfessorId: avaliacao.turmaProfessorId,
        schoolId: avaliacao.schoolId,
        professorId: avaliacao.professorId,
        periodo: avaliacao.periodo,
        tipoComposicao: avaliacao.tipoComposicao,
        observacao:
          "Nota atualizada automaticamente após autorização para refazer avaliação online.",
      });
    }

    return null;
  }

  private async sincronizarTentativaComNotas(tentativaId: string) {
    const tentativa = await this.prisma.avaliacaoOnlineTentativa.findUnique({
      where: {
        id: tentativaId,
      },
      include: {
        avaliacaoOnline: true,
      },
    });

    if (!tentativa || !tentativa.finalizada || tentativa.notaFinal === null) {
      return null;
    }

    const avaliacao = tentativa.avaliacaoOnline;
    const valorAvaliacao = this.decimalParaNumero(avaliacao.valor);
    const notaFinal = this.decimalParaNumero(tentativa.notaFinal);
    const notaLimitada = Number(
      Math.max(0, Math.min(notaFinal, valorAvaliacao)).toFixed(2)
    );

    return this.prisma.$transaction(async (tx) => {
      let atividadeModeloId = avaliacao.atividadeModeloOrigemId;

      if (!atividadeModeloId) {
        const maiorOrdem = await tx.atividadeAvaliacaoModelo.aggregate({
          where: {
            turmaProfessorId: avaliacao.turmaProfessorId,
            schoolId: avaliacao.schoolId,
            professorId: avaliacao.professorId,
            periodo: avaliacao.periodo,
          },
          _max: {
            ordem: true,
          },
        });

        const atividadeModelo = await tx.atividadeAvaliacaoModelo.create({
          data: {
            turmaProfessorId: avaliacao.turmaProfessorId,
            schoolId: avaliacao.schoolId,
            professorId: avaliacao.professorId,
            periodo: avaliacao.periodo,
            tipoComposicao: avaliacao.tipoComposicao,
            tipoAtividade: "PROVA",
            titulo: avaliacao.titulo,
            valorMaximo: valorAvaliacao,
            ordem: (maiorOrdem._max.ordem || 0) + 1,
            permiteRecuperacao: false,
            enviadoBoletim: true,
          },
        });

        atividadeModeloId = atividadeModelo.id;

        await tx.avaliacaoOnline.update({
          where: {
            id: avaliacao.id,
          },
          data: {
            atividadeModeloOrigemId: atividadeModeloId,
          },
        });
      } else {
        await tx.atividadeAvaliacaoModelo.update({
          where: {
            id: atividadeModeloId,
          },
          data: {
            titulo: avaliacao.titulo,
            valorMaximo: valorAvaliacao,
            tipoComposicao: avaliacao.tipoComposicao,
            enviadoBoletim: true,
          },
        });
      }

      await this.removerNotaAutomaticaDaAvaliacaoOnline(tx, {
        avaliacaoId: avaliacao.id,
        alunoId: tentativa.alunoId,
        recalcularBoletim: false,
      });

      await tx.avaliacaoItem.upsert({
        where: {
          atividadeModeloId_alunoId: {
            atividadeModeloId,
            alunoId: tentativa.alunoId,
          },
        },
        update: {
          turmaProfessorId: avaliacao.turmaProfessorId,
          schoolId: avaliacao.schoolId,
          professorId: avaliacao.professorId,
          periodo: avaliacao.periodo,
          nota: notaLimitada,
          notaRecuperacao: null,
          notaConsiderada: notaLimitada,
          observacao: "Nota gerada automaticamente pela avaliação online.",
          enviadoBoletim: true,
        },
        create: {
          atividadeModeloId,
          alunoId: tentativa.alunoId,
          turmaProfessorId: avaliacao.turmaProfessorId,
          schoolId: avaliacao.schoolId,
          professorId: avaliacao.professorId,
          periodo: avaliacao.periodo,
          nota: notaLimitada,
          notaRecuperacao: null,
          notaConsiderada: notaLimitada,
          observacao: "Nota gerada automaticamente pela avaliação online.",
          enviadoBoletim: true,
        },
      });

      const notaPeriodo = await this.recalcularNotaBoletimPorPeriodo(tx, {
        alunoId: tentativa.alunoId,
        turmaProfessorId: avaliacao.turmaProfessorId,
        schoolId: avaliacao.schoolId,
        professorId: avaliacao.professorId,
        periodo: avaliacao.periodo,
        tipoComposicao: avaliacao.tipoComposicao,
        observacao: "Nota atualizada automaticamente por avaliacao online.",
      });
      await tx.avaliacaoOnline.update({
        where: {
          id: avaliacao.id,
        },
        data: {
          lancadaNoSistemaNotas: true,
          lancadaEm: new Date(),
        },
      });

      return {
        atividadeModeloId,
        notaAtividade: notaLimitada,
        notaPeriodo: notaPeriodo || 0,
      };
    });
  }

  private async recalcularResumoTentativa(
    tentativaId: string,
    tx: PrismaService | any = this.prisma
  ) {
    const tentativa = await tx.avaliacaoOnlineTentativa.findUnique({
      where: { id: tentativaId },
      include: {
        avaliacaoOnline: {
          include: {
            perguntas: {
              orderBy: {
                ordem: "asc",
              },
            },
          },
        },
        respostas: {
          include: {
            pergunta: true,
          },
        },
      },
    });

    if (!tentativa) {
      throw new NotFoundException("Tentativa não encontrada para recálculo.");
    }

    const perguntas = tentativa.avaliacaoOnline.perguntas || [];
    const respostas = tentativa.respostas || [];
    const valorAvaliacao = this.decimalParaNumero(tentativa.avaliacaoOnline.valor);

    const pesoTotal = perguntas.reduce(
      (acc: number, pergunta: any) => acc + this.decimalParaNumero(pergunta.peso),
      0
    );

    const pesoObjetivoObtido = respostas.reduce((acc: number, resposta: any) => {
      if (resposta.pergunta?.tipoQuestao === "DESCRITIVA") return acc;
      if (!resposta.correta) return acc;
      return acc + this.decimalParaNumero(resposta.pergunta?.peso);
    }, 0);

    const pesoDescritivoObtido = respostas.reduce((acc: number, resposta: any) => {
      if (resposta.pergunta?.tipoQuestao !== "DESCRITIVA") return acc;

      const pesoPergunta = this.decimalParaNumero(resposta.pergunta?.peso);
      const notaManual = this.decimalParaNumero(resposta.notaManual);

      if (!resposta.corrigidaManual) return acc;

      const notaLimitada = Math.max(0, Math.min(notaManual, pesoPergunta));
      return acc + notaLimitada;
    }, 0);

    const notaObjetiva =
      pesoTotal > 0 ? (valorAvaliacao * pesoObjetivoObtido) / pesoTotal : 0;

    const notaDescritiva =
      pesoTotal > 0 ? (valorAvaliacao * pesoDescritivoObtido) / pesoTotal : 0;

    const notaFinal = notaObjetiva + notaDescritiva;

    const totalAcertos = respostas.filter(
      (resposta: any) =>
        resposta.pergunta?.tipoQuestao !== "DESCRITIVA" && resposta.correta
    ).length;

    const totalQuestoes = perguntas.length;

    const descritivas = perguntas.filter(
      (pergunta: any) => pergunta.tipoQuestao === "DESCRITIVA"
    );

    const descritivasRespondidas = respostas.filter(
      (resposta: any) => resposta.pergunta?.tipoQuestao === "DESCRITIVA"
    );

    const descritivasCorrigidas =
      descritivas.length > 0 &&
      descritivas.every((pergunta: any) =>
        descritivasRespondidas.some(
          (resposta: any) =>
            resposta.perguntaId === pergunta.id && resposta.corrigidaManual
        )
      );

    return tx.avaliacaoOnlineTentativa.update({
      where: { id: tentativa.id },
      data: {
        totalAcertos,
        totalQuestoes,
        notaObjetiva: Number(notaObjetiva.toFixed(2)),
        notaDescritiva: Number(notaDescritiva.toFixed(2)),
        notaFinal: Number(notaFinal.toFixed(2)),
      },
      include: {
        respostas: {
          include: {
            pergunta: true,
          },
        },
        aluno: {
          select: {
            id: true,
            name: true,
            matricula: true,
            status: true,
          },
        },
        avaliacaoOnline: {
          select: {
            id: true,
            titulo: true,
          },
        },
      },
    });
  }

  private async buscarTurmaProfessorValido(
    turmaProfessorId: string,
    schoolId: string
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
            turno: true,
            schoolId: true,
            school: {
              select: {
                id: true,
                tipoAvaliacao: true,
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
        "Vínculo de professor com turma/disciplina não encontrado."
      );
    }

    return turmaProfessor;
  }

  private async buscarAvaliacaoOnlineDoProfessor(data: {
    avaliacaoId: string;
    userId: string;
    userSchoolId: string;
  }) {
    const avaliacao = await this.prisma.avaliacaoOnline.findFirst({
      where: {
        id: data.avaliacaoId,
        professorId: data.userId,
        schoolId: data.userSchoolId,
      },
      include: {
        turmaProfessor: {
          select: {
            id: true,
            disciplina: true,
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
        },
      },
    });

    if (!avaliacao) {
      throw new NotFoundException("Avaliação online não encontrada.");
    }

    return avaliacao;
  }

  private async buscarPerguntaDoProfessor(data: {
    perguntaId: string;
    userId: string;
    userSchoolId: string;
  }) {
    const pergunta = await this.prisma.avaliacaoOnlinePergunta.findFirst({
      where: {
        id: data.perguntaId,
        avaliacaoOnline: {
          professorId: data.userId,
          schoolId: data.userSchoolId,
        },
      },
      include: {
        avaliacaoOnline: {
          select: {
            id: true,
            professorId: true,
            schoolId: true,
          },
        },
        alternativas: {
          orderBy: {
            ordem: "asc",
          },
        },
      },
    });

    if (!pergunta) {
      throw new NotFoundException("Pergunta não encontrada.");
    }

    return pergunta;
  }

  private async buscarAlunoDoUsuario(data: {
    userId: string;
    userName: string;
    userSchoolId: string;
  }) {
    let nomeUsuario = String(data.userName || "").trim();

    if (!nomeUsuario) {
      const usuario = await this.prisma.user.findUnique({
        where: {
          id: data.userId,
        },
        select: {
          id: true,
          name: true,
          schoolId: true,
          role: true,
        },
      });

      nomeUsuario = String(usuario?.name || "").trim();
    }

    if (!nomeUsuario) {
      throw new NotFoundException(
        "O usuário logado não possui nome válido para localizar o cadastro do aluno."
      );
    }

    const aluno = await this.prisma.aluno.findFirst({
      where: {
        schoolId: data.userSchoolId,
        userId: data.userId,
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
                tipoAvaliacao: true,
              },
            },
          },
        },
      },
    });

    if (!aluno) {
      throw new NotFoundException(
        `Registro de aluno não encontrado para o usuário "${nomeUsuario}".`
      );
    }

    if (String(aluno.status || "").toUpperCase() !== "ATIVO") {
      throw new ForbiddenException(
        "Aluno inativo não pode acessar as avaliações."
      );
    }

    return aluno;
  }

  private async buscarAlunoDoResponsavel(data: {
    responsavelId: string;
    userSchoolId: string;
    alunoId: string;
  }) {
    const aluno = await this.prisma.aluno.findFirst({
      where: {
        id: data.alunoId,
        schoolId: data.userSchoolId,
        status: "ATIVO",
        responsaveis: {
          some: { responsavelId: data.responsavelId },
        },
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
                tipoAvaliacao: true,
              },
            },
          },
        },
      },
    });

    if (!aluno) {
      throw new ForbiddenException(
        "Aluno não encontrado entre os filhos vinculados ao responsável."
      );
    }

    return aluno;
  }

  private async buscarTentativaDoAluno(data: {
    tentativaId: string;
    userId: string;
    userName: string;
    userSchoolId: string;
  }) {
    const aluno = await this.buscarAlunoDoUsuario({
      userId: data.userId,
      userName: data.userName,
      userSchoolId: data.userSchoolId,
    });

    const tentativa = await this.prisma.avaliacaoOnlineTentativa.findFirst({
      where: {
        id: data.tentativaId,
        alunoId: aluno.id,
        schoolId: data.userSchoolId,
      },
      include: {
        avaliacaoOnline: {
          include: {
            perguntas: {
              include: {
                alternativas: {
                  orderBy: {
                    ordem: "asc",
                  },
                },
              },
              orderBy: {
                ordem: "asc",
              },
            },
            turmaProfessor: {
              select: {
                id: true,
                disciplina: true,
                turmaId: true,
              },
            },
          },
        },
        respostas: {
          include: {
            pergunta: true,
          },
        },
      },
    });

    if (!tentativa) {
      throw new NotFoundException("Tentativa não encontrada.");
    }

    return { tentativa, aluno };
  }

  async criarAvaliacaoOnline(data: {
    userId: string;
    userRole: UserRole;
    userSchoolId?: string | null;
    turmaProfessorId: string;
    periodo: PeriodoAvaliacao;
    tipoComposicao: TipoComposicaoNota;
    titulo: string;
    descricao?: string;
    instrucoes?: string;
    valor: number;
    corrigeAutomaticamente?: boolean;
    publicada?: boolean;
  }) {
    if (data.userRole !== UserRole.PROFESSOR) {
      throw new ForbiddenException(
        "Somente professores podem criar avaliações online."
      );
    }

    if (!data.userSchoolId) {
      throw new ForbiddenException("Professor sem escola vinculada.");
    }

    const titulo = String(data.titulo || "").trim();
    if (!titulo) {
      throw new BadRequestException("Informe o título da avaliação.");
    }

    const valor = Number(data.valor);
    if (Number.isNaN(valor) || valor <= 0) {
      throw new BadRequestException(
        "Informe um valor válido para a avaliação."
      );
    }

    const turmaProfessor = await this.buscarTurmaProfessorValido(
      data.turmaProfessorId,
      data.userSchoolId
    );

    if (turmaProfessor.professorId !== data.userId) {
      throw new ForbiddenException(
        "Você só pode criar avaliações da sua própria disciplina."
      );
    }

    this.validarPeriodoPorTipoAvaliacao(
      turmaProfessor.turma.school.tipoAvaliacao,
      data.periodo
    );

    return this.prisma.avaliacaoOnline.create({
      data: {
        turmaProfessorId: data.turmaProfessorId,
        schoolId: data.userSchoolId,
        professorId: data.userId,
        periodo: data.periodo,
        tipoComposicao: data.tipoComposicao,
        titulo,
        descricao: data.descricao?.trim() || null,
        instrucoes: data.instrucoes?.trim() || null,
        valor,
        ativo: true,
        publicada: Boolean(data.publicada),
        corrigeAutomaticamente:
          data.corrigeAutomaticamente === false ? false : true,
        lancadaNoSistemaNotas: false,
        publicadaEm: data.publicada ? new Date() : null,
      },
      include: {
        turmaProfessor: {
          select: {
            id: true,
            disciplina: true,
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
    });
  }

  async listarMinhasAvaliacoesOnline(data: {
    userId: string;
    userRole: UserRole;
    userSchoolId?: string | null;
  }) {
    if (data.userRole !== UserRole.PROFESSOR) {
      throw new ForbiddenException(
        "Somente professores podem acessar esta listagem."
      );
    }

    if (!data.userSchoolId) {
      throw new ForbiddenException("Professor sem escola vinculada.");
    }

    return this.prisma.avaliacaoOnline.findMany({
      where: {
        professorId: data.userId,
        schoolId: data.userSchoolId,
      },
      include: {
        turmaProfessor: {
          select: {
            id: true,
            disciplina: true,
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
        },
        perguntas: {
          select: {
            id: true,
          },
        },
        tentativas: {
          select: {
            id: true,
            finalizada: true,
            refazerAutorizado: true,
            notaObjetiva: true,
            notaDescritiva: true,
            notaFinal: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });
  }

  async detalharMinhaAvaliacaoOnline(data: {
    userId: string;
    userRole: UserRole;
    userSchoolId?: string | null;
    avaliacaoId: string;
  }) {
    if (data.userRole !== UserRole.PROFESSOR) {
      throw new ForbiddenException(
        "Somente professores podem visualizar avaliações online."
      );
    }

    if (!data.userSchoolId) {
      throw new ForbiddenException("Professor sem escola vinculada.");
    }

    const avaliacao = await this.prisma.avaliacaoOnline.findFirst({
      where: {
        id: data.avaliacaoId,
        professorId: data.userId,
        schoolId: data.userSchoolId,
      },
      include: {
        turmaProfessor: {
          select: {
            id: true,
            disciplina: true,
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
        },
        atividadeModeloOrigem: {
          select: {
            id: true,
            titulo: true,
            periodo: true,
            tipoAtividade: true,
            tipoComposicao: true,
            valorMaximo: true,
          },
        },
        perguntas: {
          include: {
            alternativas: {
              orderBy: {
                ordem: "asc",
              },
            },
          },
          orderBy: {
            ordem: "asc",
          },
        },
        tentativas: {
          include: {
            aluno: {
              select: {
                id: true,
                name: true,
                matricula: true,
                status: true,
              },
            },
            respostas: {
              include: {
                pergunta: {
                  select: {
                    id: true,
                    enunciado: true,
                    tipoQuestao: true,
                    peso: true,
                    ordem: true,
                    imagemUrl: true,
                  },
                },
                alternativa: {
                  select: {
                    id: true,
                    texto: true,
                    correta: true,
                  },
                },
              },
              orderBy: {
                createdAt: "asc",
              },
            },
          },
          orderBy: {
            createdAt: "desc",
          },
        },
      },
    });

    if (!avaliacao) {
      throw new NotFoundException("Avaliação online não encontrada.");
    }

    return avaliacao;
  }

  async listarAvaliacoesDisponiveisParaAluno(data: {
    userId: string;
    userName: string;
    userRole: UserRole;
    userSchoolId?: string | null;
  }) {
    if (data.userRole !== UserRole.ALUNO) {
      throw new ForbiddenException("Somente alunos podem acessar esta listagem.");
    }

    if (!data.userSchoolId) {
      throw new ForbiddenException("Aluno sem escola vinculada.");
    }

    const aluno = await this.buscarAlunoDoUsuario({
      userId: data.userId,
      userName: data.userName,
      userSchoolId: data.userSchoolId,
    });

    return this.prisma.avaliacaoOnline.findMany({
      where: {
        schoolId: data.userSchoolId,
        ativo: true,
        publicada: true,
        turmaProfessor: {
          turmaId: aluno.turmaId,
        },
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
        },
        perguntas: {
          select: {
            id: true,
            tipoQuestao: true,
          },
        },
        tentativas: {
          where: {
            alunoId: aluno.id,
          },
          select: {
            id: true,
            finalizada: true,
            notaObjetiva: true,
            notaDescritiva: true,
            notaFinal: true,
            totalAcertos: true,
            totalQuestoes: true,
            finalizadaEm: true,
            refazerAutorizado: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });
  }

  async listarAvaliacoesOnlineGestao(data: {
    userId: string;
    userRole: UserRole;
    userSchoolId?: string | null;
  }) {
    if (
      data.userRole !== UserRole.SUPERUSUARIO &&
      data.userRole !== UserRole.ADMIN_ESCOLA &&
      data.userRole !== UserRole.GESTOR &&
      data.userRole !== UserRole.SECRETARIA
    ) {
      throw new ForbiddenException(
        "Somente a gestão escolar pode acessar esta listagem."
      );
    }

    if (!data.userSchoolId) {
      throw new ForbiddenException("Usuário sem escola vinculada.");
    }

    return this.prisma.avaliacaoOnline.findMany({
      where: {
        schoolId: data.userSchoolId,
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
        },
        perguntas: {
          select: {
            id: true,
          },
        },
        tentativas: {
          select: {
            id: true,
            finalizada: true,
            refazerAutorizado: true,
            notaObjetiva: true,
            notaDescritiva: true,
            notaFinal: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });
  }

  async detalharAvaliacaoOnlineGestao(data: {
    userId: string;
    userRole: UserRole;
    userSchoolId?: string | null;
    avaliacaoId: string;
  }) {
    if (
      data.userRole !== UserRole.SUPERUSUARIO &&
      data.userRole !== UserRole.ADMIN_ESCOLA &&
      data.userRole !== UserRole.GESTOR &&
      data.userRole !== UserRole.SECRETARIA
    ) {
      throw new ForbiddenException(
        "Somente a gestao escolar pode visualizar avaliacoes online."
      );
    }

    if (!data.userSchoolId) {
      throw new ForbiddenException("Usuario sem escola vinculada.");
    }

    const avaliacao = await this.prisma.avaliacaoOnline.findFirst({
      where: {
        id: data.avaliacaoId,
        schoolId: data.userSchoolId,
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
        },
        atividadeModeloOrigem: {
          select: {
            id: true,
            titulo: true,
            periodo: true,
            tipoAtividade: true,
            tipoComposicao: true,
            valorMaximo: true,
          },
        },
        perguntas: {
          include: {
            alternativas: {
              orderBy: {
                ordem: "asc",
              },
            },
          },
          orderBy: {
            ordem: "asc",
          },
        },
        tentativas: {
          include: {
            aluno: {
              select: {
                id: true,
                name: true,
                matricula: true,
                status: true,
              },
            },
            respostas: {
              include: {
                pergunta: {
                  select: {
                    id: true,
                    enunciado: true,
                    tipoQuestao: true,
                    peso: true,
                    ordem: true,
                    imagemUrl: true,
                  },
                },
                alternativa: {
                  select: {
                    id: true,
                    texto: true,
                    correta: true,
                  },
                },
              },
              orderBy: {
                createdAt: "asc",
              },
            },
          },
          orderBy: {
            createdAt: "desc",
          },
        },
      },
    });

    if (!avaliacao) {
      throw new NotFoundException("Avaliacao online nao encontrada.");
    }

    return avaliacao;
  }

  async listarAlunosDaAvaliacaoGestao(data: {
    avaliacaoId: string;
    userId: string;
    userRole: UserRole;
    userSchoolId?: string | null;
  }) {
    if (
      data.userRole !== UserRole.SUPERUSUARIO &&
      data.userRole !== UserRole.ADMIN_ESCOLA &&
      data.userRole !== UserRole.GESTOR &&
      data.userRole !== UserRole.SECRETARIA
    ) {
      throw new ForbiddenException(
        "Somente a gestao escolar pode visualizar os alunos da avaliacao."
      );
    }

    if (!data.userSchoolId) {
      throw new ForbiddenException("Usuario sem escola vinculada.");
    }

    const avaliacao = await this.prisma.avaliacaoOnline.findFirst({
      where: {
        id: data.avaliacaoId,
        schoolId: data.userSchoolId,
      },
      select: {
        id: true,
        turmaProfessor: {
          select: {
            turma: {
              select: {
                id: true,
              },
            },
          },
        },
      },
    });

    if (!avaliacao) {
      throw new NotFoundException("Avaliacao online nao encontrada.");
    }

    const turma = await this.prisma.turma.findFirst({
      where: {
        id: avaliacao.turmaProfessor.turma.id,
        schoolId: data.userSchoolId,
      },
      include: {
        alunos: {
          orderBy: {
            name: "asc",
          },
          include: {
            avaliacoesOnlineTentativas: {
              where: {
                avaliacaoOnlineId: avaliacao.id,
              },
              orderBy: {
                createdAt: "desc",
              },
              include: {
                respostas: {
                  include: {
                    pergunta: {
                      select: {
                        id: true,
                        enunciado: true,
                        tipoQuestao: true,
                        peso: true,
                        ordem: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    return {
      avaliacaoId: avaliacao.id,
      turma: turma
        ? {
            id: turma.id,
            name: turma.name,
            turno: turma.turno,
          }
        : null,
      alunos:
        turma?.alunos.map((aluno) => ({
          id: aluno.id,
          name: aluno.name,
          matricula: aluno.matricula,
          status: aluno.status,
          tentativa: aluno.avaliacoesOnlineTentativas[0] || null,
        })) || [],
    };
  }

  async listarAlunosResponsavel(data: {
    userId: string;
    userRole: UserRole;
    userSchoolId?: string | null;
  }) {
    if (data.userRole !== UserRole.RESPONSAVEL) {
      throw new ForbiddenException(
        "Somente responsáveis podem acessar esta listagem."
      );
    }

    if (!data.userSchoolId) {
      throw new ForbiddenException("Responsável sem escola vinculada.");
    }

    const vinculos = await this.prisma.alunoResponsavel.findMany({
      where: {
        responsavelId: data.userId,
        aluno: {
          schoolId: data.userSchoolId,
        },
      },
      include: {
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
          name: "asc",
        },
      },
    });

    return vinculos.map((vinculo) => vinculo.aluno);
  }

  async listarAvaliacoesResponsavel(data: {
    userId: string;
    userRole: UserRole;
    userSchoolId?: string | null;
    alunoId: string;
  }) {
    if (data.userRole !== UserRole.RESPONSAVEL) {
      throw new ForbiddenException(
        "Somente responsáveis podem acompanhar avaliações dos filhos."
      );
    }

    if (!data.userSchoolId) {
      throw new ForbiddenException("Responsável sem escola vinculada.");
    }

    const aluno = await this.buscarAlunoDoResponsavel({
      responsavelId: data.userId,
      userSchoolId: data.userSchoolId,
      alunoId: data.alunoId,
    });

    return this.prisma.avaliacaoOnline.findMany({
      where: {
        schoolId: data.userSchoolId,
        ativo: true,
        publicada: true,
        turmaProfessor: {
          turmaId: aluno.turmaId,
        },
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
        },
        perguntas: {
          select: {
            id: true,
            tipoQuestao: true,
          },
        },
        tentativas: {
          where: {
            alunoId: aluno.id,
          },
          select: {
            id: true,
            finalizada: true,
            notaObjetiva: true,
            notaDescritiva: true,
            notaFinal: true,
            totalAcertos: true,
            totalQuestoes: true,
            finalizadaEm: true,
            refazerAutorizado: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });
  }

  async detalharAvaliacaoDisponivelParaAluno(data: {
    avaliacaoId: string;
    userId: string;
    userName: string;
    userRole: UserRole;
    userSchoolId?: string | null;
  }) {
    if (data.userRole !== UserRole.ALUNO) {
      throw new ForbiddenException("Somente alunos podem visualizar esta prova.");
    }

    if (!data.userSchoolId) {
      throw new ForbiddenException("Aluno sem escola vinculada.");
    }

    const aluno = await this.buscarAlunoDoUsuario({
      userId: data.userId,
      userName: data.userName,
      userSchoolId: data.userSchoolId,
    });

    const avaliacao = await this.prisma.avaliacaoOnline.findFirst({
      where: {
        id: data.avaliacaoId,
        schoolId: data.userSchoolId,
        ativo: true,
        publicada: true,
        turmaProfessor: {
          turmaId: aluno.turmaId,
        },
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
        },
        perguntas: {
          include: {
            alternativas: {
              orderBy: {
                ordem: "asc",
              },
              select: {
                id: true,
                texto: true,
                ordem: true,
              },
            },
          },
          orderBy: {
            ordem: "asc",
          },
        },
        tentativas: {
          where: {
            alunoId: aluno.id,
          },
          select: {
            id: true,
            finalizada: true,
            notaObjetiva: true,
            notaDescritiva: true,
            notaFinal: true,
            totalAcertos: true,
            totalQuestoes: true,
            finalizadaEm: true,
            refazerAutorizado: true,
            respostas: {
              select: {
                id: true,
                perguntaId: true,
                alternativaId: true,
                respostaTexto: true,
                correta: true,
                notaManual: true,
                feedbackProfessor: true,
                corrigidaManual: true,
              },
            },
          },
        },
      },
    });

    if (!avaliacao) {
      throw new NotFoundException("Avaliação não encontrada para este aluno.");
    }

    return avaliacao;
  }

  async iniciarTentativaAluno(data: {
    avaliacaoId: string;
    userId: string;
    userName: string;
    userRole: UserRole;
    userSchoolId?: string | null;
  }) {
    if (data.userRole !== UserRole.ALUNO) {
      throw new ForbiddenException("Somente alunos podem iniciar a avaliação.");
    }

    if (!data.userSchoolId) {
      throw new ForbiddenException("Aluno sem escola vinculada.");
    }

    const aluno = await this.buscarAlunoDoUsuario({
      userId: data.userId,
      userName: data.userName,
      userSchoolId: data.userSchoolId,
    });

    const avaliacao = await this.prisma.avaliacaoOnline.findFirst({
      where: {
        id: data.avaliacaoId,
        schoolId: data.userSchoolId,
        ativo: true,
        publicada: true,
        turmaProfessor: {
          turmaId: aluno.turmaId,
        },
      },
      include: {
        perguntas: {
          select: {
            id: true,
          },
        },
      },
    });

    if (!avaliacao) {
      throw new NotFoundException("Avaliação não encontrada para este aluno.");
    }

    const tentativaExistente =
      await this.prisma.avaliacaoOnlineTentativa.findUnique({
        where: {
          avaliacaoOnlineId_alunoId: {
            avaliacaoOnlineId: avaliacao.id,
            alunoId: aluno.id,
          },
        },
        include: {
          respostas: true,
        },
      });

    if (!tentativaExistente) {
      return this.prisma.avaliacaoOnlineTentativa.create({
        data: {
          avaliacaoOnlineId: avaliacao.id,
          alunoId: aluno.id,
          schoolId: data.userSchoolId,
          userAlunoId: data.userId,
          totalQuestoes: avaliacao.perguntas.length,
          finalizada: false,
        },
        include: {
          respostas: true,
        },
      });
    }

    if (!tentativaExistente.finalizada) {
      return tentativaExistente;
    }

    if (!tentativaExistente.refazerAutorizado) {
      throw new ForbiddenException(
        "Você já concluiu esta avaliação. Só poderá refazer se o professor autorizar."
      );
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.avaliacaoOnlineResposta.deleteMany({
        where: {
          tentativaId: tentativaExistente.id,
        },
      });

      await this.removerNotaAutomaticaDaAvaliacaoOnline(tx, {
        avaliacaoId: avaliacao.id,
        alunoId: aluno.id,
        recalcularBoletim: true,
      });

      return tx.avaliacaoOnlineTentativa.update({
        where: {
          id: tentativaExistente.id,
        },
        data: {
          iniciadaEm: new Date(),
          finalizadaEm: null,
          notaObjetiva: null,
          notaDescritiva: null,
          notaFinal: null,
          totalAcertos: 0,
          totalQuestoes: avaliacao.perguntas.length,
          finalizada: false,
          refazerAutorizado: false,
          refazerAutorizadoEm: null,
        },
        include: {
          respostas: true,
        },
      });
    });
  }

  async salvarRespostasAluno(data: {
    tentativaId: string;
    respostas: Array<{
      perguntaId: string;
      alternativaId?: string | null;
      respostaTexto?: string | null;
    }>;
    userId: string;
    userName: string;
    userRole: UserRole;
    userSchoolId?: string | null;
  }) {
    if (data.userRole !== UserRole.ALUNO) {
      throw new ForbiddenException("Somente alunos podem responder a avaliação.");
    }

    if (!data.userSchoolId) {
      throw new ForbiddenException("Aluno sem escola vinculada.");
    }

    if (!Array.isArray(data.respostas) || data.respostas.length === 0) {
      throw new BadRequestException("Envie pelo menos uma resposta.");
    }

    const { tentativa } = await this.buscarTentativaDoAluno({
      tentativaId: data.tentativaId,
      userId: data.userId,
      userName: data.userName,
      userSchoolId: data.userSchoolId,
    });

    if (tentativa.finalizada) {
      throw new ForbiddenException(
        "Esta tentativa já foi concluída e não pode mais ser alterada."
      );
    }

    const perguntasMap = new Map(
      tentativa.avaliacaoOnline.perguntas.map((pergunta) => [pergunta.id, pergunta])
    );

    await this.prisma.$transaction(async (tx) => {
      for (const resposta of data.respostas) {
        const pergunta = perguntasMap.get(resposta.perguntaId);

        if (!pergunta) {
          throw new BadRequestException("Pergunta inválida para esta avaliação.");
        }

        let alternativaId: string | null = null;
        let respostaTexto: string | null = null;
        let correta = false;

        if (pergunta.tipoQuestao === "DESCRITIVA") {
          respostaTexto = String(resposta.respostaTexto || "").trim() || null;
        } else {
          alternativaId = resposta.alternativaId || null;

          if (!alternativaId) {
            throw new BadRequestException(
              "Selecione uma alternativa para as questões objetivas."
            );
          }

          const alternativa = pergunta.alternativas.find(
            (item) => item.id === alternativaId
          );

          if (!alternativa) {
            throw new BadRequestException("Alternativa inválida para a pergunta.");
          }

          correta = Boolean(alternativa.correta);
        }

        await tx.avaliacaoOnlineResposta.upsert({
          where: {
            tentativaId_perguntaId: {
              tentativaId: tentativa.id,
              perguntaId: pergunta.id,
            },
          },
          update: {
            alternativaId,
            respostaTexto,
            correta,
            respondidoPorUserId: data.userId,
          },
          create: {
            tentativaId: tentativa.id,
            perguntaId: pergunta.id,
            alternativaId,
            respostaTexto,
            schoolId: data.userSchoolId!,
            respondidoPorUserId: data.userId,
            correta,
          },
        });
      }
    });

    return this.prisma.avaliacaoOnlineTentativa.findUnique({
      where: {
        id: tentativa.id,
      },
      include: {
        respostas: true,
      },
    });
  }

  async concluirTentativaAluno(data: {
    tentativaId: string;
    userId: string;
    userName: string;
    userRole: UserRole;
    userSchoolId?: string | null;
  }) {
    if (data.userRole !== UserRole.ALUNO) {
      throw new ForbiddenException("Somente alunos podem concluir a avaliação.");
    }

    if (!data.userSchoolId) {
      throw new ForbiddenException("Aluno sem escola vinculada.");
    }

    const { tentativa } = await this.buscarTentativaDoAluno({
      tentativaId: data.tentativaId,
      userId: data.userId,
      userName: data.userName,
      userSchoolId: data.userSchoolId,
    });

    if (tentativa.finalizada) {
      throw new ForbiddenException("Esta avaliação já foi concluída.");
    }

    await this.prisma.avaliacaoOnlineTentativa.update({
      where: {
        id: tentativa.id,
      },
      data: {
        finalizada: true,
        finalizadaEm: new Date(),
        refazerAutorizado: false,
        refazerAutorizadoEm: null,
      },
    });

    const tentativaAtualizada = await this.recalcularResumoTentativa(tentativa.id);
    const sincronizacaoNotas = await this.sincronizarTentativaComNotas(tentativa.id);

    return {
      ...tentativaAtualizada,
      sincronizacaoNotas,
    };
  }

  async listarAlunosDaAvaliacao(data: {
    avaliacaoId: string;
    userId: string;
    userRole: UserRole;
    userSchoolId?: string | null;
  }) {
    if (data.userRole !== UserRole.PROFESSOR) {
      throw new ForbiddenException(
        "Somente professores podem visualizar os alunos da avaliação."
      );
    }

    if (!data.userSchoolId) {
      throw new ForbiddenException("Professor sem escola vinculada.");
    }

    const avaliacao = await this.buscarAvaliacaoOnlineDoProfessor({
      avaliacaoId: data.avaliacaoId,
      userId: data.userId,
      userSchoolId: data.userSchoolId,
    });

    const turma = await this.prisma.turma.findFirst({
      where: {
        id: avaliacao.turmaProfessor.turma.id,
        schoolId: data.userSchoolId,
      },
      include: {
        alunos: {
          orderBy: {
            name: "asc",
          },
          include: {
            avaliacoesOnlineTentativas: {
              where: {
                avaliacaoOnlineId: avaliacao.id,
              },
              orderBy: {
                createdAt: "desc",
              },
              include: {
                respostas: {
                  include: {
                    pergunta: {
                      select: {
                        id: true,
                        enunciado: true,
                        tipoQuestao: true,
                        peso: true,
                        ordem: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    return {
      avaliacaoId: avaliacao.id,
      turma: turma
        ? {
            id: turma.id,
            name: turma.name,
            turno: turma.turno,
          }
        : null,
      alunos:
        turma?.alunos.map((aluno) => ({
          id: aluno.id,
          name: aluno.name,
          matricula: aluno.matricula,
          status: aluno.status,
          tentativa: aluno.avaliacoesOnlineTentativas[0] || null,
        })) || [],
    };
  }

  async corrigirRespostaDescritiva(data: {
    respostaId: string;
    notaManual: number;
    feedbackProfessor?: string;
    userId: string;
    userRole: UserRole;
    userSchoolId?: string | null;
  }) {
    if (data.userRole !== UserRole.PROFESSOR) {
      throw new ForbiddenException(
        "Somente professores podem corrigir respostas descritivas."
      );
    }

    if (!data.userSchoolId) {
      throw new ForbiddenException("Professor sem escola vinculada.");
    }

    if (Number.isNaN(data.notaManual) || data.notaManual < 0) {
      throw new BadRequestException("Informe uma nota manual válida.");
    }

    const resposta = await this.prisma.avaliacaoOnlineResposta.findFirst({
      where: {
        id: data.respostaId,
        schoolId: data.userSchoolId,
        pergunta: {
          tipoQuestao: "DESCRITIVA",
          avaliacaoOnline: {
            professorId: data.userId,
            schoolId: data.userSchoolId,
          },
        },
      },
      include: {
        pergunta: {
          select: {
            id: true,
            peso: true,
            tipoQuestao: true,
          },
        },
        tentativa: {
          select: {
            id: true,
            finalizada: true,
          },
        },
      },
    });

    if (!resposta) {
      throw new NotFoundException(
        "Resposta descritiva não encontrada para correção."
      );
    }

    const pesoPergunta = this.decimalParaNumero(resposta.pergunta.peso);
    if (data.notaManual > pesoPergunta) {
      throw new BadRequestException(
        `A nota da questão descritiva não pode ser maior que o peso da pergunta (${pesoPergunta}).`
      );
    }

    await this.prisma.avaliacaoOnlineResposta.update({
      where: { id: resposta.id },
      data: {
        notaManual: Number(data.notaManual.toFixed(2)),
        feedbackProfessor: String(data.feedbackProfessor || "").trim() || null,
        corrigidaManual: true,
        corrigidoPorUserId: data.userId,
        corrigidoEm: new Date(),
      },
    });

    const tentativaAtualizada = await this.recalcularResumoTentativa(
      resposta.tentativa.id
    );
    const sincronizacaoNotas = resposta.tentativa.finalizada
      ? await this.sincronizarTentativaComNotas(resposta.tentativa.id)
      : null;

    return {
      message: "Resposta descritiva corrigida com sucesso.",
      tentativa: tentativaAtualizada,
      sincronizacaoNotas,
    };
  }

  async autorizarRefazerParaAlunos(data: {
    avaliacaoId: string;
    alunoIds: string[];
    userId: string;
    userRole: UserRole;
    userSchoolId?: string | null;
  }) {
    if (data.userRole !== UserRole.PROFESSOR) {
      throw new ForbiddenException(
        "Somente professores podem autorizar refazer."
      );
    }

    if (!data.userSchoolId) {
      throw new ForbiddenException("Professor sem escola vinculada.");
    }

    if (!Array.isArray(data.alunoIds) || data.alunoIds.length === 0) {
      throw new BadRequestException("Selecione pelo menos um aluno.");
    }

    const avaliacao = await this.buscarAvaliacaoOnlineDoProfessor({
      avaliacaoId: data.avaliacaoId,
      userId: data.userId,
      userSchoolId: data.userSchoolId,
    });

    const tentativas = await this.prisma.avaliacaoOnlineTentativa.findMany({
      where: {
        avaliacaoOnlineId: avaliacao.id,
        alunoId: {
          in: data.alunoIds,
        },
        finalizada: true,
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

    if (tentativas.length === 0) {
      throw new BadRequestException(
        "Nenhum dos alunos selecionados possui tentativa concluída para liberar refazer."
      );
    }

    await this.prisma.avaliacaoOnlineTentativa.updateMany({
      where: {
        id: {
          in: tentativas.map((tentativa) => tentativa.id),
        },
      },
      data: {
        refazerAutorizado: true,
        refazerAutorizadoEm: new Date(),
      },
    });

    return {
      message: "Refazer autorizado com sucesso.",
      totalAutorizados: tentativas.length,
      alunos: tentativas.map((tentativa) => ({
        id: tentativa.aluno.id,
        name: tentativa.aluno.name,
      })),
    };
  }

  async adicionarPerguntaComAlternativas(data: {
    userId: string;
    userRole: UserRole;
    userSchoolId?: string | null;
    avaliacaoId: string;
    tipoQuestao: TipoQuestaoOnline;
    enunciado: string;
    imagemUrl?: string;
    peso: number;
    alternativas: Array<{
      texto: string;
      correta: boolean;
    }>;
  }) {
    if (data.userRole !== UserRole.PROFESSOR) {
      throw new ForbiddenException(
        "Somente professores podem cadastrar perguntas."
      );
    }

    if (!data.userSchoolId) {
      throw new ForbiddenException("Professor sem escola vinculada.");
    }

    const avaliacao = await this.buscarAvaliacaoOnlineDoProfessor({
      avaliacaoId: data.avaliacaoId,
      userId: data.userId,
      userSchoolId: data.userSchoolId,
    });

    const enunciado = String(data.enunciado || "").trim();
    if (!enunciado) {
      throw new BadRequestException("Informe o enunciado da pergunta.");
    }

    const peso = Number(data.peso);
    if (Number.isNaN(peso) || peso <= 0) {
      throw new BadRequestException("Informe um peso válido para a pergunta.");
    }

    const imagemUrl = String(data.imagemUrl || "").trim() || null;

    let alternativasNormalizadas = (Array.isArray(data.alternativas)
      ? data.alternativas
      : []
    ).map((alternativa) => ({
      texto: String(alternativa.texto || "").trim(),
      correta: Boolean(alternativa.correta),
    }));

    if (data.tipoQuestao === "DESCRITIVA") {
      alternativasNormalizadas = [];
    } else if (data.tipoQuestao === "VERDADEIRO_FALSO") {
      const indiceCorreta = alternativasNormalizadas.findIndex(
        (item) => item.correta
      );
      const corretaEhVerdadeiro = indiceCorreta <= 0;

      alternativasNormalizadas = [
        {
          texto: "Verdadeiro",
          correta: corretaEhVerdadeiro,
        },
        {
          texto: "Falso",
          correta: !corretaEhVerdadeiro,
        },
      ];
    } else {
      if (alternativasNormalizadas.length < 2) {
        throw new BadRequestException(
          "A questão de múltipla escolha precisa ter pelo menos duas alternativas."
        );
      }

      for (const alternativa of alternativasNormalizadas) {
        if (!alternativa.texto) {
          throw new BadRequestException(
            "Todas as alternativas precisam ter texto."
          );
        }
      }

      const quantidadeCorretas = alternativasNormalizadas.filter(
        (alternativa) => alternativa.correta
      ).length;

      if (quantidadeCorretas !== 1) {
        throw new BadRequestException(
          "A pergunta precisa ter exatamente uma alternativa correta."
        );
      }
    }

    const ultimaPergunta = await this.prisma.avaliacaoOnlinePergunta.findFirst({
      where: {
        avaliacaoOnlineId: avaliacao.id,
      },
      orderBy: {
        ordem: "desc",
      },
      select: {
        ordem: true,
      },
    });

    const proximaOrdem = (ultimaPergunta?.ordem || 0) + 1;

    return this.prisma.$transaction(async (tx) => {
      const pergunta = await tx.avaliacaoOnlinePergunta.create({
        data: {
          avaliacaoOnlineId: avaliacao.id,
          enunciado,
          tipoQuestao: data.tipoQuestao,
          imagemUrl,
          respostaEsperada: null,
          ordem: proximaOrdem,
          peso,
          ativa: true,
        },
      });

      if (alternativasNormalizadas.length) {
        await Promise.all(
          alternativasNormalizadas.map((alternativa, index) =>
            tx.avaliacaoOnlineAlternativa.create({
              data: {
                perguntaId: pergunta.id,
                texto: alternativa.texto,
                ordem: index + 1,
                correta: alternativa.correta,
              },
            })
          )
        );
      }

      return tx.avaliacaoOnlinePergunta.findUnique({
        where: {
          id: pergunta.id,
        },
        include: {
          alternativas: {
            orderBy: {
              ordem: "asc",
            },
          },
        },
      });
    });
  }

  async atualizarPergunta(data: {
    userId: string;
    userRole: UserRole;
    userSchoolId?: string | null;
    perguntaId: string;
    tipoQuestao: TipoQuestaoOnline;
    enunciado: string;
    imagemUrl?: string;
    peso: number;
    alternativas: Array<{
      texto: string;
      correta: boolean;
    }>;
  }) {
    if (data.userRole !== UserRole.PROFESSOR) {
      throw new ForbiddenException(
        "Somente professores podem editar perguntas."
      );
    }

    if (!data.userSchoolId) {
      throw new ForbiddenException("Professor sem escola vinculada.");
    }

    const pergunta = await this.buscarPerguntaDoProfessor({
      perguntaId: data.perguntaId,
      userId: data.userId,
      userSchoolId: data.userSchoolId,
    });

    const enunciado = String(data.enunciado || "").trim();
    if (!enunciado) {
      throw new BadRequestException("Informe o enunciado da pergunta.");
    }

    const peso = Number(data.peso);
    if (Number.isNaN(peso) || peso <= 0) {
      throw new BadRequestException("Informe um peso válido para a pergunta.");
    }

    const imagemUrl = String(data.imagemUrl || "").trim() || null;

    let alternativasNormalizadas = (Array.isArray(data.alternativas)
      ? data.alternativas
      : []
    ).map((alternativa) => ({
      texto: String(alternativa.texto || "").trim(),
      correta: Boolean(alternativa.correta),
    }));

    if (data.tipoQuestao === "DESCRITIVA") {
      alternativasNormalizadas = [];
    } else if (data.tipoQuestao === "VERDADEIRO_FALSO") {
      const indiceCorreta = alternativasNormalizadas.findIndex(
        (item) => item.correta
      );
      const corretaEhVerdadeiro = indiceCorreta <= 0;

      alternativasNormalizadas = [
        {
          texto: "Verdadeiro",
          correta: corretaEhVerdadeiro,
        },
        {
          texto: "Falso",
          correta: !corretaEhVerdadeiro,
        },
      ];
    } else {
      if (alternativasNormalizadas.length < 2) {
        throw new BadRequestException(
          "A questão de múltipla escolha precisa ter pelo menos duas alternativas."
        );
      }

      for (const alternativa of alternativasNormalizadas) {
        if (!alternativa.texto) {
          throw new BadRequestException(
            "Todas as alternativas precisam ter texto."
          );
        }
      }

      const quantidadeCorretas = alternativasNormalizadas.filter(
        (alternativa) => alternativa.correta
      ).length;

      if (quantidadeCorretas !== 1) {
        throw new BadRequestException(
          "A pergunta precisa ter exatamente uma alternativa correta."
        );
      }
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.avaliacaoOnlinePergunta.update({
        where: {
          id: pergunta.id,
        },
        data: {
          enunciado,
          tipoQuestao: data.tipoQuestao,
          imagemUrl,
          respostaEsperada: null,
          peso,
        },
      });

      await tx.avaliacaoOnlineAlternativa.deleteMany({
        where: {
          perguntaId: pergunta.id,
        },
      });

      if (alternativasNormalizadas.length) {
        await Promise.all(
          alternativasNormalizadas.map((alternativa, index) =>
            tx.avaliacaoOnlineAlternativa.create({
              data: {
                perguntaId: pergunta.id,
                texto: alternativa.texto,
                ordem: index + 1,
                correta: alternativa.correta,
              },
            })
          )
        );
      }

      return tx.avaliacaoOnlinePergunta.findUnique({
        where: {
          id: pergunta.id,
        },
        include: {
          alternativas: {
            orderBy: {
              ordem: "asc",
            },
          },
        },
      });
    });
  }

  async excluirPergunta(data: {
    userId: string;
    userRole: UserRole;
    userSchoolId?: string | null;
    perguntaId: string;
  }) {
    if (data.userRole !== UserRole.PROFESSOR) {
      throw new ForbiddenException(
        "Somente professores podem excluir perguntas."
      );
    }

    if (!data.userSchoolId) {
      throw new ForbiddenException("Professor sem escola vinculada.");
    }

    const pergunta = await this.buscarPerguntaDoProfessor({
      perguntaId: data.perguntaId,
      userId: data.userId,
      userSchoolId: data.userSchoolId,
    });

    await this.prisma.avaliacaoOnlinePergunta.delete({
      where: {
        id: pergunta.id,
      },
    });

    return {
      message: "Pergunta excluída com sucesso.",
      perguntaId: pergunta.id,
    };
  }

  async atualizarImagemPergunta(data: {
    userId: string;
    userRole: UserRole;
    userSchoolId?: string | null;
    perguntaId: string;
    imagemUrl: string;
  }) {
    if (data.userRole !== UserRole.PROFESSOR) {
      throw new ForbiddenException(
        "Somente professores podem enviar imagem para a pergunta."
      );
    }

    if (!data.userSchoolId) {
      throw new ForbiddenException("Professor sem escola vinculada.");
    }

    const pergunta = await this.buscarPerguntaDoProfessor({
      perguntaId: data.perguntaId,
      userId: data.userId,
      userSchoolId: data.userSchoolId,
    });

    return this.prisma.avaliacaoOnlinePergunta.update({
      where: {
        id: pergunta.id,
      },
      data: {
        imagemUrl: data.imagemUrl,
      },
      include: {
        alternativas: {
          orderBy: {
            ordem: "asc",
          },
        },
      },
    });
  }
}
