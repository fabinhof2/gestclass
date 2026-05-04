"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import PageHeader from "@/components/ui/page-header";
import ScheduleGrid, {
  type ScheduleAula,
  type ScheduleTurma,
} from "@/components/ui/schedule-grid";
import { useAuth } from "@/context/auth-context";
import type { UserRole } from "@/context/auth-context";
import { apiUrl } from "@/lib/api";
import {
  buildHorarioSlots,
  calculateHorarioEnd,
  clampHorarioCount,
  createIntervalo,
  DEFAULT_HORARIO_CONFIG,
  getIntervaloAposAula,
  loadHorarioRulesFromStorage,
  resolveHorarioConfigForTurma,
  saveHorarioRulesToStorage,
  sanitizeIntervalName,
  normalizeTurno,
  normalizeHorarioConfigs,
  normalizeTurmaHorarioOverrides,
  TURNOS_REAIS,
  type HorarioConfig,
  type HorarioRulesStorage,
  type HorarioIntervalo,
  type TurmaHorarioOverride,
  type Turno,
} from "@/lib/horario-config";
import { formatTurno } from "@/lib/turno";

type TurmaContexto = ScheduleTurma;

type Modulacao = {
  id: string;
  disciplina: string;
  cargaHoraria: number;
  diasSemana: string[];
  professor?: {
    id: string;
    name: string;
    email?: string;
  };
};

type GradeTipo = "SEMANAL" | "PROFESSOR" | "TURMA" | "DIARIA";

const DIAS_FORM = [
  { value: "SEG", label: "Segunda-feira" },
  { value: "TER", label: "Terça-feira" },
  { value: "QUA", label: "Quarta-feira" },
  { value: "QUI", label: "Quinta-feira" },
  { value: "SEX", label: "Sexta-feira" },
];

const GRADE_LABELS: Record<GradeTipo, string> = {
  SEMANAL: "Grade semanal",
  PROFESSOR: "Grade do professor",
  TURMA: "Grade por turma",
  DIARIA: "Grade por dia",
};

const TURNO_OPTIONS: Turno[] = ["MANHA", "TARDE", "INTEGRAL", "NOITE"];

function normalizePlano(plan?: string | null) {
  if (!plan) return "BASICO";
  if (plan === "BASIC") return "BASICO";
  return plan;
}

function hasMeaningfulHorarioConfigData(
  configs: Record<Turno, HorarioConfig>,
  overrides: Record<string, TurmaHorarioOverride>,
) {
  const hasOverrides = Object.values(overrides).some(
    (override) => override?.enabled,
  );

  if (hasOverrides) return true;

  return TURNOS_REAIS.some((turno) => {
    return JSON.stringify(configs[turno]) !== JSON.stringify(DEFAULT_HORARIO_CONFIG[turno]);
  });
}

function getPlanoLabel(plan?: string | null) {
  const normalizedPlan = normalizePlano(plan);

  switch (normalizedPlan) {
    case "TESTE_15_DIAS":
      return "Teste de 15 dias";
    case "BASICO":
      return "Básico";
    case "PRO":
      return "Pro";
    case "PREMIUM":
      return "Premium";
    default:
      return "Básico";
  }
}

function getPlanoBadgeClass(plan?: string | null) {
  const normalizedPlan = normalizePlano(plan);

  switch (normalizedPlan) {
    case "TESTE_15_DIAS":
      return "border-amber-200 bg-amber-100 text-amber-700";
    case "BASICO":
      return "border-slate-200 bg-slate-100 text-slate-700";
    case "PRO":
      return "border-blue-200 bg-blue-100 text-blue-700";
    case "PREMIUM":
      return "border-purple-200 bg-purple-100 text-purple-700";
    default:
      return "border-slate-200 bg-slate-100 text-slate-700";
  }
}

function getContextKey(turma: TurmaContexto) {
  return turma.contextId || turma.id;
}

function getAllowedGradeTipos(role?: UserRole | null): GradeTipo[] {
  if (role === "ALUNO" || role === "RESPONSAVEL") {
    return ["SEMANAL", "TURMA", "DIARIA"];
  }

  return ["SEMANAL", "PROFESSOR", "TURMA", "DIARIA"];
}

function getDefaultGradeTipo(role?: UserRole | null): GradeTipo {
  if (role === "PROFESSOR") return "PROFESSOR";
  return "SEMANAL";
}

function normalizarContexto(item: any): TurmaContexto {
  return {
    contextId: item.contextId,
    id: item.id,
    name: item.name,
    turno: item.turno,
    aluno: item.aluno || null,
    aulas: Array.isArray(item.aulas) ? item.aulas : [],
  };
}

async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

function normalizeHorarioRulesPayload(data?: Partial<HorarioRulesStorage> | null) {
  return {
    officialConfigs: normalizeHorarioConfigs(data?.officialConfigs),
    turmaOverrides: normalizeTurmaHorarioOverrides(data?.turmaOverrides),
  };
}

