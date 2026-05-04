"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Printer,
  RefreshCcw,
  Save,
  Send,
  SlidersHorizontal,
  Trash2,
  Wand2,
} from "lucide-react";
import PageHeader from "@/components/ui/page-header";
import { useAuth } from "@/context/auth-context";
import { apiUrl } from "@/lib/api";
import {
  buildProfessorColorMap,
  getProfessorColorStyle,
} from "@/lib/professor-colors";
import {
  buildHorarioSlots,
  calculateHorarioEnd,
  clampHorarioCount,
  createIntervalo,
  DEFAULT_HORARIO_CONFIG,
  getIntervaloAposAula,
  loadHorarioRulesFromStorage,
  getModuladorDraftStorageKey,
  normalizeHorarioConfigs,
  normalizeTurmaHorarioOverrides,
  resolveHorarioConfigForTurma,
  saveHorarioRulesToStorage,
  sanitizeIntervalName,
  type HorarioIntervalo,
  type HorarioRulesStorage,
  type TurmaHorarioOverride,
  normalizeTurno,
  TURNOS_REAIS,
  type HorarioConfig,
  type HorarioSlot,
  type Turno,
} from "@/lib/horario-config";
import { formatTurno } from "@/lib/turno";

type DiaSemana = "SEG" | "TER" | "QUA" | "QUI" | "SEX";
type TurnoFiltro = Turno | "TODOS";

type Professor = {
  id: string;
  name: string;
  email?: string | null;
  role: string;
};

type ProfessorModulado = Professor & {
  totalAulas: number;
  regra: ProfessorRule;
};

type Turma = {
  id: string;
  name: string;
  turno?: string | null;
};

type AulaDuplaMode = "EVITAR" | "PERMITIR" | "PREFERIR" | "OBRIGAR";
type PosicaoPreferida = "QUALQUER" | "ULTIMAS" | "A_PARTIR_SEGUNDA" | "PRIMEIRAS";
type PrintScope = "ESCOLA" | "TURMA" | "PROFESSOR" | "DIARIA";

type AulaContexto = {
  id: string;
  diaSemana: string;
  horaInicio: string;
  horaFim: string;
  disciplina: string;
  turmaProfessorId?: string | null;
  turmaProfessor?: {
    id: string;
    professor?: {
      id: string;
      name: string;
      email?: string | null;
    } | null;
  } | null;
};

type TurmaContexto = {
  id: string;
  name: string;
  turno?: string | null;
  aulas?: AulaContexto[];
};

type Modulacao = {
  id: string;
  disciplina: string;
  cargaHoraria: number;
  diasSemana?: string[];
  professor?: {
    id: string;
    name: string;
    email?: string | null;
  };
};

type ProfessorRule = {
  diasBloqueados: DiaSemana[];
  semPrimeiroHorarioDias: DiaSemana[];
  semUltimoHorarioDias: DiaSemana[];
  posicaoPreferida: PosicaoPreferida;
};

type GlobalRuleConfig = {
  maxAulasProfessorDia: number;
  maxAulasMesmaDisciplinaTurmaDia: number;
  maxAulasDuplasDisciplinaTurmaDia: number;
  evitarSequenciaLongaDisciplina: boolean;
  maxAulasSeguidasMesmaDisciplina: number;
};

type GradeAula = {
  id: string;
  dia: DiaSemana;
  horarioIndex: number;
  horaInicio: string;
  horaFim: string;
  turmaId: string;
  turmaNome: string;
  turno: Turno;
  professorId: string;
  professorNome: string;
  disciplina: string;
  modulacaoId: string;
  origem: "AUTO" | "FIXA";
  aulaId?: string;
};

type Pendencia = {
  modulacaoId: string;
  professorNome: string;
  turmaNome: string;
  disciplina: string;
  faltantes: number;
  motivo: string;
};

type GradeResult = {
  aulas: GradeAula[];
  pendencias: Pendencia[];
};

type ModuladorDraft = {
  turno: TurnoFiltro;
  selectedDia: DiaSemana;
  selectedProfessorId: string;
  horarioConfigs: Record<Turno, HorarioConfig>;
  globalRules: GlobalRuleConfig;
  rules: Record<string, ProfessorRule>;
  grade: GradeResult;
  printScope: PrintScope;
  printTurmaId: string;
  printProfessorId: string;
};

type ModuladorDraftResponse = ModuladorDraft | null;

const DIAS: Array<{ value: DiaSemana; label: string; short: string }> = [
  { value: "SEG", label: "Segunda-feira", short: "Seg" },
  { value: "TER", label: "Terça-feira", short: "Ter" },
  { value: "QUA", label: "Quarta-feira", short: "Qua" },
  { value: "QUI", label: "Quinta-feira", short: "Qui" },
  { value: "SEX", label: "Sexta-feira", short: "Sex" },
];

const TURNOS: Array<{ value: TurnoFiltro; label: string }> = [
  { value: "TODOS", label: "Todos os turnos" },
  { value: "MANHA", label: "Manhã" },
  { value: "TARDE", label: "Tarde" },
  { value: "NOITE", label: "Noite" },
];

const DEFAULT_RULE: ProfessorRule = {
  diasBloqueados: [],
  semPrimeiroHorarioDias: [],
  semUltimoHorarioDias: [],
  posicaoPreferida: "QUALQUER",
};

const DEFAULT_GLOBAL_RULES: GlobalRuleConfig = {
  maxAulasProfessorDia: 20,
  maxAulasMesmaDisciplinaTurmaDia: 2,
  maxAulasDuplasDisciplinaTurmaDia: 1,
  evitarSequenciaLongaDisciplina: true,
  maxAulasSeguidasMesmaDisciplina: 2,
};

const HORARIO_ROW_COLORS = [
  {
    header: "bg-emerald-50/95",
    cell: "bg-emerald-50/45",
    marker: "bg-emerald-500",
  },
  {
    header: "bg-sky-50/95",
    cell: "bg-sky-50/45",
    marker: "bg-sky-500",
  },
  {
    header: "bg-amber-50/95",
    cell: "bg-amber-50/45",
    marker: "bg-amber-500",
  },
  {
    header: "bg-violet-50/95",
    cell: "bg-violet-50/45",
    marker: "bg-violet-500",
  },
  {
    header: "bg-rose-50/95",
    cell: "bg-rose-50/45",
    marker: "bg-rose-500",
  },
  {
    header: "bg-cyan-50/95",
    cell: "bg-cyan-50/45",
    marker: "bg-cyan-500",
  },
];

function getHorarioRowColor(index: number) {
  return HORARIO_ROW_COLORS[index % HORARIO_ROW_COLORS.length];
}

function getTurnoFiltroLabel(turno: TurnoFiltro) {
  if (turno === "TODOS") return "Todos os turnos";
  return formatTurno(turno);
}

function matchesTurnoFiltro(
  turmaTurno: string | null | undefined,
  turno: TurnoFiltro,
) {
  if (turno === "TODOS") return true;
  return normalizeTurno(turmaTurno) === turno;
}

function getTurmaSortInfo(name: string) {
  const normalized = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
  const numberMatch = normalized.match(/\d+/);
  const number = numberMatch ? Number(numberMatch[0]) : 999;
  const isAno =
    normalized.includes(" ANO") ||
    /\d+\s*[ºª]?\s*ANO\b/.test(normalized);
  const isSerie =
    normalized.includes("SERIE") ||
    normalized.includes("ENSINO MEDIO") ||
    /\d+\s*[ªa]?\s*SERIE\b/.test(normalized);
  const suffixMatch = normalized.match(
    /\d+\s*[ºª]?\s*(?:ANO|SERIE)?\s*([A-Z])\b/,
  );
  const suffix = suffixMatch?.[1] || "";

  return {
    group: isAno ? 0 : isSerie ? 1 : 2,
    number,
    suffix,
    normalized,
  };
}

function sortTurmasByEtapa(a: Turma, b: Turma) {
  const turmaA = getTurmaSortInfo(a.name);
  const turmaB = getTurmaSortInfo(b.name);

  return (
    turmaA.group - turmaB.group ||
    turmaA.number - turmaB.number ||
    turmaA.suffix.localeCompare(turmaB.suffix) ||
    turmaA.normalized.localeCompare(turmaB.normalized)
  );
}

function normalizeDiaSemana(value?: string | null): DiaSemana | null {
  const normalized = String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();

  if (["SEG", "SEGUNDA", "SEGUNDA-FEIRA"].includes(normalized)) return "SEG";
  if (["TER", "TERCA", "TERCA-FEIRA"].includes(normalized)) return "TER";
  if (["QUA", "QUARTA", "QUARTA-FEIRA"].includes(normalized)) return "QUA";
  if (["QUI", "QUINTA", "QUINTA-FEIRA"].includes(normalized)) return "QUI";
  if (["SEX", "SEXTA", "SEXTA-FEIRA"].includes(normalized)) return "SEX";
  return null;
}

async function readJson<T>(response: Response): Promise<T> {
  const raw = await response.text();

  if (!raw.trim()) {
    return null as T;
  }

  return JSON.parse(raw) as T;
}

function normalizeHorarioRulesPayload(data?: Partial<HorarioRulesStorage> | null) {
  return {
    officialConfigs: normalizeHorarioConfigs(data?.officialConfigs),
    turmaOverrides: normalizeTurmaHorarioOverrides(data?.turmaOverrides),
  };
}

function normalizeRule(rule?: Partial<ProfessorRule> & {
  semPrimeiroHorario?: boolean;
  semUltimoHorario?: boolean;
}): ProfessorRule {
  const semPrimeiroHorarioDias = Array.isArray(rule?.semPrimeiroHorarioDias)
    ? rule.semPrimeiroHorarioDias
    : rule?.semPrimeiroHorario
      ? DIAS.map((dia) => dia.value)
      : [];
  const semUltimoHorarioDias = Array.isArray(rule?.semUltimoHorarioDias)
    ? rule.semUltimoHorarioDias
    : rule?.semUltimoHorario
      ? DIAS.map((dia) => dia.value)
      : [];

  return {
    ...DEFAULT_RULE,
    ...(rule || {}),
    diasBloqueados: Array.isArray(rule?.diasBloqueados)
      ? rule.diasBloqueados
      : [],
    semPrimeiroHorarioDias,
    semUltimoHorarioDias,
  };
}

function getRule(
  rules: Record<string, ProfessorRule>,
  professorId: string,
): ProfessorRule {
  return normalizeRule(rules[professorId]);
}

function canUseSlot(
  rule: ProfessorRule,
  dia: DiaSemana,
  horarioIndex: number,
  totalHorarios: number,
) {
  return true;
}

function getHorarioOrder(totalHorarios: number, rule: ProfessorRule) {
  return Array.from({ length: totalHorarios }, (_, index) => index);
}

function matchesPositionRule(
  rule: ProfessorRule,
  horarioIndex: number,
  blockSize: number,
  totalHorarios: number,
) {
  return true;
}

function getDiasPermitidosModulacao(modulacao: Modulacao) {
  return DIAS.map((dia) => dia.value);
}

function findHorarioSlotIndexes(aula: AulaContexto, slots: HorarioSlot[]) {
  return slots
    .filter((slot) => aula.horaInicio < slot.fim && aula.horaFim > slot.inicio)
    .map((slot) => slot.index);
}

function buildSlotsFromGradeAulas(aulas: GradeAula[]): HorarioSlot[] {
  const slotsMap = new Map<
    number,
    { inicio: string; fim: string; duracao: number }
  >();

  aulas.forEach((aula) => {
    if (!slotsMap.has(aula.horarioIndex)) {
      const [inicioH, inicioM] = aula.horaInicio.split(":").map(Number);
      const [fimH, fimM] = aula.horaFim.split(":").map(Number);
      const duracao = fimH * 60 + fimM - (inicioH * 60 + inicioM);

      slotsMap.set(aula.horarioIndex, {
        inicio: aula.horaInicio,
        fim: aula.horaFim,
        duracao,
      });
    }
  });

  return Array.from(slotsMap.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([index, slot]) => ({
      index,
      label: `${index + 1}ª aula`,
      inicio: slot.inicio,
      fim: slot.fim,
      duracao: slot.duracao,
    }));
}

function buildSlotsFromContextoAulas(aulas: AulaContexto[]): HorarioSlot[] {
  const slotsMap = new Map<string, HorarioSlot>();

  aulas
    .slice()
    .sort(
      (a, b) =>
        a.horaInicio.localeCompare(b.horaInicio) ||
        a.horaFim.localeCompare(b.horaFim),
    )
    .forEach((aula) => {
      const key = `${aula.horaInicio}-${aula.horaFim}`;

      if (slotsMap.has(key)) return;

      const index = slotsMap.size;
      const [inicioH, inicioM] = aula.horaInicio.split(":").map(Number);
      const [fimH, fimM] = aula.horaFim.split(":").map(Number);

      slotsMap.set(key, {
        index,
        label: `${index + 1}ª aula`,
        inicio: aula.horaInicio,
        fim: aula.horaFim,
        duracao: fimH * 60 + fimM - (inicioH * 60 + inicioM),
      });
    });

  return Array.from(slotsMap.values());
}

