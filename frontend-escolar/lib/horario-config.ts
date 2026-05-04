"use client";

export type Turno = "MANHA" | "TARDE" | "NOITE";

export type HorarioIntervalo = {
  id: string;
  nome: string;
  aposAula: number;
  duracao: number;
};

export type HorarioConfig = {
  inicio: string;
  fim: string;
  duracaoAula: number;
  mesmoTempoAulas: boolean;
  intervalos: HorarioIntervalo[];
  ajustes: Record<number, number>;
};

export type HorarioSlot = {
  index: number;
  label: string;
  inicio: string;
  fim: string;
  duracao: number;
};

export type TurmaHorarioOverride = {
  enabled: boolean;
  config: HorarioConfig;
};

export type HorarioRulesStorage = {
  officialConfigs: Record<Turno, HorarioConfig>;
  turmaOverrides: Record<string, TurmaHorarioOverride>;
};

export const TURNOS_REAIS: Turno[] = ["MANHA", "TARDE", "NOITE"];

export const DEFAULT_HORARIO_CONFIG: Record<Turno, HorarioConfig> = {
  MANHA: {
    inicio: "07:00",
    fim: "11:30",
    duracaoAula: 50,
    mesmoTempoAulas: true,
    intervalos: [
      {
        id: "intervalo-1",
        nome: "Intervalo",
        aposAula: 3,
        duracao: 20,
      },
    ],
    ajustes: {},
  },
  TARDE: {
    inicio: "13:00",
    fim: "17:30",
    duracaoAula: 50,
    mesmoTempoAulas: true,
    intervalos: [
      {
        id: "intervalo-1",
        nome: "Intervalo",
        aposAula: 3,
        duracao: 20,
      },
    ],
    ajustes: {},
  },
  NOITE: {
    inicio: "18:40",
    fim: "22:00",
    duracaoAula: 45,
    mesmoTempoAulas: true,
    intervalos: [],
    ajustes: {},
  },
};

