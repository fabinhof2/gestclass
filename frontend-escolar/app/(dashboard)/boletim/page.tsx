"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import PageHeader from "@/components/ui/page-header";
import { useAuth } from "@/context/auth-context";
import { apiUrl } from "@/lib/api";
import { formatTurno } from "@/lib/turno";

type Periodo = "PRIMEIRO" | "SEGUNDO" | "TERCEIRO" | "QUARTO";

type AlunoResumo = {
  id: string;
  name: string;
  matricula?: string | null;
  status?: string;
};

type AlunoResponsavel = AlunoResumo & {
  parentesco?: string | null;
  turma?: {
    id: string;
    name: string;
    turno?: string | null;
  } | null;
};

type TurmaComAlunos = {
  id: string;
  name: string;
  turno?: string | null;
  alunos: AlunoResumo[];
};

type DisciplinaBoletim = {
  turmaProfessorId: string;
  disciplina: string;
  professor?: string;
  notas: Record<string, number | null>;
  media: number | null;
  totalPresencas: number;
  totalFaltas: number;
  situacao: string;
};

type BoletimResponse = {
  aluno: {
    id: string;
    name: string;
    matricula?: string | null;
    status?: string;
  };
  turma: {
    id: string;
    name: string;
    turno?: string | null;
  };
  escola: {
    id: string;
    name: string;
    tipoAvaliacao: "BIMESTRAL" | "TRIMESTRAL";
    mediaAprovacao: number;
  };
  periodosPermitidos: Periodo[];
  disciplinas: DisciplinaBoletim[];
};

