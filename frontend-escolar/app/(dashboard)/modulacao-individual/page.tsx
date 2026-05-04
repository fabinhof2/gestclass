"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  Search,
  UserSquare2,
} from "lucide-react";
import PageHeader from "@/components/ui/page-header";
import { useAuth } from "@/context/auth-context";
import { apiUrl } from "@/lib/api";
import { formatTurno } from "@/lib/turno";

type Turma = {
  id: string;
  name: string;
  turno?: string | null;
};

type Professor = {
  id: string;
  name: string;
  email?: string | null;
};

type Modulacao = {
  id: string;
  turmaId: string;
  professorId: string;
  disciplina: string;
  cargaHoraria: number;
  diasSemana?: string[] | null;
  professor?: Professor | null;
  turma?: Turma | null;
};

type ProfessorResumo = {
  professorId: string;
  professorNome: string;
  professorEmail: string;
  totalAulas: number;
  totalModulacoes: number;
  itens: Modulacao[];
};

const DIA_LABELS: Record<string, string> = {
  SEG: "Segunda",
  TER: "Terça",
  QUA: "Quarta",
  QUI: "Quinta",
  SEX: "Sexta",
};

function normalizeText(value?: string | null) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();
}

function formatDiasSemana(diasSemana?: string[] | null) {
  if (!Array.isArray(diasSemana) || diasSemana.length === 0) {
    return "Todos os dias letivos";
  }

  const dias = diasSemana
    .map((dia) => DIA_LABELS[normalizeText(dia)] || dia)
    .filter(Boolean);

  return dias.length ? dias.join(", ") : "Todos os dias letivos";
}

async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

