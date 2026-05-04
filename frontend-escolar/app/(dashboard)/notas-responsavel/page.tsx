"use client";

import { useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/ui/page-header";
import { useAuth } from "@/context/auth-context";
import { apiUrl } from "@/lib/api";

type Periodo = "PRIMEIRO" | "SEGUNDO" | "TERCEIRO" | "QUARTO";

type AlunoResponsavel = {
  id: string;
  name: string;
  matricula?: string | null;
  parentesco?: string | null;
  turma: {
    id: string;
    name: string;
    turno?: string | null;
  };
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

export default function NotasResponsavelPage() {
  const { token, user } = useAuth();

  const [loadingAlunos, setLoadingAlunos] = useState(true);
  const [loadingNotas, setLoadingNotas] = useState(false);
  const [error, setError] = useState("");
  const [alunos, setAlunos] = useState<AlunoResponsavel[]>([]);
  const [alunoId, setAlunoId] = useState("");
  const [periodo, setPeriodo] = useState<Periodo>("PRIMEIRO");
  const [dados, setDados] = useState<NotasAlunoResponse | null>(null);

  useEffect(() => {
    async function fetchAlunos() {
      if (!token || user?.role !== "RESPONSAVEL") {
        setLoadingAlunos(false);
        return;
      }

      try {
        setLoadingAlunos(true);
        setError("");

        const response = await fetch(apiUrl("/notas/responsavel"), {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || "Erro ao carregar alunos vinculados.");
        }

        const lista = Array.isArray(data) ? data : [];
        setAlunos(lista);
        setAlunoId((atual) => atual || lista[0]?.id || "");
      } catch (error) {
        setError(getErrorMessage(error, "Não foi possível carregar os alunos."));
      } finally {
        setLoadingAlunos(false);
      }
    }

    fetchAlunos();
  }, [token, user?.role]);

  useEffect(() => {
    async function fetchNotas() {
      if (!token || !alunoId) {
        setDados(null);
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

        setDados(data);
      } catch (error) {
        setDados(null);
        setError(getErrorMessage(error, "Não foi possível carregar as notas."));
      } finally {
        setLoadingNotas(false);
      }
    }

    fetchNotas();
  }, [token, alunoId]);

  const periodosDisponiveis: Periodo[] =
    dados?.escola.tipoAvaliacao === "TRIMESTRAL"
      ? ["PRIMEIRO", "SEGUNDO", "TERCEIRO"]
      : ["PRIMEIRO", "SEGUNDO", "TERCEIRO", "QUARTO"];

  const notasPorDisciplina = useMemo(() => {
    const mapa = new Map<string, NotaItem[]>();

    for (const item of dados?.itens || []) {
      if (item.periodo !== periodo) continue;

      const atuais = mapa.get(item.disciplina) || [];
      atuais.push(item);
      mapa.set(item.disciplina, atuais);
    }

    return Array.from(mapa.entries()).map(([disciplina, itens]) => ({
      disciplina,
      professor: itens[0]?.professor,
      itens: itens.sort((a, b) => a.ordem - b.ordem),
      media:
        itens.length > 0
          ? itens.reduce((acc, item) => acc + item.notaConsiderada, 0) /
            itens.length
          : null,
    }));
  }, [dados, periodo]);

  return (
    <section className="space-y-6">
      <PageHeader
        title="Notas do aluno"
        description="Consulte apenas as notas reais dos alunos vinculados ao seu acesso."
      />

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="card-base p-5">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className="text-sm font-semibold text-slate-700">Aluno</span>
            <select
              value={alunoId}
              onChange={(event) => setAlunoId(event.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Selecione</option>
              {alunos.map((aluno) => (
                <option key={aluno.id} value={aluno.id}>
                  {aluno.name} - {aluno.turma.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-sm font-semibold text-slate-700">Período</span>
            <select
              value={periodo}
              onChange={(event) => setPeriodo(event.target.value as Periodo)}
              className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
            >
              {periodosDisponiveis.map((periodoAtual) => (
                <option key={periodoAtual} value={periodoAtual}>
                  {labelPeriodo(dados?.escola.tipoAvaliacao || "BIMESTRAL", periodoAtual)}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {loadingAlunos || loadingNotas ? (
        <div className="card-base p-6 text-sm text-slate-500">
          Carregando notas reais...
        </div>
      ) : !alunoId ? (
        <div className="card-base p-6 text-sm text-slate-500">
          Nenhum aluno vinculado ao seu usuário responsável.
        </div>
      ) : notasPorDisciplina.length === 0 ? (
        <div className="card-base p-6 text-sm text-slate-500">
          Nenhuma nota lançada para este período.
        </div>
      ) : (
        notasPorDisciplina.map((grupo) => (
          <div key={grupo.disciplina} className="card-base overflow-hidden">
            <div className="flex flex-col gap-2 border-b border-slate-200 bg-slate-50 px-5 py-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {grupo.disciplina}
                </h3>
                <p className="text-sm text-slate-500">
                  {grupo.professor ? `Professor: ${grupo.professor}` : "Disciplina"}
                </p>
              </div>

              <div className="rounded-xl bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700">
                Média: {grupo.media == null ? "-" : formatarNota(grupo.media)}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse">
                <thead>
                  <tr className="bg-white">
                    <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">
                      Atividade
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">
                      Nota
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">
                      Recuperação
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">
                      Considerada
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">
                      Observação
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {grupo.itens.map((item) => (
                    <tr key={item.id} className="border-t border-slate-200">
                      <td className="px-4 py-4 text-sm font-medium text-slate-900">
                        {item.titulo}
                        <p className="mt-1 text-xs text-slate-500">
                          Valor máximo: {formatarNota(item.valorMaximo)}
                        </p>
                      </td>
                      <td className="px-4 py-4 text-sm font-semibold text-slate-900">
                        {formatarNota(item.nota)}
                      </td>
                      <td className="px-4 py-4 text-sm text-slate-600">
                        {item.notaRecuperacao == null
                          ? "-"
                          : formatarNota(item.notaRecuperacao)}
                      </td>
                      <td className="px-4 py-4 text-sm font-bold text-blue-700">
                        {formatarNota(item.notaConsiderada)}
                      </td>
                      <td className="px-4 py-4 text-sm text-slate-600">
                        {item.observacao || "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}
    </section>
  );
}