function timeToMinutes(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function minutesToTime(totalMinutes: number) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function getOrdinal(index: number) {
  return `${index + 1}º horário`;
}

export function clampHorarioCount(total: number) {
  return Math.max(1, Math.min(12, total));
}

export function normalizeTurno(turno?: string | null): Turno {
  const normalized = String(turno || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();

  if (["TARDE", "VESPERTINO"].includes(normalized)) return "TARDE";
  if (["NOITE", "NOTURNO"].includes(normalized)) return "NOITE";
  if (["MANHA", "MATUTINO"].includes(normalized)) return "MANHA";
  return "MANHA";
}

function slugifyIntervalName(name: string) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function sanitizeIntervalName(name?: string | null) {
  const trimmed = String(name || "").trim();
  return trimmed || "Intervalo";
}

function toIntervalId(name: string, index: number) {
  return slugifyIntervalName(name) || `intervalo-${index + 1}`;
}

export function normalizeIntervalos(
  intervalos?: Partial<HorarioIntervalo>[] | null,
  legacy?: {
    intervaloAtivo?: boolean;
    intervaloAposAula?: number;
    duracaoIntervalo?: number;
  },
) {
  const normalizedArray = Array.isArray(intervalos)
    ? intervalos
        .map((intervalo, index) => {
          const nome = sanitizeIntervalName(intervalo?.nome);
          const aposAula = Math.max(1, Number(intervalo?.aposAula) || 1);
          const duracao = Math.max(1, Number(intervalo?.duracao) || 1);

          return {
            id: String(intervalo?.id || toIntervalId(nome, index)),
            nome,
            aposAula,
            duracao,
          };
        })
        .sort((a, b) => a.aposAula - b.aposAula || a.nome.localeCompare(b.nome))
    : [];

  if (normalizedArray.length > 0) {
    return normalizedArray;
  }

  if (legacy?.intervaloAtivo) {
    return [
      {
        id: "intervalo-1",
        nome: "Intervalo",
        aposAula: Math.max(1, Number(legacy.intervaloAposAula) || 1),
        duracao: Math.max(1, Number(legacy.duracaoIntervalo) || 1),
      },
    ];
  }

  return [];
}

export function normalizeHorarioConfig(
  turno: Turno,
  config?: Partial<HorarioConfig> &
    Partial<{
      intervaloAtivo: boolean;
      intervaloAposAula: number;
      duracaoIntervalo: number;
    }> &
    null,
): HorarioConfig {
  return {
    ...DEFAULT_HORARIO_CONFIG[turno],
    ...(config || {}),
    mesmoTempoAulas:
      typeof config?.mesmoTempoAulas === "boolean"
        ? config.mesmoTempoAulas
        : true,
    intervalos: normalizeIntervalos(config?.intervalos, config || undefined),
    ajustes: config?.ajustes || {},
  };
}

export function normalizeHorarioConfigs(
  configs?: Partial<
    Record<
      Turno,
      Partial<HorarioConfig> &
        Partial<{
          intervaloAtivo: boolean;
          intervaloAposAula: number;
          duracaoIntervalo: number;
        }>
    >
  > | null,
): Record<Turno, HorarioConfig> {
  return {
    MANHA: normalizeHorarioConfig("MANHA", configs?.MANHA),
    TARDE: normalizeHorarioConfig("TARDE", configs?.TARDE),
    NOITE: normalizeHorarioConfig("NOITE", configs?.NOITE),
  };
}

function getDuracaoAula(config: HorarioConfig, index: number) {
  if (config.mesmoTempoAulas) {
    return config.duracaoAula;
  }

  return config.ajustes[index] || config.duracaoAula;
}

function getIntervalosOrdenados(config: HorarioConfig) {
  return [...config.intervalos].sort(
    (a, b) => a.aposAula - b.aposAula || a.nome.localeCompare(b.nome),
  );
}

export function getIntervaloAposAula(
  config: HorarioConfig,
  numeroAula: number,
) {
  return getIntervalosOrdenados(config).filter(
    (intervalo) => intervalo.aposAula === numeroAula,
  );
}

export function calculateHorarioEnd(config: HorarioConfig, totalAulas: number) {
  const quantidade = clampHorarioCount(totalAulas);
  let current = timeToMinutes(config.inicio);

  for (let index = 0; index < quantidade; index += 1) {
    current += getDuracaoAula(config, index);

    if (index < quantidade - 1) {
      getIntervaloAposAula(config, index + 1).forEach((intervalo) => {
        current += intervalo.duracao;
      });
    }
  }

  return minutesToTime(current);
}

export function buildHorarioSlots(config: HorarioConfig): HorarioSlot[] {
  const slots: HorarioSlot[] = [];
  let current = timeToMinutes(config.inicio);
  const end = timeToMinutes(config.fim);
  let index = 0;

  while (current < end && index < 12) {
    const duration = getDuracaoAula(config, index);
    const slotEnd = current + duration;

    if (slotEnd > end) break;

    slots.push({
      index,
      label: getOrdinal(index),
      inicio: minutesToTime(current),
      fim: minutesToTime(slotEnd),
      duracao: duration,
    });

    current = slotEnd;

    getIntervaloAposAula(config, index + 1).forEach((intervalo) => {
      current += intervalo.duracao;
    });

    index += 1;
  }

  return slots;
}

export function createIntervalo(index: number): HorarioIntervalo {
  return {
    id: `intervalo-${index + 1}`,
    nome: `Intervalo ${index + 1}`,
    aposAula: index + 1,
    duracao: 15,
  };
}

export function getModuladorDraftStorageKey(schoolKey: string) {
  return `gestclass_modulador_draft_${schoolKey || "sem-escola"}`;
}

export function getHorarioRulesStorageKey(schoolKey: string) {
  return `gestclass_horario_rules_${schoolKey || "sem-escola"}`;
}

export function normalizeTurmaHorarioOverrides(
  overrides?: Record<
    string,
    Partial<TurmaHorarioOverride> & { config?: Partial<HorarioConfig> | null }
  > | null,
) {
  const entries = Object.entries(overrides || {}).map(([turmaId, value]) => [
    turmaId,
    {
      enabled: Boolean(value?.enabled),
      config: normalizeHorarioConfig("MANHA", value?.config),
    },
  ] as const);

  return Object.fromEntries(entries) as Record<string, TurmaHorarioOverride>;
}

export function normalizeHorarioRulesStorage(
  storage?: Partial<HorarioRulesStorage> | null,
): HorarioRulesStorage {
  return {
    officialConfigs: normalizeHorarioConfigs(storage?.officialConfigs),
    turmaOverrides: normalizeTurmaHorarioOverrides(storage?.turmaOverrides),
  };
}

export function saveHorarioRulesToStorage(
  schoolKey: string,
  data: HorarioRulesStorage,
) {
  if (typeof window === "undefined") return;

  window.localStorage.setItem(
    getHorarioRulesStorageKey(schoolKey),
    JSON.stringify(normalizeHorarioRulesStorage(data)),
  );
}

export function loadHorarioRulesFromStorage(schoolKey: string) {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(getHorarioRulesStorageKey(schoolKey));
    if (raw) {
      return normalizeHorarioRulesStorage(
        JSON.parse(raw) as Partial<HorarioRulesStorage>,
      );
    }
  } catch {}

  const legacyConfigs = loadModuladorHorarioConfigsFromStorage(schoolKey);
  if (!legacyConfigs) return null;

  return normalizeHorarioRulesStorage({
    officialConfigs: legacyConfigs,
    turmaOverrides: {},
  });
}

export function resolveHorarioConfigForTurma(params: {
  officialConfigs: Record<Turno, HorarioConfig>;
  turmaOverrides?: Record<string, TurmaHorarioOverride>;
  turmaId?: string | null;
  turno?: Turno | null;
}) {
  const turno = params.turno || "MANHA";
  const official = normalizeHorarioConfig(turno, params.officialConfigs[turno]);
  const turmaId = String(params.turmaId || "").trim();
  const override = turmaId ? params.turmaOverrides?.[turmaId] : undefined;

  if (override?.enabled) {
    return normalizeHorarioConfig(turno, override.config);
  }

  return official;
}

export function loadModuladorHorarioConfigsFromStorage(schoolKey: string) {
  if (typeof window === "undefined") return null;

  try {
    const rawDraft = window.localStorage.getItem(
      getModuladorDraftStorageKey(schoolKey),
    );

    if (!rawDraft) return null;

    const draft = JSON.parse(rawDraft) as {
      horarioConfigs?: Partial<Record<Turno, Partial<HorarioConfig>>>;
    };

    return normalizeHorarioConfigs(draft.horarioConfigs);
  } catch {
    return null;
  }
}