export default function ModulacaoIndividualPage() {
  const { token, selectedSchool } = useAuth();

  const [modulacoes, setModulacoes] = useState<Modulacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [search, setSearch] = useState("");
  const [openProfessorId, setOpenProfessorId] = useState<string | null>(null);

  const requestHeaders = useMemo(
    () => ({
      Authorization: `Bearer ${token}`,
      ...(selectedSchool?.id ? { "x-school-id": selectedSchool.id } : {}),
    }),
    [selectedSchool?.id, token],
  );

  useEffect(() => {
    let ignore = false;

    async function fetchModulacoes() {
      if (!token) {
        if (!ignore) {
          setModulacoes([]);
          setLoading(false);
        }
        return;
      }

      try {
        setLoading(true);
        setErrorMessage("");

        const response = await fetch(apiUrl("/turma-professor"), {
          headers: requestHeaders,
        });
        const data = await readJson<Modulacao[]>(response);

        if (!response.ok) {
          throw new Error("Não foi possível carregar a modulação individual.");
        }

        if (ignore) return;

        setModulacoes(Array.isArray(data) ? data : []);
      } catch (error) {
        if (ignore) return;

        setModulacoes([]);
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Não foi possível carregar a modulação individual.",
        );
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }

    fetchModulacoes();

    return () => {
      ignore = true;
    };
  }, [requestHeaders, token]);

  const professores = useMemo<ProfessorResumo[]>(() => {
    const grouped = new Map<string, ProfessorResumo>();

    modulacoes.forEach((modulacao) => {
      const professorId =
        modulacao.professor?.id || modulacao.professorId || "sem-professor";
      const current = grouped.get(professorId);

      if (current) {
        current.totalAulas += Number(modulacao.cargaHoraria) || 0;
        current.totalModulacoes += 1;
        current.itens.push(modulacao);
        return;
      }

      grouped.set(professorId, {
        professorId,
        professorNome:
          modulacao.professor?.name || "Professor não identificado",
        professorEmail: modulacao.professor?.email || "",
        totalAulas: Number(modulacao.cargaHoraria) || 0,
        totalModulacoes: 1,
        itens: [modulacao],
      });
    });

    return Array.from(grouped.values())
      .map((professor) => ({
        ...professor,
        itens: [...professor.itens].sort((a, b) => {
          const turmaA = a.turma?.name || "";
          const turmaB = b.turma?.name || "";
          return (
            turmaA.localeCompare(turmaB, "pt-BR") ||
            a.disciplina.localeCompare(b.disciplina, "pt-BR")
          );
        }),
      }))
      .sort((a, b) => a.professorNome.localeCompare(b.professorNome, "pt-BR"));
  }, [modulacoes]);

  const professoresFiltrados = useMemo(() => {
    const term = normalizeText(search);
    if (!term) return professores;

    return professores.filter((professor) => {
      const base =
        `${professor.professorNome} ${professor.professorEmail} ${professor.itens
          .map(
            (item) =>
              `${item.disciplina} ${item.turma?.name || ""} ${
                item.turma?.turno || ""
              }`,
          )
          .join(" ")}`;

      return normalizeText(base).includes(term);
    });
  }, [professores, search]);

  const totalAulasModuladas = useMemo(
    () =>
      professoresFiltrados.reduce(
        (total, professor) => total + professor.totalAulas,
        0,
      ),
    [professoresFiltrados],
  );

  const totalLancamentos = useMemo(
    () =>
      professoresFiltrados.reduce(
        (total, professor) => total + professor.totalModulacoes,
        0,
      ),
    [professoresFiltrados],
  );

  useEffect(() => {
    if (!professoresFiltrados.length) {
      setOpenProfessorId(null);
      return;
    }

    const exists = professoresFiltrados.some(
      (professor) => professor.professorId === openProfessorId,
    );

    if (!exists) {
      setOpenProfessorId(professoresFiltrados[0]?.professorId || null);
    }
  }, [openProfessorId, professoresFiltrados]);

  return (
    <section className="space-y-6">
      <PageHeader
        title="Modulação Individual"
        description="Veja cada professor com o total de aulas moduladas e abra o detalhamento das turmas e disciplinas vinculadas."
      />

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-[1.8rem] border border-white/60 bg-white/80 p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
            Professores
          </p>
          <p className="mt-3 text-3xl font-black text-slate-900">
            {professoresFiltrados.length}
          </p>
        </div>
        <div className="rounded-[1.8rem] border border-white/60 bg-white/80 p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
            Aulas moduladas
          </p>
          <p className="mt-3 text-3xl font-black text-slate-900">
            {totalAulasModuladas}
          </p>
        </div>
        <div className="rounded-[1.8rem] border border-white/60 bg-white/80 p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
            Lançamentos
          </p>
          <p className="mt-3 text-3xl font-black text-slate-900">
            {totalLancamentos}
          </p>
        </div>
      </div>

      <div className="rounded-[2rem] border border-white/60 bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(246,251,255,0.92))] p-5 shadow-[0_20px_50px_rgba(15,23,42,0.08)]">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              Professores modulados
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Clique no professor para ver em quais aulas e turmas ele está
              modulado.
            </p>
          </div>

          <label className="flex items-center gap-3 rounded-full border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm md:min-w-[22rem]">
            <Search size={16} className="text-slate-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar professor, turma ou disciplina"
              className="w-full bg-transparent outline-none placeholder:text-slate-400"
            />
          </label>
        </div>

        {loading ? (
          <div className="mt-5 rounded-2xl border border-dashed border-slate-300 bg-white/60 p-8 text-center text-sm text-slate-500">
            Carregando modulação individual...
          </div>
        ) : errorMessage ? (
          <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
            {errorMessage}
          </div>
        ) : professoresFiltrados.length === 0 ? (
          <div className="mt-5 rounded-2xl border border-dashed border-slate-300 bg-white/60 p-8 text-center text-sm text-slate-500">
            Nenhuma modulação encontrada com esse filtro.
          </div>
        ) : (
          <div className="mt-5 space-y-4">
            {professoresFiltrados.map((professor) => {
              const isOpen = openProfessorId === professor.professorId;

              return (
                <div
                  key={professor.professorId}
                  className="overflow-hidden rounded-[1.6rem] border border-slate-200 bg-white/80 shadow-sm"
                >
                  <button
                    type="button"
                    onClick={() =>
                      setOpenProfessorId((current) =>
                        current === professor.professorId
                          ? null
                          : professor.professorId,
                      )
                    }
                    className="flex w-full flex-col gap-4 px-5 py-5 text-left transition hover:bg-slate-50/80 md:flex-row md:items-center md:justify-between"
                  >
                    <div className="flex items-start gap-4">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-100 text-sky-700">
                        <UserSquare2 size={22} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          {isOpen ? (
                            <ChevronDown size={18} className="text-slate-400" />
                          ) : (
                            <ChevronRight size={18} className="text-slate-400" />
                          )}
                          <h3 className="text-lg font-bold text-slate-900">
                            {professor.professorNome}
                          </h3>
                        </div>
                        <p className="mt-1 text-sm text-slate-500">
                          {professor.professorEmail || "Sem e-mail cadastrado"}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <span className="rounded-full bg-sky-100 px-3 py-1 text-xs font-bold text-sky-700">
                        {professor.totalAulas} aula(s)
                      </span>
                      <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700">
                        {professor.totalModulacoes} modulação(ões)
                      </span>
                    </div>
                  </button>

                  {isOpen ? (
                    <div className="border-t border-slate-200 bg-[linear-gradient(180deg,#ffffff,#f8fbff)] px-5 py-5">
                      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                        {professor.itens.map((item) => (
                          <article
                            key={item.id}
                            className="rounded-[1.4rem] border border-slate-200 bg-white p-4 shadow-sm"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                                  Disciplina
                                </p>
                                <h4 className="mt-2 flex items-center gap-2 text-base font-bold text-slate-900">
                                  <BookOpen size={16} className="text-sky-600" />
                                  {item.disciplina}
                                </h4>
                              </div>
                              <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-700">
                                {Number(item.cargaHoraria) || 0} aula(s)
                              </span>
                            </div>

                            <div className="mt-4 space-y-3 text-sm text-slate-600">
                              <div>
                                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                                  Turma
                                </p>
                                <p className="mt-1 font-semibold text-slate-800">
                                  {item.turma?.name || "Turma não identificada"}
                                </p>
                              </div>

                              <div>
                                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                                  Turno
                                </p>
                                <p className="mt-1 font-semibold text-slate-800">
                                  {item.turma?.turno
                                    ? formatTurno(item.turma.turno)
                                    : "Turno não informado"}
                                </p>
                              </div>

                              <div>
                                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                                  Dias modulados
                                </p>
                                <p className="mt-1 font-semibold text-slate-800">
                                  {formatDiasSemana(item.diasSemana)}
                                </p>
                              </div>
                            </div>
                          </article>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
