"use client";

import { useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/ui/page-header";
import ProtectedRoute from "@/components/auth/protected-route";
import { useAuth } from "@/context/auth-context";
import { apiUrl } from "@/lib/api";
import { formatTurno } from "@/lib/turno";

type Periodo = "PRIMEIRO" | "SEGUNDO" | "TERCEIRO" | "QUARTO";

type AlunoResumo = {
  id: string;
  name: string;
  matricula?: string | null;
  status?: string | null;
};

type TurmaComAlunos = {
  id: string;
  name: string;
  turno?: string | null;
  alunos: AlunoResumo[];
};

type NotaItem = {
  id: string;
  periodo: Periodo;
  nota: number;
  notaRecuperacao: number | null;
  notaConsiderada: number;
  observacao?: string | null;
  disciplina: string;
  professor?: string | null;
  ordem: number;
  tipoAtividade: string;
  titulo: string;
  valorMaximo: number;
  enviadoBoletim?: boolean;
};

type NotasAlunoResponse = {
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
  escola: {
    tipoAvaliacao: "BIMESTRAL" | "TRIMESTRAL";
  };
  itens: NotaItem[];
};

type MediaAluno = {
  alunoId: string;
  alunoNome: string;
  media: number;
};

const periodos: Periodo[] = ["PRIMEIRO", "SEGUNDO", "TERCEIRO", "QUARTO"];

function formatarNota(valor: number | null | undefined) {
  if (typeof valor !== "number") return "-";
  return valor.toFixed(2).replace(".", ",");
}

function labelPeriodo(tipoAvaliacao: "BIMESTRAL" | "TRIMESTRAL", periodo: Periodo) {
  const ordem: Record<Periodo, string> = {
    PRIMEIRO: "1º",
    SEGUNDO: "2º",
    TERCEIRO: "3º",
    QUARTO: "4º",
  };

  return `${ordem[periodo]} ${tipoAvaliacao === "TRIMESTRAL" ? "Trimestre" : "Bimestre"}`;
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export default function NotasGestaoPage() {
  const { token, user } = useAuth();

  const [loadingTurmas, setLoadingTurmas] = useState(true);
  const [loadingNotas, setLoadingNotas] = useState(false);
  const [error, setError] = useState("");
  const [turmas, setTurmas] = useState<TurmaComAlunos[]>([]);
  const [turmaId, setTurmaId] = useState("");
  const [alunoId, setAlunoId] = useState("");
  const [periodoSelecionado, setPeriodoSelecionado] = useState<Periodo>("PRIMEIRO");
  const [notasAluno, setNotasAluno] = useState<NotasAlunoResponse | null>(null);
  const [mediasTurma, setMediasTurma] = useState<{
    menor: MediaAluno | null;
    maior: MediaAluno | null;
  }>({ menor: null, maior: null });

  const podeVerNotas =
    user?.role === "SUPERUSUARIO" ||
    user?.role === "ADMIN_ESCOLA" ||
    user?.role === "GESTOR" ||
    user?.role === "SECRETARIA";

  useEffect(() => {
    async function fetchTurmas() {
      if (!token || !podeVerNotas) {
        setLoadingTurmas(false);
        return;
      }

      try {
        setLoadingTurmas(true);
        setError("");

        const response = await fetch(apiUrl("/notas/boletim"), {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || "Erro ao carregar alunos.");
        }

        const lista = Array.isArray(data) ? data : [];
        setTurmas(lista);

        const primeiraTurma = lista[0];
        const primeiroAluno = primeiraTurma?.alunos?.[0];

        setTurmaId(primeiraTurma?.id || "");
        setAlunoId(primeiroAluno?.id || "");
      } catch (err) {
        setError(getErrorMessage(err, "Erro ao carregar alunos."));
      } finally {
        setLoadingTurmas(false);
      }
    }

    fetchTurmas();
  }, [token, podeVerNotas]);

  const turmaSelecionada = useMemo(() => {
    return turmas.find((turma) => turma.id === turmaId) || null;
  }, [turmas, turmaId]);

  const alunosDaTurma = useMemo(() => {
    return turmaSelecionada?.alunos || [];
  }, [turmaSelecionada]);

  useEffect(() => {
    const alunoAtualExiste = alunosDaTurma.some((aluno) => aluno.id === alunoId);

    if (!alunoAtualExiste) {
      setAlunoId(alunosDaTurma[0]?.id || "");
      setNotasAluno(null);
    }
  }, [alunosDaTurma, alunoId]);

  useEffect(() => {
    async function fetchNotasAluno() {
      if (!token || !podeVerNotas || !alunoId) {
        setNotasAluno(null);
        return;
      }

      try {
        setLoadingNotas(true);
        setError("");

        const response = await fetch(apiUrl(`/notas/aluno/${alunoId}`), {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || "Erro ao carregar notas do aluno.");
        }

        setNotasAluno(data);

        if (
          data?.escola?.tipoAvaliacao === "TRIMESTRAL" &&
          periodoSelecionado === "QUARTO"
        ) {
          setPeriodoSelecionado("PRIMEIRO");
        }
      } catch (err) {
        setNotasAluno(null);
        setError(getErrorMessage(err, "Erro ao carregar notas do aluno."));
      } finally {
        setLoadingNotas(false);
      }
    }

    fetchNotasAluno();
  }, [token, podeVerNotas, alunoId, periodoSelecionado]);

  useEffect(() => {
    async function fetchMediasTurma() {
      if (!token || !podeVerNotas || !alunosDaTurma.length) {
        setMediasTurma({ menor: null, maior: null });
        return;
      }

      try {
        const resultados = await Promise.all(
          alunosDaTurma.map(async (aluno) => {
            const response = await fetch(apiUrl(`/notas/aluno/${aluno.id}`), {
              headers: {
                Authorization: `Bearer ${token}`,
              },
            });

            const data = await response.json();

            if (!response.ok) return null;

            const itens = Array.isArray(data?.itens)
              ? data.itens.filter((item: NotaItem) => item.periodo === periodoSelecionado)
              : [];

            if (!itens.length) return null;

            const total = itens.reduce(
              (acc: number, item: NotaItem) => acc + Number(item.notaConsiderada || 0),
              0,
            );

            return {
              alunoId: aluno.id,
              alunoNome: aluno.name,
              media: total / itens.length,
            };
          }),
        );

        const medias = resultados.filter(Boolean) as MediaAluno[];

        if (!medias.length) {
          setMediasTurma({ menor: null, maior: null });
          return;
        }

        setMediasTurma({
          menor: medias.reduce((menor, atual) =>
            atual.media < menor.media ? atual : menor,
          ),
          maior: medias.reduce((maior, atual) =>
            atual.media > maior.media ? atual : maior,
          ),
        });
      } catch {
        setMediasTurma({ menor: null, maior: null });
      }
    }

    fetchMediasTurma();
  }, [token, podeVerNotas, alunosDaTurma, periodoSelecionado]);

  const periodosDisponiveis = useMemo(() => {
    if (notasAluno?.escola.tipoAvaliacao === "TRIMESTRAL") {
      return periodos.filter((periodo) => periodo !== "QUARTO");
    }

    return periodos;
  }, [notasAluno?.escola.tipoAvaliacao]);

  const notasDoPeriodo = useMemo(() => {
    return (notasAluno?.itens || []).filter(
      (item) => item.periodo === periodoSelecionado,
    );
  }, [notasAluno, periodoSelecionado]);

  const notasPorDisciplina = useMemo(() => {
    return notasDoPeriodo.reduce<Record<string, NotaItem[]>>((acc, item) => {
      const disciplina = item.disciplina || "Disciplina sem nome";

      if (!acc[disciplina]) {
        acc[disciplina] = [];
      }

      acc[disciplina].push(item);
      return acc;
    }, {});
  }, [notasDoPeriodo]);

  const totalAlunos = useMemo(() => {
    return turmas.reduce((acc, turma) => acc + turma.alunos.length, 0);
  }, [turmas]);

  return (
    <ProtectedRoute
      allowedRoles={["SUPERUSUARIO", "ADMIN_ESCOLA", "GESTOR", "SECRETARIA"]}
    >
      <section className="space-y-6">
        <PageHeader
          title="Notas da Gestão"
          description="Consulte somente notas reais lançadas por professores ou geradas pelas avaliações online."
        />

        {!podeVerNotas ? (
          <div className="card-base p-6">
            <p className="text-sm text-red-600">
              Esta página é exclusiva para superusuário, administrador, gestor e secretaria.
            </p>
          </div>
        ) : null}

        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
          <div className="card-base p-5">
            <p className="text-sm text-slate-500">Turmas reais</p>
            <h3 className="mt-2 text-2xl font-bold text-slate-900">{turmas.length}</h3>
          </div>

          <div className="card-base p-5">
            <p className="text-sm text-slate-500">Alunos reais</p>
            <h3 className="mt-2 text-2xl font-bold text-slate-900">{totalAlunos}</h3>
          </div>

          <div className="card-base p-5">
            <p className="text-sm text-slate-500">Atividades do período</p>
            <h3 className="mt-2 text-2xl font-bold text-slate-900">
              {notasDoPeriodo.length}
            </h3>
          </div>

          <div className="card-base p-5">
            <p className="text-sm text-slate-500">Média mais baixa</p>
            <h3 className="mt-2 text-2xl font-bold text-slate-900">
              {formatarNota(mediasTurma.menor?.media)}
            </h3>
            <p className="mt-1 truncate text-xs text-slate-500">
              {mediasTurma.menor?.alunoNome || "Sem notas"}
            </p>
          </div>

          <div className="card-base p-5">
            <p className="text-sm text-slate-500">Média mais alta</p>
            <h3 className="mt-2 text-2xl font-bold text-slate-900">
              {formatarNota(mediasTurma.maior?.media)}
            </h3>
            <p className="mt-1 truncate text-xs text-slate-500">
              {mediasTurma.maior?.alunoNome || "Sem notas"}
            </p>
          </div>
        </div>

        <div className="card-base p-5">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div>
              <label className="text-sm font-medium text-slate-700">Turma</label>
              <select
                value={turmaId}
                onChange={(event) => setTurmaId(event.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                disabled={loadingTurmas}
              >
                <option value="">Selecione</option>
                {turmas.map((turma) => (
                  <option key={turma.id} value={turma.id}>
                    {turma.name}
                    {turma.turno ? ` (${formatTurno(turma.turno)})` : ""}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-sm font-medium text-slate-700">Aluno</label>
              <select
                value={alunoId}
                onChange={(event) => setAlunoId(event.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                disabled={!turmaId || loadingTurmas}
              >
                <option value="">Selecione</option>
                {alunosDaTurma.map((aluno) => (
                  <option key={aluno.id} value={aluno.id}>
                    {aluno.name}
                    {aluno.matricula ? ` - ${aluno.matricula}` : ""}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-sm font-medium text-slate-700">Período</label>
              <select
                value={periodoSelecionado}
                onChange={(event) => setPeriodoSelecionado(event.target.value as Periodo)}
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              >
                {periodosDisponiveis.map((periodo) => (
                  <option key={periodo} value={periodo}>
                    {labelPeriodo(notasAluno?.escola.tipoAvaliacao || "BIMESTRAL", periodo)}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="card-base overflow-hidden">
          {loadingTurmas || loadingNotas ? (
            <div className="p-6">
              <p className="text-sm text-slate-500">Carregando notas reais...</p>
            </div>
          ) : !alunoId ? (
            <div className="p-6">
              <p className="text-sm text-slate-500">
                Selecione um aluno para visualizar as notas.
              </p>
            </div>
          ) : Object.keys(notasPorDisciplina).length === 0 ? (
            <div className="p-6">
              <p className="text-sm text-slate-500">
                Nenhuma nota real foi lançada para este aluno neste período.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-200">
              {Object.entries(notasPorDisciplina).map(([disciplina, itens]) => (
                <div key={disciplina} className="p-5">
                  <div className="mb-4 flex flex-col gap-1 md:flex-row md:items-end md:justify-between">
                    <div>
                      <h3 className="text-lg font-bold text-slate-900">{disciplina}</h3>
                      <p className="text-sm text-slate-500">
                        {itens[0]?.professor
                          ? `Professor: ${itens[0].professor}`
                          : "Professor não informado"}
                      </p>
                    </div>
                    <p className="text-sm font-semibold text-slate-700">
                      {labelPeriodo(
                        notasAluno?.escola.tipoAvaliacao || "BIMESTRAL",
                        periodoSelecionado,
                      )}
                    </p>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[760px] border-collapse">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">
                            Atividade
                          </th>
                          <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">
                            Tipo
                          </th>
                          <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">
                            Nota
                          </th>
                          <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">
                            Recuperação
                          </th>
                          <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">
                            Nota considerada
                          </th>
                          <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">
                            Valor máximo
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {itens.map((item) => (
                          <tr key={item.id} className="border-t border-slate-200">
                            <td className="px-4 py-3 text-sm font-medium text-slate-900">
                              {item.titulo}
                            </td>
                            <td className="px-4 py-3 text-sm text-slate-600">
                              {item.tipoAtividade.replaceAll("_", " ")}
                            </td>
                            <td className="px-4 py-3 text-sm text-slate-700">
                              {formatarNota(item.nota)}
                            </td>
                            <td className="px-4 py-3 text-sm text-slate-700">
                              {formatarNota(item.notaRecuperacao)}
                            </td>
                            <td className="px-4 py-3 text-sm font-semibold text-slate-900">
                              {formatarNota(item.notaConsiderada)}
                            </td>
                            <td className="px-4 py-3 text-sm text-slate-600">
                              {formatarNota(item.valorMaximo)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </ProtectedRoute>
  );
}

