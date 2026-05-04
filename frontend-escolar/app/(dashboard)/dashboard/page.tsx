"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import PageHeader from "@/components/ui/page-header";
import { useAuth } from "@/context/auth-context";
import { apiUrl } from "@/lib/api";
import { formatTurno } from "@/lib/turno";

type School = {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  status?: string;
  plan?: string;
};

type FrequenciaDoDiaResponse = {
  dataReferencia: string;
  ehFimDeSemana: boolean;
  semLancamento: boolean;
  aluno: {
    id: string;
    name: string;
    matricula?: string | null;
  };
  turma: {
    id: string;
    name: string;
    turno?: string | null;
  };
  alunosDisponiveis: Array<{
    id: string;
    name: string;
    matricula?: string | null;
    turmaNome: string;
  }>;
  totalAulas: number;
  totalPresencasDisciplinas: number;
  totalFaltasDisciplinas: number;
  statusConsolidado: "PRESENTE" | "FALTA" | null;
  faltaJustificada: boolean;
  eventoCalendario?: {
    id: string;
    tipo: "DIA_SEM_AULA" | "RECESSO" | "FERIAS";
    abrangencia:
      | "ESCOLA_INTEIRA"
      | "APENAS_TURMA"
      | "ESCOLA_INTEIRA_EXCETO_TURMA";
    motivo: string;
    dataInicio: string;
    dataFim: string;
    turmaId?: string | null;
  } | null;
  disciplinas: Array<{
    id: string;
    disciplina: string;
    status: "PRESENTE" | "FALTA";
    faltaJustificada: boolean;
    observacao?: string | null;
  }>;
};

type FinanceiroResumoResponsavel = {
  enabled: boolean;
  totalAbertos: number;
  valorEmAberto: number;
  cobrancasAbertasIds: string[];
};

type ProfessorTurma = {
  id: string;
  name: string;
  turno?: string | null;
};

type ProfessorAgendaItem = {
  id: string;
  data: string;
  titulo: string;
  descricao?: string | null;
  turma: {
    id: string;
    name: string;
  };
};

type DashboardAlunoAula = {
  id: string;
  diaSemana: string;
  horaInicio: string;
  horaFim: string;
  disciplina: string;
  turmaProfessorId?: string | null;
  turmaProfessor?: {
    disciplina?: string | null;
    professor?: {
      id?: string | null;
      name?: string | null;
    } | null;
  } | null;
};

type DashboardAlunoContexto = {
  contextId?: string;
  id: string;
  name: string;
  turno?: string | null;
  aluno?: {
    id: string;
    name: string;
  } | null;
  aulas: DashboardAlunoAula[];
};

type ConteudoDoDiaItem = {
  id: string;
  data: string;
  conteudo?: string | null;
  objetivo?: string | null;
  metodologia?: string | null;
  atividades?: string | null;
  aula: {
    horaInicio: string;
    horaFim: string;
  };
  turmaProfessor: {
    id: string;
    disciplina: string;
    professor?: {
      name?: string | null;
    } | null;
    turma: {
      name: string;
      turno?: string | null;
    };
  };
};

type DashboardAtividade = {
  id: string;
  titulo: string;
  descricao: string;
  disciplina?: string | null;
  prazo?: string | null;
  turma?: {
    id: string;
    name: string;
  } | null;
};

type DashboardSummary = {
  scope: "global" | "school";
  totalSchools?: number;
  activeSchools?: number;
  trialSchools?: number;
  delinquentSchools?: number;
  totalUsers?: number;
  totalAlunos?: number;
  alunosMatriculados?: number;
  turmasAtivas?: number;
  totalFuncionarios?: number;
  avaliacoesPeriodo?: number;
  avaliacoesOnline?: number;
  mediaGeral?: number | null;
  solicitacoesPendentes?: number;
  cobrancasPendentes?: number;
  valorPendente?: number;
  usuariosOnline?: number;
  financeiroSecretariaEnabled?: boolean;
  gestorAnalytics?: {
    mediaAprovacao: number;
    frequenciaPorTurma: Array<{
      turmaId: string;
      turmaNome: string;
      turno?: string | null;
      totalRegistros: number;
      totalPresencas: number;
      totalFaltas: number;
      percentualPresencas: number;
      percentualFaltas: number;
      alunosComMaisFaltas: Array<{
        id: string;
        name: string;
        faltas: number;
        presenas: number;
      }>;
    }>;
    defasagemPorTurma: Array<{
      turmaId: string;
      turmaNome: string;
      turno?: string | null;
      alunosComNotas: number;
      alunosEmDefasagem: number;
      percentualDefasagem: number;
      alunos: Array<{
        id: string;
        name: string;
        media: number;
      }>;
    }>;
    extremosNotasPorTurma: Array<{
      turmaId: string;
      turmaNome: string;
      turno?: string | null;
      maiorNota: number | null;
      menorNota: number | null;
      quantidadeLancamentos: number;
      alunosMaiorNota: Array<{
        id: string;
        name: string;
        media: number;
      }>;
      alunosAbaixoDaMedia: Array<{
        id: string;
        name: string;
        media: number;
      }>;
    }>;
    financeiroAlunos: {
      totalAlunos: number;
      inadimplentes: number;
      adimplentes: number;
      inadimplentesLista: Array<{
        id: string;
        name: string;
        turmaNome: string;
        turno?: string | null;
      }>;
      adimplentesLista: Array<{
        id: string;
        name: string;
        turmaNome: string;
        turno?: string | null;
      }>;
    };
    financeiroGestorEnabled: boolean;
    financeiroSecretariaEnabled: boolean;
  };
};

function financeiroSeenKey(userId?: string) {
  return `gestclass_financeiro_seen_d?bitos_${userId || "anon"}`;
}