function formatarNota(valor: number | null) {
  if (typeof valor !== "number") return "-";
  return valor.toFixed(2).replace(".", ",");
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function labelPeriodo(tipoAvaliacao: "BIMESTRAL" | "TRIMESTRAL", periodo: Periodo) {
  const prefixo: Record<Periodo, string> = {
    PRIMEIRO: "1º",
    SEGUNDO: "2º",
    TERCEIRO: "3º",
    QUARTO: "4º",
  };

  return `${prefixo[periodo]} ${tipoAvaliacao === "TRIMESTRAL" ? "Trim" : "Bim"}`;
}

function formatTipoAvaliacao(tipoAvaliacao: "BIMESTRAL" | "TRIMESTRAL") {
  return tipoAvaliacao === "TRIMESTRAL" ? "Trimestral" : "Bimestral";
}

function calcularFrequenciaPercentual(totalPresencas: number, totalFaltas: number) {
  const total = totalPresencas + totalFaltas;
  if (!total) return 0;
  return Number(((totalPresencas / total) * 100).toFixed(1));
}

function BoletimVisual({
  dados,
  loading,
  error,
  mostrarVoltar,
  ocultarCabecalho,
}: {
  dados: BoletimResponse | null;
  loading: boolean;
  error: string;
  mostrarVoltar?: boolean;
  ocultarCabecalho?: boolean;
}) {
  const mediaGeral = useMemo(() => {
    const disciplinas = dados?.disciplinas || [];
    const medias = disciplinas
      .map((item) => item.media)
      .filter((valor): valor is number => typeof valor === "number");

    if (!medias.length) return null;

    return Number(
      (medias.reduce((acc, valor) => acc + valor, 0) / medias.length).toFixed(2),
    );
  }, [dados]);

  const frequenciaGeral = useMemo(() => {
    const disciplinas = dados?.disciplinas || [];
    const totalPresencas = disciplinas.reduce(
      (acc, item) => acc + item.totalPresencas,
      0,
    );
    const totalFaltas = disciplinas.reduce((acc, item) => acc + item.totalFaltas, 0);

    return calcularFrequenciaPercentual(totalPresencas, totalFaltas);
  }, [dados]);

  return (
    <section className="space-y-6">
      <PageHeader
        title="Boletim do aluno"
        description="Visualização consolidada das notas finais por período e frequência por disciplina."
      />

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {mostrarVoltar ? (
        <div className="flex">
          <Link
            href="/boletim"
            className="inline-flex rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Voltar para seleção de alunos
          </Link>
        </div>
      ) : null}

      {loading ? (
        <div className="card-base p-6">
          <p className="text-sm text-slate-500">Carregando...</p>
        </div>
      ) : !dados ? (
        <div className="card-base p-6">
          <p className="text-sm text-slate-500">
            Nenhum dado de boletim encontrado.
          </p>
        </div>
      ) : (
        <>
          <div className="card-base p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h3 className="text-xl font-bold text-slate-900">
                  Aluno: {dados.aluno.name}
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  Turma: {dados.turma.name}
                  {dados.turma.turno ? ` - Turno: ${formatTurno(dados.turma.turno)}` : ""}
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  Escola: {dados.escola.name}
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  Matrícula: {dados.aluno.matricula || "Não informada"}
                </p>
                <p className="mt-2 text-xs font-medium text-slate-500">
                  Regime: {formatTipoAvaliacao(dados.escola.tipoAvaliacao)}. A
                  média divide a soma das notas por {dados.periodosPermitidos.length}.
                  Situação: Cursando até atingir{" "}
                  {formatarNota(Number(dados.escola.mediaAprovacao))}.
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                <div className="rounded-xl bg-emerald-50 px-4 py-3">
                  <p className="text-xs text-emerald-600">Média geral</p>
                  <p className="text-lg font-bold text-emerald-700">
                    {mediaGeral === null ? "-" : formatarNota(mediaGeral)}
                  </p>
                </div>

                <div className="rounded-xl bg-blue-50 px-4 py-3">
                  <p className="text-xs text-blue-600">Frequência geral</p>
                  <p className="text-lg font-bold text-blue-700">
                    {`${String(frequenciaGeral).replace(".", ",")}%`}
                  </p>
                </div>

                <div
                  className={`rounded-xl px-4 py-3 ${
                    String(dados.aluno.status || "").toUpperCase() === "ATIVO"
                      ? "bg-emerald-50"
                      : "bg-red-50"
                  }`}
                >
                  <p
                    className={`text-xs ${
                      String(dados.aluno.status || "").toUpperCase() === "ATIVO"
                        ? "text-emerald-600"
                        : "text-red-600"
                    }`}
                  >
                    Status
                  </p>
                  <p
                    className={`text-lg font-bold ${
                      String(dados.aluno.status || "").toUpperCase() === "ATIVO"
                        ? "text-emerald-700"
                        : "text-red-700"
                    }`}
                  >
                    {String(dados.aluno.status || "").toUpperCase() || "SEM STATUS"}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="card-base overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1000px] border-collapse">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-4 text-left text-sm font-semibold text-slate-700">
                      Disciplina
                    </th>

                    {dados.periodosPermitidos.map((periodo) => (
                      <th
                        key={periodo}
                        className="px-4 py-4 text-left text-sm font-semibold text-slate-700"
                      >
                        {labelPeriodo(dados.escola.tipoAvaliacao, periodo)}
                      </th>
                    ))}

                    <th className="px-4 py-4 text-left text-sm font-semibold text-slate-700">
                      Média
                    </th>
                    <th className="px-4 py-4 text-left text-sm font-semibold text-slate-700">
                      Presenças
                    </th>
                    <th className="px-4 py-4 text-left text-sm font-semibold text-slate-700">
                      Faltas
                    </th>
                    <th className="px-4 py-4 text-left text-sm font-semibold text-slate-700">
                      Frequência
                    </th>
                    <th className="px-4 py-4 text-left text-sm font-semibold text-slate-700">
                      Situação
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {dados.disciplinas.length === 0 ? (
                    <tr>
                      <td
                        colSpan={dados.periodosPermitidos.length + 6}
                        className="px-4 py-6 text-sm text-slate-500"
                      >
                        Nenhuma disciplina com notas enviadas ao boletim.
                      </td>
                    </tr>
                  ) : (
                    dados.disciplinas.map((disciplina) => {
                      const frequencia = calcularFrequenciaPercentual(
                        disciplina.totalPresencas,
                        disciplina.totalFaltas,
                      );
                      const situacao = disciplina.situacao || "Cursando";

                      return (
                        <tr
                          key={disciplina.turmaProfessorId}
                          className="border-t border-slate-200"
                        >
                          <td className="px-4 py-4 text-sm">
                            <p className="font-semibold text-slate-900">
                              {disciplina.disciplina}
                            </p>
                            <p className="mt-1 text-xs text-slate-500">
                              Professor: {disciplina.professor || "Não informado"}
                            </p>
                          </td>

                          {dados.periodosPermitidos.map((periodo) => (
                            <td
                              key={`${disciplina.turmaProfessorId}-${periodo}`}
                              className="px-4 py-4 text-sm text-slate-600"
                            >
                              {formatarNota(
                                (disciplina.notas[periodo] as number | null) || null,
                              )}
                            </td>
                          ))}

                          <td className="px-4 py-4 text-sm font-semibold text-slate-900">
                            {formatarNota(disciplina.media)}
                          </td>
                          <td className="px-4 py-4 text-sm text-slate-600">
                            {disciplina.totalPresencas}
                          </td>
                          <td className="px-4 py-4 text-sm text-slate-600">
                            {disciplina.totalFaltas}
                          </td>
                          <td className="px-4 py-4 text-sm text-slate-600">
                            {`${String(frequencia).replace(".", ",")}%`}
                          </td>
                          <td className="px-4 py-4">
                            <span
                              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                                situacao === "Aprovado"
                                  ? "bg-emerald-50 text-emerald-700"
                                  : "bg-blue-50 text-blue-700"
                              }`}
                            >
                              {situacao}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

export default function BoletimPage() {
  const { token, user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [loadingMeuBoletim, setLoadingMeuBoletim] = useState(true);
  const [error, setError] = useState("");
  const [erroMeuBoletim, setErroMeuBoletim] = useState("");
  const [turmas, setTurmas] = useState<TurmaComAlunos[]>([]);
  const [turmaIdSelecionada, setTurmaIdSelecionada] = useState("");
  const [buscaAluno, setBuscaAluno] = useState("");
  const [meuBoletim, setMeuBoletim] = useState<BoletimResponse | null>(null);
  const [alunosResponsavel, setAlunosResponsavel] = useState<AlunoResponsavel[]>([]);
  const [alunoResponsavelId, setAlunoResponsavelId] = useState("");
  const [loadingResponsavel, setLoadingResponsavel] = useState(true);
  const [erroResponsavel, setErroResponsavel] = useState("");
  const [boletimResponsavel, setBoletimResponsavel] =
    useState<BoletimResponse | null>(null);

  const podeVerBoletimGestao =
    user?.role === "SUPERUSUARIO" ||
    user?.role === "ADMIN_ESCOLA" ||
    user?.role === "GESTOR" ||
    user?.role === "SECRETARIA";
  const isAluno = user?.role === "ALUNO";
  const isResponsavel = user?.role === "RESPONSAVEL";

  useEffect(() => {
    async function fetchMeuBoletim() {
      if (!token || !isAluno) {
        setLoadingMeuBoletim(false);
        return;
      }

      try {
        setLoadingMeuBoletim(true);
        setErroMeuBoletim("");

        const res = await fetch(apiUrl("/notas/boletim/me"), {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.message || "Erro ao carregar seu boletim.");
        }

        setMeuBoletim(data);
      } catch (err) {
        setErroMeuBoletim(getErrorMessage(err, "Erro ao carregar seu boletim."));
      } finally {
        setLoadingMeuBoletim(false);
      }
    }

    fetchMeuBoletim();
  }, [token, isAluno]);

  useEffect(() => {
    async function fetchAlunosResponsavel() {
      if (!token || !isResponsavel) {
        setLoadingResponsavel(false);
        return;
      }

      try {
        setLoadingResponsavel(true);
        setErroResponsavel("");

        const res = await fetch(apiUrl("/notas/responsavel"), {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.message || "Erro ao carregar alunos vinculados.");
        }

        const lista = Array.isArray(data) ? data : [];
        setAlunosResponsavel(lista);
        setAlunoResponsavelId((atual) => atual || lista[0]?.id || "");
      } catch (err) {
        setErroResponsavel(
          getErrorMessage(err, "Erro ao carregar alunos vinculados."),
        );
      } finally {
        setLoadingResponsavel(false);
      }
    }

    fetchAlunosResponsavel();
  }, [token, isResponsavel]);

  useEffect(() => {
    async function fetchBoletimResponsavel() {
      if (!token || !isResponsavel || !alunoResponsavelId) {
        setBoletimResponsavel(null);
        return;
      }

      try {
        setLoadingResponsavel(true);
        setErroResponsavel("");

        const res = await fetch(apiUrl(`/notas/boletim/${alunoResponsavelId}`), {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.message || "Erro ao carregar boletim do aluno.");
        }

        setBoletimResponsavel(data);
      } catch (err) {
        setBoletimResponsavel(null);
        setErroResponsavel(getErrorMessage(err, "Erro ao carregar boletim."));
      } finally {
        setLoadingResponsavel(false);
      }
    }

    fetchBoletimResponsavel();
  }, [token, isResponsavel, alunoResponsavelId]);

  useEffect(() => {
    async function fetchBoletimBase() {
      if (!token || !podeVerBoletimGestao) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError("");

        const res = await fetch(apiUrl("/notas/boletim"), {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.message || "Erro ao carregar dados do boletim.");
        }

        const lista = Array.isArray(data) ? data : [];
        setTurmas(lista);

        if (lista.length > 0) {
          setTurmaIdSelecionada(lista[0].id);
        }
      } catch (err) {
        setError(getErrorMessage(err, "Erro ao carregar dados do boletim."));
      } finally {
        setLoading(false);
      }
    }

    fetchBoletimBase();
  }, [token, podeVerBoletimGestao]);

  const turmaSelecionada = useMemo(() => {
    return turmas.find((turma) => turma.id === turmaIdSelecionada) || null;
  }, [turmas, turmaIdSelecionada]);

  const alunosFiltrados = useMemo(() => {
    const alunos = turmaSelecionada?.alunos || [];
    const termo = buscaAluno.trim().toLowerCase();

    if (!termo) return alunos;

    return alunos.filter((aluno) => {
      const nome = String(aluno.name || "").toLowerCase();
      const matricula = String(aluno.matricula || "").toLowerCase();

      return nome.includes(termo) || matricula.includes(termo);
    });
  }, [turmaSelecionada, buscaAluno]);

  if (isAluno) {
    return (
      <BoletimVisual
        dados={meuBoletim}
        loading={loadingMeuBoletim}
        error={erroMeuBoletim}
      />
    );
  }

  if (isResponsavel) {
    return (
      <section className="space-y-6">
        <PageHeader
          title="Boletim dos filhos"
          description="Selecione o aluno sob sua responsabilidade para acompanhar o boletim."
        />

        <div className="card-base p-5">
          <label className="text-sm font-medium text-slate-700">Aluno</label>
          <select
            value={alunoResponsavelId}
            onChange={(event) => setAlunoResponsavelId(event.target.value)}
            className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-3 text-sm"
          >
            <option value="">Selecione</option>
            {alunosResponsavel.map((aluno) => (
              <option key={aluno.id} value={aluno.id}>
                {aluno.name}
                {aluno.turma?.name ? ` - ${aluno.turma.name}` : ""}
              </option>
            ))}
          </select>
        </div>

        <BoletimVisual
          dados={boletimResponsavel}
          loading={loadingResponsavel}
          error={erroResponsavel}
        />
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <PageHeader
        title="Boletim"
        description="Selecione a turma e o aluno para visualizar o boletim consolidado com notas finais e frequência."
      />

      {!podeVerBoletimGestao ? (
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

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="card-base p-5">
          <p className="text-sm text-slate-500">Turmas encontradas</p>
          <h3 className="mt-2 text-2xl font-bold text-slate-900">{turmas.length}</h3>
        </div>

        <div className="card-base p-5">
          <p className="text-sm text-slate-500">Turma selecionada</p>
          <h3 className="mt-2 text-xl font-bold text-slate-900">
            {turmaSelecionada?.name || "-"}
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            {formatTurno(turmaSelecionada?.turno)}
          </p>
        </div>

        <div className="card-base p-5">
          <p className="text-sm text-slate-500">Alunos visíveis</p>
          <h3 className="mt-2 text-2xl font-bold text-slate-900">
            {alunosFiltrados.length}
          </h3>
        </div>
      </div>

      <div className="card-base p-5">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="text-sm font-medium text-slate-700">Turma</label>
            <select
              value={turmaIdSelecionada}
              onChange={(e) => setTurmaIdSelecionada(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
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
            <label className="text-sm font-medium text-slate-700">
              Buscar aluno
            </label>
            <input
              type="text"
              value={buscaAluno}
              onChange={(e) => setBuscaAluno(e.target.value)}
              placeholder="Digite nome ou matrícula"
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
            />
          </div>
        </div>
      </div>

      <div className="card-base overflow-hidden">
        {loading ? (
          <div className="p-6">
            <p className="text-sm text-slate-500">Carregando...</p>
          </div>
        ) : !turmaSelecionada ? (
          <div className="p-6">
            <p className="text-sm text-slate-500">
              Selecione uma turma para visualizar os alunos.
            </p>
          </div>
        ) : alunosFiltrados.length === 0 ? (
          <div className="p-6">
            <p className="text-sm text-slate-500">
              Nenhum aluno encontrado para os filtros informados.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] border-collapse">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-4 text-left text-sm font-semibold text-slate-700">
                    Aluno
                  </th>
                  <th className="px-4 py-4 text-left text-sm font-semibold text-slate-700">
                    Matrícula
                  </th>
                  <th className="px-4 py-4 text-left text-sm font-semibold text-slate-700">
                    Status
                  </th>
                  <th className="px-4 py-4 text-left text-sm font-semibold text-slate-700">
                    Ação
                  </th>
                </tr>
              </thead>

              <tbody>
                {alunosFiltrados.map((aluno) => (
                  <tr key={aluno.id} className="border-t border-slate-200">
                    <td className="px-4 py-4 text-sm font-medium text-slate-900">
                      {aluno.name}
                    </td>
                    <td className="px-4 py-4 text-sm text-slate-600">
                      {aluno.matricula || "Não informada"}
                    </td>
                    <td className="px-4 py-4">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${
                          String(aluno.status || "").toUpperCase() === "ATIVO"
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-red-50 text-red-700"
                        }`}
                      >
                        {String(aluno.status || "").toUpperCase() || "SEM STATUS"}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <Link
                        href={`/boletim/${aluno.id}`}
                        title="Ver boletim"
                        aria-label={`Ver boletim de ${aluno.name}`}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-blue-600 hover:bg-blue-700"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                        >
                          <path
                            d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"
                            stroke="#ffffff"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                          <circle
                            cx="12"
                            cy="12"
                            r="3"
                            stroke="#ffffff"
                            strokeWidth="2"
                            fill="none"
                          />
                        </svg>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

