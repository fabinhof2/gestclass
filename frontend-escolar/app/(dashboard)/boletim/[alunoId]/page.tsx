"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import PageHeader from "@/components/ui/page-header";
import { useAuth } from "@/context/auth-context";
import { apiUrl } from "@/lib/api";
import { formatTurno } from "@/lib/turno";

type Periodo = "PRIMEIRO" | "SEGUNDO" | "TERCEIRO" | "QUARTO";

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

function labelPeriodo(tipoAvaliacao: "BIMESTRAL" | "TRIMESTRAL", periodo: Periodo) {
  if (tipoAvaliacao === "TRIMESTRAL") {
    switch (periodo) {
      case "PRIMEIRO":
        return "1º Trim";
      case "SEGUNDO":
        return "2º Trim";
      case "TERCEIRO":
        return "3º Trim";
      default:
        return periodo;
    }
  }

  switch (periodo) {
    case "PRIMEIRO":
      return "1º Bim";
    case "SEGUNDO":
      return "2º Bim";
    case "TERCEIRO":
      return "3º Bim";
    case "QUARTO":
      return "4º Bim";
    default:
      return periodo;
  }
}

function calcularFrequenciaPercentual(
  totalPresencas: number,
  totalFaltas: number
) {
  const total = totalPresencas + totalFaltas;
  if (!total) return 0;
  return Number(((totalPresencas / total) * 100).toFixed(1));
}

function formatTipoAvaliacao(tipoAvaliacao: "BIMESTRAL" | "TRIMESTRAL") {
  return tipoAvaliacao === "TRIMESTRAL" ? "Trimestral" : "Bimestral";
}

export default function BoletimAlunoPage() {
  const { token, user } = useAuth();
  const params = useParams();
  const alunoId = String(params?.alunoId || "");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dados, setDados] = useState<BoletimResponse | null>(null);

  const podeVerBoletim =
    user?.role === "SUPERUSUARIO" ||
    user?.role === "ADMIN_ESCOLA" ||
    user?.role === "GESTOR" ||
    user?.role === "SECRETARIA";

  async function fetchBoletimAluno() {
    if (!token || !alunoId || !podeVerBoletim) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError("");

      const res = await fetch(apiUrl(`/notas/boletim/${alunoId}`), {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Erro ao carregar boletim do aluno.");
      }

      setDados(data);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Erro ao carregar boletim do aluno.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchBoletimAluno();
  }, [token, alunoId, podeVerBoletim]);

  const mediaGeral = useMemo(() => {
    const disciplinas = dados?.disciplinas || [];
    const medias = disciplinas
      .map((item) => item.media)
      .filter((valor): valor is number => typeof valor === "number");

    if (!medias.length) return null;

    return Number(
      (medias.reduce((acc, valor) => acc + valor, 0) / medias.length).toFixed(2)
    );
  }, [dados]);

  const frequenciaGeral = useMemo(() => {
    const disciplinas = dados?.disciplinas || [];
    const totalPresencas = disciplinas.reduce(
      (acc, item) => acc + item.totalPresencas,
      0
    );
    const totalFaltas = disciplinas.reduce((acc, item) => acc + item.totalFaltas, 0);

    return calcularFrequenciaPercentual(totalPresencas, totalFaltas);
  }, [dados]);

  return (
    <section className="space-y-6">
      <PageHeader
        title="Boletim do aluno"
        description="Visualização consolidada das notas finais por período e da frequência por disciplina."
      />

      {!podeVerBoletim ? (
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

      <div className="flex">
        <Link
          href="/boletim"
          className="inline-flex rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Voltar para seleção de alunos
        </Link>
      </div>

      {loading ? (
        <div className="card-base p-6">
          <p className="text-sm text-slate-500">Carregando...</p>
        </div>
      ) : !dados ? (
        <div className="card-base p-6">
          <p className="text-sm text-slate-500">
            Nenhum dado de boletim encontrado para este aluno.
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
                  {dados.turma.turno ? ` • Turno: ${formatTurno(dados.turma.turno)}` : ""}
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
                        disciplina.totalFaltas
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
                                (disciplina.notas[periodo] as number | null) || null
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