function readSeenFinanceiroIds(userId?: string) {
  if (typeof window === "undefined") return new Set<string>();

  try {
    const parsed = JSON.parse(
      localStorage.getItem(financeiroSeenKey(userId)) || "[]",
    );
    return new Set<string>(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set<string>();
  }
}

function formatarMoeda(value: number) {
  return Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function formatarDataBrasileira(dataISO?: string) {
  if (!dataISO) return "-";
  const [ano, mes, dia] = dataISO.split("-");
  return `${dia}/${mes}/${ano}`;
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function formatarNota(valor?: number | null) {
  if (valor == null || Number.isNaN(Number(valor))) return "-";
  return Number(valor).toFixed(1).replace(".", ",");
}

function formatarTurmaDashboard(turma: { turmaNome: string; turno?: string | null }) {
  return turma.turno
    ? `${turma.turmaNome} - ${formatTurno(turma.turno)}`
    : turma.turmaNome;
}

const MONTHS = [
  "Janeiro",
  "Fevereiro",
  "Marco",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

const DIA_SEMANA_LABELS: Record<string, string> = {
  SEG: "Segunda-feira",
  TER: "Terça-feira",
  QUA: "Quarta-feira",
  QUI: "Quinta-feira",
  SEX: "Sexta-feira",
};

const DIA_SEMANA_POR_DIA: Record<number, string | undefined> = {
  1: "SEG",
  2: "TER",
  3: "QUA",
  4: "QUI",
  5: "SEX",
};

function toDateKey(date: Date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toLocalDateKey(date: Date) {
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 10);
}

function addDays(date: Date, amount: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function normalizarDataAgenda(dataISO?: string | null) {
  if (!dataISO) return "";

  const dataTexto = String(dataISO).trim();
  const dataISOCurta = dataTexto.match(/^(\d{4}-\d{2}-\d{2})/);

  if (dataISOCurta) {
    return dataISOCurta[1];
  }

  const date = new Date(dataTexto);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return toDateKey(date);
}

function formatarDataCurta(dataISO?: string) {
  const dataNormalizada = normalizarDataAgenda(dataISO);

  if (!dataNormalizada) return "-";

  const [ano, mes, dia] = dataNormalizada.split("-");
  return `${dia}/${mes}/${ano}`;
}

function formatarDataSemana(dataISO?: string) {
  const dataNormalizada = normalizarDataAgenda(dataISO);

  if (!dataNormalizada) return "-";

  const [ano, mes, dia] = dataNormalizada.split("-").map(Number);
  const date = new Date(ano, mes - 1, dia);

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return date.toLocaleDateString("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  });
}

function renderNomesAlunos(
  alunos: Array<{
    id: string;
    name: string;
    media?: number;
    turmaNome?: string;
    turno?: string | null;
  }>,
  emptyLabel: string,
) {
  if (!alunos.length) {
    return <p className="text-xs text-slate-500">{emptyLabel}</p>;
  }

  return (
    <div className="space-y-2">
      {alunos.map((aluno) => (
        <div
          key={aluno.id}
          className="rounded-xl bg-white/80 px-3 py-2 text-xs text-slate-700"
        >
          <div className="flex items-center justify-between gap-3">
            <span className="font-medium text-slate-900">{aluno.name}</span>
            {typeof aluno.media === "number" ? (
              <span className="font-semibold text-slate-600">
                {formatarNota(aluno.media)}
              </span>
            ) : null}
          </div>
          {aluno.turmaNome ? (
            <p className="mt-1 text-[11px] text-slate-500">
              {aluno.turno
                ? `${aluno.turmaNome} - ${formatTurno(aluno.turno)}`
                : aluno.turmaNome}
            </p>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function renderAlunosComFaltas(
  alunos: Array<{
    id: string;
    name: string;
    faltas: number;
    presenas: number;
  }>,
  emptyLabel: string,
) {
  if (!alunos.length) {
    return <p className="text-xs text-slate-500">{emptyLabel}</p>;
  }

  return (
    <div className="space-y-2">
      {alunos.map((aluno) => (
        <div
          key={aluno.id}
          className="rounded-xl bg-white/80 px-3 py-2 text-xs text-slate-700"
        >
          <div className="flex items-center justify-between gap-3">
            <span className="font-medium text-slate-900">{aluno.name}</span>
            <span className="font-semibold text-rose-600">
              {aluno.faltas} falta(s)
            </span>
          </div>
          <p className="mt-1 text-[11px] text-slate-500">
            {aluno.presenas} presena(s) registrada(s)
          </p>
        </div>
      ))}
    </div>
  );
}

function DashboardProfessorCalendar() {
  const { token, user } = useAuth();
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth();
  const todayKey = toDateKey(
    new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())),
  );

  const [turmas, setTurmas] = useState<ProfessorTurma[]>([]);
  const [selectedTurmaIds, setSelectedTurmaIds] = useState<string[]>([]);
  const [agendasByTurma, setAgendasByTurma] = useState<Record<string, ProfessorAgendaItem[]>>({});
  const [selectedDate, setSelectedDate] = useState(todayKey);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token || user?.role !== "PROFESSOR") {
      setTurmas([]);
      setSelectedTurmaIds([]);
      setAgendasByTurma({});
      setLoading(false);
      return;
    }

    let ignore = false;

    async function loadProfessorCalendar() {
      try {
        setLoading(true);
        setError("");

        const turmasResponse = await fetch(apiUrl("/professor-agenda/turmas"), {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        const turmasData = await turmasResponse.json();

        if (!turmasResponse.ok) {
          throw new Error(turmasData.message || "Não foi possível carregar as turmas.");
        }

        const turmasList = Array.isArray(turmasData) ? turmasData : [];

        if (ignore) return;

        setTurmas(turmasList);
        setSelectedTurmaIds(turmasList.map((turma) => turma.id));

        const agendaEntries = await Promise.all(
          turmasList.map(async (turma) => {
            const params = new URLSearchParams({
              turmaId: turma.id,
              ano: String(currentYear),
            });
            const response = await fetch(apiUrl(`/professor-agenda?${params.toString()}`), {
              headers: {
                Authorization: `Bearer ${token}`,
              },
            });
            const data = await response.json();

            if (!response.ok) {
              throw new Error(data.message || "Não foi possível carregar a agenda.");
            }

            return [turma.id, Array.isArray(data) ? data : []] as const;
          }),
        );

        if (!ignore) {
          setAgendasByTurma(Object.fromEntries(agendaEntries));
        }
      } catch (loadError) {
        if (!ignore) {
          setError(
            getErrorMessage(loadError, "Não foi possível carregar o calendário do professor."),
          );
          setTurmas([]);
          setSelectedTurmaIds([]);
          setAgendasByTurma({});
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }

    loadProfessorCalendar();

    return () => {
      ignore = true;
    };
  }, [token, user?.role, currentYear]);

  const visibleTurmas = useMemo(
    () => turmas.filter((turma) => selectedTurmaIds.includes(turma.id)),
    [selectedTurmaIds, turmas],
  );

  const monthEvents = useMemo(() => {
    return selectedTurmaIds
      .flatMap((turmaId) => agendasByTurma[turmaId] || [])
      .filter((item) => {
        const date = new Date(item.data);
        return (
          date.getUTCFullYear() === currentYear &&
          date.getUTCMonth() === currentMonth
        );
      })
      .sort((a, b) => {
        const byDate = new Date(a.data).getTime() - new Date(b.data).getTime();
        if (byDate !== 0) return byDate;
        return a.titulo.localeCompare(b.titulo, "pt-BR");
      });
  }, [agendasByTurma, currentMonth, currentYear, selectedTurmaIds]);

  const eventsByDate = useMemo(() => {
    return monthEvents.reduce<Record<string, ProfessorAgendaItem[]>>((acc, item) => {
      const key = toDateKey(new Date(item.data));
      acc[key] = [...(acc[key] || []), item];
      return acc;
    }, {});
  }, [monthEvents]);

  const availableDates = useMemo(() => {
    const uniqueDates = Array.from(new Set(monthEvents.map((item) => toDateKey(new Date(item.data)))));

    if (!uniqueDates.length) {
      return [todayKey];
    }

    return uniqueDates.sort((a, b) => a.localeCompare(b));
  }, [monthEvents, todayKey]);

  const selectedDateEvents = selectedDate ? eventsByDate[selectedDate] || [] : [];
  const totalEventosMes = monthEvents.length;

  useEffect(() => {
    if (!availableDates.includes(selectedDate)) {
      setSelectedDate(availableDates[0] || todayKey);
    }
  }, [availableDates, selectedDate, todayKey]);

  function toggleTurma(turmaId: string) {
    setSelectedTurmaIds((current) => {
      if (current.includes(turmaId)) {
        if (current.length === 1) return current;
        return current.filter((item) => item !== turmaId);
      }

      return [...current, turmaId];
    });
  }

  return (
    <div className="card-base overflow-hidden p-0 xl:col-span-2">
      <div className="border-b border-white/50 bg-[linear-gradient(135deg,rgba(31,41,55,0.96),rgba(37,99,235,0.9),rgba(245,158,11,0.72))] px-6 py-6 text-white">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <span className="inline-flex rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-white/85">
              Agenda do professor
            </span>
            <h3 className="mt-3 font-[var(--font-display)] text-3xl font-semibold tracking-[-0.03em]">
              {MONTHS[currentMonth]} de {currentYear}
            </h3>
            <p className="mt-2 max-w-2xl text-sm text-white/80">
              Visualize os compromissos do mês, destaque dias com registros e filtre rapidamente as turmas em exibição.
            </p>
          </div>
          <Link
            href="/calendario"
            className="inline-flex items-center rounded-2xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/20"
          >
            Abrir agenda completa
          </Link>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3 backdrop-blur-sm">
            <p className="text-xs uppercase tracking-[0.18em] text-white/65">Turmas ativas</p>
            <p className="mt-2 text-2xl font-semibold">{visibleTurmas.length}</p>
          </div>
          <div className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3 backdrop-blur-sm">
            <p className="text-xs uppercase tracking-[0.18em] text-white/65">Eventos no mês</p>
            <p className="mt-2 text-2xl font-semibold">{totalEventosMes}</p>
          </div>
          <div className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3 backdrop-blur-sm">
            <p className="text-xs uppercase tracking-[0.18em] text-white/65">Dia em foco</p>
            <p className="mt-2 text-lg font-semibold">{formatarDataBrasileira(selectedDate)}</p>
          </div>
        </div>
      </div>

      {error ? (
        <div className="mx-6 mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="px-6 py-6">
        <div className="rounded-[1.8rem] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(248,250,252,0.92),rgba(255,255,255,0.98))] p-5 shadow-[0_18px_38px_rgba(15,23,42,0.06)]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-800">Turmas em exibição</p>
              <p className="mt-1 text-sm text-slate-500">
                Selecione uma ou mais turmas para compor o calendário.
              </p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
              {selectedTurmaIds.length} selecionada(s)
            </span>
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            {turmas.length === 0 && !loading ? (
              <span className="text-sm text-slate-500">Nenhuma turma vinculada.</span>
            ) : null}

            {turmas.map((turma) => {
              const active = selectedTurmaIds.includes(turma.id);
              return (
                <button
                  key={turma.id}
                  type="button"
                  onClick={() => toggleTurma(turma.id)}
                  className={`rounded-[1.2rem] border px-4 py-3 text-left text-sm font-semibold transition ${
                    active
                      ? "border-blue-500 bg-[linear-gradient(135deg,#2563eb,#1d4ed8)] text-white shadow-[0_12px_24px_rgba(37,99,235,0.24)]"
                      : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  <span className="block">{turma.name}</span>
                  {turma.turno ? (
                    <span className={`mt-1 block text-xs ${active ? "text-blue-100" : "text-slate-500"}`}>
                      {formatTurno(turma.turno)}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(320px,0.9fr)_minmax(0,1.1fr)]">
          <div className="rounded-[1.8rem] border border-slate-200/80 bg-white p-5 shadow-[0_18px_38px_rgba(15,23,42,0.05)]">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-slate-800">Selecionar data</p>
                <p className="mt-1 max-w-md text-sm leading-7 text-slate-500">
                  Escolha uma data do mês para visualizar os compromissos vinculados às turmas selecionadas.
                </p>
              </div>
              <span className="inline-flex items-center rounded-full bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700">
                {availableDates.length} data(s)
              </span>
            </div>

            <div className="mt-5 rounded-[1.5rem] border border-slate-200 bg-[linear-gradient(180deg,#ffffff,#f8fafc)] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
              <label className="block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Data do mês
              </label>
              <select
                value={selectedDate}
                onChange={(event) => setSelectedDate(event.target.value)}
                className="mt-3 w-full rounded-2xl border border-slate-200 bg-white px-4 py-4 text-base font-semibold text-slate-900 shadow-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
              >
                {availableDates.map((dateKey) => {
                  const totalEventos = eventsByDate[dateKey]?.length || 0;
                  const labelBase = formatarDataBrasileira(dateKey);
                  const hojeLabel = dateKey === todayKey ? " - Hoje" : "";
                  const eventoLabel =
                    totalEventos > 0
                      ? ` - ${totalEventos} evento(s)`
                      : " - Sem eventos";

                  return (
                    <option key={dateKey} value={dateKey}>
                      {`${labelBase}${hojeLabel}${eventoLabel}`}
                    </option>
                  );
                })}
              </select>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Data escolhida
                </p>
                <p className="mt-2 text-lg font-semibold text-slate-900">
                  {formatarDataBrasileira(selectedDate)}
                </p>
              </div>

              <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Eventos encontrados
                </p>
                <p className="mt-2 text-lg font-semibold text-slate-900">
                  {selectedDateEvents.length}
                </p>
              </div>
            </div>

            <div className="mt-5 rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 px-4 py-4 text-sm leading-7 text-slate-500">
              {totalEventosMes
                ? "Use o seletor para alternar rapidamente entre as datas com compromissos cadastrados neste mês."
                : "Ainda não há compromissos cadastrados para as turmas selecionadas neste mês."}
            </div>
          </div>

          <div className="overflow-hidden rounded-[1.8rem] border border-slate-200/80 bg-[linear-gradient(180deg,#f8fafc,#eef2ff)] shadow-[0_18px_38px_rgba(15,23,42,0.05)]">
            <div className="border-b border-white/70 px-5 py-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h4 className="text-lg font-semibold text-slate-900">Dia selecionado</h4>
                  <p className="mt-1 text-sm text-slate-500">
                    {formatarDataBrasileira(selectedDate)}
                  </p>
                </div>
                <span className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-sm">
                  {selectedDateEvents.length} evento(s)
                </span>
              </div>

              <div className="mt-4 rounded-2xl border border-white/70 bg-white/70 px-4 py-3 text-xs text-slate-500">
                {visibleTurmas.length
                  ? `${visibleTurmas.length} turma(s) compondo esta visualização.`
                  : "Selecione ao menos uma turma para visualizar os agendamentos."}
              </div>
            </div>

            <div className="p-5">
              <div className="space-y-3">
                {loading ? (
                  <div className="rounded-2xl bg-white px-4 py-4 text-sm text-slate-500 shadow-sm">
                    Carregando calendario...
                  </div>
                ) : selectedDateEvents.length ? (
                  selectedDateEvents.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-[1.4rem] border border-white/80 bg-white p-4 shadow-[0_10px_24px_rgba(15,23,42,0.05)]"
                    >
                      <div className="flex items-start gap-3">
                        <span className="mt-1 h-3 w-3 rounded-full bg-[linear-gradient(135deg,#2563eb,#f59e0b)] shadow-sm" />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <p className="text-base font-semibold text-slate-900">{item.titulo}</p>
                            <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                              {item.turma.name}
                            </span>
                          </div>
                          <p className="mt-3 text-sm leading-6 text-slate-600">
                            {item.descricao || "Sem descricao adicional."}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-[1.5rem] border border-dashed border-slate-200 bg-white px-5 py-8 text-center text-sm text-slate-500">
                    Nenhum agendamento para as turmas selecionadas neste dia.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

type CalendarioTipo = NonNullable<
  FrequenciaDoDiaResponse["eventoCalendario"]
>["tipo"];

function traduzirTipoCalendario(tipo: CalendarioTipo) {
  const labels: Record<CalendarioTipo, string> = {
    DIA_SEM_AULA: "Dia sem aula",
    RECESSO: "Recesso escolar",
    FERIAS: "Férias escolares",
  };

  return labels[tipo];
}

function DashboardAlunoResponsavel() {
  const { token, user, selectedSchool } = useAuth();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [frequenciaDia, setFrequenciaDia] = useState<FrequenciaDoDiaResponse | null>(null);
  const [alunoSelecionado, setAlunoSelecionado] = useState("");
  const [contextosAluno, setContextosAluno] = useState<DashboardAlunoContexto[]>([]);
  const [conteudosDoDia, setConteudosDoDia] = useState<ConteudoDoDiaItem[]>([]);
  const [agendamentosSemana, setAgendamentosSemana] = useState<ProfessorAgendaItem[]>([]);
  const [atividadesTurma, setAtividadesTurma] = useState<DashboardAtividade[]>([]);
  const [loadingPainelAcademico, setLoadingPainelAcademico] = useState(true);
  const [painelError, setPainelError] = useState("");
  const [financeiroResumo, setFinanceiroResumo] =
    useState<FinanceiroResumoResponsavel | null>(null);
  const [financeiroNovosDebitos, setFinanceiroNovosDebitos] = useState(0);

  const isResponsavel = user?.role === "RESPONSAVEL";
  const alunoAtivoId =
    isResponsavel
      ? alunoSelecionado || frequenciaDia?.alunosDisponiveis?.[0]?.id || ""
      : "";

  function authHeaders() {
    return {
      Authorization: `Bearer ${token}`,
      ...(selectedSchool?.id ? { "x-school-id": selectedSchool.id } : {}),
    };
  }

  async function fetchFrequenciaDoDia() {
    if (!token || (user?.role !== "ALUNO" && user?.role !== "RESPONSAVEL")) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError("");

      const params = new URLSearchParams();
      if (isResponsavel && alunoSelecionado) {
        params.set("alunoId", alunoSelecionado);
      }

      const url = apiUrl(`/frequencia/frequencia-do-dia${
        params.toString() ? `?${params.toString()}` : ""
      }`);

      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Erro ao carregar frequência do dia.");
      }

      setFrequenciaDia(data);

      if (isResponsavel && !alunoSelecionado && data.alunosDisponiveis?.length) {
        setAlunoSelecionado(data.alunosDisponiveis[0].id);
      }
    } catch (error) {
      console.error("Erro ao carregar frequência do dia:", error);
      setError(getErrorMessage(error, "Não foi possível carregar a frequência do dia."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchFrequenciaDoDia();
  }, [token, user?.role, alunoSelecionado]);

  useEffect(() => {
    if (!token || (user?.role !== "ALUNO" && user?.role !== "RESPONSAVEL")) {
      setContextosAluno([]);
      setConteudosDoDia([]);
      setAgendamentosSemana([]);
      setAtividadesTurma([]);
      setLoadingPainelAcademico(false);
      return;
    }

    if (isResponsavel && !alunoAtivoId) {
      setContextosAluno([]);
      setConteudosDoDia([]);
      setAgendamentosSemana([]);
      setAtividadesTurma([]);
      setLoadingPainelAcademico(false);
      return;
    }

    let ignore = false;

    async function fetchPainelAcademico() {
      try {
        setLoadingPainelAcademico(true);
        setPainelError("");

        const hoje = new Date();
        const hojeKey = toLocalDateKey(hoje);
        const anoAtual = String(hoje.getFullYear());
        const conteudoParams = new URLSearchParams({ data: hojeKey });

        if (isResponsavel && alunoAtivoId) {
          conteudoParams.set("alunoId", alunoAtivoId);
        }

        const [contextosResponse, conteudosResponse] = await Promise.all([
          fetch(apiUrl("/aulas/contextos"), {
            headers: authHeaders(),
          }),
          fetch(
            apiUrl(`/conteudo-do-dia/meus-conteudos?${conteudoParams.toString()}`),
            {
              headers: authHeaders(),
            },
          ),
        ]);

        const contextosData = await contextosResponse.json();
        const conteudosData = await conteudosResponse.json();

        if (!contextosResponse.ok) {
          throw new Error(contextosData.message || "Erro ao carregar aulas do dia.");
        }

        if (!conteudosResponse.ok) {
          throw new Error(conteudosData.message || "Erro ao carregar conteúdos do dia.");
        }

        const contextos = Array.isArray(contextosData)
          ? (contextosData as DashboardAlunoContexto[])
          : [];
        const conteudos = Array.isArray(conteudosData)
          ? (conteudosData as ConteudoDoDiaItem[])
          : [];
        const contextoAtivo =
          user?.role === "RESPONSAVEL"
            ? contextos.find((item) => item.aluno?.id === alunoAtivoId) || null
            : contextos[0] || null;

        let agendaDaSemana: ProfessorAgendaItem[] = [];
        let atividadesDaTurma: DashboardAtividade[] = [];

        if (contextoAtivo?.id) {
          const atividadeParams = new URLSearchParams({ turmaId: contextoAtivo.id });
          const agendaParams = new URLSearchParams({
            turmaId: contextoAtivo.id,
            ano: anoAtual,
          });

          const [agendaResponse, atividadesResponse] = await Promise.all([
            fetch(apiUrl(`/professor-agenda?${agendaParams.toString()}`), {
              headers: authHeaders(),
            }),
            fetch(apiUrl(`/forum/atividades?${atividadeParams.toString()}`), {
              headers: authHeaders(),
            }),
          ]);

          const agendaData = await agendaResponse.json();
          const atividadesData = await atividadesResponse.json();

          if (!agendaResponse.ok) {
            throw new Error(agendaData.message || "Erro ao carregar agendamentos.");
          }

          if (!atividadesResponse.ok) {
            throw new Error(atividadesData.message || "Erro ao carregar atividades.");
          }

          const inicioSemana = hojeKey;
          const fimSemana = toLocalDateKey(addDays(hoje, 6));

          agendaDaSemana = (Array.isArray(agendaData) ? agendaData : [])
            .map((item) => ({
              ...item,
              data: normalizarDataAgenda(item?.data),
            }))
            .filter((item) => item.data && item.data >= inicioSemana && item.data <= fimSemana)
            .sort((a, b) => a.data.localeCompare(b.data));

          atividadesDaTurma = (Array.isArray(atividadesData) ? atividadesData : []).sort(
            (a, b) => {
              const prazoA = a?.prazo || "9999-12-31";
              const prazoB = b?.prazo || "9999-12-31";
              return prazoA.localeCompare(prazoB);
            },
          );
        }

        if (ignore) return;

        setContextosAluno(contextos);
        setConteudosDoDia(conteudos);
        setAgendamentosSemana(agendaDaSemana);
        setAtividadesTurma(atividadesDaTurma);
      } catch (painelError) {
        if (ignore) return;
        console.error("Erro ao carregar painel acadêmico:", painelError);
        setContextosAluno([]);
        setConteudosDoDia([]);
        setAgendamentosSemana([]);
        setAtividadesTurma([]);
        setPainelError(
          getErrorMessage(
            painelError,
            "Não foi possível carregar aulas, conteúdos e agendamentos.",
          ),
        );
      } finally {
        if (!ignore) {
          setLoadingPainelAcademico(false);
        }
      }
    }

    fetchPainelAcademico();

    return () => {
      ignore = true;
    };
  }, [token, user?.role, selectedSchool?.id, isResponsavel, alunoAtivoId]);

  useEffect(() => {
    if (
      !token ||
      user?.role !== "RESPONSAVEL" ||
      (user.plan && user.plan !== "PRO" && user.plan !== "PREMIUM")
    ) {
      setFinanceiroResumo(null);
      setFinanceiroNovosDebitos(0);
      return;
    }

    const responsavelId = user.id;
    const ignore = false;

    async function fetchResumoFinanceiro() {
      try {
        const response = await fetch(apiUrl("/financeiro/resumo-respons?vel"), {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        const data = (await response.json()) as FinanceiroResumoResponsavel;

        if (!response.ok || ignore || !data.enabled) {
          if (!ignore) {
            setFinanceiroResumo(null);
            setFinanceiroNovosDebitos(0);
          }
          return;
        }

        const ids = Array.isArray(data.cobrancasAbertasIds)
          ? data.cobrancasAbertasIds
          : [];
        const seen = readSeenFinanceiroIds(responsavelId);

        setFinanceiroResumo(data);
        setFinanceiroNovosDebitos(ids.filter((id) => !seen.has(id)).length);
      } catch {
        if (!ignore) {
          setFinanceiroResumo(null);
          setFinanceiroNovosDebitos(0);
        }
      }
    }

    fetchResumoFinanceiro();
  }, [token, user?.id, user?.role, user?.plan]);

  const cardFrequencia = useMemo(() => {
    if (!frequenciaDia) {
      return {
        containerClass: "bg-white border border-slate-200 text-slate-900",
        title: "Frequência do dia",
        message: "Nenhuma informação disponível.",
        detail: "",
      };
    }

    if (frequenciaDia.eventoCalendario) {
      return {
        containerClass: "bg-amber-50 border border-amber-200 text-amber-900",
        title: "Calendário escolar",
        message: traduzirTipoCalendario(frequenciaDia.eventoCalendario.tipo),
        detail: frequenciaDia.eventoCalendario.motivo,
      };
    }

    if (frequenciaDia.ehFimDeSemana) {
      return {
        containerClass: "bg-slate-50 border border-slate-200 text-slate-900",
        title: "Frequência do dia",
        message: "Hoje é fim de semana.",
        detail: "Nenhuma marcação é exibida em sábados e domingos.",
      };
    }

    if (frequenciaDia.semLancamento) {
      return {
        containerClass: "bg-white border border-slate-200 text-slate-900",
        title: "Frequência do dia",
        message: "Aguardando lançamento da frequência.",
        detail: "Ainda não há registro das aulas de hoje.",
      };
    }

    if (frequenciaDia.statusConsolidado === "FALTA" && frequenciaDia.faltaJustificada) {
      return {
        containerClass: "bg-emerald-50 border border-emerald-200 text-emerald-900",
        title: "Frequência do dia",
        message: "Falta justificada registrada.",
        detail: "A ausência do dia foi marcada e justificada.",
      };
    }

    if (frequenciaDia.statusConsolidado === "FALTA") {
      return {
        containerClass: "bg-red-50 border border-red-200 text-red-900",
        title: "Frequência do dia",
        message: "O aluno faltou hoje.",
        detail: "A falta do dia já aparece no sistema.",
      };
    }

    return {
      containerClass: "bg-blue-50 border border-blue-200 text-blue-900",
      title: "Frequência do dia",
      message: "Presença registrada hoje.",
      detail: "O aluno está frequente neste dia letivo.",
    };
  }, [frequenciaDia]);

  const contextoAtivo = useMemo(() => {
    if (user?.role === "RESPONSAVEL") {
      return contextosAluno.find((item) => item.aluno?.id === alunoAtivoId) || null;
    }

    return contextosAluno[0] || null;
  }, [contextosAluno, user?.role, alunoAtivoId]);

  const aulasDoDia = useMemo(() => {
    const diaSemana = DIA_SEMANA_POR_DIA[new Date().getDay()];

    if (!contextoAtivo || !diaSemana) return [];

    return (contextoAtivo.aulas || [])
      .filter((aula) => aula.diaSemana === diaSemana)
      .sort((a, b) => a.horaInicio.localeCompare(b.horaInicio));
  }, [contextoAtivo]);

  return (
    <section className="space-y-6">
      <PageHeader
        title="Dashboard"
        description="Resumo do dia letivo, frequência e situação atual do aluno."
      />

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {painelError ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {painelError}
        </div>
      ) : null}

      {isResponsavel ? (
        <div className="card-base p-5">
          <label className="text-sm font-medium text-slate-700">Aluno</label>
          <select
            value={alunoSelecionado}
            onChange={(e) => setAlunoSelecionado(e.target.value)}
            className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2"
          >
            <option value="">Selecione</option>
            {(frequenciaDia?.alunosDisponiveis || []).map((aluno) => (
              <option key={aluno.id} value={aluno.id}>
                {aluno.name} - {aluno.turmaNome}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className={`rounded-2xl p-5 ${cardFrequencia.containerClass}`}>
          <p className="text-sm opacity-80">{cardFrequencia.title}</p>
          <h3 className="mt-2 text-2xl font-bold">{cardFrequencia.message}</h3>
          <p className="mt-2 text-sm opacity-80">{cardFrequencia.detail}</p>
        </div>

        {isResponsavel && financeiroResumo && financeiroNovosDebitos > 0 ? (
          <Link
            href="/financeiro"
            className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-900 transition hover:bg-red-100"
          >
            <p className="text-sm font-medium text-red-700">Financeiro</p>
            <h3 className="mt-2 text-2xl font-bold">
              Novos debitos disponiveis!
            </h3>
            <p className="mt-2 text-sm text-red-700">
              {financeiroNovosDebitos} novo(s) debito(s) em aberto. Total em aberto:
              {" "}
              {formatarMoeda(financeiroResumo.valorEmAberto)}.
            </p>
          </Link>
        ) : null}

        <div className="card-base p-5">
          <p className="text-sm text-slate-500">Aluno</p>
          <h3 className="mt-2 text-2xl font-bold text-slate-900">
            {loading ? "Carregando..." : frequenciaDia?.aluno?.name || "-"}
          </h3>
          <p className="mt-2 text-sm text-slate-500">
            Matrícula: {frequenciaDia?.aluno?.matricula || "Não informada"}
          </p>
        </div>

        <div className="card-base p-5">
          <p className="text-sm text-slate-500">Turma</p>
          <h3 className="mt-2 text-2xl font-bold text-slate-900">
            {loading ? "Carregando..." : frequenciaDia?.turma?.name || "-"}
          </h3>
          <p className="mt-2 text-sm text-slate-500">
            {formatTurno(frequenciaDia?.turma?.turno)}
          </p>
        </div>

        <div className="card-base p-5">
          <p className="text-sm text-slate-500">Data</p>
          <h3 className="mt-2 text-2xl font-bold text-slate-900">
            {loading
              ? "Carregando..."
              : formatarDataBrasileira(frequenciaDia?.dataReferencia)}
          </h3>
          <p className="mt-2 text-sm text-slate-500">
            {frequenciaDia?.ehFimDeSemana
              ? "Fim de semana"
              : frequenciaDia?.semLancamento
                ? "Sem lançamento"
                : `${frequenciaDia?.totalAulas || 0} aula(s) no dia`}
          </p>
        </div>
      </div>

      {!loading &&
      frequenciaDia &&
      !frequenciaDia.ehFimDeSemana &&
      !frequenciaDia.eventoCalendario ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <div className="card-base p-6">
            <h3 className="text-lg font-bold text-slate-900">
              Resumo da frequência do dia
            </h3>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Presenças em disciplinas
                </p>
                <p className="mt-2 text-2xl font-bold text-blue-700">
                  {frequenciaDia.totalPresencasDisciplinas}
                </p>
              </div>

              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Faltas em disciplinas
                </p>
                <p className="mt-2 text-2xl font-bold text-red-700">
                  {frequenciaDia.totalFaltasDisciplinas}
                </p>
              </div>
            </div>
          </div>

          <div className="card-base p-6">
            <h3 className="text-lg font-bold text-slate-900">
              Disciplinas do dia
            </h3>

            <div className="mt-5 space-y-3">
              {frequenciaDia.disciplinas.length === 0 ? (
                <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
                  Ainda não há disciplinas lançadas para hoje.
                </div>
              ) : (
                frequenciaDia.disciplinas.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-xl bg-slate-50 p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-slate-900">
                        {item.disciplina}
                      </p>

                      <span
                        className={`rounded-full px-3 py-1 text-xs font-medium ${
                          item.status === "FALTA" && item.faltaJustificada
                            ? "bg-emerald-50 text-emerald-700"
                            : item.status === "FALTA"
                              ? "bg-red-50 text-red-700"
                              : "bg-blue-50 text-blue-700"
                        }`}
                      >
                        {item.status === "FALTA"
                          ? item.faltaJustificada
                            ? "Falta justificada"
                            : "Falta"
                          : "Presença"}
                      </span>
                    </div>

                    <p className="mt-2 text-sm text-slate-500">
                      {item.observacao || "Sem observação"}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="card-base p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-lg font-bold text-slate-900">Aulas do dia</h3>
              <p className="mt-1 text-sm text-slate-500">
                {DIA_SEMANA_LABELS[DIA_SEMANA_POR_DIA[new Date().getDay()] || ""] ||
                  "Sem aulas regulares hoje"}
              </p>
            </div>
            {contextoAtivo ? (
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                {contextoAtivo.name}
              </span>
            ) : null}
          </div>

          <div className="mt-5 space-y-3">
            {loadingPainelAcademico ? (
              <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
                Carregando aulas do dia...
              </div>
            ) : aulasDoDia.length === 0 ? (
              <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
                Nenhuma aula prevista para hoje.
              </div>
            ) : (
              aulasDoDia.map((aula) => (
                <div key={aula.id} className="rounded-xl bg-slate-50 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-slate-900">
                      {aula.turmaProfessor?.disciplina || aula.disciplina || "Aula"}
                    </p>
                    <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-700">
                      {aula.horaInicio} - {aula.horaFim}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-slate-500">
                    {aula.turmaProfessorId
                      ? aula.turmaProfessor?.professor?.name || "Professor não informado"
                      : "Intervalo ou aula avulsa"}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="card-base p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-lg font-bold text-slate-900">Conteúdos do dia</h3>
              <p className="mt-1 text-sm text-slate-500">
                Planejamento lançado para a data de hoje
              </p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
              {formatarDataCurta(toLocalDateKey(new Date()))}
            </span>
          </div>

          <div className="mt-5 space-y-3">
            {loadingPainelAcademico ? (
              <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
                Carregando conteúdos do dia...
              </div>
            ) : conteudosDoDia.length === 0 ? (
              <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
                Nenhum conteúdo foi lançado para hoje.
              </div>
            ) : (
              conteudosDoDia.map((item) => (
                <div key={item.id} className="rounded-xl bg-slate-50 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-slate-900">
                      {item.turmaProfessor.disciplina}
                    </p>
                    <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700">
                      {item.aula.horaInicio} - {item.aula.horaFim}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-slate-700">
                    {item.conteudo || item.atividades || item.objetivo || "Sem detalhes informados."}
                  </p>
                  <p className="mt-2 text-xs text-slate-500">
                    {item.turmaProfessor.professor?.name || "Professor não informado"}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="card-base p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-lg font-bold text-slate-900">
                Agendamentos da semana
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                Próximos 7 dias da turma atual
              </p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
              7 dias
            </span>
          </div>

          <div className="mt-5 space-y-3">
            {loadingPainelAcademico ? (
              <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
                Carregando agendamentos...
              </div>
            ) : agendamentosSemana.length === 0 ? (
              <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
                Nenhum agendamento cadastrado para esta semana.
              </div>
            ) : (
              agendamentosSemana.map((item) => (
                <div key={item.id} className="rounded-xl bg-slate-50 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-slate-900">{item.titulo}</p>
                    <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-700">
                      {formatarDataSemana(item.data)}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-slate-500">
                    {item.descricao || "Sem detalhes adicionais."}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="card-base p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-lg font-bold text-slate-900">Atividades da turma</h3>
              <p className="mt-1 text-sm text-slate-500">
                Atividades publicadas para o aluno atual
              </p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
              {atividadesTurma.length}
            </span>
          </div>

          <div className="mt-5 space-y-3">
            {loadingPainelAcademico ? (
              <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
                Carregando atividades...
              </div>
            ) : atividadesTurma.length === 0 ? (
              <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
                Nenhuma atividade publicada no momento.
              </div>
            ) : (
              atividadesTurma.slice(0, 6).map((atividade) => (
                <div key={atividade.id} className="rounded-xl bg-slate-50 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-slate-900">
                      {atividade.titulo}
                    </p>
                    <span className="rounded-full bg-violet-100 px-3 py-1 text-xs font-medium text-violet-700">
                      {atividade.prazo
                        ? `Prazo: ${formatarDataCurta(atividade.prazo.slice(0, 10))}`
                        : "Sem prazo"}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-slate-500">
                    {atividade.disciplina || "Geral"}
                  </p>
                  <p className="mt-2 text-sm text-slate-700">{atividade.descricao}</p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

export default function DashboardPage() {
  const { token, user, selectedSchool } = useAuth();

  const [school, setSchool] = useState<School | null>(null);
  const [loadingSchool, setLoadingSchool] = useState(true);
  const [schoolError, setSchoolError] = useState("");
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [summaryError, setSummaryError] = useState("");

  async function fetchSchool() {
    if (!token || user?.role !== "ADMIN_ESCOLA") {
      setLoadingSchool(false);
      return;
    }

    try {
      setLoadingSchool(true);
      setSchoolError("");

      const response = await fetch(apiUrl("/schools"), {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Erro ao carregar escola");
      }

      const schoolData = Array.isArray(data) ? data[0] : data;
      setSchool(schoolData || null);
    } catch (error) {
      console.error("Erro ao carregar escola:", error);
      setSchoolError(getErrorMessage(error, "Não foi possível carregar a escola."));
    } finally {
      setLoadingSchool(false);
    }
  }

  useEffect(() => {
    fetchSchool();
  }, [token, user?.role]);

  useEffect(() => {
    if (
      !token ||
      !user ||
      ![
        "ADMIN_ESCOLA",
        "GESTOR",
        "SECRETARIA",
        "FINANCEIRO",
        "COORDENADOR",
        "AUXILIAR",
        "PROFESSOR",
      ].includes(user.role)
    ) {
      setLoadingSummary(false);
      setSummary(null);
      return;
    }

    let ignore = false;

    async function fetchSummary() {
      try {
        setLoadingSummary(true);
        setSummaryError("");

        const response = await fetch(apiUrl("/schools/dashboard-summary"), {
          headers: {
            Authorization: `Bearer ${token}`,
            ...(selectedSchool?.id ? { "x-school-id": selectedSchool.id } : {}),
          },
        });
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || "Erro ao carregar resumo do dashboard.");
        }

        if (!ignore) {
          setSummary(data);
        }
      } catch (error) {
        if (!ignore) {
          setSummaryError(
            getErrorMessage(error, "Não foi possível carregar os dados reais do painel."),
          );
          setSummary(null);
        }
      } finally {
        if (!ignore) {
          setLoadingSummary(false);
        }
      }
    }

    fetchSummary();

    return () => {
      ignore = true;
    };
  }, [token, user, selectedSchool?.id]);

  const isAdminEscola = user?.role === "ADMIN_ESCOLA";
  const isAlunoOuResponsavel =
    user?.role === "ALUNO" || user?.role === "RESPONSAVEL";
  const showOnlineCard =
    user?.role === "ADMIN_ESCOLA" ||
    user?.role === "GESTOR" ||
    user?.role === "SECRETARIA" ||
    user?.role === "PROFESSOR";

  if (isAlunoOuResponsavel) {
    return <DashboardAlunoResponsavel />;
  }

  return (
    <section className="space-y-6">
      <PageHeader
        title={isAdminEscola ? "Minha Escola" : "Dashboard"}
        description={
          isAdminEscola
            ? "Gerencie a base da sua escola: identidade, turmas, alunos, usuários, professores e horários."
            : "Visão geral da plataforma escolar, desempenho acadêmico e operação administrativa."
        }
      />

      {isAdminEscola ? (
        <>
          {schoolError ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {schoolError}
            </div>
          ) : null}

          <div className="card-base p-6">
            {loadingSchool ? (
              <p className="text-sm text-slate-500">Carregando dados da escola...</p>
            ) : !school ? (
              <p className="text-sm text-slate-500">
                Nenhuma escola vinculada foi encontrada para este administrador.
              </p>
            ) : (
              <div className="space-y-4">
                <div>
                  <h2 className="text-2xl font-bold text-slate-900">
                    {school.name}
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Esta é a base principal da sua gestão escolar.
                  </p>
                </div>

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      E-mail
                    </p>
                    <p className="mt-2 text-sm font-semibold text-slate-900">
                      {school.email || "Não informado"}
                    </p>
                  </div>

                  <div className="rounded-2xl bg-slate-50 p-4">
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      Telefone
                    </p>
                    <p className="mt-2 text-sm font-semibold text-slate-900">
                      {school.phone || "Não informado"}
                    </p>
                  </div>

                  <div className="rounded-2xl bg-slate-50 p-4">
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      Status
                    </p>
                    <p className="mt-2 text-sm font-semibold text-slate-900">
                      {school.status || "Não definido"}
                    </p>
                  </div>

                  <div className="rounded-2xl bg-slate-50 p-4">
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      Plano
                    </p>
                    <p className="mt-2 text-sm font-semibold text-slate-900">
                      {school.plan || "Não definido"}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {summaryError ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {summaryError}
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
            <div className="card-base p-5">
              <p className="text-sm text-slate-500">Alunos matriculados</p>
              <h3 className="mt-2 text-3xl font-bold text-slate-900">
                {loadingSummary ? "..." : summary?.alunosMatriculados || 0}
              </h3>
              <p className="mt-2 text-sm text-slate-500">Total real cadastrado</p>
            </div>

            <div className="card-base p-5">
              <p className="text-sm text-slate-500">Turmas ativas</p>
              <h3 className="mt-2 text-3xl font-bold text-slate-900">
                {loadingSummary ? "..." : summary?.turmasAtivas || 0}
              </h3>
              <p className="mt-2 text-sm text-slate-500">Turmas cadastradas</p>
            </div>

            <div className="card-base p-5">
              <p className="text-sm text-slate-500">Total de funcionários</p>
              <h3 className="mt-2 text-3xl font-bold text-slate-900">
                {loadingSummary ? "..." : summary?.totalFuncionarios || 0}
              </h3>
              <p className="mt-2 text-sm text-slate-500">
                Admin, gestão, secretaria e professores
              </p>
            </div>

            <div className="card-base p-5">
              <p className="text-sm text-slate-500">Cobranças pendentes</p>
              <h3 className="mt-2 text-3xl font-bold text-slate-900">
                {loadingSummary ? "..." : summary?.cobrancasPendentes || 0}
              </h3>
              <p className="mt-2 text-sm text-blue-600">
                {loadingSummary ? "" : formatarMoeda(summary?.valorPendente || 0)}
              </p>
            </div>

            {showOnlineCard ? (
              <div className="card-base p-5">
                <p className="text-sm text-slate-500">Online agora</p>
                <h3 className="mt-2 text-3xl font-bold text-emerald-700">
                  {loadingSummary ? "..." : summary?.usuariosOnline || 0}
                </h3>
                <p className="mt-2 text-sm text-slate-500">
                  Usuários ativos nos últimos 5 minutos
                </p>
              </div>
            ) : null}
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-6">
            <DashboardShortcutCard
              title="Configurar escola"
              description="Nome, identidade visual, logo e cores."
              href="/escolas"
            />
            <DashboardShortcutCard
              title="Turmas"
              description="Criar e organizar séries e turmas."
              href="/turmas"
            />
            <DashboardShortcutCard
              title="Professores e Disciplinas"
              description="Vincular professores, disciplinas e turmas."
              href="/cadastro-turma"
            />
            <DashboardShortcutCard
              title="Alunos"
              description="Cadastrar alunos e responsáveis."
              href="/alunos"
            />
            <DashboardShortcutCard
              title="Usuários"
              description="Gerenciar gestores, professores e demais perfis."
              href="/usuarios"
            />
            <DashboardShortcutCard
              title="Horários"
              description="Organizar a grade e distribuição das aulas."
              href="/horarios"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <div className="card-base p-6">
              <h3 className="text-lg font-bold text-slate-900">
                Ordem correta de implantação
              </h3>

              <div className="mt-5 space-y-3">
                {[
                  "1. Configurar identidade da escola",
                  "2. Criar séries e turmas",
                  "3. Inserir alunos por turma",
                  "4. Vincular responsáveis",
                  "5. Cadastrar professores e disciplinas",
                  "6. Organizar horários e calendário",
                ].map((item) => (
                  <div
                    key={item}
                    className="rounded-xl bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700"
                  >
                    {item}
                  </div>
                ))}
              </div>
            </div>

            <div className="card-base p-6">
              <h3 className="text-lg font-bold text-slate-900">
                Próximo foco do projeto
              </h3>

              <div className="mt-5 space-y-3">
                <div className="rounded-xl bg-slate-50 p-4">
                  <p className="text-sm font-semibold text-slate-900">
                    Identidade visual da escola
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    Vamos preparar nome, logo e paleta de cores como base do painel.
                  </p>
                </div>

                <div className="rounded-xl bg-slate-50 p-4">
                  <p className="text-sm font-semibold text-slate-900">
                    Estrutura acadêmica organizada
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    Depois vamos construir séries, turmas, alunos, responsáveis e professores.
                  </p>
                </div>

                <div className="rounded-xl bg-slate-50 p-4">
                  <p className="text-sm font-semibold text-slate-900">
                    Calendário automático da escola
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    O calendário vai nascer junto com a escola e poderá ser ajustado depois.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </>
      ) : (
        <>
          {summaryError ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {summaryError}
            </div>
          ) : null}

          {user?.role === "PROFESSOR" ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
            {showOnlineCard ? (
              <div className="card-base p-5">
                <p className="text-sm text-slate-500">Online agora</p>
                <h3 className="mt-2 text-3xl font-bold text-emerald-700">
                  {loadingSummary ? "..." : summary?.usuariosOnline || 0}
                </h3>
                <p className="mt-2 text-sm text-slate-500">
                  Usuários ativos nos últimos 5 minutos
                </p>
              </div>
            ) : null}
            <DashboardShortcutCard
              title="Frequência"
              description="Lançar e acompanhar presença das suas turmas."
              href="/frequencia"
            />
            <DashboardShortcutCard
              title="Avaliações"
              description="Criar provas e atividades avaliativas."
              href="/avaliacoes"
            />
            <DashboardShortcutCard
              title="Notas"
              description="Registrar notas dos alunos por avaliação."
              href="/notas-professor"
            />
            <DashboardShortcutCard
              title="Comunicação"
              description="Abrir rede social, chat e recados da turma."
              href="/feed"
            />
          </div>
          ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
            <div className="card-base p-5">
              <p className="text-sm text-slate-500">Alunos matriculados</p>
              <h3 className="mt-2 text-3xl font-bold text-slate-900">
                {loadingSummary ? "..." : summary?.alunosMatriculados || 0}
              </h3>
              <p className="mt-2 text-sm text-slate-500">Total real cadastrado</p>
            </div>

            <div className="card-base p-5">
              <p className="text-sm text-slate-500">Turmas ativas</p>
              <h3 className="mt-2 text-3xl font-bold text-slate-900">
                {loadingSummary ? "..." : summary?.turmasAtivas || 0}
              </h3>
              <p className="mt-2 text-sm text-slate-500">
                Turmas cadastradas
              </p>
            </div>

            {showOnlineCard ? (
              <div className="card-base p-5">
                <p className="text-sm text-slate-500">Online agora</p>
                <h3 className="mt-2 text-3xl font-bold text-emerald-700">
                  {loadingSummary ? "..." : summary?.usuariosOnline || 0}
                </h3>
                <p className="mt-2 text-sm text-slate-500">
                  Usuários ativos nos últimos 5 minutos
                </p>
              </div>
            ) : null}

            {user?.role === "SECRETARIA" ? (
              <>
                <div className="card-base p-5">
                  <p className="text-sm text-slate-500">Total de funcionários</p>
                  <h3 className="mt-2 text-3xl font-bold text-slate-900">
                    {loadingSummary ? "..." : summary?.totalFuncionarios || 0}
                  </h3>
                  <p className="mt-2 text-sm text-slate-500">
                    Equipe vinculada à escola
                  </p>
                </div>

                {summary?.financeiroSecretariaEnabled !== false ? (
                  <div className="card-base p-5">
                    <p className="text-sm text-slate-500">Cobranças pendentes</p>
                    <h3 className="mt-2 text-3xl font-bold text-slate-900">
                      {loadingSummary ? "..." : summary?.cobrancasPendentes || 0}
                    </h3>
                    <p className="mt-2 text-sm text-blue-600">
                      {loadingSummary ? "" : formatarMoeda(summary?.valorPendente || 0)}
                    </p>
                  </div>
                ) : (
                  <Link
                    href="/alunos"
                    className="card-base block p-5 transition hover:-translate-y-0.5 hover:shadow-lg"
                  >
                    <p className="text-sm text-slate-500">Acesso aos alunos</p>
                    <h3 className="mt-2 text-3xl font-bold text-slate-900">
                      {loadingSummary ? "..." : summary?.alunosMatriculados || 0}
                    </h3>
                    <p className="mt-2 text-sm text-blue-600">
                      Consulte cadastros, turmas e acompanhamento escolar
                    </p>
                  </Link>
                )}
              </>
            ) : (
              <>
                <div className="card-base p-5">
                  <p className="text-sm text-slate-500">Avaliações no período</p>
                  <h3 className="mt-2 text-3xl font-bold text-slate-900">
                    {loadingSummary ? "..." : summary?.avaliacoesPeriodo || 0}
                  </h3>
                  <p className="mt-2 text-sm text-violet-600">
                    {loadingSummary ? "" : `${summary?.avaliacoesOnline || 0} online`}
                  </p>
                </div>

                <div className="card-base p-5">
                  <p className="text-sm text-slate-500">Média geral</p>
                  <h3 className="mt-2 text-3xl font-bold text-slate-900">
                    {loadingSummary
                      ? "..."
                      : summary?.mediaGeral == null
                        ? "-"
                        : summary.mediaGeral.toFixed(1).replace(".", ",")}
                  </h3>
                  <p className="mt-2 text-sm text-blue-600">
                    Calculada pelas notas lançadas
                  </p>
                </div>
              </>
            )}
          </div>
          )}

          {user?.role === "GESTOR" ? (
            <DashboardGestorCharts analytics={summary?.gestorAnalytics} />
          ) : null}

          <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-3">
            {user?.role === "PROFESSOR" ? (
              <DashboardProfessorCalendar />
            ) : (
              <div className="card-base p-6 xl:col-span-2">
                <h3 className="text-lg font-bold text-slate-900">
                  Resumo operacional
                </h3>

                <div className="mt-5 space-y-3">
                  <div className="rounded-xl bg-slate-50 p-4">
                    <p className="text-sm font-semibold text-slate-900">
                      Solicitações pendentes
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      {loadingSummary ? "Carregando..." : `${summary?.solicitacoesPendentes || 0} pedido(s) aguardando retorno.`}
                    </p>
                  </div>

                  {user?.role !== "GESTOR" ||
                  summary?.gestorAnalytics?.financeiroGestorEnabled !== false ? (
                    <div className="rounded-xl bg-slate-50 p-4">
                      <p className="text-sm font-semibold text-slate-900">
                        Cobranças em aberto
                      </p>
                      <p className="mt-1 text-sm text-slate-500">
                        {loadingSummary
                          ? "Carregando..."
                          : `${summary?.cobrancasPendentes || 0} cobrança(s), totalizando ${formatarMoeda(summary?.valorPendente || 0)}.`}
                      </p>
                    </div>
                  ) : null}

                  <div className="rounded-xl bg-slate-50 p-4">
                    <p className="text-sm font-semibold text-slate-900">
                      Média geral registrada
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      {loadingSummary
                        ? "Carregando..."
                        : summary?.mediaGeral == null
                          ? "Ainda não há notas suficientes para calcular a média."
                          : `Média atual: ${summary.mediaGeral.toFixed(1).replace(".", ",")}.`}
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="card-base p-6">
              <h3 className="text-lg font-bold text-slate-900">
                Módulos disponíveis
              </h3>

              <div className="mt-5 space-y-3">
                {[
                  "Alunos",
                  "Turmas",
                  "Avaliações",
                  "Notas e boletim",
                  ...(user?.role !== "GESTOR" ||
                  summary?.gestorAnalytics?.financeiroGestorEnabled !== false
                    ? ["Financeiro"]
                    : []),
                  "Feed escolar",
                ].map((item) => (
                  <div
                    key={item}
                    className="flex items-center gap-3 rounded-xl bg-slate-50 px-4 py-3"
                  >
                    <span className="text-green-600">OK</span>
                    <span className="text-sm font-medium text-slate-700">
                      {item}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

function DashboardShortcutCard({
  title,
  description,
  href,
}: {
  title: string;
  description: string;
  href: string;
}) {
  return (
    <a
      href={href}
      className="card-base p-5 transition hover:shadow-lg"
    >
      <h3 className="text-base font-semibold text-slate-900">{title}</h3>
      <p className="mt-2 text-sm text-slate-500">{description}</p>
    </a>
  );
}

function DashboardGestorCharts({
  analytics,
}: {
  analytics?: DashboardSummary["gestorAnalytics"];
}) {
  if (!analytics) return null;

  const totalFinanceiro = analytics.financeiroAlunos.totalAlunos || 0;
  const percentualAdimplentes = totalFinanceiro
    ? (analytics.financeiroAlunos.adimplentes / totalFinanceiro) * 100
    : 0;
  const percentualInadimplentes = totalFinanceiro
    ? (analytics.financeiroAlunos.inadimplentes / totalFinanceiro) * 100
    : 0;
  const columnsClass = analytics.financeiroGestorEnabled
    ? "grid grid-cols-1 gap-4 xl:grid-cols-3"
    : "grid grid-cols-1 gap-4 xl:grid-cols-2";

  return (
    <div className={columnsClass}>
      <div className="card-base p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold text-slate-900">
              Faltas por turma
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              Analise baseada nas faltas e presenas registradas em cada turma.
            </p>
          </div>
          <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-800">
            Frequencia real
          </span>
        </div>

        <div className="mt-5 space-y-4">
          {analytics.frequenciaPorTurma.length === 0 ? (
            <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
              Ainda nao ha frequencias suficientes para montar a analise por turma.
            </div>
          ) : (
            analytics.frequenciaPorTurma.map((item) => (
              <div key={item.turmaId} className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-slate-900">
                    {formatarTurmaDashboard(item)}
                  </p>
                  <p className="text-xs font-medium text-slate-500">
                    {item.totalFaltas} falta(s) em {item.totalRegistros} registro(s)
                  </p>
                </div>
                <div className="flex h-3 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full bg-emerald-500"
                    style={{ width: `${Math.min(item.percentualPresencas, 100)}%` }}
                  />
                  <div
                    className="h-full bg-rose-500"
                    style={{ width: `${Math.min(item.percentualFaltas, 100)}%` }}
                  />
                </div>
                <div className="flex items-center justify-between gap-3 text-xs font-medium text-slate-500">
                  <span>{formatarNota(item.percentualPresencas)}% de presena</span>
                  <span>{formatarNota(item.percentualFaltas)}% de falta</span>
                </div>
                <div className="pt-1">
                  {renderAlunosComFaltas(
                    item.alunosComMaisFaltas,
                    "Nenhum aluno com faltas em destaque nesta turma.",
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="card-base p-6">
        <h3 className="text-lg font-bold text-slate-900">
          Notas altas e baixas por turma
        </h3>
        <p className="mt-1 text-sm text-slate-500">
          Faixa das notas ja lancadas no boletim.
        </p>

        <div className="mt-5 space-y-4">
          {analytics.extremosNotasPorTurma.length === 0 ? (
            <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
              Nenhuma nota foi lancada no boletim ate agora.
            </div>
          ) : (
            analytics.extremosNotasPorTurma.map((item) => (
              <div key={item.turmaId} className="rounded-2xl bg-slate-50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      {formatarTurmaDashboard(item)}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {item.quantidadeLancamentos} lancamento(s)
                    </p>
                  </div>
                  <div className="text-right text-xs text-slate-500">
                    <p>Maior: {formatarNota(item.maiorNota)}</p>
                    <p>Menor: {formatarNota(item.menorNota)}</p>
                  </div>
                </div>

                <div className="mt-4 space-y-3">
                  <div>
                    <div className="mb-1 flex items-center justify-between text-xs font-medium text-slate-500">
                      <span>Maior nota</span>
                      <span>{formatarNota(item.maiorNota)}</span>
                    </div>
                    <div className="h-3 overflow-hidden rounded-full bg-slate-200">
                      <div
                        className="h-full rounded-full bg-emerald-500"
                        style={{ width: `${Math.max(0, Math.min(((item.maiorNota || 0) / 10) * 100, 100))}%` }}
                      />
                    </div>
                    <div className="mt-2">
                      {renderNomesAlunos(
                        item.alunosMaiorNota,
                        "Nenhum aluno com maior nota identificado.",
                      )}
                    </div>
                  </div>

                  <div>
                    <div className="mb-1 flex items-center justify-between text-xs font-medium text-slate-500">
                      <span>Abaixo da media da escola</span>
                      <span>{formatarNota(item.menorNota)}</span>
                    </div>
                    <div className="h-3 overflow-hidden rounded-full bg-slate-200">
                      <div
                        className="h-full rounded-full bg-rose-400"
                        style={{ width: `${Math.max(0, Math.min(((item.menorNota || 0) / 10) * 100, 100))}%` }}
                      />
                    </div>
                    <div className="mt-2">
                      {renderNomesAlunos(
                        item.alunosAbaixoDaMedia,
                        "Nenhum aluno abaixo da media da escola nesta turma.",
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {analytics.financeiroGestorEnabled ? (
        <div className="card-base p-6">
          <h3 className="text-lg font-bold text-slate-900">
            Situacao financeira dos alunos
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            Comparativo entre alunos adimplentes e inadimplentes.
          </p>

          <div className="mt-6">
            <div className="h-5 overflow-hidden rounded-full bg-slate-100">
              <div className="flex h-full w-full">
                <div
                  className="bg-emerald-500"
                  style={{ width: `${percentualAdimplentes}%` }}
                />
                <div
                  className="bg-rose-500"
                  style={{ width: `${percentualInadimplentes}%` }}
                />
              </div>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-emerald-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                  Adimplentes
                </p>
                <p className="mt-2 text-3xl font-bold text-emerald-900">
                  {analytics.financeiroAlunos.adimplentes}
                </p>
                <p className="mt-1 text-sm text-emerald-700">
                  {formatarNota(percentualAdimplentes)}% do total
                </p>
                <div className="mt-3 max-h-48 overflow-y-auto">
                  {renderNomesAlunos(
                    analytics.financeiroAlunos.adimplentesLista,
                    "Nenhum aluno adimplente encontrado.",
                  )}
                </div>
              </div>

              <div className="rounded-2xl bg-rose-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-rose-700">
                  Inadimplentes
                </p>
                <p className="mt-2 text-3xl font-bold text-rose-900">
                  {analytics.financeiroAlunos.inadimplentes}
                </p>
                <p className="mt-1 text-sm text-rose-700">
                  {formatarNota(percentualInadimplentes)}% do total
                </p>
                <div className="mt-3 max-h-48 overflow-y-auto">
                  {renderNomesAlunos(
                    analytics.financeiroAlunos.inadimplentesLista,
                    "Nenhum aluno inadimplente encontrado.",
                  )}
                </div>
              </div>
            </div>

            <p className="mt-4 text-sm text-slate-500">
              Base considerada: {analytics.financeiroAlunos.totalAlunos} aluno(s) da escola.
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