function buildAulasFixas(
  turmas: Turma[],
  contextos: TurmaContexto[],
  horarioConfigs: Record<Turno, HorarioConfig>,
  turmaOverrides: Record<string, TurmaHorarioOverride>,
): GradeAula[] {
  const turmasMap = new Map(turmas.map((turma) => [turma.id, turma]));

  return contextos.flatMap((contexto) => {
    const turma = turmasMap.get(contexto.id);
    if (!turma) return [];

    const turno = normalizeTurno(turma.turno);
    const configSlots = buildHorarioSlots(
      resolveHorarioConfigForTurma({
        officialConfigs: horarioConfigs,
        turmaOverrides,
        turmaId: turma.id,
        turno,
      }),
    );
    const actualSlots = buildSlotsFromContextoAulas(contexto.aulas || []);
    const slots = actualSlots.length > configSlots.length ? actualSlots : configSlots;

    return (contexto.aulas || []).flatMap((aula) => {
      const dia = normalizeDiaSemana(aula.diaSemana);
      const professor = aula.turmaProfessor?.professor;
      const horarioIndexes = findHorarioSlotIndexes(aula, slots);

      if (!dia || horarioIndexes.length === 0 || !professor?.id) return [];

      return horarioIndexes.map((horarioIndex) => ({
        id: `fixa-${aula.id}-${horarioIndex}`,
        aulaId: aula.id,
        dia,
        horarioIndex,
        horaInicio: aula.horaInicio,
        horaFim: aula.horaFim,
        turmaId: turma.id,
        turmaNome: turma.name,
        turno,
        professorId: professor.id,
        professorNome: professor.name,
        disciplina: aula.disciplina,
        modulacaoId:
          aula.turmaProfessorId || aula.turmaProfessor?.id || `fixa-${aula.id}`,
        origem: "FIXA" as const,
      }));
    });
  });
}

function buildGrade(
  turmas: Turma[],
  modulacoesPorTurma: Record<string, Modulacao[]>,
  globalRules: GlobalRuleConfig,
  rules: Record<string, ProfessorRule>,
  turno: Turno,
  horarioSlots: HorarioSlot[],
  aulasExistentesTurno: GradeAula[],
): GradeResult {
  const aulasGeradas: GradeAula[] = [];
  const pendencias: Pendencia[] = [];
  const turmaSlot = new Set<string>();
  const professorDiaCount = new Map<string, number>();
  const aulasFixasPorModulacao = new Map<string, number>();
  const professorAgenda = new Map<
    string,
    Array<{ inicio: string; fim: string; gradeAulaId: string }>
  >();
  const turmasDoTurno = turmas.filter((turma) => normalizeTurno(turma.turno) === turno);

  aulasExistentesTurno.forEach((aula) => {
    turmaSlot.add(`${aula.turmaId}-${aula.dia}-${aula.horarioIndex}`);
    const professorAgendaKey = `${aula.professorId}-${aula.dia}`;
    const currentAgenda = professorAgenda.get(professorAgendaKey) || [];
    currentAgenda.push({
      inicio: aula.horaInicio,
      fim: aula.horaFim,
      gradeAulaId: aula.id,
    });
    professorAgenda.set(professorAgendaKey, currentAgenda);

    const diaCountKey = `${aula.professorId}-${aula.dia}`;
    professorDiaCount.set(
      diaCountKey,
      (professorDiaCount.get(diaCountKey) || 0) + 1,
    );

    aulasFixasPorModulacao.set(
      aula.modulacaoId,
      (aulasFixasPorModulacao.get(aula.modulacaoId) || 0) + 1,
    );
  });

  const demandas = turmasDoTurno.flatMap((turma) =>
    (modulacoesPorTurma[turma.id] || [])
      .filter((modulacao) => modulacao.professor?.id && modulacao.cargaHoraria > 0)
      .map((modulacao) => ({
        turma,
        modulacao,
        restantes: Math.max(
          (Number(modulacao.cargaHoraria) || 0) -
            (aulasFixasPorModulacao.get(modulacao.id) || 0),
          0,
        ),
      })),
  );

  demandas.sort((a, b) => {
    return b.restantes - a.restantes;
  });

  function hasProfessorConflict(
    professorId: string,
    dia: DiaSemana,
    inicio: string,
    fim: string,
  ) {
    const agenda = professorAgenda.get(`${professorId}-${dia}`) || [];
    return agenda.some((item) => inicio < item.fim && fim > item.inicio);
  }

  function getAulasTurmaDia(turmaId: string, dia: DiaSemana) {
    return [...aulasExistentesTurno, ...aulasGeradas]
      .filter((aula) => aula.turmaId === turmaId && aula.dia === dia)
      .sort((a, b) => a.horarioIndex - b.horarioIndex);
  }

  function countDisciplinaTurmaDia(
    turmaId: string,
    dia: DiaSemana,
    disciplina: string,
  ) {
    return getAulasTurmaDia(turmaId, dia).filter(
      (aula) => aula.disciplina === disciplina,
    ).length;
  }

  function countDuplasMesmaTurmaDia(
    turmaId: string,
    dia: DiaSemana,
    disciplina: string,
  ) {
    const aulasDia = getAulasTurmaDia(turmaId, dia);
    let total = 0;

    for (let index = 1; index < aulasDia.length; index += 1) {
      const anterior = aulasDia[index - 1];
      const atual = aulasDia[index];

      if (
        anterior.disciplina === disciplina &&
        atual.disciplina === disciplina &&
        atual.horarioIndex === anterior.horarioIndex + 1
      ) {
        total += 1;
        index += 1;
      }
    }

    return total;
  }

  function getSequenciaDisciplinaAoRedor(
    turmaId: string,
    dia: DiaSemana,
    disciplina: string,
    horarioIndex: number,
  ) {
    const aulasDia = getAulasTurmaDia(turmaId, dia);
    const indexes = new Set(
      aulasDia
        .filter((aula) => aula.disciplina === disciplina)
        .map((aula) => aula.horarioIndex),
    );

    let antes = 0;
    let cursorAntes = horarioIndex - 1;
    while (indexes.has(cursorAntes)) {
      antes += 1;
      cursorAntes -= 1;
    }

    let depois = 0;
    let cursorDepois = horarioIndex + 1;
    while (indexes.has(cursorDepois)) {
      depois += 1;
      cursorDepois += 1;
    }

    return antes + 1 + depois;
  }

  function canPlaceBlock(
    demanda: (typeof demandas)[number],
    dia: DiaSemana,
    horarioIndex: number,
    blockSize: number,
    options?: {
      ignoreDisciplinaLimite?: boolean;
      ignoreDuplasMesmaTurma?: boolean;
      ignoreSequenciaDisciplina?: boolean;
    },
  ) {
    const professorId = demanda.modulacao.professor?.id;
    if (!professorId || demanda.restantes < blockSize) return false;

    const rule = getRule(rules, professorId);
    const totalHorarios = horarioSlots.length;
    const diaCountKey = `${professorId}-${dia}`;
    const currentDayCount = professorDiaCount.get(diaCountKey) || 0;

    if (horarioIndex + blockSize > totalHorarios) return false;
    if (currentDayCount + blockSize > globalRules.maxAulasProfessorDia) {
      return false;
    }
    if (
      !options?.ignoreDisciplinaLimite &&
      countDisciplinaTurmaDia(
        demanda.turma.id,
        dia,
        demanda.modulacao.disciplina,
      ) +
        blockSize >
      globalRules.maxAulasMesmaDisciplinaTurmaDia
    ) {
      return false;
    }
    if (
      blockSize === 2 &&
      !options?.ignoreDuplasMesmaTurma &&
      countDuplasMesmaTurmaDia(
        demanda.turma.id,
        dia,
        demanda.modulacao.disciplina,
      ) >= globalRules.maxAulasDuplasDisciplinaTurmaDia
    ) {
      return false;
    }

    for (let offset = 0; offset < blockSize; offset++) {
      const index = horarioIndex + offset;
      const turmaKey = `${demanda.turma.id}-${dia}-${index}`;
      const slot = horarioSlots[index];

      if (!slot) return false;
      if (rule.semPrimeiroHorarioDias.includes(dia) && index === 0) return false;
      if (rule.semUltimoHorarioDias.includes(dia) && index === totalHorarios - 1) {
        return false;
      }
      if (turmaSlot.has(turmaKey)) return false;
      if (hasProfessorConflict(professorId, dia, slot.inicio, slot.fim)) return false;
      if (
        !options?.ignoreSequenciaDisciplina &&
        globalRules.evitarSequenciaLongaDisciplina &&
        getSequenciaDisciplinaAoRedor(
          demanda.turma.id,
          dia,
          demanda.modulacao.disciplina,
          index,
        ) > globalRules.maxAulasSeguidasMesmaDisciplina
      ) {
        return false;
      }
    }

    return true;
  }

  function canPlaceFallback(
    demanda: (typeof demandas)[number],
    dia: DiaSemana,
    horarioIndex: number,
    options?: {
      ignoreMaxAulasDia?: boolean;
      ignoreHorarioExtremos?: boolean;
      ignoreDisciplinaLimite?: boolean;
      ignoreSequenciaDisciplina?: boolean;
    },
  ) {
    const professorId = demanda.modulacao.professor?.id;
    if (!professorId || demanda.restantes < 1) return false;

    const rule = getRule(rules, professorId);
    const diaCountKey = `${professorId}-${dia}`;
    const currentDayCount = professorDiaCount.get(diaCountKey) || 0;
    const turmaKey = `${demanda.turma.id}-${dia}-${horarioIndex}`;
    const slot = horarioSlots[horarioIndex];
    const totalHorarios = horarioSlots.length;

    if (!slot) return false;
    if (rule.semPrimeiroHorarioDias.includes(dia) && horarioIndex === 0) return false;
    if (rule.semUltimoHorarioDias.includes(dia) && horarioIndex === totalHorarios - 1) {
      return false;
    }
    if (turmaSlot.has(turmaKey)) return false;
    if (hasProfessorConflict(professorId, dia, slot.inicio, slot.fim)) return false;
    if (currentDayCount + 1 > globalRules.maxAulasProfessorDia) return false;
    if (
      !options?.ignoreDisciplinaLimite &&
      countDisciplinaTurmaDia(
        demanda.turma.id,
        dia,
        demanda.modulacao.disciplina,
      ) >= globalRules.maxAulasMesmaDisciplinaTurmaDia
    ) {
      return false;
    }
    if (
      !options?.ignoreSequenciaDisciplina &&
      globalRules.evitarSequenciaLongaDisciplina &&
      getSequenciaDisciplinaAoRedor(
        demanda.turma.id,
        dia,
        demanda.modulacao.disciplina,
        horarioIndex,
      ) > globalRules.maxAulasSeguidasMesmaDisciplina
    ) {
      return false;
    }

    return true;
  }

  function placeBlock(
    demanda: (typeof demandas)[number],
    dia: DiaSemana,
    horarioIndex: number,
    blockSize: number,
  ) {
    const professor = demanda.modulacao.professor;
    if (!professor) return;

    const diaCountKey = `${professor.id}-${dia}`;

    for (let offset = 0; offset < blockSize; offset++) {
      const index = horarioIndex + offset;
      const slot = horarioSlots[index];
      if (!slot) continue;

      turmaSlot.add(`${demanda.turma.id}-${dia}-${index}`);
      const professorAgendaKey = `${professor.id}-${dia}`;
      const currentAgenda = professorAgenda.get(professorAgendaKey) || [];
      currentAgenda.push({
        inicio: slot.inicio,
        fim: slot.fim,
        gradeAulaId: `${demanda.modulacao.id}-${dia}-${index}`,
      });
      professorAgenda.set(professorAgendaKey, currentAgenda);

      aulasGeradas.push({
        id: `${demanda.modulacao.id}-${dia}-${index}`,
        dia,
        horarioIndex: index,
        horaInicio: slot.inicio,
        horaFim: slot.fim,
        turmaId: demanda.turma.id,
        turmaNome: demanda.turma.name,
        turno,
        professorId: professor.id,
        professorNome: professor.name,
        disciplina: demanda.modulacao.disciplina,
        modulacaoId: demanda.modulacao.id,
        origem: "AUTO",
      });
    }

    professorDiaCount.set(
      diaCountKey,
      (professorDiaCount.get(diaCountKey) || 0) + blockSize,
    );
    demanda.restantes -= blockSize;

  }

  function removeGeneratedAula(aulaId: string) {
    const aulaIndex = aulasGeradas.findIndex((item) => item.id === aulaId);
    if (aulaIndex === -1) return null;

    const [aula] = aulasGeradas.splice(aulaIndex, 1);
    turmaSlot.delete(`${aula.turmaId}-${aula.dia}-${aula.horarioIndex}`);

    const agendaKey = `${aula.professorId}-${aula.dia}`;
    const agendaAtual = professorAgenda.get(agendaKey) || [];
    professorAgenda.set(
      agendaKey,
      agendaAtual.filter((item) => item.gradeAulaId !== aula.id),
    );

    const diaCountKey = `${aula.professorId}-${aula.dia}`;
    professorDiaCount.set(
      diaCountKey,
      Math.max((professorDiaCount.get(diaCountKey) || 1) - 1, 0),
    );

    return aula;
  }

  function findGeneratedAulaAt(
    turmaId: string,
    dia: DiaSemana,
    horarioIndex: number,
  ) {
    return aulasGeradas.find(
      (aula) =>
        aula.turmaId === turmaId &&
        aula.dia === dia &&
        aula.horarioIndex === horarioIndex,
    );
  }

  function tryPlace(demanda: (typeof demandas)[number], blockSize: number) {
    const professorId = demanda.modulacao.professor?.id;
    if (!professorId) return false;

    const regraProfessor = getRule(rules, professorId);
    const diasPermitidos = getDiasPermitidosModulacao(demanda.modulacao).filter(
      (dia) => !regraProfessor.diasBloqueados.includes(dia),
    );

    for (const dia of DIAS.filter((item) => diasPermitidos.includes(item.value))) {
      for (const horarioIndex of getHorarioOrder(
        horarioSlots.length,
        regraProfessor,
      )) {
        if (canPlaceBlock(demanda, dia.value, horarioIndex, blockSize)) {
          placeBlock(demanda, dia.value, horarioIndex, blockSize);
          return true;
        }
      }
    }

    return false;
  }

  demandas.forEach((demanda) => {
    const professorId = demanda.modulacao.professor?.id;
    if (!professorId) return;

    while (demanda.restantes > 0) {
      if (!tryPlace(demanda, 1)) {
        break;
      }
    }
  });

  const fallbackPasses = [{ ignoreMaxAulasDia: true, ignoreHorarioExtremos: true }];

  fallbackPasses.forEach((pass) => {
    turmasDoTurno.forEach((turma) => {
      DIAS.forEach((dia) => {
        for (let horarioIndex = 0; horarioIndex < horarioSlots.length; horarioIndex += 1) {
          const turmaKey = `${turma.id}-${dia.value}-${horarioIndex}`;
          if (turmaSlot.has(turmaKey)) continue;

          const candidatos = demandas
            .filter((demanda) => demanda.turma.id === turma.id && demanda.restantes > 0)
            .sort((a, b) => {
              const professorA = a.modulacao.professor?.id || "";
              const professorB = b.modulacao.professor?.id || "";
              const diaCountA =
                professorDiaCount.get(`${professorA}-${dia.value}`) || 0;
              const diaCountB =
                professorDiaCount.get(`${professorB}-${dia.value}`) || 0;

              return b.restantes - a.restantes || diaCountA - diaCountB;
            });

          const candidato = candidatos.find((demanda) =>
            canPlaceFallback(demanda, dia.value, horarioIndex, pass),
          );

          if (candidato) {
            placeBlock(candidato, dia.value, horarioIndex, 1);
          }
        }
      });
    });
  });

  function tryRepairDemand(demanda: (typeof demandas)[number]) {
    for (const dia of DIAS) {
      for (let horarioIndex = 0; horarioIndex < horarioSlots.length; horarioIndex += 1) {
        const turmaKey = `${demanda.turma.id}-${dia.value}-${horarioIndex}`;

        if (
          !turmaSlot.has(turmaKey) &&
          canPlaceFallback(demanda, dia.value, horarioIndex)
        ) {
          placeBlock(demanda, dia.value, horarioIndex, 1);
          return true;
        }

        const ocupante = findGeneratedAulaAt(
          demanda.turma.id,
          dia.value,
          horarioIndex,
        );
        if (!ocupante) continue;

        const demandaOcupante = demandas.find(
          (item) => item.modulacao.id === ocupante.modulacaoId,
        );
        if (!demandaOcupante) continue;

        const aulaRemovida = removeGeneratedAula(ocupante.id);
        if (!aulaRemovida) continue;
        demandaOcupante.restantes += 1;

        const encaixouDemanda = canPlaceFallback(
          demanda,
          dia.value,
          horarioIndex,
        );

        if (!encaixouDemanda) {
          placeBlock(demandaOcupante, aulaRemovida.dia, aulaRemovida.horarioIndex, 1);
          continue;
        }

        placeBlock(demanda, dia.value, horarioIndex, 1);

        let recolocouOcupante = false;
        for (const diaRelocacao of DIAS) {
          for (
            let horarioRelocacao = 0;
            horarioRelocacao < horarioSlots.length;
            horarioRelocacao += 1
          ) {
            const mesmaPosicao =
              diaRelocacao.value === aulaRemovida.dia &&
              horarioRelocacao === aulaRemovida.horarioIndex;
            if (mesmaPosicao) continue;

            if (
              canPlaceFallback(
                demandaOcupante,
                diaRelocacao.value,
                horarioRelocacao,
              )
            ) {
              placeBlock(
                demandaOcupante,
                diaRelocacao.value,
                horarioRelocacao,
                1,
              );
              recolocouOcupante = true;
              break;
            }
          }

          if (recolocouOcupante) break;
        }

        if (recolocouOcupante) {
          return true;
        }

        const aulaInserida = findGeneratedAulaAt(
          demanda.turma.id,
          dia.value,
          horarioIndex,
        );
        if (aulaInserida) {
          removeGeneratedAula(aulaInserida.id);
          demanda.restantes += 1;
        }

        placeBlock(demandaOcupante, aulaRemovida.dia, aulaRemovida.horarioIndex, 1);
      }
    }

    return false;
  }

  let houveMudanca = true;
  while (houveMudanca) {
    houveMudanca = false;

    demandas
      .filter((item) => item.restantes > 0)
      .sort((a, b) => b.restantes - a.restantes)
      .forEach((demanda) => {
        while (demanda.restantes > 0 && tryRepairDemand(demanda)) {
          houveMudanca = true;
        }
      });
  }

  function diagnosticarMotivoPendencia(demanda: (typeof demandas)[number]) {
    const professorId = demanda.modulacao.professor?.id;
    if (!professorId) {
      return "Professor da modulação não identificado.";
    }

    let encontrouTurmaLivre = false;
    let encontrouProfessorLivre = false;

    for (const dia of DIAS) {
      for (let horarioIndex = 0; horarioIndex < horarioSlots.length; horarioIndex += 1) {
        const slot = horarioSlots[horarioIndex];
        if (!slot) continue;

        const turmaKey = `${demanda.turma.id}-${dia.value}-${horarioIndex}`;
        const professorLivre = !hasProfessorConflict(
          professorId,
          dia.value,
          slot.inicio,
          slot.fim,
        );
        const turmaLivre = !turmaSlot.has(turmaKey);

        if (turmaLivre) encontrouTurmaLivre = true;
        if (professorLivre) encontrouProfessorLivre = true;

        if (!turmaLivre || !professorLivre) continue;

        const mesmaDisciplinaDia = countDisciplinaTurmaDia(
          demanda.turma.id,
          dia.value,
          demanda.modulacao.disciplina,
        );
        if (mesmaDisciplinaDia >= globalRules.maxAulasMesmaDisciplinaTurmaDia) {
          return `Limite da disciplina ${demanda.modulacao.disciplina} atingido nesta turma no dia.`;
        }

        if (
          globalRules.evitarSequenciaLongaDisciplina &&
          getSequenciaDisciplinaAoRedor(
            demanda.turma.id,
            dia.value,
            demanda.modulacao.disciplina,
            horarioIndex,
          ) > globalRules.maxAulasSeguidasMesmaDisciplina
        ) {
          return `Sequência máxima de ${globalRules.maxAulasSeguidasMesmaDisciplina} aula(s) seguidas de ${demanda.modulacao.disciplina} atingida.`;
        }
      }
    }

    if (!encontrouProfessorLivre) {
      return `Professor ${demanda.modulacao.professor?.name || "selecionado"} sem horário disponível nesta grade.`;
    }

    if (!encontrouTurmaLivre) {
      return `Turma ${demanda.turma.name} sem espaço livre na grade para encaixar ${demanda.modulacao.disciplina}.`;
    }

    return `Não foi possível encaixar ${demanda.modulacao.disciplina} com as regras globais e exceções atuais.`;
  }

  demandas
    .filter((item) => item.restantes > 0)
    .forEach((item) => {
      pendencias.push({
        modulacaoId: item.modulacao.id,
        professorNome: item.modulacao.professor?.name || "Professor",
        turmaNome: item.turma.name,
        disciplina: item.modulacao.disciplina,
        faltantes: item.restantes,
        motivo: diagnosticarMotivoPendencia(item),
      });
    });

  return { aulas: aulasGeradas, pendencias };
}

