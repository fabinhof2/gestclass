import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

type DisciplinaPayload = {
  schoolId: string;
  turmaId: string;
  serie: string;
  nome: string;
  cargaHoraria: number;
};

type ReplicarDisciplinasPayload = {
  schoolId: string;
  turmaDestinoIds: string[];
  turmaOrigemId: string;
  itens: Array<{
    id: string;
    nome: string;
    cargaHoraria: number;
  }>;
};

@Injectable()
export class DisciplinasService {
  constructor(private readonly prisma: PrismaService) {}

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
        name: true,
        turno: true,
      },
    });

    if (!turma) {
      throw new NotFoundException("Turma nao encontrada para esta escola.");
    }

    return turma;
  }

  private normalizePayload(data: DisciplinaPayload) {
    const nome = data.nome?.trim();
    const serie = data.serie?.trim();
    const cargaHoraria = Number(data.cargaHoraria);

    if (!nome) {
      throw new BadRequestException("Informe o nome da disciplina.");
    }

    if (!serie) {
      throw new BadRequestException("Informe a serie.");
    }

    if (!Number.isFinite(cargaHoraria) || cargaHoraria <= 0) {
      throw new BadRequestException("Informe uma carga horaria valida.");
    }

    return {
      nome,
      serie,
      cargaHoraria,
    };
  }

  async findAllByTurma(data: { schoolId: string; turmaId?: string }) {
    const turmaId = data.turmaId?.trim();

    if (turmaId) {
      await this.ensureTurmaFromSchool(turmaId, data.schoolId);
    }

    return this.prisma.disciplinaTurma.findMany({
      where: {
        schoolId: data.schoolId,
        ...(turmaId ? { turmaId } : {}),
      },
      include: {
        turma: {
          select: {
            id: true,
            name: true,
            turno: true,
          },
        },
      },
      orderBy: [{ nome: "asc" }, { turma: { name: "asc" } }, { createdAt: "asc" }],
    });
  }

  async create(data: DisciplinaPayload) {
    const turma = await this.ensureTurmaFromSchool(data.turmaId, data.schoolId);
    const normalized = this.normalizePayload(data);

    const existente = await this.prisma.disciplinaTurma.findFirst({
      where: {
        turmaId: turma.id,
        nome: {
          equals: normalized.nome,
          mode: "insensitive",
        },
      },
      select: {
        id: true,
      },
    });

    if (existente) {
      throw new BadRequestException(
        "Ja existe uma disciplina com esse nome para a turma selecionada.",
      );
    }

    return this.prisma.disciplinaTurma.create({
      data: {
        schoolId: data.schoolId,
        turmaId: turma.id,
        serie: normalized.serie,
        nome: normalized.nome,
        cargaHoraria: normalized.cargaHoraria,
      },
    });
  }

  async replicate(data: ReplicarDisciplinasPayload) {
    const turmaOrigem = await this.ensureTurmaFromSchool(
      data.turmaOrigemId,
      data.schoolId,
    );

    const turmaDestinoIds = Array.from(
      new Set(
        (Array.isArray(data.turmaDestinoIds) ? data.turmaDestinoIds : [])
          .map((item) => item?.trim())
          .filter(Boolean),
      ),
    );

    if (turmaDestinoIds.length === 0) {
      throw new BadRequestException("Selecione ao menos uma turma de destino.");
    }

    if (!Array.isArray(data.itens) || data.itens.length === 0) {
      throw new BadRequestException("Nenhuma disciplina foi informada para replicar.");
    }

    const normalizedItems = data.itens.map((item) => ({
      id: item?.id?.trim(),
      nome: item?.nome?.trim(),
      cargaHoraria: Number(item?.cargaHoraria),
    }));

    const invalidItem = normalizedItems.find(
      (item) =>
        !item.id ||
        !item.nome ||
        !Number.isFinite(item.cargaHoraria) ||
        item.cargaHoraria <= 0,
    );

    if (invalidItem) {
      throw new BadRequestException(
        "Todas as disciplinas replicadas precisam ter nome e carga horaria valida.",
      );
    }

    const duplicateNames = normalizedItems.reduce<string[]>((acc, item, index) => {
      const alreadySeen = normalizedItems.findIndex(
        (candidate) =>
          candidate.id === item.id ||
          candidate.nome.toLocaleLowerCase("pt-BR") ===
          item.nome.toLocaleLowerCase("pt-BR"),
      );

      if (alreadySeen !== index && !acc.includes(item.nome!)) {
        acc.push(item.nome!);
      }

      return acc;
    }, []);

    if (duplicateNames.length > 0) {
      throw new BadRequestException(
        `Existem disciplinas repetidas na replicacao: ${duplicateNames.join(", ")}.`,
      );
    }

    const disciplinasOrigem = await this.prisma.disciplinaTurma.findMany({
      where: {
        schoolId: data.schoolId,
        turmaId: turmaOrigem.id,
        id: {
          in: normalizedItems.map((item) => item.id!),
        },
      },
      select: {
        id: true,
        nome: true,
      },
    });

    const chavesOrigem = new Set(
      disciplinasOrigem.map(
        (item) => `${item.id}|${item.nome.toLocaleLowerCase("pt-BR")}`,
      ),
    );

    const notFoundItems = normalizedItems
      .filter(
        (item) =>
          !chavesOrigem.has(
            `${item.id}|${item.nome!.toLocaleLowerCase("pt-BR")}`,
          ),
      )
      .map((item) => item.nome!);

    if (notFoundItems.length > 0) {
      throw new BadRequestException(
        `Estas disciplinas nao existem mais na turma de origem: ${notFoundItems.join(", ")}.`,
      );
    }

    const turmasDestino = await this.prisma.turma.findMany({
      where: {
        schoolId: data.schoolId,
        id: {
          in: turmaDestinoIds,
        },
      },
      select: {
        id: true,
        name: true,
      },
    });

    if (turmasDestino.length !== turmaDestinoIds.length) {
      throw new NotFoundException("Uma ou mais turmas de destino nao foram encontradas.");
    }

    if (turmasDestino.some((turma) => turma.id === turmaOrigem.id)) {
      throw new BadRequestException(
        "A turma de origem nao pode estar entre as turmas de destino.",
      );
    }

    const existentesDestino = await this.prisma.disciplinaTurma.findMany({
      where: {
        turmaId: {
          in: turmasDestino.map((turma) => turma.id),
        },
      },
      select: {
        turmaId: true,
        nome: true,
      },
    });

    const nomesPorTurma = new Map<string, Set<string>>();
    for (const item of existentesDestino) {
      const nomes = nomesPorTurma.get(item.turmaId) || new Set<string>();
      nomes.add(item.nome.toLocaleLowerCase("pt-BR"));
      nomesPorTurma.set(item.turmaId, nomes);
    }

    const createData: Array<{
      schoolId: string;
      turmaId: string;
      serie: string;
      nome: string;
      cargaHoraria: number;
    }> = [];
    const skippedByTurma: Array<{
      turmaId: string;
      turmaNome: string;
      disciplinasIgnoradas: string[];
    }> = [];

    for (const turmaDestino of turmasDestino) {
      const nomesExistentes = nomesPorTurma.get(turmaDestino.id) || new Set<string>();
      const disciplinasIgnoradas: string[] = [];

      for (const item of normalizedItems) {
        const nomeNormalizado = item.nome!.toLocaleLowerCase("pt-BR");

        if (nomesExistentes.has(nomeNormalizado)) {
          disciplinasIgnoradas.push(item.nome!);
          continue;
        }

        nomesExistentes.add(nomeNormalizado);
        createData.push({
          schoolId: data.schoolId,
          turmaId: turmaDestino.id,
          serie: deriveSerieFromTurmaName(turmaDestino.name),
          nome: item.nome!,
          cargaHoraria: item.cargaHoraria,
        });
      }

      if (disciplinasIgnoradas.length > 0) {
        skippedByTurma.push({
          turmaId: turmaDestino.id,
          turmaNome: turmaDestino.name,
          disciplinasIgnoradas,
        });
      }
    }

    if (createData.length === 0) {
      throw new BadRequestException(
        "Nenhuma disciplina nova foi replicada porque todas ja existem nas turmas de destino.",
      );
    }

    await this.prisma.$transaction(
      createData.map((item) =>
        this.prisma.disciplinaTurma.create({
          data: item,
        }),
      ),
    );

    return {
      message: `${createData.length} disciplina(s) replicada(s) com sucesso em ${turmasDestino.length} turma(s).`,
      createdCount: createData.length,
      targetCount: turmasDestino.length,
      skippedByTurma,
    };
  }

  async update(
    id: string,
    data: {
      schoolId: string;
      turmaId?: string;
      serie?: string;
      nome?: string;
      cargaHoraria?: number;
    },
  ) {
    if (!id?.trim()) {
      throw new BadRequestException("Disciplina nao informada.");
    }

    const disciplina = await this.prisma.disciplinaTurma.findFirst({
      where: {
        id: id.trim(),
        schoolId: data.schoolId,
      },
    });

    if (!disciplina) {
      throw new NotFoundException("Disciplina nao encontrada.");
    }

    const updateData: {
      turmaId?: string;
      serie?: string;
      nome?: string;
      cargaHoraria?: number;
    } = {};

    if (data.turmaId !== undefined) {
      const turma = await this.ensureTurmaFromSchool(data.turmaId, data.schoolId);
      updateData.turmaId = turma.id;
    }

    if (data.serie !== undefined) {
      const serie = data.serie.trim();
      if (!serie) {
        throw new BadRequestException("Informe a serie.");
      }
      updateData.serie = serie;
    }

    if (data.nome !== undefined) {
      const nome = data.nome.trim();
      if (!nome) {
        throw new BadRequestException("Informe o nome da disciplina.");
      }

      const turmaId = updateData.turmaId || disciplina.turmaId;
      const duplicada = await this.prisma.disciplinaTurma.findFirst({
        where: {
          turmaId,
          id: {
            not: disciplina.id,
          },
          nome: {
            equals: nome,
            mode: "insensitive",
          },
        },
        select: {
          id: true,
        },
      });

      if (duplicada) {
        throw new BadRequestException(
          "Ja existe uma disciplina com esse nome para a turma selecionada.",
        );
      }

      updateData.nome = nome;
    }

    if (data.cargaHoraria !== undefined) {
      const cargaHoraria = Number(data.cargaHoraria);
      if (!Number.isFinite(cargaHoraria) || cargaHoraria <= 0) {
        throw new BadRequestException("Informe uma carga horaria valida.");
      }
      updateData.cargaHoraria = cargaHoraria;
    }

    return this.prisma.disciplinaTurma.update({
      where: {
        id: disciplina.id,
      },
      data: updateData,
    });
  }

  async remove(id: string, data: { schoolId: string }) {
    if (!id?.trim()) {
      throw new BadRequestException("Disciplina nao informada.");
    }

    const disciplina = await this.prisma.disciplinaTurma.findFirst({
      where: {
        id: id.trim(),
        schoolId: data.schoolId,
      },
      select: {
        id: true,
        nome: true,
      },
    });

    if (!disciplina) {
      throw new NotFoundException("Disciplina nao encontrada.");
    }

    await this.prisma.disciplinaTurma.delete({
      where: {
        id: disciplina.id,
      },
    });

    return {
      message: `Disciplina "${disciplina.nome}" excluida com sucesso.`,
    };
  }

  async removeAllByTurma(data: { schoolId: string; turmaId: string }) {
    const turma = await this.ensureTurmaFromSchool(data.turmaId, data.schoolId);

    const disciplinas = await this.prisma.disciplinaTurma.findMany({
      where: {
        schoolId: data.schoolId,
        turmaId: turma.id,
      },
      select: {
        id: true,
      },
    });

    if (disciplinas.length === 0) {
      throw new BadRequestException(
        "Nao existem disciplinas cadastradas para esta turma.",
      );
    }

    await this.prisma.disciplinaTurma.deleteMany({
      where: {
        schoolId: data.schoolId,
        turmaId: turma.id,
      },
    });

    return {
      message: `${disciplinas.length} disciplina(s) excluida(s) da turma "${turma.name}" com sucesso.`,
      deletedCount: disciplinas.length,
    };
  }
}

function deriveSerieFromTurmaName(turmaName: string) {
  const normalized = String(turmaName || "")
    .replace(/\s+/g, " ")
    .trim();

  const yearMatch = normalized.match(
    /\d{1,2}\s*(?:º|°)?\s*(?:ano|anos|serie|série)/i,
  );

  if (yearMatch) {
    return yearMatch[0]
      .replace(/\s+/g, " ")
      .replace(/serie/i, "Série")
      .replace(/série/i, "Série")
      .replace(/ano/i, "Ano")
      .trim();
  }

  const stageMatch = normalized.match(
    /(berçário|bercario|maternal|jardim|infantil|pré|pre)\s*\w*/i,
  );

  if (stageMatch) {
    return stageMatch[0].replace(/\s+/g, " ").trim();
  }

  const fallback = normalized.split(" ").slice(0, 2).join(" ").trim();
  return fallback || "Sem série";
}