export default function HorariosPage() {
  const { token, user, selectedSchool } = useAuth();
  const isProfessor = user?.role === "PROFESSOR";
  const canManageSchedule =
    user?.role === "SUPERUSUARIO" ||
    user?.role === "ADMIN_ESCOLA" ||
    user?.role === "GESTOR" ||
    user?.role === "SECRETARIA";
  const plano = normalizePlano(user?.plan || "BASICO");

  const [contextos, setContextos] = useState<TurmaContexto[]>([]);
  const [gradeTipo, setGradeTipo] = useState<GradeTipo>(() =>
    getDefaultGradeTipo(user?.role),
  );
  const [gradeTurmaKey, setGradeTurmaKey] = useState("");
  const [gradeProfessorId, setGradeProfessorId] = useState("");
  const [gradeDiaSemana, setGradeDiaSemana] = useState("SEG");
  const [turnoOficialSelecionado, setTurnoOficialSelecionado] =
    useState<Turno>("MANHA");

  const [turmaId, setTurmaId] = useState("");
  const [diaSemana, setDiaSemana] = useState("SEG");
  const [horaInicio, setHoraInicio] = useState("07:30");
  const [horaFim, setHoraFim] = useState("08:20");
  const [turmaProfessorId, setTurmaProfessorId] = useState("");
  const [isIntervalo, setIsIntervalo] = useState(false);
  const [intervaloNome, setIntervaloNome] = useState("Intervalo");

  const [modulacoes, setModulacoes] = useState<Modulacao[]>([]);
  const [horarioConfigs, setHorarioConfigs] =
    useState<Record<Turno, HorarioConfig>>(DEFAULT_HORARIO_CONFIG);
  const [hasStoredHorarioConfig, setHasStoredHorarioConfig] = useState(false);
  const [turmaOverrides, setTurmaOverrides] = useState<
    Record<string, TurmaHorarioOverride>
  >({});
  const [loadingContextos, setLoadingContextos] = useState(true);
  const [loadingModulacoes, setLoadingModulacoes] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingAulaId, setEditingAulaId] = useState<string | null>(null);
  const cadastroRef = useRef<HTMLDivElement | null>(null);

  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const shouldFilterGradeByTurn =
    canManageSchedule || isProfessor || gradeTipo === "PROFESSOR";

  function authHeaders(extra?: Record<string, string>) {
    return {
      Authorization: `Bearer ${token}`,
      ...(selectedSchool?.id ? { "x-school-id": selectedSchool.id } : {}),
      ...(extra || {}),
    };
  }

  function getSchoolKey() {
    return selectedSchool?.id || user?.schoolId || "sem-escola";
  }

  async function fetchGradeContextos() {
    if (!token) {
      setContextos([]);
      setLoadingContextos(false);
      return;
    }

    try {
      setLoadingContextos(true);
      setErrorMessage("");

      const response = await fetch(apiUrl("/aulas/contextos"), {
        headers: authHeaders(),
      });
      const data = await readJson<any>(response);

      if (!response.ok) {
        throw new Error(data.message || "Erro ao buscar grade de horários.");
      }

      const lista = Array.isArray(data) ? data.map(normalizarContexto) : [];
      setContextos(lista);
      setGradeTurmaKey((current) =>
        current && lista.some((item) => getContextKey(item) === current)
          ? current
          : getContextKey(lista[0] || ({ id: "" } as TurmaContexto)),
      );
      setTurmaId((current) =>
        current && lista.some((item) => item.id === current)
          ? current
          : lista[0]?.id || "",
      );
    } catch (error: any) {
      setContextos([]);
      setErrorMessage(error.message || "Não foi possível carregar a grade.");
    } finally {
      setLoadingContextos(false);
    }
  }

  async function fetchModulacoesByTurma(selectedTurmaId: string) {
    if (!token || !selectedTurmaId || !canManageSchedule) {
      setModulacoes([]);
      return;
    }

    try {
      setLoadingModulacoes(true);

      const response = await fetch(apiUrl(`/turma-professor/${selectedTurmaId}`), {
        headers: authHeaders(),
      });
      const data = await readJson<any>(response);

      if (!response.ok) {
        throw new Error(data.message || "Erro ao buscar modulacoes.");
      }

      setModulacoes(Array.isArray(data) ? data : []);
    } catch (error: any) {
      setModulacoes([]);
      setErrorMessage(
        error.message || "Não foi possível carregar os professores da turma.",
      );
    } finally {
      setLoadingModulacoes(false);
    }
  }

  useEffect(() => {
    if (user?.role) {
      setGradeTipo(getDefaultGradeTipo(user.role));
    }
  }, [user?.role]);

  useEffect(() => {
    const allowed = getAllowedGradeTipos(user?.role);

    if (!allowed.includes(gradeTipo)) {
      setGradeTipo(allowed[0]);
    }
  }, [gradeTipo, user?.role]);

  useEffect(() => {
    if (isProfessor && user?.id) {
      setGradeProfessorId(user.id);
    }
  }, [isProfessor, user?.id]);

  useEffect(() => {
    fetchGradeContextos();
  }, [token, selectedSchool?.id]);

  useEffect(() => {
    async function loadHorarioRules() {
      const schoolKey = getSchoolKey();
      const cachedRules = loadHorarioRulesFromStorage(schoolKey);

      if (!token) {
        setHorarioConfigs(cachedRules?.officialConfigs || DEFAULT_HORARIO_CONFIG);
        setTurmaOverrides(cachedRules?.turmaOverrides || {});
        setHasStoredHorarioConfig(
          cachedRules
            ? hasMeaningfulHorarioConfigData(
                cachedRules.officialConfigs,
                cachedRules.turmaOverrides,
              )
            : false,
        );
        return;
      }

      try {
        const response = await fetch(apiUrl("/aulas/horario-rules"), {
          headers: authHeaders(),
        });
        const data = await readJson<
          Partial<HorarioRulesStorage> & {
            message?: string;
            hasStoredConfig?: boolean;
          }
        >(
          response,
        );

        if (!response.ok) {
          throw new Error(data.message || "Erro ao carregar configurações da grade.");
        }

        const normalizedRules = normalizeHorarioRulesPayload(data);
        setHorarioConfigs(normalizedRules.officialConfigs);
        setTurmaOverrides(normalizedRules.turmaOverrides);
        setHasStoredHorarioConfig(
          Boolean(data?.hasStoredConfig) ||
            hasMeaningfulHorarioConfigData(
              normalizedRules.officialConfigs,
              normalizedRules.turmaOverrides,
            ),
        );
        saveHorarioRulesToStorage(schoolKey, normalizedRules);
      } catch {
        setHorarioConfigs(cachedRules?.officialConfigs || DEFAULT_HORARIO_CONFIG);
        setTurmaOverrides(cachedRules?.turmaOverrides || {});
        setHasStoredHorarioConfig(
          cachedRules
            ? hasMeaningfulHorarioConfigData(
                cachedRules.officialConfigs,
                cachedRules.turmaOverrides,
              )
            : false,
        );
      }
    }

    void loadHorarioRules();
  }, [selectedSchool?.id, user?.schoolId]);

  useEffect(() => {
    fetchModulacoesByTurma(turmaId);
  }, [turmaId, token, canManageSchedule]);

  const gradeOptions = useMemo(
    () =>
      getAllowedGradeTipos(user?.role).map((value) => ({
        value,
        label: GRADE_LABELS[value],
      })),
    [user?.role],
  );

  const turmasUnicas = useMemo(() => {
    const map = new Map<string, TurmaContexto>();

    contextos.forEach((contexto) => {
      if (!map.has(contexto.id)) {
        map.set(contexto.id, {
          ...contexto,
          contextId: contexto.id,
          aluno: null,
        });
      }
    });

    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [contextos]);

  const professoresDaGrade = useMemo(() => {
    const map = new Map<string, string>();

    contextos.forEach((contexto) => {
      contexto.aulas.forEach((aula) => {
        const professor = aula.turmaProfessor?.professor;
        if (professor?.id) {
          map.set(professor.id, professor.name || "Professor");
        }
      });
    });

    if (isProfessor && user?.id) {
      map.set(user.id, user.name || "Professor");
    }

    return Array.from(map, ([id, name]) => ({ id, name })).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }, [contextos, isProfessor, user?.id, user?.name]);

  useEffect(() => {
    if (isProfessor && user?.id) {
      setGradeProfessorId(user.id);
      return;
    }

    setGradeProfessorId((current) =>
      current && professoresDaGrade.some((professor) => professor.id === current)
        ? current
        : professoresDaGrade[0]?.id || "",
    );
  }, [isProfessor, professoresDaGrade, user?.id]);

  const aulasDaTurmaSelecionada = useMemo<ScheduleAula[]>(() => {
    return contextos.find((contexto) => contexto.id === turmaId)?.aulas || [];
  }, [contextos, turmaId]);

  const turmaSelecionada = useMemo(
    () => turmasUnicas.find((turma) => turma.id === turmaId) || null,
    [turmaId, turmasUnicas],
  );
  const turnoConfiguradoTurma = turmaSelecionada?.turno
    ? normalizeTurno(turmaSelecionada.turno)
    : null;
  const horarioConfigOficial = horarioConfigs[turnoOficialSelecionado];
  const turmaOverrideAtual = turmaId ? turmaOverrides[turmaId] : undefined;
  const excecaoTurmaAtiva = Boolean(turmaOverrideAtual?.enabled);
  const horarioConfigTurma = useMemo(
    () =>
      turnoConfiguradoTurma
        ? resolveHorarioConfigForTurma({
            officialConfigs: horarioConfigs,
            turmaOverrides,
            turmaId,
            turno: turnoConfiguradoTurma,
          })
        : null,
    [horarioConfigs, turmaId, turmaOverrides, turnoConfiguradoTurma],
  );
  const horariosConfiguradosTurma = useMemo(() => {
    if (!horarioConfigTurma) return [];
    return buildHorarioSlots(horarioConfigTurma);
  }, [horarioConfigTurma]);
  const intervalosConfiguradosTurma = useMemo<HorarioIntervalo[]>(
    () => horarioConfigTurma?.intervalos || [],
    [horarioConfigTurma],
  );

  useEffect(() => {
    if (!isIntervalo) return;
    setIntervaloNome(
      (current) => current || intervalosConfiguradosTurma[0]?.nome || "Intervalo",
    );
  }, [intervalosConfiguradosTurma, isIntervalo]);

  const selectedGradeTurmas = useMemo(() => {
    if (gradeTipo === "TURMA") {
      const selected = contextos.find(
        (contexto) => getContextKey(contexto) === gradeTurmaKey,
      );
      return selected ? [selected] : [];
    }

    if (shouldFilterGradeByTurn) {
      return contextos.filter((contexto) => {
        if (!contexto.turno) return false;
        return normalizeTurno(contexto.turno) === turnoOficialSelecionado;
      });
    }

    return contextos;
  }, [
    contextos,
    gradeTipo,
    gradeTurmaKey,
    shouldFilterGradeByTurn,
    turnoOficialSelecionado,
  ]);

  const gradeTurnoAutomatico = useMemo(() => {
    const turnos = Array.from(
      new Set(
        selectedGradeTurmas
          .map((contexto) => (contexto.turno ? normalizeTurno(contexto.turno) : null))
          .filter((turno): turno is Turno => Boolean(turno)),
      ),
    );

    return turnos.length === 1 ? turnos[0] : undefined;
  }, [selectedGradeTurmas]);

  const effectiveTurnFilter = shouldFilterGradeByTurn
    ? turnoOficialSelecionado
    : gradeTurnoAutomatico;

  const shouldPreferConfiguredSlots =
    (user?.role === "ALUNO" || user?.role === "RESPONSAVEL") &&
    hasStoredHorarioConfig;

  const turmaHorarioConfigsDaGrade = useMemo(() => {
    const entries = selectedGradeTurmas
      .map((contexto) => {
        const turno = contexto.turno ? normalizeTurno(contexto.turno) : null;
        if (!turno) return null;

        return [
          contexto.id,
          resolveHorarioConfigForTurma({
            officialConfigs: horarioConfigs,
            turmaOverrides,
            turmaId: contexto.id,
            turno,
          }),
        ] as const;
      })
      .filter(
        (
          entry,
        ): entry is readonly [string, HorarioConfig] => Boolean(entry),
      );

    return Object.fromEntries(entries) as Record<string, HorarioConfig>;
  }, [horarioConfigs, selectedGradeTurmas, turmaOverrides]);

  const effectiveProfessorId = isProfessor
    ? user?.id || ""
    : gradeTipo === "PROFESSOR"
      ? gradeProfessorId
      : undefined;

  const gradeSubtitle = useMemo(() => {
    if (gradeTipo === "PROFESSOR") {
      const professor = professoresDaGrade.find(
        (item) => item.id === effectiveProfessorId,
      );
      return professor
        ? `Professor: ${professor.name} - Turno: ${formatTurno(turnoOficialSelecionado)}`
        : "Selecione um professor";
    }

    if ((isProfessor || canManageSchedule) && gradeTipo === "SEMANAL") {
      return `${isProfessor ? "Visão semanal do professor" : "Visão semanal por turno"} - Turno: ${formatTurno(turnoOficialSelecionado)}.`;
    }

    if (gradeTipo === "TURMA") {
      const turma = contextos.find(
        (item) => getContextKey(item) === gradeTurmaKey,
      );
      if (!turma) return "Selecione uma turma";
      const turno = turma.turno ? ` - ${formatTurno(turma.turno)}` : "";
      const aluno = turma.aluno?.name ? ` - ${turma.aluno.name}` : "";
      return `${turma.name}${turno}${aluno}`;
    }

    if (gradeTipo === "DIARIA") {
      return `${shouldFilterGradeByTurn ? `Turno: ${formatTurno(turnoOficialSelecionado)} - ` : ""}Dia selecionado: ${
        DIAS_FORM.find((dia) => dia.value === gradeDiaSemana)?.label || gradeDiaSemana
      }`;
    }

    return "Visão semanal da escola ou das turmas disponíveis para o perfil.";
  }, [
    contextos,
    effectiveProfessorId,
    gradeDiaSemana,
    gradeTipo,
    gradeTurmaKey,
    isProfessor,
    canManageSchedule,
    professoresDaGrade,
    shouldFilterGradeByTurn,
    turnoOficialSelecionado,
  ]);

  const modulacaoSelecionada = modulacoes.find(
    (modulacao) => modulacao.id === turmaProfessorId,
  );

  function resetForm() {
    setDiaSemana("SEG");
    setHoraInicio("07:30");
    setHoraFim("08:20");
    setTurmaProfessorId("");
    setIsIntervalo(false);
    setIntervaloNome(intervalosConfiguradosTurma[0]?.nome || "Intervalo");
    setEditingAulaId(null);
  }

  function preencherFormularioParaEditar(aula: ScheduleAula) {
    setEditingAulaId(aula.id);
    setDiaSemana(aula.diaSemana);
    setHoraInicio(aula.horaInicio);
    setHoraFim(aula.horaFim);
    setErrorMessage("");
    setSuccessMessage("");
    cadastroRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });

    if (!aula.turmaProfessorId) {
      setIsIntervalo(true);
      setTurmaProfessorId("");
      setIntervaloNome(aula.disciplina || "Intervalo");
      return;
    }

    setIsIntervalo(false);
    setIntervaloNome(intervalosConfiguradosTurma[0]?.nome || "Intervalo");
    setTurmaProfessorId(aula.turmaProfessorId || "");
  }

  function abrirCadastroManual() {
    setErrorMessage("");
    setSuccessMessage("");
    cadastroRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function persistHorarioRules(
    nextOfficialConfigs: Record<Turno, HorarioConfig>,
    nextTurmaOverrides: Record<string, TurmaHorarioOverride>,
  ) {
    const schoolKey = getSchoolKey();
    const payload: HorarioRulesStorage = {
      officialConfigs: nextOfficialConfigs,
      turmaOverrides: nextTurmaOverrides,
    };

    saveHorarioRulesToStorage(schoolKey, payload);

    if (!token || !canManageSchedule) return;

    try {
      await fetch(apiUrl("/aulas/horario-rules"), {
        method: "PATCH",
        headers: authHeaders({
          "Content-Type": "application/json",
        }),
        body: JSON.stringify(payload),
      });
    } catch (error) {
      console.error("Não foi possível sincronizar as configurações de horário.", error);
    }
  }

  function persistHorarioConfigs(nextConfigs: Record<Turno, HorarioConfig>) {
    const payload: HorarioRulesStorage = {
      officialConfigs: nextConfigs,
      turmaOverrides,
    };
    void persistHorarioRules(payload.officialConfigs, payload.turmaOverrides);
  }

  function updateHorarioConfigTurno(
    updater: (config: HorarioConfig) => HorarioConfig,
  ) {
    if (!turnoConfiguradoTurma) return;

    const nextConfigs = normalizeHorarioConfigs({
      ...horarioConfigs,
      [turnoConfiguradoTurma]: updater(horarioConfigs[turnoConfiguradoTurma]),
    });

    setHorarioConfigs(nextConfigs);
    persistHorarioConfigs(nextConfigs);
    setErrorMessage("");
  }

  function updateHorarioConfigOficial(updater: (config: HorarioConfig) => HorarioConfig) {
    const nextOfficialConfigs = normalizeHorarioConfigs({
      ...horarioConfigs,
      [turnoOficialSelecionado]: updater(horarioConfigs[turnoOficialSelecionado]),
    });
    setHorarioConfigs(nextOfficialConfigs);
    persistHorarioRules(nextOfficialConfigs, turmaOverrides);
    setErrorMessage("");
  }

  function updateHorarioConfigExcecao(updater: (config: HorarioConfig) => HorarioConfig) {
    if (!turmaId || !turnoConfiguradoTurma) return;

    const baseConfig = horarioConfigTurma || horarioConfigs[turnoConfiguradoTurma];
    const nextTurmaOverrides = {
      ...turmaOverrides,
      [turmaId]: {
        enabled: true,
        config: updater(baseConfig),
      },
    };

    setTurmaOverrides(nextTurmaOverrides);
    persistHorarioRules(horarioConfigs, nextTurmaOverrides);
    setErrorMessage("");
  }

  function toggleExcecaoTurma(enabled: boolean) {
    if (!turmaId || !turnoConfiguradoTurma) return;

    const nextTurmaOverrides = {
      ...turmaOverrides,
      [turmaId]: {
        enabled,
        config:
          turmaOverrides[turmaId]?.config ||
          normalizeHorarioConfigs({
            [turnoConfiguradoTurma]: horarioConfigs[turnoConfiguradoTurma],
          })[turnoConfiguradoTurma],
      },
    };

    setTurmaOverrides(nextTurmaOverrides);
    persistHorarioRules(horarioConfigs, nextTurmaOverrides);
    setSuccessMessage(
      enabled
        ? "Exceção ativada para esta turma."
        : "A turma voltou a usar o horário oficial da escola.",
    );
  }

  function updateHorarioQuantidadeTurma(totalAulas: number) {
    if (!turnoConfiguradoTurma || !horarioConfigTurma) return;

    const quantidade = clampHorarioCount(totalAulas);
    const updater = (configAtual: HorarioConfig) => ({
      ...configAtual,
      fim: calculateHorarioEnd(configAtual, quantidade),
    });

    if (excecaoTurmaAtiva) {
      updateHorarioConfigExcecao(updater);
    } else {
      updateHorarioConfigOficial(updater);
    }
    setSuccessMessage("Quantidade total de aulas atualizada para este turno.");
  }

  function updateInicioHorarioTurma(inicio: string) {
    if (!horarioConfigTurma) return;

    const updater = (configAtual: HorarioConfig) => {
      const nextConfig = {
        ...configAtual,
        inicio,
      };

      return {
        ...nextConfig,
        fim: calculateHorarioEnd(nextConfig, horariosConfiguradosTurma.length || 1),
      };
    };

    if (excecaoTurmaAtiva) {
      updateHorarioConfigExcecao(updater);
    } else {
      updateHorarioConfigOficial(updater);
    }
    setSuccessMessage("Horario inicial atualizado.");
  }

  function updateDuracaoAulaTurma(index: number, duracao: number) {
    if (!horarioConfigTurma) return;

    const updater = (configAtual: HorarioConfig) => {
      const ajustes = {
        ...configAtual.ajustes,
        [index]: Math.max(1, duracao),
      };
      const nextConfig = {
        ...configAtual,
        mesmoTempoAulas: false,
        ajustes,
      };

      return {
        ...nextConfig,
        fim: calculateHorarioEnd(nextConfig, horariosConfiguradosTurma.length || 1),
      };
    };

    if (excecaoTurmaAtiva) {
      updateHorarioConfigExcecao(updater);
    } else {
      updateHorarioConfigOficial(updater);
    }
    setSuccessMessage("Duração da aula atualizada.");
  }

  function adicionarIntervaloTurno() {
    const updater = (configAtual: HorarioConfig) => {
      const novoIntervalo = createIntervalo(configAtual.intervalos.length);
      const nextConfig = {
        ...configAtual,
        intervalos: [...configAtual.intervalos, novoIntervalo],
      };

      return {
        ...nextConfig,
        fim: calculateHorarioEnd(nextConfig, horariosConfiguradosTurma.length || 1),
      };
    };

    if (excecaoTurmaAtiva) {
      updateHorarioConfigExcecao(updater);
    } else {
      updateHorarioConfigOficial(updater);
    }
    setSuccessMessage("Novo intervalo adicionado ao turno.");
  }

  function atualizarIntervaloTurno(
    intervaloId: string,
    nextIntervalo: Partial<HorarioIntervalo>,
  ) {
    const updater = (configAtual: HorarioConfig) => {
      const nextConfig = {
        ...configAtual,
        intervalos: configAtual.intervalos.map((intervalo) =>
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

      return {
        ...nextConfig,
        fim: calculateHorarioEnd(nextConfig, horariosConfiguradosTurma.length || 1),
      };
    };

    if (excecaoTurmaAtiva) {
      updateHorarioConfigExcecao(updater);
    } else {
      updateHorarioConfigOficial(updater);
    }
    setSuccessMessage("Intervalo atualizado.");
  }

  function removerIntervaloTurno(intervaloId: string) {
    const updater = (configAtual: HorarioConfig) => {
      const nextConfig = {
        ...configAtual,
        intervalos: configAtual.intervalos.filter(
          (intervalo) => intervalo.id !== intervaloId,
        ),
      };

      return {
        ...nextConfig,
        fim: calculateHorarioEnd(nextConfig, horariosConfiguradosTurma.length || 1),
      };
    };

    if (excecaoTurmaAtiva) {
      updateHorarioConfigExcecao(updater);
    } else {
      updateHorarioConfigOficial(updater);
    }
    setSuccessMessage("Intervalo removido.");
  }

  function getAulasUsadasModulacao(modulacaoId: string) {
    const total = aulasDaTurmaSelecionada.filter(
      (aula) => aula.turmaProfessorId === modulacaoId,
    ).length;

    if (!editingAulaId) return total;

    const aulaEditada = aulasDaTurmaSelecionada.find(
      (aula) => aula.id === editingAulaId,
    );

    if (aulaEditada?.turmaProfessorId === modulacaoId && total > 0) {
      return total - 1;
    }

    return total;
  }

  const aulasUsadasSelecionadas =
    turmaProfessorId && !isIntervalo
      ? getAulasUsadasModulacao(turmaProfessorId)
      : 0;
  const aulasRestantesSelecionadas = modulacaoSelecionada
    ? Math.max(modulacaoSelecionada.cargaHoraria - aulasUsadasSelecionadas, 0)
    : 0;
  const percentualUsoSelecionado =
    modulacaoSelecionada && modulacaoSelecionada.cargaHoraria > 0
      ? Math.min(
          (aulasUsadasSelecionadas / modulacaoSelecionada.cargaHoraria) * 100,
          100,
        )
      : 0;

  async function salvarAula() {
    setErrorMessage("");
    setSuccessMessage("");

    if (!token) {
      setErrorMessage("Sessão inválida. Faça login novamente.");
      return;
    }

    if (!turmaId) {
      setErrorMessage("Selecione uma turma.");
      return;
    }

    if (!isIntervalo && !turmaProfessorId) {
      setErrorMessage("Selecione professor e disciplina ou marque intervalo.");
      return;
    }

    if (!horaInicio || !horaFim) {
      setErrorMessage("Informe o horário de início e fim.");
      return;
    }

    if (horaInicio >= horaFim) {
      setErrorMessage("O horário de início deve ser menor que o horário de fim.");
      return;
    }

    if (plano === "PREMIUM" && !isIntervalo && modulacaoSelecionada) {
      const usadas = getAulasUsadasModulacao(modulacaoSelecionada.id);

      if (usadas >= modulacaoSelecionada.cargaHoraria) {
        setErrorMessage("Este professor já atingiu o limite de aulas da modulação.");
        return;
      }
    }

    try {
      setSaving(true);

      const isEditing = !!editingAulaId;
      const url = isEditing
        ? apiUrl(`/aulas/${editingAulaId}`)
        : apiUrl("/aulas");
      const method = isEditing ? "PATCH" : "POST";

      const response = await fetch(url, {
        method,
        headers: authHeaders({
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({
          turmaId,
          diaSemana,
          horaInicio,
          horaFim,
          turmaProfessorId: isIntervalo ? null : turmaProfessorId,
          disciplina: isIntervalo ? sanitizeIntervalName(intervaloNome) : undefined,
        }),
      });
      const data = await readJson<any>(response);

      if (!response.ok) {
        throw new Error(data.message || "Erro ao salvar aula.");
      }

      setSuccessMessage(
        isEditing ? "Aula atualizada com sucesso." : "Aula adicionada com sucesso.",
      );
      resetForm();
      await fetchGradeContextos();
      await fetchModulacoesByTurma(turmaId);
    } catch (error: any) {
      setErrorMessage(error.message || "Não foi possível salvar a aula.");
    } finally {
      setSaving(false);
    }
  }

  async function excluirAula(id: string) {
    if (!confirm("Deseja realmente excluir esta aula?")) return;

    try {
      setErrorMessage("");
      setSuccessMessage("");

      const response = await fetch(apiUrl(`/aulas/${id}`), {
        method: "DELETE",
        headers: authHeaders(),
      });

      if (!response.ok) {
        const data = await readJson<any>(response);
        throw new Error(data.message || "Erro ao excluir aula.");
      }

      if (editingAulaId === id) {
        resetForm();
      }

      setSuccessMessage("Aula excluída com sucesso.");
      await fetchGradeContextos();
      await fetchModulacoesByTurma(turmaId);
    } catch (error: any) {
      setErrorMessage(error.message || "Erro ao excluir aula.");
    }
  }

  const aulasDoDiaSelecionado = useMemo(() => {
    return aulasDaTurmaSelecionada
      .filter((aula) => aula.diaSemana === diaSemana)
      .sort((a, b) => a.horaInicio.localeCompare(b.horaInicio));
  }, [aulasDaTurmaSelecionada, diaSemana]);

  return (
    <section className="space-y-6">
      <PageHeader
        title="Horários"
        description="Organize e visualize a grade de aulas por semana, professor, turma ou dias separados."
      />

      {canManageSchedule ? (
        <>
          <div className="card-base space-y-6 p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  Modulação manual da grade
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Esta área é a fonte oficial para admin, gestor e secretaria
                  ajustarem manualmente a grade criada pelo modulador.
                </p>
              </div>

              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
                As alterações feitas aqui prevalecem sobre a geração automática
                do modulador.
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-[1.1fr_0.9fr_auto]">
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">
                  Turma para ajuste manual
                </span>
                <select
                  value={turmaId}
                  onChange={(event) => {
                    setTurmaId(event.target.value);
                    resetForm();
                  }}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
                >
                  <option value="">
                    {loadingContextos ? "Carregando turmas..." : "Selecione a turma"}
                  </option>
                  {turmasUnicas.map((turma) => (
                    <option key={turma.id} value={turma.id}>
                      {turma.name}
                      {turma.turno ? ` - ${formatTurno(turma.turno)}` : ""}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">
                  Dia para ajuste manual
                </span>
                <select
                  value={diaSemana}
                  onChange={(event) => setDiaSemana(event.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
                >
                  {DIAS_FORM.map((dia) => (
                    <option key={dia.value} value={dia.value}>
                      {dia.label}
                    </option>
                  ))}
                </select>
              </label>

              <button
                type="button"
                onClick={abrirCadastroManual}
                className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 md:self-end"
              >
                Novo ajuste manual
              </button>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-sm font-bold uppercase text-slate-600">
                  Grade manual de{" "}
                  {DIAS_FORM.find((dia) => dia.value === diaSemana)?.label ||
                    diaSemana}
                </h3>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
                  {aulasDoDiaSelecionado.length} ajuste(s) neste dia
                </span>
              </div>

              {!turmaId ? (
                <p className="text-sm text-slate-500">
                  Selecione uma turma para abrir a modulacao manual.
                </p>
              ) : aulasDoDiaSelecionado.length === 0 ? (
                <p className="text-sm text-slate-500">
                  Nenhum horario manual registrado neste dia. Use o cadastro por
                  horario abaixo para criar o primeiro ajuste.
                </p>
              ) : (
                <div className="space-y-2">
                  {aulasDoDiaSelecionado.map((aula) => (
                    <div
                      key={aula.id}
                      className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 p-4 md:flex-row md:items-center md:justify-between"
                    >
                      <div>
                        <span className="text-sm font-semibold text-slate-600">
                          {aula.horaInicio} - {aula.horaFim}
                        </span>
                        <strong className="mt-1 block text-slate-900">
                          {!aula.turmaProfessorId
                            ? aula.disciplina
                            : aula.turmaProfessor
                              ? `${aula.turmaProfessor.disciplina} - ${
                                  aula.turmaProfessor.professor?.name ||
                                  "Professor"
                                }`
                              : aula.disciplina}
                        </strong>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => preencherFormularioParaEditar(aula)}
                          className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 transition hover:bg-blue-100"
                        >
                          Editar manualmente
                        </button>
                        <button
                          type="button"
                          onClick={() => excluirAula(aula.id)}
                          className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-100"
                        >
                          Excluir da grade
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div ref={cadastroRef} className="card-base space-y-6 p-6">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">
              {editingAulaId ? "Editar aula" : "Cadastro de aulas por horário"}
            </h2>
            <p className="text-sm text-slate-500">
              Este cadastro executa a modulação manual da grade oficial.
              Selecione a turma, o dia, os horários e o vínculo de professor com
              disciplina.
            </p>

            <div
              className={`mt-2 inline-flex items-center gap-2 rounded-lg border px-3 py-1 text-xs font-semibold ${getPlanoBadgeClass(
                plano,
              )}`}
            >
              Plano: {getPlanoLabel(plano)}
            </div>
          </div>

          {errorMessage ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {errorMessage}
            </div>
          ) : null}

          {successMessage ? (
            <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
              {successMessage}
            </div>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">
                Turma
              </span>
              <select
                value={turmaId}
                onChange={(event) => {
                  setTurmaId(event.target.value);
                  resetForm();
                }}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
              >
                <option value="">
                  {loadingContextos ? "Carregando turmas..." : "Selecione a turma"}
                </option>
                {turmasUnicas.map((turma) => (
                  <option key={turma.id} value={turma.id}>
                    {turma.name}
                    {turma.turno ? ` - ${formatTurno(turma.turno)}` : ""}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">
                Dia da semana
              </span>
              <select
                value={diaSemana}
                onChange={(event) => setDiaSemana(event.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
              >
                {DIAS_FORM.map((dia) => (
                  <option key={dia.value} value={dia.value}>
                    {dia.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid gap-3 md:grid-cols-4">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">
                Inicio
              </span>
              <input
                type="time"
                value={horaInicio}
                onChange={(event) => setHoraInicio(event.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">
                Fim
              </span>
              <input
                type="time"
                value={horaFim}
                onChange={(event) => setHoraFim(event.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
              />
            </label>

            <div className="md:col-span-2">
              <div className="mb-3 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                <input
                  id="intervalo"
                  type="checkbox"
                  checked={isIntervalo}
                  onChange={(event) => {
                    const checked = event.target.checked;
                    setIsIntervalo(checked);
                    if (checked) setTurmaProfessorId("");
                  }}
                  className="h-4 w-4"
                />
                <label
                  htmlFor="intervalo"
                  className="text-sm font-medium text-slate-700"
                >
                  Este horario e intervalo
                </label>
              </div>

              {isIntervalo ? (
                <label className="mb-3 block">
                  <span className="mb-1 block text-sm font-medium text-slate-700">
                    Nome do intervalo
                  </span>
                  <input
                    list="intervalos-configurados"
                    type="text"
                    value={intervaloNome}
                    onChange={(event) => setIntervaloNome(event.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
                    placeholder="Ex.: Recreio, Lanche, Pausa"
                  />
                  <datalist id="intervalos-configurados">
                    {intervalosConfiguradosTurma.map((intervalo) => (
                      <option key={intervalo.id} value={intervalo.nome} />
                    ))}
                  </datalist>
                </label>
              ) : null}

              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">
                  Professor + disciplina
                </span>
                <select
                  value={turmaProfessorId}
                  onChange={(event) => setTurmaProfessorId(event.target.value)}
                  disabled={isIntervalo}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500 disabled:bg-slate-100 disabled:text-slate-400"
                >
                  <option value="">
                    {isIntervalo
                      ? "Intervalo selecionado"
                      : !turmaId
                        ? "Selecione a turma primeiro"
                        : loadingModulacoes
                          ? "Carregando opções..."
                          : "Selecione professor e disciplina"}
                  </option>

                  {modulacoes.map((modulacao) => {
                    const usadas = getAulasUsadasModulacao(modulacao.id);
                    const lotada = usadas >= modulacao.cargaHoraria;
                    const bloquear =
                      plano === "PREMIUM" &&
                      lotada &&
                      turmaProfessorId !== modulacao.id;

                    return (
                      <option
                        key={modulacao.id}
                        value={modulacao.id}
                        disabled={bloquear}
                      >
                        {modulacao.disciplina} -{" "}
                        {modulacao.professor?.name || "Professor sem nome"}
                        {bloquear ? " (lotado)" : ""}
                      </option>
                    );
                  })}
                </select>
              </label>

              {!isIntervalo && modulacaoSelecionada ? (
                <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="mb-2 flex items-center justify-between text-sm">
                    <span className="font-medium text-slate-700">
                      Uso da modulação
                    </span>
                    <span className="text-slate-600">
                      {aulasUsadasSelecionadas} /{" "}
                      {modulacaoSelecionada.cargaHoraria}
                    </span>
                  </div>

                  <div className="h-3 w-full overflow-hidden rounded-full bg-slate-200">
                    <div
                      className={`h-3 rounded-full transition-all ${
                        percentualUsoSelecionado < 70
                          ? "bg-green-500"
                          : percentualUsoSelecionado < 100
                            ? "bg-yellow-500"
                            : "bg-red-500"
                      }`}
                      style={{ width: `${percentualUsoSelecionado}%` }}
                    />
                  </div>

                  <div className="mt-2 text-xs text-slate-600">
                    Restam {aulasRestantesSelecionadas} aula(s) para esta
                    modulação.
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold uppercase text-slate-700">
                  Horário oficial da escola
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  Esta configuração vira a regra base para todas as séries e turmas.
                </p>
              </div>
              <select
                value={turnoOficialSelecionado}
                onChange={(event) =>
                  setTurnoOficialSelecionado(event.target.value as Turno)
                }
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-slate-500"
              >
                <option value="MANHA">Manhã</option>
                <option value="TARDE">Tarde</option>
                <option value="NOITE">Noite</option>
              </select>
            </div>
            <div className="mt-3 rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-600">
              Turno oficial selecionado: <strong>{formatTurno(turnoOficialSelecionado)}</strong>.
              Quantidade atual:{" "}
              <strong>{buildHorarioSlots(horarioConfigOficial).length} aula(s)</strong>.
            </div>
          </div>

          {turmaSelecionada ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold uppercase text-slate-700">
                    Quadro horário da turma
                  </h3>
                  <p className="mt-1 text-sm text-slate-500">
                    Os horários desta turma seguem o turno {formatTurno(turmaSelecionada.turno || "")}.
                  </p>
                </div>
                <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-slate-600">
                  {horariosConfiguradosTurma.length} aula(s) configurada(s)
                </span>
              </div>

              <label className="mt-3 flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={excecaoTurmaAtiva}
                  onChange={(event) => toggleExcecaoTurma(event.target.checked)}
                  className="h-4 w-4"
                />
                Usar horário de exceção para esta turma
              </label>

              <div className="mt-3 rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-600">
                {excecaoTurmaAtiva
                  ? "Você está editando uma exceção própria desta turma."
                  : "Sem exceção ativa: a turma está usando a regra oficial da escola."}
              </div>

              {turnoConfiguradoTurma ? (
                <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
                  <label className="block">
                    <span className="mb-1 block text-xs font-bold uppercase text-slate-500">
                      Início da primeira aula
                    </span>
                    <input
                      type="time"
                      value={horarioConfigTurma?.inicio || ""}
                      onChange={(event) =>
                        updateInicioHorarioTurma(event.target.value)
                      }
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-slate-500"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-bold uppercase text-slate-500">
                      Total de aulas do turno
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          updateHorarioQuantidadeTurma(
                            horariosConfiguradosTurma.length - 1,
                          )
                        }
                        className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={horariosConfiguradosTurma.length <= 1}
                        aria-label="Diminuir quantidade de aulas"
                      >
                        -
                      </button>
                      <input
                        type="number"
                        min={1}
                        max={12}
                        value={horariosConfiguradosTurma.length}
                        onChange={(event) =>
                          updateHorarioQuantidadeTurma(
                            Number(event.target.value) || 1,
                          )
                        }
                        className="w-28 rounded-xl border border-slate-300 bg-white px-3 py-2 text-center text-sm text-slate-700 outline-none focus:border-slate-500"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          updateHorarioQuantidadeTurma(
                            horariosConfiguradosTurma.length + 1,
                          )
                        }
                        className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={horariosConfiguradosTurma.length >= 12}
                        aria-label="Aumentar quantidade de aulas"
                      >
                        +
                      </button>
                    </div>
                  </label>
                  <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-500">
                    Ajuste aplicado ao turno {formatTurno(turnoConfiguradoTurma)} e reutilizado na grade.
                  </div>
                </div>
              ) : null}

              {turnoConfiguradoTurma ? (
                <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h4 className="text-sm font-bold uppercase text-slate-700">
                        Intervalos do turno
                      </h4>
                      <p className="mt-1 text-sm text-slate-500">
                        Adicione quantos intervalos quiser e renomeie cada um deles.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={adicionarIntervaloTurno}
                      className="rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                    >
                      Adicionar intervalo
                    </button>
                  </div>

                  {intervalosConfiguradosTurma.length === 0 ? (
                    <div className="mt-3 rounded-xl border border-dashed border-slate-300 bg-slate-50/70 p-4 text-sm text-slate-500">
                      Nenhum intervalo configurado neste turno.
                    </div>
                  ) : (
                    <div className="mt-3 space-y-3">
                      {intervalosConfiguradosTurma.map((intervalo) => (
                        <div
                          key={intervalo.id}
                          className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3 md:grid-cols-[1.2fr_0.8fr_0.8fr_auto]"
                        >
                          <label className="block">
                            <span className="mb-1 block text-xs font-bold uppercase text-slate-500">
                              Nome
                            </span>
                            <input
                              type="text"
                              value={intervalo.nome}
                              onChange={(event) =>
                                atualizarIntervaloTurno(intervalo.id, {
                                  nome: event.target.value,
                                })
                              }
                              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-slate-500"
                            />
                          </label>
                          <label className="block">
                            <span className="mb-1 block text-xs font-bold uppercase text-slate-500">
                              Após a aula
                            </span>
                            <input
                              type="number"
                              min={1}
                              max={12}
                              value={intervalo.aposAula}
                              onChange={(event) =>
                                atualizarIntervaloTurno(intervalo.id, {
                                  aposAula: Number(event.target.value) || 1,
                                })
                              }
                              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-slate-500"
                            />
                          </label>
                          <label className="block">
                            <span className="mb-1 block text-xs font-bold uppercase text-slate-500">
                              Duração
                            </span>
                            <input
                              type="number"
                              min={1}
                              max={60}
                              value={intervalo.duracao}
                              onChange={(event) =>
                                atualizarIntervaloTurno(intervalo.id, {
                                  duracao: Number(event.target.value) || 1,
                                })
                              }
                              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-slate-500"
                            />
                          </label>
                          <button
                            type="button"
                            onClick={() => removerIntervaloTurno(intervalo.id)}
                            className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-100 md:self-end"
                          >
                            Remover
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : null}

              {horariosConfiguradosTurma.length === 0 ? (
                <p className="mt-3 text-sm text-slate-500">
                  Nenhuma configuração foi encontrada no modulador para este turno.
                </p>
              ) : (
                <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                  {horariosConfiguradosTurma.map((slot) => (
                    <div
                      key={`${slot.index}-${slot.inicio}-${slot.fim}`}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-left"
                    >
                      <span className="block text-xs font-bold uppercase text-slate-500">
                        {slot.label}
                      </span>
                      <span className="mt-1 block text-sm font-semibold text-slate-900">
                        {slot.inicio} - {slot.fim}
                      </span>
                      <span className="mt-1 block text-xs text-slate-500">
                        {slot.duracao} minuto(s)
                      </span>
                      <label className="mt-2 block">
                        <span className="mb-1 block text-[11px] font-bold uppercase text-slate-500">
                          Duração manual
                        </span>
                        <input
                          type="number"
                          min={1}
                          max={180}
                          value={slot.duracao}
                          onChange={(event) =>
                            updateDuracaoAulaTurma(
                              slot.index,
                              Number(event.target.value) || 1,
                            )
                          }
                          className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none focus:border-slate-500"
                        />
                      </label>
                      {horarioConfigTurma
                        ? getIntervaloAposAula(
                            horarioConfigTurma,
                            slot.index + 1,
                          ).map((intervalo) => (
                            <span
                              key={intervalo.id}
                              className="mt-1 block text-xs font-semibold text-orange-600"
                            >
                              {intervalo.nome}: {intervalo.duracao} min
                            </span>
                          ))
                        : null}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}

          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <button
              type="button"
              onClick={salvarAula}
              disabled={saving}
              className="w-full rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 md:w-auto md:min-w-44"
            >
              {saving
                ? "Salvando..."
                : editingAulaId
                  ? "Atualizar aula"
                  : "Adicionar aula"}
            </button>

            {editingAulaId ? (
              <button
                type="button"
                onClick={resetForm}
                className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancelar edição
              </button>
            ) : null}
          </div>

        </div>
        </>
      ) : errorMessage ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}

      <div className="card-base space-y-4 p-5">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            Seletor de grade
          </h2>
          <p className="text-sm text-slate-500">
            Escolha um tipo para abrir somente a grade solicitada.
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <label className="block">
            <span className="mb-1 block text-xs font-bold uppercase text-slate-500">
              Tipo
            </span>
            <select
              value={gradeTipo}
              onChange={(event) => setGradeTipo(event.target.value as GradeTipo)}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-slate-500"
            >
              {gradeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          {gradeTipo === "TURMA" ? (
            <label className="block md:col-span-2">
              <span className="mb-1 block text-xs font-bold uppercase text-slate-500">
                Turma
              </span>
              <select
                value={gradeTurmaKey}
                onChange={(event) => setGradeTurmaKey(event.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-slate-500"
              >
                <option value="">Selecione</option>
                {contextos.map((contexto) => (
                  <option key={getContextKey(contexto)} value={getContextKey(contexto)}>
                    {contexto.name}
                    {contexto.turno ? ` - ${formatTurno(contexto.turno)}` : ""}
                    {contexto.aluno?.name ? ` - ${contexto.aluno.name}` : ""}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {gradeTipo === "PROFESSOR" ? (
            <>
            <label className="block">
              <span className="mb-1 block text-xs font-bold uppercase text-slate-500">
                Professor
              </span>
              <select
                value={effectiveProfessorId || ""}
                onChange={(event) => setGradeProfessorId(event.target.value)}
                disabled={isProfessor}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-slate-500 disabled:bg-slate-100 disabled:text-slate-500"
              >
                <option value="">Selecione</option>
                {professoresDaGrade.map((professor) => (
                  <option key={professor.id} value={professor.id}>
                    {professor.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-bold uppercase text-slate-500">
                Turno
              </span>
              <select
                value={turnoOficialSelecionado}
                onChange={(event) =>
                  setTurnoOficialSelecionado(event.target.value as Turno)
                }
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-slate-500"
              >
                {TURNO_OPTIONS.map((turno) => (
                  <option key={turno} value={turno}>
                    {formatTurno(turno)}
                  </option>
                ))}
              </select>
            </label>
            </>
          ) : null}

          {(isProfessor || canManageSchedule) &&
          (gradeTipo === "SEMANAL" || gradeTipo === "DIARIA") ? (
            <label className="block">
              <span className="mb-1 block text-xs font-bold uppercase text-slate-500">
                Turno
              </span>
              <select
                value={turnoOficialSelecionado}
                onChange={(event) =>
                  setTurnoOficialSelecionado(event.target.value as Turno)
                }
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-slate-500"
              >
                {TURNO_OPTIONS.map((turno) => (
                  <option key={turno} value={turno}>
                    {formatTurno(turno)}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {gradeTipo === "DIARIA" ? (
            <label className="block md:col-span-2">
              <span className="mb-1 block text-xs font-bold uppercase text-slate-500">
                Dia
              </span>
              <select
                value={gradeDiaSemana}
                onChange={(event) => setGradeDiaSemana(event.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-slate-500"
              >
                {DIAS_FORM.map((dia) => (
                  <option key={dia.value} value={dia.value}>
                    {dia.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
      </div>

      {loadingContextos ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white/70 p-8 text-center text-sm font-semibold text-slate-500">
          Carregando grade de horários...
        </div>
      ) : (
        <ScheduleGrid
          turmas={selectedGradeTurmas}
          mode={gradeTipo === "DIARIA" ? "daily" : "weekly"}
          professorId={effectiveProfessorId}
          turnFilter={effectiveTurnFilter}
          dayFilter={gradeTipo === "DIARIA" ? gradeDiaSemana : undefined}
          horarioConfigs={horarioConfigs}
          turmaHorarioConfigs={turmaHorarioConfigsDaGrade}
          preferConfiguredSlots={shouldPreferConfiguredSlots}
          title={GRADE_LABELS[gradeTipo]}
          subtitle={gradeSubtitle}
          compact={canManageSchedule}
          emptyMessage={
            gradeTipo === "PROFESSOR"
              ? "Nenhuma aula encontrada para este professor."
              : "Nenhuma aula cadastrada para montar esta grade."
          }
        />
      )}
    </section>
  );
}