function buildGradeCompleta(
  turmas: Turma[],
  modulacoesPorTurma: Record<string, Modulacao[]>,
  globalRules: GlobalRuleConfig,
  rules: Record<string, ProfessorRule>,
  horarioConfigs: Record<Turno, HorarioConfig>,
  turmaOverrides: Record<string, TurmaHorarioOverride>,
  aulasFixas: GradeAula[],
): GradeResult {
  const resultados = TURNOS_REAIS.map((value) => {
    const turmasDoTurno = turmas.filter(
      (turma) => normalizeTurno(turma.turno) === value,
    );
    const grupos = new Map<
      string,
      { turmas: Turma[]; slots: HorarioSlot[]; turmaIds: Set<string> }
    >();

    turmasDoTurno.forEach((turma) => {
      const config = resolveHorarioConfigForTurma({
        officialConfigs: horarioConfigs,
        turmaOverrides,
        turmaId: turma.id,
        turno: value,
      });
      const key = JSON.stringify(config);
      const existente = grupos.get(key);

      if (existente) {
        existente.turmas.push(turma);
        existente.turmaIds.add(turma.id);
        return;
      }

      grupos.set(key, {
        turmas: [turma],
        slots: buildHorarioSlots(config),
        turmaIds: new Set([turma.id]),
      });
    });

    const gruposOrdenados = Array.from(grupos.values()).sort(
      (a, b) => b.turmas.length - a.turmas.length,
    );
    const aulasTurno = aulasFixas.filter((aula) => aula.turno === value);
    const pendenciasTurno: Pendencia[] = [];

    gruposOrdenados.forEach((grupo) => {
      const resultadoGrupo = buildGrade(
        grupo.turmas,
        modulacoesPorTurma,
        globalRules,
        rules,
        value,
        grupo.slots,
        aulasTurno,
      );

      aulasTurno.push(...resultadoGrupo.aulas);
      pendenciasTurno.push(...resultadoGrupo.pendencias);
    });

    return {
      aulas: aulasTurno,
      pendencias: pendenciasTurno,
    };
  });

  return {
    aulas: resultados.flatMap((resultado) => resultado.aulas),
    pendencias: resultados.flatMap((resultado) => resultado.pendencias),
  };
}

export default function ModuladorPage() {
  const { token, user, selectedSchool } = useAuth();
  const [professores, setProfessores] = useState<Professor[]>([]);
  const [turmas, setTurmas] = useState<Turma[]>([]);
  const [contextosComAulas, setContextosComAulas] = useState<TurmaContexto[]>([]);
  const [modulacoesPorTurma, setModulacoesPorTurma] = useState<Record<string, Modulacao[]>>({});
  const [globalRules, setGlobalRules] = useState<GlobalRuleConfig>(
    DEFAULT_GLOBAL_RULES,
  );
  const [rules, setRules] = useState<Record<string, ProfessorRule>>({});
  const [turmaOverrides, setTurmaOverrides] = useState<
    Record<string, TurmaHorarioOverride>
  >({});
  const [selectedProfessorId, setSelectedProfessorId] = useState("");
  const [turno, setTurno] = useState<TurnoFiltro>("TODOS");
  const [selectedDia, setSelectedDia] = useState<DiaSemana>("SEG");
  const [horarioConfigs, setHorarioConfigs] = useState(DEFAULT_HORARIO_CONFIG);
  const [grade, setGrade] = useState<GradeResult>({ aulas: [], pendencias: [] });
  const [printScope, setPrintScope] = useState<PrintScope>("ESCOLA");
  const [printTurmaId, setPrintTurmaId] = useState("");
  const [printProfessorId, setPrintProfessorId] = useState("");
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const canManage =
    user?.role === "ADMIN_ESCOLA" ||
    user?.role === "GESTOR" ||
    user?.role === "SECRETARIA";

  const horarioTurno: Turno = turno === "TODOS" ? "MANHA" : turno;
  const selectedRule = selectedProfessorId
    ? getRule(rules, selectedProfessorId)
    : DEFAULT_RULE;
  const horarioConfig = horarioConfigs[horarioTurno];
  const horarioSlots = useMemo(
    () => buildHorarioSlots(horarioConfig),
    [horarioConfig],
  );
  const horarioSlotsExibicao = useMemo(() => {
    const gradeSlots = buildSlotsFromGradeAulas(
      grade.aulas.filter((aula) => aula.turno === horarioTurno),
    );

    return gradeSlots.length > horarioSlots.length ? gradeSlots : horarioSlots;
  }, [grade.aulas, horarioSlots, horarioTurno]);
  const aulasFixas = useMemo(
    () => buildAulasFixas(turmas, contextosComAulas, horarioConfigs, turmaOverrides),
    [contextosComAulas, horarioConfigs, turmaOverrides, turmas],
  );
  const turmasOrdenadas = useMemo(
    () => [...turmas].sort(sortTurmasByEtapa),
    [turmas],
  );
  const turmasDoTurno = useMemo(
    () =>
      turmasOrdenadas
        .filter((turma) => matchesTurnoFiltro(turma.turno, turno))
        .sort(sortTurmasByEtapa),
    [turmasOrdenadas, turno],
  );
  const professoresNaGrade = useMemo(() => {
    const map = new Map<string, string>();

    grade.aulas.forEach((aula) => {
      map.set(aula.professorId, aula.professorNome);
    });

    return Array.from(map, ([id, name]) => ({ id, name })).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }, [grade.aulas]);
  const professorColors = useMemo(
    () =>
      buildProfessorColorMap(
        grade.aulas.map((aula) => ({
          id: aula.professorId,
          name: aula.professorNome,
        })),
      ),
    [grade.aulas],
  );
  const pendenciasPorTurma = useMemo(() => {
    const map = new Map<string, Pendencia[]>();

    grade.pendencias.forEach((pendencia) => {
      const current = map.get(pendencia.turmaNome) || [];
      current.push(pendencia);
      map.set(pendencia.turmaNome, current);
    });

    return map;
  }, [grade.pendencias]);
  const turmasImpressao = useMemo(() => {
    if (printScope === "TURMA" && printTurmaId) {
      return turmasDoTurno.filter((turma) => turma.id === printTurmaId);
    }

    if (printScope === "PROFESSOR" && printProfessorId) {
      const turmaIds = new Set(
        grade.aulas
          .filter((aula) => aula.professorId === printProfessorId)
          .map((aula) => aula.turmaId),
      );
      return turmasDoTurno.filter((turma) => turmaIds.has(turma.id));
    }

    return turmasDoTurno;
  }, [grade.aulas, printProfessorId, printScope, printTurmaId, turmasDoTurno]);
  const gruposTurmasImpressao = useMemo(() => {
    const grupos = new Map<
      string,
      {
        key: string;
        slots: HorarioSlot[];
        turmas: Turma[];
        isCustom: boolean;
      }
    >();

    turmasImpressao.forEach((turma) => {
      const turnoTurma = normalizeTurno(turma.turno);
      const config = resolveHorarioConfigForTurma({
        officialConfigs: horarioConfigs,
        turmaOverrides,
        turmaId: turma.id,
        turno: turnoTurma,
      });
      const configSlots = buildHorarioSlots(config);
      const gradeSlots = buildSlotsFromGradeAulas(
        grade.aulas.filter((aula) => aula.turmaId === turma.id),
      );
      const slots = gradeSlots.length > configSlots.length ? gradeSlots : configSlots;
      const key = JSON.stringify(slots);
      const existente = grupos.get(key);

      if (existente) {
        existente.turmas.push(turma);
        return;
      }

      grupos.set(key, {
        key,
        slots,
        turmas: [turma],
        isCustom: Boolean(turmaOverrides[turma.id]?.enabled),
      });
    });

    return Array.from(grupos.values());
  }, [horarioConfigs, turmaOverrides, turmasImpressao]);

  const professoresModulados = useMemo<ProfessorModulado[]>(() => {
    const professoresBase = new Map<string, Professor>();

    professores.forEach((professor) => {
      professoresBase.set(professor.id, professor);
    });

    const totalPorProfessor = new Map<string, number>();

    Object.values(modulacoesPorTurma).forEach((modulacoes) => {
      modulacoes.forEach((modulacao) => {
        const professorId = modulacao.professor?.id;
        if (!professorId) return;

        const professorExistente = professoresBase.get(professorId);
        professoresBase.set(professorId, {
          id: professorId,
          name:
            professorExistente?.name ||
            modulacao.professor?.name ||
            "Professor",
          email:
            professorExistente?.email ||
            modulacao.professor?.email ||
            null,
          role: professorExistente?.role || "PROFESSOR",
        });

        totalPorProfessor.set(
          professorId,
          (totalPorProfessor.get(professorId) || 0) +
            (Number(modulacao.cargaHoraria) || 0),
        );
      });
    });

    return Array.from(totalPorProfessor.entries())
      .map(([professorId, totalAulas]) => {
        const professor = professoresBase.get(professorId);

        return {
          id: professorId,
          name: professor?.name || "Professor",
          email: professor?.email || null,
          role: professor?.role || "PROFESSOR",
          totalAulas,
          regra: getRule(rules, professorId),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [professores, modulacoesPorTurma, rules]);

  const professoresComModulacao = professoresModulados;

  const modulacoesTurno = useMemo(() => {
    return turmas
      .filter((turma) => matchesTurnoFiltro(turma.turno, turno))
      .flatMap((turma) =>
        (modulacoesPorTurma[turma.id] || []).map((modulacao) => ({
          turma,
          modulacao,
        })),
      );
  }, [turmas, modulacoesPorTurma, turno]);

  useEffect(() => {
    if (professoresModulados.length === 0) {
      setSelectedProfessorId("");
      return;
    }

    setSelectedProfessorId((current) =>
      current && professoresModulados.some((professor) => professor.id === current)
        ? current
        : professoresModulados[0]?.id || "",
    );
  }, [professoresModulados]);

  function authHeaders(extra?: Record<string, string>) {
    return {
      Authorization: `Bearer ${token}`,
      ...(selectedSchool?.id ? { "x-school-id": selectedSchool.id } : {}),
      ...(extra || {}),
    };
  }

  function getDraftStorageKey() {
    const schoolKey = selectedSchool?.id || user?.schoolId || "sem-escola";
    return getModuladorDraftStorageKey(schoolKey);
  }

  function getSchoolKey() {
    return selectedSchool?.id || user?.schoolId || "sem-escola";
  }

  function applyDraft(draft: ModuladorDraft) {
    setTurno(draft.turno || "TODOS");
    setSelectedDia(draft.selectedDia || "SEG");
    setSelectedProfessorId(draft.selectedProfessorId || "");
    if (draft.horarioConfigs) {
      setHorarioConfigs(normalizeHorarioConfigs(draft.horarioConfigs));
    }
    setGlobalRules(draft.globalRules || DEFAULT_GLOBAL_RULES);
    setRules(draft.rules || {});
    setGrade(draft.grade || { aulas: [], pendencias: [] });
    setPrintScope(draft.printScope || "ESCOLA");
    setPrintTurmaId(draft.printTurmaId || "");
    setPrintProfessorId(draft.printProfessorId || "");
  }

  function loadLocalDraftFromStorage(sharedRules?: HorarioRulesStorage | null) {
    if (typeof window === "undefined") return;

    const horarioRules = sharedRules || loadHorarioRulesFromStorage(getSchoolKey());
    if (horarioRules) {
      setHorarioConfigs(horarioRules.officialConfigs);
      setTurmaOverrides(horarioRules.turmaOverrides);
    }

    const rawDraft = window.localStorage.getItem(getDraftStorageKey());
    if (!rawDraft) return;

    try {
      const draft = JSON.parse(rawDraft) as ModuladorDraft;
      applyDraft(draft);
    } catch {
      window.localStorage.removeItem(getDraftStorageKey());
    }
  }

  function resetToSharedState(params: {
    horarioRules: HorarioRulesStorage;
    aulasConfirmadas?: GradeAula[];
  }) {
    setTurno("TODOS");
    setSelectedDia("SEG");
    setSelectedProfessorId("");
    setHorarioConfigs(params.horarioRules.officialConfigs);
    setTurmaOverrides(params.horarioRules.turmaOverrides);
    setGlobalRules(DEFAULT_GLOBAL_RULES);
    setRules({});
    setGrade({
      aulas: params.aulasConfirmadas || [],
      pendencias: [],
    });
    setPrintScope("ESCOLA");
    setPrintTurmaId("");
    setPrintProfessorId("");
  }

  function saveDraftToStorage(draft: ModuladorDraft) {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(getDraftStorageKey(), JSON.stringify(draft));
  }

  function clearDraftFromStorage() {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem(getDraftStorageKey());
  }

  function buildCurrentDraft(): ModuladorDraft {
    return {
      turno,
      selectedDia,
      selectedProfessorId,
      horarioConfigs,
      globalRules,
      rules,
      grade,
      printScope,
      printTurmaId,
      printProfessorId,
    };
  }

  async function persistSharedHorarioRules(
    nextOfficialConfigs: Record<Turno, HorarioConfig>,
    nextTurmaOverrides: Record<string, TurmaHorarioOverride>,
  ) {
    const payload: HorarioRulesStorage = {
      officialConfigs: normalizeHorarioConfigs(nextOfficialConfigs),
      turmaOverrides: nextTurmaOverrides,
    };

    saveHorarioRulesToStorage(getSchoolKey(), payload);

    if (!token || !canManage) return;

    const response = await fetch(apiUrl("/aulas/horario-rules"), {
      method: "PATCH",
      headers: authHeaders({
        "Content-Type": "application/json",
      }),
      body: JSON.stringify(payload),
    });
    const data = await readJson<{ message?: string }>(response);

    if (!response.ok) {
      throw new Error(
        data.message || "Não foi possível sincronizar as configurações da grade.",
      );
    }
  }

  async function persistSharedDraft(draft: ModuladorDraft) {
    saveDraftToStorage(draft);

    if (!token || !canManage) return;

    const response = await fetch(apiUrl("/aulas/modulador-draft"), {
      method: "PATCH",
      headers: authHeaders({
        "Content-Type": "application/json",
      }),
      body: JSON.stringify({
        draft,
      }),
    });
    const data = await readJson<{ message?: string }>(response);

    if (!response.ok) {
      throw new Error(
        data.message || "Não foi possível sincronizar a grade do modulador.",
      );
    }
  }

  async function clearSharedDraft() {
    clearDraftFromStorage();

    if (!token || !canManage) return;

    const response = await fetch(apiUrl("/aulas/modulador-draft"), {
      method: "DELETE",
      headers: authHeaders(),
    });
    const data = await readJson<{ message?: string }>(response);

    if (!response.ok) {
      throw new Error(
        data.message || "Não foi possível limpar a grade compartilhada do modulador.",
      );
    }
  }

  const fetchData = useCallback(async () => {
    if (!token) return;

    if (user?.role === "SUPERUSUARIO" && !selectedSchool?.id) {
      setTurmas([]);
      setProfessores([]);
      setModulacoesPorTurma({});
      setErrorMessage("Selecione uma escola no painel do superusuário para carregar o modulador.");
      return;
    }

    try {
      setLoading(true);
      setErrorMessage("");

      const [
        usersResponse,
        turmasResponse,
        contextosResponse,
        horarioRulesResponse,
        moduladorDraftResponse,
      ] =
        await Promise.all([
        fetch(apiUrl("/users"), {
          headers: authHeaders(),
        }),
        fetch(apiUrl("/turmas"), {
          headers: authHeaders(),
        }),
        fetch(apiUrl("/aulas/contextos"), {
          headers: authHeaders(),
        }),
        fetch(apiUrl("/aulas/horario-rules"), {
          headers: authHeaders(),
        }),
        fetch(apiUrl("/aulas/modulador-draft"), {
          headers: authHeaders(),
        }),
      ]);

      const [
        usersData,
        turmasData,
        contextosData,
        horarioRulesData,
        moduladorDraftData,
      ] = await Promise.all([
        readJson<Professor[]>(usersResponse),
        readJson<Turma[]>(turmasResponse),
        readJson<TurmaContexto[]>(contextosResponse),
        readJson<Partial<HorarioRulesStorage> & { message?: string }>(horarioRulesResponse),
        readJson<ModuladorDraftResponse | { message?: string }>(moduladorDraftResponse),
      ]);

      if (!usersResponse.ok) {
        throw new Error(
          (usersData as any)?.message || "Erro ao carregar professores."
        );
      }
      if (!turmasResponse.ok) {
        throw new Error(
          (turmasData as any)?.message || "Erro ao carregar turmas."
        );
      }
      if (!contextosResponse.ok) {
        throw new Error(
          (contextosData as any)?.message || "Erro ao carregar aulas ja lancadas."
        );
      }
      if (!horarioRulesResponse.ok) {
        throw new Error(
          (horarioRulesData as any)?.message ||
            "Erro ao carregar configuracoes compartilhadas da grade.",
        );
      }
      if (!moduladorDraftResponse.ok) {
        throw new Error(
          (moduladorDraftData as any)?.message ||
            "Erro ao carregar a grade compartilhada do modulador.",
        );
      }

      const onlyProfessors = Array.isArray(usersData)
        ? usersData.filter((item) => item.role === "PROFESSOR")
        : [];
      const turmasList = Array.isArray(turmasData) ? turmasData : [];
      const contextosList = Array.isArray(contextosData) ? contextosData : [];
      const normalizedHorarioRules = normalizeHorarioRulesPayload(horarioRulesData);
      const aulasConfirmadas = buildAulasFixas(
        turmasList,
        contextosList,
        normalizedHorarioRules.officialConfigs,
        normalizedHorarioRules.turmaOverrides,
      );

      setProfessores(onlyProfessors);
      setTurmas(turmasList);
      setContextosComAulas(contextosList);
      setHorarioConfigs(normalizedHorarioRules.officialConfigs);
      setTurmaOverrides(normalizedHorarioRules.turmaOverrides);
      saveHorarioRulesToStorage(getSchoolKey(), normalizedHorarioRules);

      const entries = await Promise.all(
        turmasList.map(async (turma) => {
          const response = await fetch(apiUrl(`/turma-professor/${turma.id}`), {
            headers: authHeaders(),
          });
          const data = await readJson<Modulacao[]>(response);
          return [turma.id, response.ok && Array.isArray(data) ? data : []] as const;
        }),
      );

      setModulacoesPorTurma(Object.fromEntries(entries));
      if (moduladorDraftData && typeof moduladorDraftData === "object" && "grade" in moduladorDraftData) {
        const draft = moduladorDraftData as ModuladorDraft;
        applyDraft(draft);
        saveDraftToStorage(draft);

        if (!draft.horarioConfigs) {
          setHorarioConfigs(normalizedHorarioRules.officialConfigs);
        }
        if (!draft.grade?.aulas?.length && aulasConfirmadas.length > 0) {
          setGrade({
            aulas: aulasConfirmadas,
            pendencias: [],
          });
        }
      } else {
        clearDraftFromStorage();
        resetToSharedState({
          horarioRules: normalizedHorarioRules,
          aulasConfirmadas,
        });
      }
    } catch (error) {
      console.error(error);
      loadLocalDraftFromStorage();
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Não foi possível carregar os dados do modulador.",
      );
    } finally {
      setLoading(false);
    }
  }, [selectedSchool?.id, token, user?.schoolId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  function updateRule(professorId: string, nextRule: Partial<ProfessorRule>) {
    setRules((current) => ({
      ...current,
      [professorId]: normalizeRule({
        ...getRule(current, professorId),
        ...nextRule,
      }),
    }));
    setSuccessMessage("");
  }

  function updateGlobalRules(nextRule: Partial<GlobalRuleConfig>) {
    setGlobalRules((current) => ({
      ...current,
      ...nextRule,
    }));
    setSuccessMessage("");
  }

  function updateHorarioConfig(nextConfig: Partial<HorarioConfig>) {
    setHorarioConfigs((current) => ({
      ...current,
      [horarioTurno]: {
        ...current[horarioTurno],
        ...nextConfig,
      },
    }));
    setGrade({ aulas: [], pendencias: [] });
    setSuccessMessage("");
  }

  function updateHorarioConfigPreservingQuantidade(nextConfig: Partial<HorarioConfig>) {
    const quantidadeAtual = horarioSlots.length;
    const nextHorarioConfig = {
      ...horarioConfig,
      ...nextConfig,
    };

    updateHorarioConfig({
      ...nextConfig,
      fim: calculateHorarioEnd(nextHorarioConfig, quantidadeAtual),
    });
  }

  function updateHorarioQuantidade(totalAulas: number) {
    const quantidade = clampHorarioCount(totalAulas);

    updateHorarioConfig({
      fim: calculateHorarioEnd(horarioConfig, quantidade),
    });
  }

  function updateHorarioAjuste(index: number, duration: number) {
    const ajustes = {
      ...horarioConfig.ajustes,
      [index]: duration,
    };

    updateHorarioConfig({
      mesmoTempoAulas: false,
      ajustes,
      fim: calculateHorarioEnd(
        {
          ...horarioConfig,
          mesmoTempoAulas: false,
          ajustes,
        },
        horarioSlots.length,
      ),
    });
  }

  function addHorarioIntervalo() {
    const novoIntervalo = createIntervalo(horarioConfig.intervalos.length);
    const nextConfig = {
      ...horarioConfig,
      intervalos: [...horarioConfig.intervalos, novoIntervalo],
    };

    updateHorarioConfig({
      intervalos: nextConfig.intervalos,
      fim: calculateHorarioEnd(nextConfig, horarioSlots.length),
    });
  }

  function updateHorarioIntervalo(
    intervaloId: string,
    nextIntervalo: Partial<HorarioIntervalo>,
  ) {
    const nextConfig = {
      ...horarioConfig,
      intervalos: horarioConfig.intervalos.map((intervalo) =>
        intervalo.id === intervaloId
          ? {
              ...intervalo,
              ...nextIntervalo,
              nome:
                nextIntervalo.nome !== undefined
                  ? sanitizeIntervalName(nextIntervalo.nome)
                  : intervalo.nome,
              aposAula:
                nextIntervalo.aposAula !== undefined
                  ? Math.max(1, Number(nextIntervalo.aposAula) || 1)
                  : intervalo.aposAula,
              duracao:
                nextIntervalo.duracao !== undefined
                  ? Math.max(1, Number(nextIntervalo.duracao) || 1)
                  : intervalo.duracao,
            }
          : intervalo,
      ),
    };

    updateHorarioConfig({
      intervalos: nextConfig.intervalos,
      fim: calculateHorarioEnd(nextConfig, horarioSlots.length),
    });
  }

  function removeHorarioIntervalo(intervaloId: string) {
    const nextConfig = {
      ...horarioConfig,
      intervalos: horarioConfig.intervalos.filter(
        (intervalo) => intervalo.id !== intervaloId,
      ),
    };

    updateHorarioConfig({
      intervalos: nextConfig.intervalos,
      fim: calculateHorarioEnd(nextConfig, horarioSlots.length),
    });
  }

  function toggleDiaBloqueado(dia: DiaSemana) {
    if (!selectedProfessorId) return;

    const diasBloqueados = selectedRule.diasBloqueados.includes(dia)
      ? selectedRule.diasBloqueados.filter((item) => item !== dia)
      : [...selectedRule.diasBloqueados, dia];

    updateRule(selectedProfessorId, { diasBloqueados });
  }

  function gerarGrade() {
    setGenerating(true);
    setErrorMessage("");

    const result = buildGradeCompleta(
      turmas,
      modulacoesPorTurma,
      globalRules,
      rules,
      horarioConfigs,
      turmaOverrides,
      aulasFixas,
    );

    setGrade(result);
    setGenerating(false);
    void persistSharedDraft({
      ...buildCurrentDraft(),
      grade: result,
    }).catch((error) => {
      console.error(error);
    });
    setSuccessMessage(
      result.pendencias.length
        ? "Grade gerada com pendências. Ajuste regras ou carga horária e gere novamente."
        : "Grade gerada respeitando as regras cadastradas.",
    );
  }

  async function salvarHorario() {
    if (grade.aulas.length === 0) return;

    try {
      setSavingDraft(true);
      setErrorMessage("");
      setSuccessMessage("");

      await persistSharedHorarioRules(horarioConfigs, turmaOverrides);
      await persistSharedDraft(buildCurrentDraft());

      setSuccessMessage(
        "Horario salvo com sucesso. Ele continuara disponivel ao reabrir o modulador, sem enviar nada aos professores ate clicar em Confirmar.",
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Não foi possível salvar o horário.",
      );
    } finally {
      setSavingDraft(false);
    }
  }

  function excluirHorarioGerado() {
    void (async () => {
      try {
        await clearSharedDraft();
        setGrade({ aulas: [], pendencias: [] });
        setPrintTurmaId("");
        setPrintProfessorId("");
        setErrorMessage("");
        setSuccessMessage(
          "Grade excluída com sucesso. O horário salvo no modulador também foi removido.",
        );
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Não foi possível excluir a grade compartilhada.",
        );
      }
    })();
  }

  async function salvarConfiguraes() {
    try {
      setSavingDraft(true);
      setErrorMessage("");
      setSuccessMessage("");

      await persistSharedHorarioRules(horarioConfigs, turmaOverrides);
      await persistSharedDraft(buildCurrentDraft());

      setSuccessMessage(
        "Configurações do modulador salvas. Elas permanecerão até você alterar novamente.",
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Não foi possível salvar as configurações do modulador.",
      );
    } finally {
      setSavingDraft(false);
    }
  }

  function getAulaGrade(
    turmaId: string,
    dia: DiaSemana,
    horarioIndex: number,
    professorId?: string,
  ) {
    return grade.aulas.find(
      (aula) =>
        aula.turmaId === turmaId &&
        aula.dia === dia &&
        aula.horarioIndex === horarioIndex &&
        (!professorId || aula.professorId === professorId),
    );
  }

  function getPendenciasTurma(turmaNome: string) {
    return pendenciasPorTurma.get(turmaNome) || [];
  }

  function getMotivoPendenciaTurma(turmaNome: string) {
    const pendencias = getPendenciasTurma(turmaNome);
    if (pendencias.length === 0) return "";
    return pendencias[0]?.motivo || "Não foi possível encaixar esta modulação.";
  }

  function hasPendenciaTurma(turmaNome: string) {
    return getPendenciasTurma(turmaNome).length > 0;
  }

  async function confirmarHorario() {
    if (!token || grade.aulas.length === 0) return;

    try {
      setConfirming(true);
      setErrorMessage("");
      setSuccessMessage("");

      await persistSharedHorarioRules(horarioConfigs, turmaOverrides);

      for (const aula of grade.aulas) {
        if (aula.origem === "FIXA") continue;

        const slot = buildHorarioSlots(
          resolveHorarioConfigForTurma({
            officialConfigs: horarioConfigs,
            turmaOverrides,
            turmaId: aula.turmaId,
            turno: aula.turno,
          }),
        )[aula.horarioIndex];

        if (!slot) continue;

        const response = await fetch(apiUrl("/aulas"), {
          method: "POST",
          headers: authHeaders({
            "Content-Type": "application/json",
          }),
          body: JSON.stringify({
            turmaId: aula.turmaId,
            diaSemana: aula.dia,
            horaInicio: slot.inicio,
            horaFim: slot.fim,
            turmaProfessorId: aula.modulacaoId,
          }),
        });

        const data = await readJson<{ message?: string }>(response);

        if (!response.ok) {
          throw new Error(
            data.message ||
              `Não foi possível confirmar ${aula.disciplina} em ${aula.turmaNome}.`,
          );
        }
      }

      await clearSharedDraft();

      setSuccessMessage(
        "Horário confirmado. A guia Horários já passa a exibir estas aulas para administração, professores e alunos.",
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Não foi possível confirmar o horário.",
      );
    } finally {
      setConfirming(false);
    }
  }

  function imprimirHorario() {
    window.print();
  }

  const selectedProfessor = professores.find(
    (professor) => professor.id === selectedProfessorId,
  );
  const selectedProfessorModulado = professoresModulados.find(
    (professor) => professor.id === selectedProfessorId,
  );

  if (!canManage) {
    return (
      <section className="space-y-6">
        <PageHeader
          title="Modulador"
          description="Acesso restrito para admin, gestor e secretaria."
        />
        <div className="card-base p-6 text-sm text-slate-600">
          Seu perfil não tem permissão para acessar o modulador.
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <PageHeader
        title="Modulador"
        description="Use regras globais para toda a escola, aplique exceções só quando precisar e gere a grade sem alterar a configuração oficial do menu Horários."
      />

      {errorMessage ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {errorMessage}
        </div>
      ) : null}

      {successMessage ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
          {successMessage}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="card-base space-y-5 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
                <ClipboardList size={20} />
                Professores modulados
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Visão por professor, turno e carga semanal.
              </p>
            </div>
            <button
              type="button"
              onClick={fetchData}
              className="inline-flex items-center gap-2 rounded-xl border border-white/60 bg-white/70 px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-white"
            >
              <RefreshCcw size={16} />
              Atualizar
            </button>
          </div>

          <div className="rounded-[1.7rem] border border-white/60 bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(244,248,247,0.88))] p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.7),0_14px_32px_rgba(15,23,42,0.06)]">
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              {TURNOS.map((item) => {
                const isActive = turno === item.value;

                return (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => setTurno(item.value)}
                    className={`group relative overflow-hidden rounded-2xl px-4 py-3 text-sm font-semibold transition-all duration-200 ${
                      isActive
                        ? "border border-[color:var(--primary)] bg-[linear-gradient(135deg,rgba(47,108,103,0.18),rgba(47,108,103,0.08))] text-[color:var(--primary)] shadow-[0_10px_24px_rgba(47,108,103,0.16)]"
                        : "border border-transparent bg-white/55 text-slate-600 hover:bg-white hover:text-slate-900"
                    }`}
                  >
                    <span
                      className={`pointer-events-none absolute inset-x-4 top-0 h-px transition-opacity ${
                        isActive ? "bg-white/80 opacity-100" : "bg-white/50 opacity-0 group-hover:opacity-100"
                      }`}
                    />
                    <span className="relative block">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-2xl border border-white/50 bg-white/55 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-semibold text-slate-900">Regras globais do modulador</p>
                <p className="text-xs text-slate-500">
                  Essas regras valem para todos os professores. Os horários oficiais continuam vindo do menu Horários e prevalecem sobre o modulador.
                </p>
              </div>
              <span className="rounded-full bg-white/80 px-2.5 py-1 text-xs font-bold text-slate-700">
                {horarioSlots.length} aulas no turno
              </span>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-slate-700">
                  Máximo de aulas por professor/dia
                </span>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={globalRules.maxAulasProfessorDia}
                  onChange={(event) =>
                    updateGlobalRules({
                      maxAulasProfessorDia: Math.max(
                        1,
                        Math.min(20, Number(event.target.value) || 1),
                      ),
                    })
                  }
                  className="w-full rounded-2xl border border-white/60 bg-white/80 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-[color:var(--primary)]"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-slate-700">
                  Máximo da mesma disciplina por turma/dia
                </span>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={globalRules.maxAulasMesmaDisciplinaTurmaDia}
                  onChange={(event) =>
                    updateGlobalRules({
                      maxAulasMesmaDisciplinaTurmaDia: Math.max(
                        1,
                        Number(event.target.value) || 1,
                      ),
                    })
                  }
                  className="w-full rounded-2xl border border-white/60 bg-white/80 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-[color:var(--primary)]"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-slate-700">
                  Máximo de aulas duplas da disciplina por turma/dia
                </span>
                <input
                  type="number"
                  min={0}
                  max={10}
                  value={globalRules.maxAulasDuplasDisciplinaTurmaDia}
                  onChange={(event) =>
                    updateGlobalRules({
                      maxAulasDuplasDisciplinaTurmaDia: Math.max(
                        0,
                        Number(event.target.value) || 0,
                      ),
                    })
                  }
                  className="w-full rounded-2xl border border-white/60 bg-white/80 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-[color:var(--primary)]"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-slate-700">
                  Máximo de aulas seguidas da mesma disciplina
                </span>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={globalRules.maxAulasSeguidasMesmaDisciplina}
                  onChange={(event) =>
                    updateGlobalRules({
                      maxAulasSeguidasMesmaDisciplina: Math.max(
                        1,
                        Number(event.target.value) || 1,
                      ),
                    })
                  }
                  disabled={!globalRules.evitarSequenciaLongaDisciplina}
                  className="w-full rounded-2xl border border-white/60 bg-white/80 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-[color:var(--primary)] disabled:opacity-50"
                />
              </label>
            </div>

            <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <label className="flex items-center gap-3 rounded-2xl border border-white/60 bg-white/70 px-4 py-3 text-sm font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={globalRules.evitarSequenciaLongaDisciplina}
                  onChange={(event) =>
                    updateGlobalRules({
                      evitarSequenciaLongaDisciplina: event.target.checked,
                    })
                  }
                  className="h-4 w-4 accent-[color:var(--primary)]"
                />
                Evitar muitas aulas seguidas da mesma disciplina
              </label>

              <button
                type="button"
                onClick={salvarConfiguraes}
                disabled={savingDraft}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Save size={16} />
                {savingDraft ? "Salvando configurações" : "Salvar configurações"}
              </button>
            </div>
          </div>

          {loading ? (
            <p className="text-sm text-slate-500">Carregando dados...</p>
          ) : professoresComModulacao.length === 0 ? (
            <p className="text-sm text-slate-500">Nenhum professor encontrado.</p>
          ) : (
            <div className="max-h-[34rem] space-y-2 overflow-y-auto pr-1">
              {professoresComModulacao.map((professor) => (
                <button
                  key={professor.id}
                  type="button"
                  onClick={() => setSelectedProfessorId(professor.id)}
                  className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                    selectedProfessorId === professor.id
                      ? "border-[color:var(--primary)] bg-[rgba(47,108,103,0.1)]"
                      : "border-white/50 bg-white/60 hover:bg-white"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-900">{professor.name}</p>
                      <p className="text-xs text-slate-500">
                        {professor.email || "Sem e-mail cadastrado"}
                      </p>
                    </div>
                    <span className="rounded-full bg-white/80 px-2.5 py-1 text-xs font-bold text-slate-700">
                      {professor.totalAulas} aulas
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-semibold text-slate-600">
                    {professor.regra.diasBloqueados.length ? (
                      <span className="rounded-full bg-red-50 px-2 py-1 text-red-700">
                        {professor.regra.diasBloqueados.length} dia(s) bloqueado(s)
                      </span>
                    ) : null}
                    {professor.regra.semPrimeiroHorarioDias.length ? (
                      <span className="rounded-full bg-amber-50 px-2 py-1 text-amber-700">
                        Sem 1º horário em {professor.regra.semPrimeiroHorarioDias.length} dia(s)
                      </span>
                    ) : null}
                    {professor.regra.semUltimoHorarioDias.length ? (
                      <span className="rounded-full bg-amber-50 px-2 py-1 text-amber-700">
                        Sem último horário em {professor.regra.semUltimoHorarioDias.length} dia(s)
                      </span>
                    ) : null}
                    {professor.regra.posicaoPreferida !== "QUALQUER" ? (
                      <span className="rounded-full bg-violet-50 px-2 py-1 text-violet-700">
                        Posição:{" "}
                        {professor.regra.posicaoPreferida.toLowerCase()}
                      </span>
                    ) : null}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="card-base space-y-5 p-5">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
              <SlidersHorizontal size={20} />
              Exceções por professor
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Essas regras só funcionam quando você selecionar um professor específico e gravar a exceção dele.
            </p>
          </div>

          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-slate-700">
              Professor
            </span>
            <select
              value={selectedProfessorId}
              onChange={(event) => setSelectedProfessorId(event.target.value)}
              className="w-full rounded-2xl border border-white/60 bg-white/80 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-[color:var(--primary)]"
            >
              {professoresModulados.map((professor) => (
                <option key={professor.id} value={professor.id}>
                  {professor.name}
                </option>
              ))}
            </select>
          </label>

          <div className="rounded-2xl border border-white/50 bg-white/55 p-4">
            <p className="text-sm font-semibold text-slate-800">
              {selectedProfessorModulado?.name ||
                selectedProfessor?.name ||
                "Selecione um professor"}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Exceções individuais de disponibilidade.
            </p>

            <div className="mt-4">
              <p className="mb-2 text-sm font-semibold text-slate-700">
                Dia da exceção de horário
              </p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                {DIAS.map((dia) => (
                  <button
                    key={`regra-${dia.value}`}
                    type="button"
                    onClick={() => setSelectedDia(dia.value)}
                    className={`rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                      selectedDia === dia.value
                        ? "border-[color:var(--primary)] bg-[rgba(47,108,103,0.12)] text-[color:var(--primary)]"
                        : "border-white/70 bg-white/70 text-slate-600 hover:bg-white"
                    }`}
                  >
                    {dia.short}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4">
              <p className="mb-2 text-sm font-semibold text-slate-700">
                Dias sem aula
              </p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                {DIAS.map((dia) => {
                  const active = selectedRule.diasBloqueados.includes(dia.value);
                  return (
                    <button
                      key={dia.value}
                      type="button"
                      onClick={() => toggleDiaBloqueado(dia.value)}
                      className={`rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                        active
                          ? "border-red-200 bg-red-50 text-red-700"
                          : "border-white/70 bg-white/70 text-slate-600 hover:bg-white"
                      }`}
                    >
                      {dia.short}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
              <label className="flex items-center gap-3 rounded-2xl border border-white/60 bg-white/70 px-4 py-3 text-sm font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={selectedRule.semPrimeiroHorarioDias.includes(selectedDia)}
                  onChange={(event) =>
                    selectedProfessorId &&
                    updateRule(selectedProfessorId, {
                      semPrimeiroHorarioDias: event.target.checked
                        ? [...new Set([...selectedRule.semPrimeiroHorarioDias, selectedDia])]
                        : selectedRule.semPrimeiroHorarioDias.filter(
                            (dia) => dia !== selectedDia,
                          ),
                    })
                  }
                  className="h-4 w-4 accent-[color:var(--primary)]"
                />
                Não pode no primeiro horário de {DIAS.find((dia) => dia.value === selectedDia)?.label}
              </label>
              <label className="flex items-center gap-3 rounded-2xl border border-white/60 bg-white/70 px-4 py-3 text-sm font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={selectedRule.semUltimoHorarioDias.includes(selectedDia)}
                  onChange={(event) =>
                    selectedProfessorId &&
                    updateRule(selectedProfessorId, {
                      semUltimoHorarioDias: event.target.checked
                        ? [...new Set([...selectedRule.semUltimoHorarioDias, selectedDia])]
                        : selectedRule.semUltimoHorarioDias.filter(
                            (dia) => dia !== selectedDia,
                          ),
                    })
                  }
                  className="h-4 w-4 accent-[color:var(--primary)]"
                />
                Não pode no último horário de {DIAS.find((dia) => dia.value === selectedDia)?.label}
              </label>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-slate-700">
                  Posição das aulas
                </span>
                <select
                  value={selectedRule.posicaoPreferida}
                  onChange={(event) =>
                    selectedProfessorId &&
                    updateRule(selectedProfessorId, {
                      posicaoPreferida: event.target.value as PosicaoPreferida,
                    })
                  }
                  className="w-full rounded-2xl border border-white/60 bg-white/80 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-[color:var(--primary)]"
                >
                  <option value="QUALQUER">Qualquer horário</option>
                  <option value="ULTIMAS">Sempre nas últimas aulas</option>
                  <option value="A_PARTIR_SEGUNDA">A partir da segunda aula</option>
                  <option value="PRIMEIRAS">Sempre nas primeiras aulas</option>
                </select>
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-slate-700">
                  Resumo da exceção
                </span>
                <div className="rounded-2xl border border-white/60 bg-white/80 px-4 py-3 text-sm text-slate-700">
                  {selectedRule.diasBloqueados.length === 0 &&
                  selectedRule.semPrimeiroHorarioDias.length === 0 &&
                  selectedRule.semUltimoHorarioDias.length === 0 &&
                  selectedRule.posicaoPreferida === "QUALQUER"
                    ? "Nenhuma exceção cadastrada para este professor."
                    : "Este professor possui exceções individuais ativas no gerador."}
                </div>
              </label>
            </div>

            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={salvarConfiguraes}
                disabled={savingDraft}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Save size={16} />
                {savingDraft ? "Salvando configurações" : "Salvar configurações"}
              </button>

              <button
                type="button"
                onClick={gerarGrade}
                disabled={
                  loading ||
                  generating ||
                  professoresModulados.length === 0 ||
                  horarioSlots.length === 0
                }
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-[color:var(--primary)] px-5 py-3 text-sm font-bold text-white shadow-[0_14px_26px_rgba(47,108,103,0.24)] transition hover:bg-[color:var(--primary-strong)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Wand2 size={18} />
                {generating
                  ? "Gerando..."
                  : turno === "TODOS"
                    ? "Gerar horário de todos os turnos"
                    : `Gerar horário do turno ${formatTurno(turno)}`}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="card-base space-y-5 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
              <CalendarClock size={20} />
              Grade semanal
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Turmas nas linhas, dias e aulas nas colunas, no padrão compacto.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-white/70 px-3 py-1.5 text-xs font-bold text-slate-700">
              {getTurnoFiltroLabel(turno)}
            </span>
            <span className="rounded-full bg-white/70 px-3 py-1.5 text-xs font-bold text-slate-700">
              {horarioSlots.length} horário(s)
            </span>
          </div>
        </div>

        <div className="print:hidden grid grid-cols-1 gap-3 rounded-2xl border border-white/60 bg-white/55 p-4 md:grid-cols-2 xl:grid-cols-[1.1fr_0.9fr_0.9fr_0.9fr_1.45fr]">
          <label className="block">
            <span className="mb-1 block text-xs font-bold uppercase text-slate-500">
              Imprimir
            </span>
            <select
              value={printScope}
              onChange={(event) => setPrintScope(event.target.value as PrintScope)}
              className="w-full rounded-xl border border-white/70 bg-white/80 px-3 py-2 text-sm text-slate-700 outline-none focus:border-[color:var(--primary)]"
            >
              <option value="ESCOLA">Horários semanais da escola</option>
              <option value="DIARIA">Horário por dia</option>
              <option value="TURMA">Apenas uma turma</option>
              <option value="PROFESSOR">Apenas um professor</option>
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-bold uppercase text-slate-500">
              Dia
            </span>
            <select
              value={selectedDia}
              onChange={(event) => setSelectedDia(event.target.value as DiaSemana)}
              disabled={printScope !== "DIARIA"}
              className="w-full rounded-xl border border-white/70 bg-white/80 px-3 py-2 text-sm text-slate-700 outline-none focus:border-[color:var(--primary)] disabled:opacity-50"
            >
              {DIAS.map((dia) => (
                <option key={dia.value} value={dia.value}>
                  {dia.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-bold uppercase text-slate-500">
              Turma
            </span>
            <select
              value={printTurmaId}
              onChange={(event) => {
                const nextTurmaId = event.target.value;
                setPrintTurmaId(nextTurmaId);

                const turmaSelecionada = turmasOrdenadas.find(
                  (turma) => turma.id === nextTurmaId,
                );

                if (turmaSelecionada) {
                  setTurno(normalizeTurno(turmaSelecionada.turno));
                }
              }}
              disabled={printScope !== "TURMA"}
              className="w-full rounded-xl border border-white/70 bg-white/80 px-3 py-2 text-sm text-slate-700 outline-none focus:border-[color:var(--primary)] disabled:opacity-50"
            >
              <option value="">Selecione</option>
              {turmasOrdenadas.map((turma) => (
                <option key={turma.id} value={turma.id}>
                  {turma.name}
                  {turma.turno ? ` - ${formatTurno(turma.turno)}` : ""}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-bold uppercase text-slate-500">
              Professor
            </span>
            <select
              value={printProfessorId}
              onChange={(event) => setPrintProfessorId(event.target.value)}
              disabled={printScope !== "PROFESSOR"}
              className="w-full rounded-xl border border-white/70 bg-white/80 px-3 py-2 text-sm text-slate-700 outline-none focus:border-[color:var(--primary)] disabled:opacity-50"
            >
              <option value="">Selecione</option>
              {professoresNaGrade.map((professor) => (
                <option key={professor.id} value={professor.id}>
                  {professor.name}
                </option>
              ))}
            </select>
          </label>

          <div className="grid min-w-0 grid-cols-2 gap-2 md:col-span-2 xl:col-span-1 xl:grid-cols-4">
            <button
              type="button"
              onClick={salvarHorario}
              disabled={grade.aulas.length === 0 || savingDraft}
              className="inline-flex min-w-0 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white/90 px-3 py-2.5 text-sm font-bold text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Save size={16} />
              {savingDraft ? "Salvando" : "Salvar"}
            </button>
            <button
              type="button"
              onClick={excluirHorarioGerado}
              disabled={grade.aulas.length === 0}
              className="inline-flex min-w-0 items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50/90 px-3 py-2.5 text-sm font-bold text-red-700 shadow-sm transition hover:-translate-y-0.5 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Trash2 size={16} />
              Excluir
            </button>
            <button
              type="button"
              onClick={imprimirHorario}
              disabled={grade.aulas.length === 0}
              className="inline-flex min-w-0 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white/90 px-3 py-2.5 text-sm font-bold text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Printer size={16} />
              PDF
            </button>
            <button
              type="button"
              onClick={confirmarHorario}
              disabled={grade.aulas.length === 0 || confirming}
              className="inline-flex min-w-0 items-center justify-center gap-2 rounded-xl bg-[linear-gradient(135deg,var(--primary),var(--primary-strong))] px-3 py-2.5 text-sm font-bold text-white shadow-[0_14px_30px_rgba(47,108,103,0.22)] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Send size={16} />
              {confirming ? "Confirmando" : "Confirmar"}
            </button>
          </div>
        </div>

        <div
          className={`overflow-hidden rounded-[2rem] border border-sky-200 bg-[linear-gradient(180deg,#fffdf8,#f6fbff)] p-5 shadow-[0_20px_50px_rgba(53,92,142,0.12)] ${
            printScope === "DIARIA" ? "hidden" : ""
          }`}
        >
          <div className="relative overflow-hidden rounded-[1.6rem] border border-sky-100 bg-white px-5 py-6">
            <div className="pointer-events-none absolute left-6 top-5 h-16 w-16 rotate-[-10deg] rounded-[1.2rem] border-2 border-violet-200 bg-violet-50" />
            <div className="pointer-events-none absolute right-8 top-6 h-14 w-20 rotate-[8deg] rounded-xl border-2 border-emerald-200 bg-emerald-50" />

            <div className="relative text-center">
              <h3 className="font-[var(--font-display)] text-4xl font-black tracking-wide md:text-6xl">
                <span className="text-blue-600">HORÁRIO</span>{" "}
                <span className="text-emerald-600">DE</span>{" "}
                <span className="text-red-500">AULA</span>{" "}
                <span className="text-violet-600">SEMANAL</span>
              </h3>
              <p className="mt-2 text-lg font-bold text-slate-800">
                Modelo para organização por séries, dias da semana e aulas
              </p>
              <div className="mx-auto mt-4 h-1 max-w-xl rounded-full bg-[linear-gradient(90deg,#5fbf72,#f2c94c,#f06b6b,#8f6fd5)]" />
            </div>

            <div className="mt-6 space-y-6">
              {gruposTurmasImpressao.map((grupo, grupoIndex) => (
                <div key={grupo.key} className="overflow-x-auto">
                  <div className="mb-3 inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold text-slate-600">
                    {grupo.isCustom ? "Configuração com exceção de turma" : "Configuração oficial do horário"}
                  </div>
                  <table className="min-w-[1400px] w-full border-separate border-spacing-0 text-[11px]">
                    <thead>
                      <tr>
                        <th
                          rowSpan={2}
                          className="w-48 rounded-tl-xl border-2 border-sky-300 bg-blue-100 px-4 py-4 text-center text-xl font-black text-blue-950"
                        >
                          SÉRIE / TURMA
                        </th>
                        {DIAS.map((dia) => (
                          <th
                            key={`${grupoIndex}-${dia.value}`}
                            colSpan={grupo.slots.length}
                            className="border-2 border-sky-300 bg-slate-100 px-3 py-3 text-center text-base font-black text-blue-950"
                          >
                            {dia.label}
                          </th>
                        ))}
                      </tr>
                      <tr>
                        {DIAS.map((dia) =>
                          grupo.slots.map((slot) => (
                            <th
                              key={`${grupoIndex}-${dia.value}-${slot.index}`}
                              className={`w-32 border-2 px-2 py-2 text-center ${getHorarioRowColor(slot.index).header}`}
                            >
                              <span className="block text-lg font-black text-slate-950">
                                {slot.index + 1}ª AULA
                              </span>
                              <span className="mt-1 block text-[10px] font-bold leading-tight text-slate-700">
                                ({slot.inicio} - {slot.fim})
                              </span>
                            </th>
                          )),
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {grupo.turmas.map((turma) => (
                        <tr key={`modelo-${grupoIndex}-${turma.id}`}>
                          <td className="border-2 border-sky-200 bg-blue-50 px-4 py-3 text-center text-lg font-black text-blue-950">
                            {turma.name}
                          </td>
                          {DIAS.map((dia) =>
                            grupo.slots.map((slot) => {
                              const aula = getAulaGrade(
                                turma.id,
                                dia.value,
                                slot.index,
                                printScope === "PROFESSOR"
                                  ? printProfessorId
                                  : undefined,
                              );

                              return (
                                <td
                                  key={`modelo-${grupoIndex}-${turma.id}-${dia.value}-${slot.index}`}
                                  className="h-16 border border-sky-200 bg-white/70 p-1.5"
                                >
                                  {aula ? (
                                    <div
                                      className="flex h-full flex-col items-center justify-center rounded-lg border px-1 text-center leading-tight"
                                      style={getProfessorColorStyle(professorColors, {
                                        id: aula.professorId,
                                        name: aula.professorNome,
                                      })}
                                    >
                                      <span className="line-clamp-2 text-[12px] font-black">
                                        {aula.disciplina}
                                      </span>
                                      <span className="mt-0.5 line-clamp-1 text-[11px] font-semibold">
                                        {aula.professorNome}
                                      </span>
                                    </div>
                                  ) : hasPendenciaTurma(turma.name) ? (
                                    <div className="flex h-full items-center justify-center rounded-lg border border-amber-200 bg-amber-50 px-2 text-center text-[10px] font-bold text-amber-800">
                                      {getMotivoPendenciaTurma(turma.name)}
                                    </div>
                                  ) : null}
                                </td>
                              );
                            }),
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>

            <div className="mt-6 rounded-[1.4rem] border-2 border-dashed border-orange-200 bg-white px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full border border-blue-200 bg-blue-50 text-sm font-black text-blue-700">
                  OK
                </div>
                <span className="font-[var(--font-display)] text-2xl font-semibold text-slate-900">
                  Observações:
                </span>
                <div className="h-px flex-1 bg-slate-300" />
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 rounded-2xl border border-white/60 bg-white/55 p-4 sm:grid-cols-5">
          {DIAS.map((dia) => (
            <button
              key={dia.value}
              type="button"
              onClick={() => setSelectedDia(dia.value)}
              className={`rounded-2xl border px-3 py-3 text-sm font-bold transition ${
                selectedDia === dia.value
                  ? "border-[color:var(--primary)] bg-[rgba(47,108,103,0.12)] text-[color:var(--primary)]"
                  : "border-white/60 bg-white/60 text-slate-600 hover:bg-white"
              }`}
            >
              {dia.label}
            </button>
          ))}
        </div>

        <div className="space-y-3">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              Configuração vinda do menu Horários
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              O modulador usa automaticamente a configuração oficial cadastrada no menu Horários. Qualquer mudança de quantidade, duração e intervalos deve ser feita lá.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-white/60 bg-white/60 p-4 text-sm text-slate-700">
              <span className="block text-xs font-bold uppercase text-slate-500">
                Turno selecionado
              </span>
              <span className="mt-2 block font-semibold text-slate-900">
                {formatTurno(horarioTurno)}
              </span>
            </div>
            <div className="rounded-2xl border border-white/60 bg-white/60 p-4 text-sm text-slate-700">
              <span className="block text-xs font-bold uppercase text-slate-500">
                Total de aulas
              </span>
              <span className="mt-2 block font-semibold text-slate-900">
                {horarioSlotsExibicao.length} aula(s)
              </span>
            </div>
            <div className="rounded-2xl border border-white/60 bg-white/60 p-4 text-sm text-slate-700">
              <span className="block text-xs font-bold uppercase text-slate-500">
                Intervalos
              </span>
              <span className="mt-2 block font-semibold text-slate-900">
                {horarioConfig.intervalos.length} configurado(s)
              </span>
            </div>
          </div>
        </div>

        {grade.aulas.length === 0 ? (
          <div className="hidden rounded-2xl border border-dashed border-slate-300 bg-white/50 p-8 text-center text-sm text-slate-500">
            Configure os tempos, as regras e gere o horário para visualizar a grade semanal.
          </div>
        ) : (
          <div className="hidden overflow-x-auto">
            <table className="min-w-[1280px] w-full border-separate border-spacing-0 text-[11px]">
              <thead>
                <tr>
                  <th
                    rowSpan={2}
                    className="sticky left-0 z-20 rounded-tl-xl border border-slate-300 bg-slate-100 px-2 py-2 text-left text-sm font-black text-slate-800"
                  >
                    Turma
                  </th>
                  {DIAS.map((dia) => (
                    <th
                      key={dia.value}
                      colSpan={horarioSlotsExibicao.length}
                      className="border border-slate-300 bg-slate-200 px-2 py-2 text-center text-sm font-black text-slate-800"
                    >
                      {dia.label}
                    </th>
                  ))}
                </tr>
                <tr>
                  {DIAS.map((dia) =>
                    horarioSlotsExibicao.map((slot) => {
                      const rowColor = getHorarioRowColor(slot.index);

                      return (
                        <th
                          key={`${dia.value}-${slot.index}`}
                          className={`w-20 border border-slate-300 px-1 py-1 text-center font-black text-slate-800 ${rowColor.header}`}
                        >
                          <span className="block text-sm">{slot.index + 1}</span>
                          <span className="block text-[9px] font-bold leading-tight text-slate-600">
                            ({slot.inicio} - {slot.fim})
                          </span>
                        </th>
                      );
                    }),
                  )}
                </tr>
              </thead>
              <tbody>
                {turmasImpressao.map((turma) => (
                  <tr key={turma.id}>
                    <td className="sticky left-0 z-10 border border-slate-300 bg-slate-100 px-2 py-2 text-sm font-black text-slate-900">
                      {turma.name}
                    </td>
                    {DIAS.map((dia) =>
                      horarioSlotsExibicao.map((slot) => {
                        const aula = getAulaGrade(
                          turma.id,
                          dia.value,
                          slot.index,
                          printScope === "PROFESSOR" ? printProfessorId : undefined,
                        );
                        const rowColor = getHorarioRowColor(slot.index);

                        return (
                            <td
                              key={`${turma.id}-${dia.value}-${slot.index}`}
                              className={`h-16 border border-slate-300 p-1 align-middle ${rowColor.cell}`}
                            >
                              {aula ? (
                                <div
                                  className="flex h-full flex-col items-center justify-center rounded border px-1 text-center leading-tight"
                                  style={getProfessorColorStyle(professorColors, {
                                    id: aula.professorId,
                                    name: aula.professorNome,
                                  })}
                                >
                                  <span className="line-clamp-2 text-[11px] font-black">
                                    {aula.disciplina}
                                  </span>
                                  <span className="mt-0.5 line-clamp-1 text-[10px] font-semibold">
                                    {aula.professorNome}
                                  </span>
                                </div>
                              ) : hasPendenciaTurma(turma.name) ? (
                                <div className="flex h-full items-center justify-center rounded border border-amber-200 bg-amber-50 px-1 text-center text-[9px] font-bold text-amber-800">
                                  {getMotivoPendenciaTurma(turma.name)}
                                </div>
                              ) : (
                                <div className="h-full rounded border border-dashed border-slate-300 bg-white/30" />
                              )}
                            </td>
                        );
                      }),
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div
          className={`overflow-hidden rounded-[2rem] border border-sky-200 bg-[linear-gradient(180deg,#fffdf8,#f6fbff)] p-5 shadow-[0_20px_50px_rgba(53,92,142,0.12)] ${
            printScope === "DIARIA" ? "" : "hidden"
          }`}
        >
          <div className="relative overflow-hidden rounded-[1.6rem] border border-sky-100 bg-white px-5 py-6">
            <div className="pointer-events-none absolute left-6 top-5 h-16 w-16 rotate-[-10deg] rounded-[1.2rem] border-2 border-violet-200 bg-violet-50" />
            <div className="pointer-events-none absolute right-8 top-6 h-14 w-20 rotate-[8deg] rounded-xl border-2 border-emerald-200 bg-emerald-50" />
            <div className="relative text-center">
              <h3 className="font-[var(--font-display)] text-4xl font-black tracking-wide md:text-6xl">
                <span className="text-blue-600">HORÁRIO</span>{" "}
                <span className="text-emerald-600">DE</span>{" "}
                <span className="text-red-500">AULA</span>{" "}
                <span className="text-violet-600">DIÁRIO</span>
              </h3>
              <p className="mt-2 text-lg font-bold text-slate-800">
                Modelo para organização diária por séries
              </p>
              <div className="mx-auto mt-4 h-1 max-w-xl rounded-full bg-[linear-gradient(90deg,#5fbf72,#f2c94c,#f06b6b,#8f6fd5)]" />
            </div>

            {grade.aulas.length === 0 ? (
              <div className="mt-6 rounded-2xl border border-dashed border-sky-300 bg-sky-50/60 p-8 text-center text-sm font-semibold text-slate-500">
                Configure os tempos, as regras e gere o horário para visualizar o modelo.
              </div>
            ) : (
              <div className="mt-6 space-y-6">
                {gruposTurmasImpressao.map((grupo, grupoIndex) => {
                  const turnoGrupo = grupo.turmas[0]
                    ? normalizeTurno(grupo.turmas[0].turno)
                    : horarioTurno;
                  const configGrupo = resolveHorarioConfigForTurma({
                    officialConfigs: horarioConfigs,
                    turmaOverrides,
                    turmaId: grupo.turmas[0]?.id,
                    turno: turnoGrupo,
                  });

                  return (
                    <div key={`diario-grupo-${grupo.key}`} className="overflow-x-auto">
                      <div className="mb-3 inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold text-slate-600">
                        {grupo.isCustom ? "Configuração com exceção de turma" : "Configuração oficial do horário"}
                      </div>
                      <table className="min-w-[1180px] w-full border-separate border-spacing-0 text-sm">
                        <thead>
                          <tr>
                            <th className="w-48 rounded-tl-xl border-2 border-sky-300 bg-blue-100 px-4 py-4 text-center text-xl font-black text-blue-950">
                              SÉRIE / TURMA
                            </th>
                            {grupo.slots.map((slot) => (
                              <Fragment key={`model-head-${grupoIndex}-${slot.index}`}>
                                <th
                                  className={`w-40 border-2 px-3 py-3 text-center ${getHorarioRowColor(slot.index).header}`}
                                >
                                  <span className="block text-xl font-black text-slate-950">
                                    {slot.index + 1}ª AULA
                                  </span>
                                  <span className="mt-1 block text-base font-bold text-slate-900">
                                    {slot.inicio} - {slot.fim}
                                  </span>
                                </th>
                                {getIntervaloAposAula(configGrupo, slot.index + 1).map(
                                  (intervalo) => (
                                    <th
                                      key={`interval-head-${grupoIndex}-${slot.index}-${intervalo.id}`}
                                      className="w-14 border-2 border-orange-300 bg-orange-50 text-center"
                                    />
                                  ),
                                )}
                              </Fragment>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {grupo.turmas.map((turma, turmaIndex) => (
                            <tr key={`model-${grupoIndex}-${turma.id}`}>
                              <td className="border-2 border-sky-200 bg-blue-50 px-4 py-3 text-center text-lg font-black text-blue-950">
                                {turma.name}
                              </td>
                              {grupo.slots.map((slot) => {
                                const aula = getAulaGrade(
                                  turma.id,
                                  selectedDia,
                                  slot.index,
                                  printScope === "PROFESSOR"
                                    ? printProfessorId
                                    : undefined,
                                );

                                return (
                                  <Fragment key={`model-${grupoIndex}-${turma.id}-${slot.index}`}>
                                    <td className="h-16 border border-sky-200 bg-white/70 p-1.5">
                                      {aula ? (
                                        <div
                                          className="flex h-full flex-col items-center justify-center rounded-lg border px-1 text-center leading-tight"
                                          style={getProfessorColorStyle(professorColors, {
                                            id: aula.professorId,
                                            name: aula.professorNome,
                                          })}
                                        >
                                          <span className="line-clamp-2 text-[12px] font-black">
                                            {aula.disciplina}
                                          </span>
                                          <span className="mt-0.5 line-clamp-1 text-[11px] font-semibold">
                                            {aula.professorNome}
                                          </span>
                                        </div>
                                      ) : hasPendenciaTurma(turma.name) ? (
                                        <div className="flex h-full items-center justify-center rounded-lg border border-amber-200 bg-amber-50 px-2 text-center text-[10px] font-bold text-amber-800">
                                          {getMotivoPendenciaTurma(turma.name)}
                                        </div>
                                      ) : null}
                                    </td>
                                    {getIntervaloAposAula(
                                      configGrupo,
                                      slot.index + 1,
                                    ).map((intervalo) =>
                                      turmaIndex === 0 ? (
                                        <td
                                          key={`interval-body-${grupoIndex}-${slot.index}-${intervalo.id}`}
                                          rowSpan={grupo.turmas.length}
                                          className="border-2 border-dashed border-orange-300 bg-orange-50/80 text-center"
                                        >
                                          <div className="flex h-full items-center justify-center">
                                            <span className="[writing-mode:vertical-rl] rotate-180 text-lg font-black tracking-[0.2em] text-orange-600">
                                              {intervalo.nome.toUpperCase()}
                                            </span>
                                          </div>
                                        </td>
                                      ) : (
                                        <Fragment
                                          key={`interval-body-empty-${grupoIndex}-${slot.index}-${intervalo.id}`}
                                        />
                                      ),
                                    )}
                                  </Fragment>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="mt-6 rounded-[1.4rem] border-2 border-dashed border-orange-200 bg-white px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full border border-blue-200 bg-blue-50 text-sm font-black text-blue-700">
                  OK
                </div>
                <span className="font-[var(--font-display)] text-2xl font-semibold text-slate-900">
                  Observações:
                </span>
                <div className="h-px flex-1 bg-slate-300" />
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-white/60 pt-5">
          <h3 className="text-base font-bold text-slate-900">Horário diário</h3>
          <p className="mt-1 text-sm text-slate-500">
            A mesma lógica da grade semanal, filtrada por um dia específico.
          </p>
        </div>

        {grade.aulas.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white/50 p-8 text-center text-sm text-slate-500">
            Configure os tempos, as regras e gere o horário para visualizar a escalação diária.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[1120px] w-full border-separate border-spacing-0 text-sm">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 rounded-tl-2xl border border-white/60 bg-white/85 px-3 py-3 text-left font-bold text-slate-700">
                    Série / Turma
                  </th>
                  {horarioSlots.map((slot) => (
                    <th
                      key={slot.index}
                      className="border border-white/60 bg-white/85 px-3 py-3 text-left font-bold text-slate-700"
                    >
                      <span className="block">{slot.label}</span>
                      <span className="mt-1 block text-xs font-semibold text-slate-500">
                        {slot.inicio} - {slot.fim}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {turmasImpressao.map((turma) => (
                  <tr key={turma.id}>
                    <td className="sticky left-0 z-10 border border-white/60 bg-white/85 px-3 py-3 font-bold text-slate-700">
                      <span className="block text-slate-900">{turma.name}</span>
                      <span className="text-xs font-semibold text-slate-500">
                        {formatTurno(normalizeTurno(turma.turno))}
                      </span>
                    </td>
                    {horarioSlots.map((slot) => {
                      const aula = getAulaGrade(
                        turma.id,
                        selectedDia,
                        slot.index,
                        printScope === "PROFESSOR" ? printProfessorId : undefined,
                      );

                      return (
                        <td
                          key={`${turma.id}-${slot.index}`}
                          className="h-28 align-top border border-white/60 bg-white/45 p-2"
                        >
                          {aula ? (
                            <div
                              className="h-full rounded-xl border px-3 py-2"
                              style={getProfessorColorStyle(professorColors, {
                                id: aula.professorId,
                                name: aula.professorNome,
                              })}
                            >
                              <p className="font-bold text-slate-900">
                                {aula.disciplina}
                              </p>
                              <p className="text-xs font-semibold text-slate-700">
                                {aula.professorNome}
                              </p>
                              <p className="mt-2 text-[11px] font-semibold uppercase text-slate-500">
                                {DIAS.find((dia) => dia.value === aula.dia)?.label}
                              </p>
                            </div>
                          ) : hasPendenciaTurma(turma.name) ? (
                            <div className="flex h-full items-center justify-center rounded-xl border border-amber-200 bg-amber-50 px-2 text-center text-xs font-bold text-amber-800">
                              {getMotivoPendenciaTurma(turma.name)}
                            </div>
                          ) : (
                            <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white/35 text-xs font-semibold text-slate-400">
                              Livre
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="hidden card-base space-y-5 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
              <CalendarClock size={20} />
              Grade gerada
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Quadro semanal do turno {getTurnoFiltroLabel(turno)}.
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-full bg-white/70 px-3 py-1.5 text-xs font-bold text-slate-700">
            <CheckCircle2 size={15} />
            {grade.aulas.length} aula(s) alocada(s)
          </div>
        </div>

        {grade.aulas.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white/50 p-8 text-center text-sm text-slate-500">
            Configure as regras e clique em gerar horário.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[980px] w-full border-separate border-spacing-0 text-sm">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 rounded-tl-2xl border border-white/60 bg-white/85 px-3 py-3 text-left font-bold text-slate-700">
                    Horário
                  </th>
                  {DIAS.map((dia) => (
                    <th
                      key={dia.value}
                      className="border border-white/60 bg-white/85 px-3 py-3 text-left font-bold text-slate-700"
                    >
                      {dia.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {horarioSlots.map((slot) => {
                  const rowColor = getHorarioRowColor(slot.index);

                  return (
                    <tr key={slot.index}>
                      <td
                        className={`sticky left-0 z-10 border border-white/60 px-3 py-3 font-bold text-slate-700 ${rowColor.header}`}
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className={`h-8 w-1.5 rounded-full ${rowColor.marker}`}
                          />
                          <div>
                            <span className="block text-slate-900">
                              {slot.label}
                            </span>
                            <span className="text-xs font-semibold text-slate-500">
                              {slot.inicio} - {slot.fim}
                            </span>
                          </div>
                        </div>
                      </td>
                      {DIAS.map((dia) => {
                        const aulasSlot = grade.aulas.filter(
                          (aula) =>
                            aula.dia === dia.value &&
                            aula.horarioIndex === slot.index,
                        );

                        return (
                          <td
                            key={`${dia.value}-${slot.index}`}
                            className={`h-28 align-top border border-white/60 p-2 ${rowColor.cell}`}
                          >
                            <div className="space-y-2">
                              {aulasSlot.map((aula) => (
                                <div
                                  key={aula.id}
                                  className="rounded-xl border border-[rgba(47,108,103,0.14)] bg-white/75 px-3 py-2 shadow-sm"
                                >
                                  <p className="font-bold text-slate-900">
                                    {aula.turmaNome}
                                  </p>
                                  <p className="text-xs font-semibold text-[color:var(--primary)]">
                                    {aula.disciplina}
                                  </p>
                                  <p className="text-xs text-slate-600">
                                    {aula.professorNome}
                                  </p>
                                </div>
                              ))}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {grade.pendencias.length ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <h3 className="flex items-center gap-2 font-semibold text-amber-800">
              <AlertTriangle size={18} />
              Pendências de alocação
            </h3>
            <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
              {grade.pendencias.map((pendencia) => (
                <div
                  key={pendencia.modulacaoId}
                  className="rounded-xl bg-white/70 px-3 py-2 text-sm text-amber-900"
                >
                  <strong>{pendencia.professorNome}</strong> em{" "}
                  {pendencia.turmaNome}: {pendencia.faltantes} aula(s) de{" "}
                  {pendencia.disciplina} sem horário. {pendencia.motivo}
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}


