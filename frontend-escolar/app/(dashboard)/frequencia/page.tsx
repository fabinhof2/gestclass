"use client";

import { useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/ui/page-header";
import { useAuth } from "@/context/auth-context";
import { apiUrl } from "@/lib/api";
import { formatTurno } from "@/lib/turno";

type MinhaDisciplina = {
  id: string;
  disciplina: string;
  cargaHoraria: number;
  turma: {
    id: string;
    name: string;
    turno?: string;
  };
};

type TurmaCalendario = {
  id: string;
  name: string;
  turno?: string | null;
};

type Aluno = {
  id: string;
  name: string;
  matricula?: string | null;
  status?: string;
};

type FrequenciaExistente = {
  id: string;
  alunoId: string;
  turmaProfessorId: string;
  dataLancamento: string;
  status: "PRESENTE" | "FALTA";
  faltaJustificada: boolean;
  observacao?: string | null;
};

type LancamentoForm = {
  alunoId: string;
  status: "PRESENTE" | "FALTA";
  faltaJustificada: boolean;
  observacao: string;
  frequenciaId?: string;
};

type FrequenciaMensalItem = {
  id: string;
  alunoId: string;
  dia: number;
  status: "PRESENTE" | "FALTA";
  faltaJustificada: boolean;
  observacao?: string | null;
};

type ResumoMensalResponse = {
  turmaProfessor: {
    id: string;
    disciplina: string;
    turmaId: string;
    turmaNome: string;
  };
  mesReferencia: string;
  dias: number[];
  alunos: Aluno[];
  frequencias: FrequenciaMensalItem[];
};

type MinhaVisaoResponse = {
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
  };
  mesReferencia: string;
  dias: number[];
  alunosDisponiveis: Array<{
    id: string;
    name: string;
    matricula?: string | null;
    turmaNome: string;
  }>;
  diario: Array<{
    dia: number;
    totalPresencas: number;
    totalFaltas: number;
    statusConsolidado: "PRESENTE" | "FALTA" | null;
    faltaJustificada: boolean;
  }>;
  eventosCalendario?: Array<{
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
    turma?: {
      id: string;
      name: string;
      turno?: string | null;
    } | null;
  }>;

  porDisciplina: Array<{
    turmaProfessorId: string;
    disciplina: string;
    registros: Array<{
      id: string;
      dia: number;
      status: "PRESENTE" | "FALTA";
      faltaJustificada: boolean;
      observacao?: string | null;
    }>;
  }>;
};

type CalendarioLetivoEvento = {
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
  turma?: {
    id: string;
    name: string;
    turno?: string | null;
  } | null;
  createdBy?: {
    id: string;
    name: string;
    role: string;
  } | null;
    turmasExcecao?: Array<{
      id: string;
      turmaId: string;
      turma?: {
        id: string;
        name: string;
        turno?: string | null;
      } | null;
    }>;
};

type BloqueioCalendario = {
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

type ListaAlunosResponse = {
  turmaProfessor: {
    id: string;
    disciplina: string;
    turmaId: string;
    turmaNome: string;
  };
  dataLancamento: string;
  bloqueioCalendario?: BloqueioCalendario;
  alunos: Aluno[];
  frequencias: FrequenciaExistente[];
};

type CalendarioForm = {
  tipo: "DIA_SEM_AULA" | "RECESSO" | "FERIAS";
  abrangencia:
    | "ESCOLA_INTEIRA"
    | "APENAS_TURMA"
    | "ESCOLA_INTEIRA_EXCETO_TURMA";
  motivo: string;
  dataInicio: string;
  dataFim: string;
  turmaId: string;
  turmasExcecaoIds: string[];
};

function dataHoje() {
  const hoje = new Date();
  const ano = hoje.getFullYear();
  const mes = String(hoje.getMonth() + 1).padStart(2, "0");
  const dia = String(hoje.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

function mesAtual() {
  const hoje = new Date();
  const ano = hoje.getFullYear();
  const mes = String(hoje.getMonth() + 1).padStart(2, "0");
  return `${ano}-${mes}`;
}

function formatarDataBrasileira(dataISO?: string | null) {
  if (!dataISO) return "-";

  const somenteData = dataISO.includes("T") ? dataISO.split("T")[0] : dataISO;
  const [ano, mes, dia] = somenteData.split("-");
  return `${dia}/${mes}/${ano}`;
}

function traduzirTipoCalendario(tipo: string) {
  switch (tipo) {
    case "DIA_SEM_AULA":
      return "Dia sem aula";
    case "RECESSO":
      return "Recesso";
    case "FERIAS":
      return "Férias";
    default:
      return tipo;
  }
}

function traduzirAbrangencia(abrangencia: string) {
  switch (abrangencia) {
    case "ESCOLA_INTEIRA":
      return "Escola inteira";
    case "APENAS_TURMA":
      return "Apenas turma";
    case "ESCOLA_INTEIRA_EXCETO_TURMA":
      return "Escola inteira, menos a turma";
    default:
      return abrangencia;
  }
}

function obterClassesLinha(item: LancamentoForm) {
  if (item.status === "FALTA" && item.faltaJustificada) {
    return "bg-emerald-50";
  }

  if (item.status === "FALTA") {
    return "bg-red-50";
  }

  return "bg-blue-50";
}

function obterTextoMarcador(item: LancamentoForm) {
  if (item.status === "FALTA") return "F";
  return "•";
}

function obterClassesMarcador(item: LancamentoForm) {
  if (item.status === "FALTA" && item.faltaJustificada) {
    return "bg-emerald-600 text-white";
  }

  if (item.status === "FALTA") {
    return "bg-red-600 text-white";
  }

  return "bg-blue-600 text-white";
}

function obterClassesCelulaMensal(item?: {
  status: "PRESENTE" | "FALTA" | null;
  faltaJustificada?: boolean;
}) {
  if (!item || !item.status) return "bg-white text-slate-400";

  if (item.status === "FALTA" && item.faltaJustificada) {
    return "bg-emerald-100 text-emerald-700";
  }

  if (item.status === "FALTA") {
    return "bg-red-100 text-red-700";
  }

  return "bg-blue-100 text-blue-700";
}

function obterTextoCelulaMensal(item?: {
  status: "PRESENTE" | "FALTA" | null;
}) {
  if (!item || !item.status) return "-";
  if (item.status === "FALTA") return "F";
  return "•";
}

function calcularResumoAlunoNoMes(
  alunoId: string,
  frequencias: FrequenciaMensalItem[]
) {
  const registrosAluno = frequencias.filter((item) => item.alunoId === alunoId);

  const totalPresencas = registrosAluno.filter(
    (item) => item.status === "PRESENTE"
  ).length;

  const totalFaltas = registrosAluno.filter(
    (item) => item.status === "FALTA"
  ).length;

  const totalLancado = totalPresencas + totalFaltas;

  const percentualPresenca = totalLancado
    ? Number(((totalPresencas / totalLancado) * 100).toFixed(1))
    : 0;

  const percentualFalta = totalLancado
    ? Number(((totalFaltas / totalLancado) * 100).toFixed(1))
    : 0;

  return {
    totalPresencas,
    totalFaltas,
    percentualPresenca,
    percentualFalta,
  };
}

function calcularResumoDisciplina(
  registros: Array<{ status: "PRESENTE" | "FALTA" }>
) {
  const totalPresencas = registros.filter((item) => item.status === "PRESENTE").length;
  const totalFaltas = registros.filter((item) => item.status === "FALTA").length;
  const totalLancado = totalPresencas + totalFaltas;

  return {
    totalPresencas,
    totalFaltas,
    percentualPresenca: totalLancado
      ? Number(((totalPresencas / totalLancado) * 100).toFixed(1))
      : 0,
    percentualFalta: totalLancado
      ? Number(((totalFaltas / totalLancado) * 100).toFixed(1))
      : 0,
  };
}

function MinhaFrequenciaAlunoResponsavel() {
  const { token, user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [mesReferencia, setMesReferencia] = useState(mesAtual());
  const [alunoIdSelecionado, setAlunoIdSelecionado] = useState("");
  const [dados, setDados] = useState<MinhaVisaoResponse | null>(null);

  async function fetchMinhaVisao() {
    if (!token || !user) return;

    try {
      setLoading(true);
      setError("");

      const params = new URLSearchParams();
      params.set("mesReferencia", mesReferencia);

      if (user.role === "RESPONSAVEL" && alunoIdSelecionado) {
        params.set("alunoId", alunoIdSelecionado);
      }

      const res = await fetch(
        apiUrl(`/frequencia/minha-visao?${params.toString()}`),
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Erro ao carregar frequência.");
      }

      setDados(data);

      if (user.role === "RESPONSAVEL" && !alunoIdSelecionado && data.alunosDisponiveis?.length) {
        setAlunoIdSelecionado(data.alunosDisponiveis[0].id);
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Erro ao carregar frequência.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!token) return;
    fetchMinhaVisao();
  }, [token, mesReferencia, alunoIdSelecionado]);

  const resumoDiario = useMemo(() => {
    const diario = dados?.diario || [];
    const totalPresencas = diario.filter((item) => item.statusConsolidado === "PRESENTE").length;
    const totalFaltas = diario.filter((item) => item.statusConsolidado === "FALTA").length;
    const totalLancado = totalPresencas + totalFaltas;

    return {
      totalPresencas,
      totalFaltas,
      percentualPresenca: totalLancado
        ? Number(((totalPresencas / totalLancado) * 100).toFixed(1))
        : 0,
      percentualFalta: totalLancado
        ? Number(((totalFaltas / totalLancado) * 100).toFixed(1))
        : 0,
    };
  }, [dados]);

  function obterRegistroDisciplina(
    disciplina: MinhaVisaoResponse["porDisciplina"][number],
    dia: number
  ) {
    return disciplina.registros.find((item) => item.dia === dia);
  }

  return (
    <section className="space-y-6">
      <PageHeader
        title="Minha Frequência"
        description="Visualize sua frequência diária consolidada e também o detalhamento por disciplina no mês selecionado."
      />

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="card-base p-5">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="text-sm font-medium text-slate-700">Mês</label>
            <input
              type="month"
              value={mesReferencia}
              onChange={(e) => setMesReferencia(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
            />
          </div>

          {user?.role === "RESPONSAVEL" ? (
            <div>
              <label className="text-sm font-medium text-slate-700">Aluno</label>
              <select
                value={alunoIdSelecionado}
                onChange={(e) => setAlunoIdSelecionado(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
              >
                <option value="">Selecione</option>
                {(dados?.alunosDisponiveis || []).map((aluno) => (
                  <option key={aluno.id} value={aluno.id}>
                    {aluno.name} - {aluno.turmaNome}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </div>
      </div>

      {loading ? (
        <div className="card-base p-6">
          <p className="text-sm text-slate-500">Carregando...</p>
        </div>
      ) : !dados ? (
        <div className="card-base p-6">
          <p className="text-sm text-slate-500">
            Nenhum dado de frequência encontrado.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <div className="card-base p-5">
              <p className="text-sm text-slate-500">Aluno</p>
              <h3 className="mt-2 text-lg font-bold text-slate-900">{dados.aluno.name}</h3>
              <p className="mt-1 text-sm text-slate-500">
                Matrícula: {dados.aluno.matricula || "Não informada"}
              </p>
            </div>

            <div className="card-base p-5">
              <p className="text-sm text-slate-500">Turma</p>
              <h3 className="mt-2 text-lg font-bold text-slate-900">{dados.turma.name}</h3>
              <p className="mt-1 text-sm text-slate-500">
                {formatTurno(dados.turma.turno)}
              </p>
            </div>

            <div className="card-base p-5">
              <p className="text-sm text-slate-500">Dias presentes</p>
              <h3 className="mt-2 text-2xl font-bold text-blue-700">
                {resumoDiario.totalPresencas}
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                {String(resumoDiario.percentualPresenca).replace(".", ",")}%
              </p>
            </div>

            <div className="card-base p-5">
              <p className="text-sm text-slate-500">Dias com falta</p>
              <h3 className="mt-2 text-2xl font-bold text-red-700">
                {resumoDiario.totalFaltas}
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                {String(resumoDiario.percentualFalta).replace(".", ",")}%
              </p>
            </div>
          </div>

          {dados.eventosCalendario && dados.eventosCalendario.length > 0 ? (
            <div className="card-base p-5">
              <h3 className="text-lg font-bold text-slate-900">
                Calendário escolar do período
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                Aqui aparecem feriados, recessos, férias e outros eventos que afetam as aulas.
              </p>

              <div className="mt-5 space-y-3">
                {dados.eventosCalendario.map((evento) => (
                  <div
                    key={evento.id}
                    className="rounded-2xl border border-amber-200 bg-amber-50 p-4"
                  >
                    <p className="text-sm font-semibold text-amber-900">
                      {traduzirTipoCalendario(evento.tipo)}
                    </p>
                    <p className="mt-1 text-sm text-amber-800">
                      Motivo: <strong>{evento.motivo}</strong>
                    </p>                    
                    <p className="mt-1 text-sm text-amber-800">
                      {formatarDataBrasileira(evento.dataInicio)} até{" "}
                      {formatarDataBrasileira(evento.dataFim)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="card-base p-5">
            <h3 className="text-lg font-bold text-slate-900">Frequência diária</h3>
            <p className="mt-1 text-sm text-slate-500">
              Aqui a situação do dia é consolidada pela regra de maioria das disciplinas.
            </p>

            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[1200px] border-collapse">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="sticky left-0 z-10 bg-slate-50 px-4 py-3 text-left text-sm font-semibold text-slate-700">
                      Diário
                    </th>

                    {dados.dias.map((dia) => (
                      <th
                        key={dia}
                        className="px-2 py-3 text-center text-xs font-semibold text-slate-700"
                      >
                        {dia}
                      </th>
                    ))}

                    <th className="px-4 py-3 text-center text-xs font-semibold text-slate-700">
                      Pres.
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-slate-700">
                      Falt.
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-slate-700">
                      % Pres.
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-slate-700">
                      % Falt.
                    </th>
                  </tr>
                </thead>

                <tbody>
                  <tr className="border-t border-slate-200">
                    <td className="sticky left-0 bg-white px-4 py-3 text-sm font-medium text-slate-900">
                      Situação do dia
                    </td>

                    {dados.dias.map((dia) => {
                      const item = dados.diario.find((registro) => registro.dia === dia);

                      return (
                        <td key={dia} className="px-2 py-3">
                          <div
                            className={`mx-auto flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${obterClassesCelulaMensal(
                              item
                                ? {
                                    status: item.statusConsolidado,
                                    faltaJustificada: item.faltaJustificada,
                                  }
                                : undefined
                            )}`}
                          >
                            {obterTextoCelulaMensal(
                              item
                                ? {
                                    status: item.statusConsolidado,
                                  }
                                : undefined
                            )}
                          </div>
                        </td>
                      );
                    })}

                    <td className="px-4 py-3 text-center text-sm font-semibold text-blue-700">
                      {resumoDiario.totalPresencas}
                    </td>
                    <td className="px-4 py-3 text-center text-sm font-semibold text-red-700">
                      {resumoDiario.totalFaltas}
                    </td>
                    <td className="px-4 py-3 text-center text-sm font-semibold text-slate-700">
                      {String(resumoDiario.percentualPresenca).replace(".", ",")}%
                    </td>
                    <td className="px-4 py-3 text-center text-sm font-semibold text-slate-700">
                      {String(resumoDiario.percentualFalta).replace(".", ",")}%
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="card-base p-5">
            <h3 className="text-lg font-bold text-slate-900">Frequência por disciplina</h3>
            <p className="mt-1 text-sm text-slate-500">
              Aqui você vê a presença e a falta separadas por disciplina.
            </p>

            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[1500px] border-collapse">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="sticky left-0 z-10 bg-slate-50 px-4 py-3 text-left text-sm font-semibold text-slate-700">
                      Disciplina
                    </th>

                    {dados.dias.map((dia) => (
                      <th
                        key={dia}
                        className="px-2 py-3 text-center text-xs font-semibold text-slate-700"
                      >
                        {dia}
                      </th>
                    ))}

                    <th className="px-4 py-3 text-center text-xs font-semibold text-slate-700">
                      Pres.
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-slate-700">
                      Falt.
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-slate-700">
                      % Pres.
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-slate-700">
                      % Falt.
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {dados.porDisciplina.length === 0 ? (
                    <tr>
                      <td
                        colSpan={dados.dias.length + 5}
                        className="px-4 py-6 text-sm text-slate-500"
                      >
                        Nenhum lançamento encontrado para este mês.
                      </td>
                    </tr>
                  ) : (
                    dados.porDisciplina.map((disciplina) => {
                      const resumo = calcularResumoDisciplina(disciplina.registros);

                      return (
                        <tr key={disciplina.turmaProfessorId} className="border-t border-slate-200">
                          <td className="sticky left-0 bg-white px-4 py-3 text-sm font-medium text-slate-900">
                            {disciplina.disciplina}
                          </td>

                          {dados.dias.map((dia) => {
                            const item = obterRegistroDisciplina(disciplina, dia);

                            return (
                              <td key={`${disciplina.turmaProfessorId}-${dia}`} className="px-2 py-3">
                                <div
                                  className={`mx-auto flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${obterClassesCelulaMensal(
                                    item
                                      ? {
                                          status: item.status,
                                          faltaJustificada: item.faltaJustificada,
                                        }
                                      : undefined
                                  )}`}
                                >
                                  {obterTextoCelulaMensal(
                                    item
                                      ? {
                                          status: item.status,
                                        }
                                      : undefined
                                  )}
                                </div>
                              </td>
                            );
                          })}

                          <td className="px-4 py-3 text-center text-sm font-semibold text-blue-700">
                            {resumo.totalPresencas}
                          </td>
                          <td className="px-4 py-3 text-center text-sm font-semibold text-red-700">
                            {resumo.totalFaltas}
                          </td>
                          <td className="px-4 py-3 text-center text-sm font-semibold text-slate-700">
                            {String(resumo.percentualPresenca).replace(".", ",")}%
                          </td>
                          <td className="px-4 py-3 text-center text-sm font-semibold text-slate-700">
                            {String(resumo.percentualFalta).replace(".", ",")}%
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card-base p-5">
            <h3 className="text-sm font-bold text-slate-900">Legenda</h3>

            <div className="mt-4 flex flex-wrap gap-4">
              <div className="flex items-center gap-2">
                <span className="h-4 w-4 rounded bg-blue-100" />
                <span className="text-sm text-slate-700">Azul: presente</span>
              </div>

              <div className="flex items-center gap-2">
                <span className="h-4 w-4 rounded bg-red-100" />
                <span className="text-sm text-slate-700">Vermelho: falta</span>
              </div>

              <div className="flex items-center gap-2">
                <span className="h-4 w-4 rounded bg-emerald-100" />
                <span className="text-sm text-slate-700">
                  Verde: falta justificada
                </span>
              </div>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

function ProfessorGestaoFrequencia() {
  const { token, user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadingResumoMensal, setLoadingResumoMensal] = useState(false);
  const [loadingCalendario, setLoadingCalendario] = useState(false);
  const [savingCalendario, setSavingCalendario] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [minhasDisciplinas, setMinhasDisciplinas] = useState<MinhaDisciplina[]>([]);
  const [turmaProfessorId, setTurmaProfessorId] = useState("");
  const [dataLancamento, setDataLancamento] = useState(dataHoje());
  const [mesReferencia, setMesReferencia] = useState(mesAtual());

  const [alunos, setAlunos] = useState<Aluno[]>([]);
  const [lancamentos, setLancamentos] = useState<Record<string, LancamentoForm>>({});
  const [resumoMensal, setResumoMensal] = useState<ResumoMensalResponse | null>(null);
  const [eventosCalendario, setEventosCalendario] = useState<CalendarioLetivoEvento[]>([]);
  const [bloqueioCalendario, setBloqueioCalendario] = useState<BloqueioCalendario>(null);

  const [turmasCalendario, setTurmasCalendario] = useState<TurmaCalendario[]>([]);

  const [calendarioForm, setCalendarioForm] = useState<CalendarioForm>({
    tipo: "DIA_SEM_AULA",
    abrangencia: "APENAS_TURMA",
    motivo: "",
    dataInicio: dataHoje(),
    dataFim: dataHoje(),
    turmaId: "",
    turmasExcecaoIds: [],
  });

  const disciplinaSelecionada = useMemo(() => {
    return minhasDisciplinas.find((item) => item.id === turmaProfessorId) || null;
  }, [minhasDisciplinas, turmaProfessorId]);

  const podeJustificarFalta =
    user?.role === "SUPERUSUARIO" ||
    user?.role === "ADMIN_ESCOLA" ||
    user?.role === "GESTOR" ||
    user?.role === "SECRETARIA";

  const podeGerenciarCalendario = podeJustificarFalta;

  async function fetchMinhasDisciplinas() {
    if (!token) return;

    try {
      setLoading(true);
      setError("");

      const res = await fetch(apiUrl("/frequencia/minhas-disciplinas"), {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Erro ao carregar disciplinas.");
      }

      const lista = Array.isArray(data) ? data : [];
      setMinhasDisciplinas(lista);

      if (lista.length > 0) {
        setTurmaProfessorId((atual) => atual || lista[0].id);
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Erro ao carregar disciplinas.");
    } finally {
      setLoading(false);
    }
  }

  async function fetchAlunosEFrequencia() {
    if (!token || !turmaProfessorId || !dataLancamento) {
      setAlunos([]);
      setLancamentos({});
      setBloqueioCalendario(null);
      return;
    }

    try {
      setLoading(true);
      setError("");
      setSuccess("");

      const res = await fetch(
        apiUrl(`/frequencia/turma-professor/${turmaProfessorId}/alunos?dataLancamento=${dataLancamento}`),
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const data: ListaAlunosResponse = await res.json();

      if (!res.ok) {
        throw new Error((data as any).message || "Erro ao carregar frequência.");
      }

      const alunosRecebidos: Aluno[] = Array.isArray(data.alunos) ? data.alunos : [];
      const frequenciasRecebidas: FrequenciaExistente[] = Array.isArray(data.frequencias)
        ? data.frequencias
        : [];

      setAlunos(alunosRecebidos);
      setBloqueioCalendario(data.bloqueioCalendario || null);

      const mapaLancamentos: Record<string, LancamentoForm> = {};

      for (const aluno of alunosRecebidos) {
        const frequenciaExistente = frequenciasRecebidas.find(
          (item) => item.alunoId === aluno.id
        );

        mapaLancamentos[aluno.id] = {
          alunoId: aluno.id,
          status: frequenciaExistente?.status || "PRESENTE",
          faltaJustificada: Boolean(frequenciaExistente?.faltaJustificada),
          observacao: frequenciaExistente?.observacao || "",
          frequenciaId: frequenciaExistente?.id,
        };
      }

      setLancamentos(mapaLancamentos);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Erro ao carregar frequência.");
    } finally {
      setLoading(false);
    }
  }

  async function fetchResumoMensal() {
    if (!token || !turmaProfessorId || !mesReferencia) {
      setResumoMensal(null);
      return;
    }

    try {
      setLoadingResumoMensal(true);
      setError("");

      const res = await fetch(
        apiUrl(`/frequencia/turma-professor/${turmaProfessorId}/resumo-mensal?mesReferencia=${mesReferencia}`),
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Erro ao carregar resumo mensal.");
      }

      setResumoMensal(data);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Erro ao carregar resumo mensal.");
      setResumoMensal(null);
    } finally {
      setLoadingResumoMensal(false);
    }
  }

  async function fetchTurmasCalendario() {
    if (!token || !podeGerenciarCalendario) {
      setTurmasCalendario([]);
      return;
    }

    try {
      const res = await fetch(apiUrl("/frequencia/turmas-escola"), {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Erro ao carregar turmas da escola.");
      }

      const lista = Array.isArray(data) ? data : [];
      setTurmasCalendario(lista);

      setCalendarioForm((prev) => ({
        ...prev,
        turmaId: prev.turmaId || lista[0]?.id || "",
      }));
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Erro ao carregar turmas da escola.");
    }
  }

  async function fetchCalendarioLetivo() {
    if (!token || !mesReferencia) {
      setEventosCalendario([]);
      return;
    }

    try {
      setLoadingCalendario(true);
      setError("");

      const params = new URLSearchParams();
      params.set("mesReferencia", mesReferencia);

      if (disciplinaSelecionada?.turma?.id) {
        params.set("turmaId", disciplinaSelecionada.turma.id);
      }

      const res = await fetch(
        apiUrl(`/frequencia/calendario-letivo?${params.toString()}`),
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Erro ao carregar calendário letivo.");
      }

      setEventosCalendario(Array.isArray(data) ? data : []);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Erro ao carregar calendário letivo.");
      setEventosCalendario([]);
    } finally {
      setLoadingCalendario(false);
    }
  }

  function alternarPresencaFalta(alunoId: string) {
    if (bloqueioCalendario) return;

    setLancamentos((prev) => {
      const atual = prev[alunoId] || {
        alunoId,
        status: "PRESENTE" as const,
        faltaJustificada: false,
        observacao: "",
      };

      const professorBloqueadoPorJustificativa =
        user?.role === "PROFESSOR" && atual.faltaJustificada;

      if (professorBloqueadoPorJustificativa) {
        return prev;
      }

      const novoStatus = atual.status === "PRESENTE" ? "FALTA" : "PRESENTE";

      return {
        ...prev,
        [alunoId]: {
          ...atual,
          status: novoStatus,
          faltaJustificada: novoStatus === "FALTA" ? atual.faltaJustificada : false,
        },
      };
    });
  }

  function atualizarObservacao(alunoId: string, valor: string) {
    if (bloqueioCalendario) return;

    setLancamentos((prev) => ({
      ...prev,
      [alunoId]: {
        ...(prev[alunoId] || {
          alunoId,
          status: "PRESENTE",
          faltaJustificada: false,
          observacao: "",
        }),
        observacao: valor,
      },
    }));
  }

  function marcarTodosComo(status: "PRESENTE" | "FALTA") {
    if (bloqueioCalendario) return;

    setLancamentos((prev) => {
      const novoEstado = { ...prev };

      for (const aluno of alunos) {
        const anterior = novoEstado[aluno.id] || {
          alunoId: aluno.id,
          status: "PRESENTE" as const,
          faltaJustificada: false,
          observacao: "",
        };

        const professorBloqueadoPorJustificativa =
          user?.role === "PROFESSOR" && anterior.faltaJustificada;

        if (professorBloqueadoPorJustificativa) {
          continue;
        }

        novoEstado[aluno.id] = {
          ...anterior,
          alunoId: aluno.id,
          status,
          faltaJustificada: status === "FALTA" ? anterior.faltaJustificada : false,
        };
      }

      return novoEstado;
    });
  }

  async function handleSalvarFrequencia() {
    if (!token || !turmaProfessorId || !dataLancamento || bloqueioCalendario) return;

    try {
      setSaving(true);
      setError("");
      setSuccess("");

      const payload = alunos.map((aluno) => {
        const item = lancamentos[aluno.id];

        return {
          alunoId: aluno.id,
          status: (item?.status || "PRESENTE") as "PRESENTE" | "FALTA",
          observacao: item?.observacao || "",
          faltaJustificada:
            (item?.status || "PRESENTE") === "FALTA"
              ? Boolean(item?.faltaJustificada)
              : false,
        };
      });

      const res = await fetch(apiUrl("/frequencia/em-massa"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          turmaProfessorId,
          dataLancamento,
          lancamentos: payload,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Erro ao salvar frequência.");
      }

      setSuccess("Frequência salva com sucesso.");
      await fetchAlunosEFrequencia();
      await fetchResumoMensal();
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Erro ao salvar frequência.");
    } finally {
      setSaving(false);
    }
  }

  async function handleAlternarFaltaJustificada(alunoId: string) {
    const item = lancamentos[alunoId];
    if (
      !token ||
      !item?.frequenciaId ||
      item.status !== "FALTA" ||
      !podeJustificarFalta ||
      bloqueioCalendario
    ) {
      return;
    }

    try {
      setError("");
      setSuccess("");

      const res = await fetch(
        apiUrl(`/frequencia/${item.frequenciaId}/falta-justificada`),
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            faltaJustificada: !item.faltaJustificada,
          }),
        }
      );

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Erro ao atualizar falta justificada.");
      }

      setSuccess("Falta justificada atualizada com sucesso.");
      await fetchAlunosEFrequencia();
      await fetchResumoMensal();
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Erro ao atualizar falta justificada.");
    }
  }

  async function handleSalvarCalendario() {
    if (!token || !podeGerenciarCalendario) return;

    try {
      setSavingCalendario(true);
      setError("");
      setSuccess("");

      if (!calendarioForm.motivo.trim()) {
        throw new Error("Informe o motivo do evento.");
      }

      const exigeTurmaPrincipal = calendarioForm.abrangencia === "APENAS_TURMA";
      const exigeTurmasExcecao =
        calendarioForm.abrangencia === "ESCOLA_INTEIRA_EXCETO_TURMA";

      if (exigeTurmaPrincipal && !calendarioForm.turmaId) {
        throw new Error("Selecione a turma quando a abrangência for apenas turma.");
      }

      if (exigeTurmasExcecao && !calendarioForm.turmasExcecaoIds.length) {
        throw new Error("Selecione pelo menos uma turma de exceção.");
      }

      const res = await fetch(apiUrl("/frequencia/calendario-letivo"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          tipo: calendarioForm.tipo,
          abrangencia: calendarioForm.abrangencia,
          motivo: calendarioForm.motivo.trim(),
          dataInicio: calendarioForm.dataInicio,
          dataFim: calendarioForm.dataFim,
          turmaId: exigeTurmaPrincipal ? calendarioForm.turmaId : undefined,
          turmasExcecaoIds: exigeTurmasExcecao ? calendarioForm.turmasExcecaoIds : [],
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Erro ao salvar evento do calendário.");
      }

      setSuccess("Evento do calendário salvo com sucesso.");

      setCalendarioForm((prev) => ({
        ...prev,
        motivo: "",
      }));

      await fetchCalendarioLetivo();
      await fetchAlunosEFrequencia();
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Erro ao salvar evento do calendário.");
    } finally {
      setSavingCalendario(false);
    }
  }

  async function handleExcluirEvento(id: string) {
    if (!token || !podeGerenciarCalendario) return;

    const confirmou = window.confirm(
      "Tem certeza que deseja excluir este evento do calendário?"
    );

    if (!confirmou) return;

    try {
      setError("");
      setSuccess("");

      const res = await fetch(
        apiUrl(`/frequencia/calendario-letivo/${id}`),
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Erro ao excluir evento.");
      }

      setSuccess("Evento excluído com sucesso.");
      await fetchCalendarioLetivo();
      await fetchAlunosEFrequencia();
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Erro ao excluir evento.");
    }
  }

  useEffect(() => {
    fetchMinhasDisciplinas();
  }, [token]);

  useEffect(() => {
    if (!turmaProfessorId || !dataLancamento) return;
    fetchAlunosEFrequencia();
  }, [turmaProfessorId, dataLancamento]);

  useEffect(() => {
    if (!turmaProfessorId || !mesReferencia) return;
    fetchResumoMensal();
  }, [turmaProfessorId, mesReferencia]);

  useEffect(() => {
    if (!podeGerenciarCalendario || !mesReferencia) return;
    fetchCalendarioLetivo();
    fetchTurmasCalendario();
  }, [mesReferencia, turmaProfessorId, token, user?.role]);

  const totalPresentes = useMemo(() => {
    return alunos.filter(
      (aluno) => (lancamentos[aluno.id]?.status || "PRESENTE") === "PRESENTE"
    ).length;
  }, [alunos, lancamentos]);

  const totalFaltas = useMemo(() => {
    return alunos.filter(
      (aluno) => (lancamentos[aluno.id]?.status || "PRESENTE") === "FALTA"
    ).length;
  }, [alunos, lancamentos]);

  const totalJustificadas = useMemo(() => {
    return alunos.filter((aluno) => {
      const item = lancamentos[aluno.id];
      return item?.status === "FALTA" && item?.faltaJustificada;
    }).length;
  }, [alunos, lancamentos]);

  function obterFrequenciaMensalAluno(alunoId: string, dia: number) {
    return resumoMensal?.frequencias.find(
      (item) => item.alunoId === alunoId && item.dia === dia
    );
  }

  return (
    <section className="space-y-6">
      <PageHeader
        title="Frequência"
        description="Lance a frequência diária, gerencie dias sem aula, recessos e acompanhe o relatório mensal."
      />

      {user?.role !== "PROFESSOR" &&
      user?.role !== "SUPERUSUARIO" &&
      user?.role !== "ADMIN_ESCOLA" &&
      user?.role !== "GESTOR" &&
      user?.role !== "SECRETARIA" ? (
        <div className="card-base p-6">
          <p className="text-sm text-red-600">
            Esta página está liberada apenas para professor e gestão.
          </p>
        </div>
      ) : null}

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {success ? (
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          {success}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
        <div className="card-base p-5">
          <p className="text-sm text-slate-500">Disciplina</p>
          <h3 className="mt-2 text-xl font-bold text-slate-900">
            {disciplinaSelecionada?.disciplina || "-"}
          </h3>
        </div>

        <div className="card-base p-5">
          <p className="text-sm text-slate-500">Turma</p>
          <h3 className="mt-2 text-xl font-bold text-slate-900">
            {disciplinaSelecionada?.turma?.name || "-"}
          </h3>
        </div>

        <div className="card-base p-5">
          <p className="text-sm text-slate-500">Data</p>
          <h3 className="mt-2 text-xl font-bold text-slate-900">
            {formatarDataBrasileira(dataLancamento)}
          </h3>
        </div>

        <div className="card-base p-5">
          <p className="text-sm text-slate-500">Presentes</p>
          <h3 className="mt-2 text-xl font-bold text-blue-700">{totalPresentes}</h3>
        </div>

        <div className="card-base p-5">
          <p className="text-sm text-slate-500">Faltas</p>
          <h3 className="mt-2 text-xl font-bold text-red-700">
            {totalFaltas}
            {totalJustificadas > 0 ? ` (${totalJustificadas} justificadas)` : ""}
          </h3>
        </div>
      </div>

      <div className="card-base p-5">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="text-sm font-medium text-slate-700">
              Minha disciplina / turma
            </label>
            <select
              value={turmaProfessorId}
              onChange={(e) => setTurmaProfessorId(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
            >
              <option value="">Selecione</option>
              {minhasDisciplinas.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.disciplina} - {item.turma.name}
                  {item.turma.turno ? ` (${formatTurno(item.turma.turno)})` : ""}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm font-medium text-slate-700">Calendário</label>
            <input
              type="date"
              value={dataLancamento}
              onChange={(e) => setDataLancamento(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
            />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => marcarTodosComo("PRESENTE")}
            disabled={Boolean(bloqueioCalendario)}
            className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Marcar todos como presentes
          </button>

          <button
            type="button"
            onClick={() => marcarTodosComo("FALTA")}
            disabled={Boolean(bloqueioCalendario)}
            className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Marcar todos como falta
          </button>
        </div>
      </div>

      {bloqueioCalendario ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800">
          <p className="font-semibold">
            Esta data está bloqueada para lançamento de frequência.
          </p>
          <p className="mt-1">
            Tipo: <strong>{traduzirTipoCalendario(bloqueioCalendario.tipo)}</strong> |{" "}
            Abrangência:{" "}
            <strong>{traduzirAbrangencia(bloqueioCalendario.abrangencia)}</strong>
          </p>
          <p className="mt-1">
            Motivo: <strong>{bloqueioCalendario.motivo}</strong>
          </p>
        </div>
      ) : null}

      {podeGerenciarCalendario ? (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.05fr_0.95fr]">
          <div className="card-base p-6">
            <h3 className="text-lg font-bold text-slate-900">
              Dia sem aula / férias / recesso
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              Use este formulário para informar feriado, conselho de classe,
              recesso, férias ou outro motivo que impeça aulas.
            </p>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <div>
                <label className="text-sm font-medium text-slate-700">Tipo</label>
                <select
                  value={calendarioForm.tipo}
                  onChange={(e) =>
                    setCalendarioForm((prev) => ({
                      ...prev,
                      tipo: e.target.value as CalendarioForm["tipo"],
                    }))
                  }
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
                >
                  <option value="DIA_SEM_AULA">Dia sem aula / evento</option>
                  <option value="RECESSO">Recesso</option>
                  <option value="FERIAS">Férias</option>
                </select>
              </div>

              <div>
                <label className="text-sm font-medium text-slate-700">Abrangência</label>
                <select
                  value={calendarioForm.abrangencia}
                  onChange={(e) =>
                    setCalendarioForm((prev) => ({
                      ...prev,
                      abrangencia: e.target.value as CalendarioForm["abrangencia"],
                    }))
                  }
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
                >
                  <option value="ESCOLA_INTEIRA">Escola inteira</option>
                  <option value="APENAS_TURMA">Apenas turma selecionada</option>
                  <option value="ESCOLA_INTEIRA_EXCETO_TURMA">
                    Escola inteira, menos a turma selecionada
                  </option>
                </select>
              </div>

              <div>
                <label className="text-sm font-medium text-slate-700">Data inicial</label>
                <input
                  type="date"
                  value={calendarioForm.dataInicio}
                  onChange={(e) =>
                    setCalendarioForm((prev) => ({
                      ...prev,
                      dataInicio: e.target.value,
                    }))
                  }
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-slate-700">Data final</label>
                <input
                  type="date"
                  value={calendarioForm.dataFim}
                  onChange={(e) =>
                    setCalendarioForm((prev) => ({
                      ...prev,
                      dataFim: e.target.value,
                    }))
                  }
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
                />
              </div>

              <div className="md:col-span-2">
                <label className="text-sm font-medium text-slate-700">Motivo</label>
                <input
                  type="text"
                  value={calendarioForm.motivo}
                  onChange={(e) =>
                    setCalendarioForm((prev) => ({
                      ...prev,
                      motivo: e.target.value,
                    }))
                  }
                  placeholder="Ex.: Feriado, conselho de classe, reunião pedagógica, férias de julho..."
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
                />
              </div>
            </div>

            {calendarioForm.abrangencia === "APENAS_TURMA" && (
              <div className="mt-4">
                <label className="text-sm font-medium text-slate-700">
                  Turma do evento
                </label>
                <select
                  value={calendarioForm.turmaId}
                  onChange={(e) =>
                    setCalendarioForm((prev) => ({
                      ...prev,
                      turmaId: e.target.value,
                    }))
                  }
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
                >
                  <option value="">Selecione a turma</option>
                  {turmasCalendario.map((turma) => (
                    <option key={turma.id} value={turma.id}>
                      {turma.name}
                      {turma.turno ? ` (${formatTurno(turma.turno)})` : ""}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {calendarioForm.abrangencia === "ESCOLA_INTEIRA_EXCETO_TURMA" && (
              <div className="mt-4">
                <label className="text-sm font-medium text-slate-700">
                  Turmas em exceção
                </label>

                <div className="mt-2 grid gap-2 md:grid-cols-2">
                  {turmasCalendario.map((turma) => {
                    const checked = calendarioForm.turmasExcecaoIds.includes(turma.id);

                    return (
                      <label
                        key={turma.id}
                        className="flex items-center gap-3 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            setCalendarioForm((prev) => ({
                              ...prev,
                              turmasExcecaoIds: e.target.checked
                                ? [...prev.turmasExcecaoIds, turma.id]
                                : prev.turmasExcecaoIds.filter((id) => id !== turma.id),
                            }));
                          }}
                        />
                        <span>
                          {turma.name}
                          {turma.turno ? ` (${formatTurno(turma.turno)})` : ""}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="mt-5">
              <button
                type="button"
                onClick={handleSalvarCalendario}
                disabled={savingCalendario}
                className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {savingCalendario ? "Salvando evento..." : "Salvar evento do calendário"}
              </button>
            </div>
          </div>

          <div className="card-base p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  Eventos do mês
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  Lista de dias sem aula, recessos e férias do mês selecionado.
                </p>
              </div>

              <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                {eventosCalendario.length} item(ns)
              </div>
            </div>

            <div className="mt-5 space-y-3">
              {loadingCalendario ? (
                <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
                  Carregando calendário letivo...
                </div>
              ) : eventosCalendario.length === 0 ? (
                <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
                  Nenhum evento cadastrado neste mês.
                </div>
              ) : (
                eventosCalendario.map((evento) => (
                  <div
                    key={evento.id}
                    className="rounded-2xl border border-slate-200 bg-white p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">
                          {traduzirTipoCalendario(evento.tipo)}
                        </p>
                        <p className="mt-1 text-sm text-slate-500">
                          {traduzirAbrangencia(evento.abrangencia)}
                        </p>
                        <p className="mt-1 text-sm text-slate-700">
                          Motivo: <strong>{evento.motivo}</strong>
                        </p>
                        <p className="mt-1 text-sm text-slate-500">
                          {formatarDataBrasileira(evento.dataInicio)} até{" "}
                          {formatarDataBrasileira(evento.dataFim)}
                        </p>
                        {evento.abrangencia === "APENAS_TURMA" && evento.turma ? (
                          <p className="mt-1 text-sm text-slate-500">
                            Turma: {evento.turma.name}
                            {evento.turma.turno ? ` (${formatTurno(evento.turma.turno)})` : ""}
                          </p>
                        ) : null}

                        {evento.abrangencia === "ESCOLA_INTEIRA_EXCETO_TURMA" &&
                        evento.turmasExcecao &&
                        evento.turmasExcecao.length > 0 ? (
                          <div className="mt-2">
                            <p className="text-sm text-slate-500">Turmas em exceção:</p>
                            <div className="mt-1 flex flex-wrap gap-2">
                              {evento.turmasExcecao.map((item) => (
                                <span
                                  key={item.id}
                                  className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700"
                                >
                                  {item.turma?.name || "Turma"}
                                  {item.turma?.turno ? ` (${formatTurno(item.turma.turno)})` : ""}
                                </span>
                              ))}
                            </div>
                          </div>
                        ) : null}
                      </div>

                      <button
                        type="button"
                        onClick={() => handleExcluirEvento(evento.id)}
                        className="rounded-xl bg-red-600 px-4 py-2 text-sm font-medium text-white hover:opacity-90"
                      >
                        Excluir
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      ) : null}

      <div className="card-base overflow-hidden">
        {loading ? (
          <div className="p-6">
            <p className="text-sm text-slate-500">Carregando...</p>
          </div>
        ) : alunos.length === 0 ? (
          <div className="p-6">
            <p className="text-sm text-slate-500">
              Nenhum aluno encontrado para esta disciplina/turma.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px] border-collapse">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-4 text-left text-sm font-semibold text-slate-700">
                    Marcação
                  </th>
                  <th className="px-4 py-4 text-left text-sm font-semibold text-slate-700">
                    Aluno
                  </th>
                  <th className="px-4 py-4 text-left text-sm font-semibold text-slate-700">
                    Matrícula
                  </th>
                  <th className="px-4 py-4 text-left text-sm font-semibold text-slate-700">
                    Status do aluno
                  </th>
                  {podeJustificarFalta ? (
                    <th className="px-4 py-4 text-left text-sm font-semibold text-slate-700">
                      Falta justificada
                    </th>
                  ) : null}
                  <th className="px-4 py-4 text-left text-sm font-semibold text-slate-700">
                    Observação
                  </th>
                </tr>
              </thead>

              <tbody>
                {alunos.map((aluno) => {
                  const item = lancamentos[aluno.id] || {
                    alunoId: aluno.id,
                    status: "PRESENTE" as const,
                    faltaJustificada: false,
                    observacao: "",
                  };

                  return (
                    <tr
                      key={aluno.id}
                      className={`border-t border-slate-200 ${obterClassesLinha(item)}`}
                    >
                      <td className="px-4 py-4">
                        <button
                          type="button"
                          onClick={() => alternarPresencaFalta(aluno.id)}
                          disabled={
                            Boolean(bloqueioCalendario) ||
                            (user?.role === "PROFESSOR" && item.faltaJustificada)
                          }
                          className={`inline-flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold ${obterClassesMarcador(
                            item
                          )} disabled:cursor-not-allowed disabled:opacity-60`}
                          title={
                            bloqueioCalendario
                              ? "Data bloqueada no calendário letivo"
                              : user?.role === "PROFESSOR" && item.faltaJustificada
                                ? "Registro bloqueado por falta justificada"
                                : "Clique para alternar presença e falta"
                          }
                        >
                          {obterTextoMarcador(item)}
                        </button>
                      </td>

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
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-red-100 text-red-700"
                          }`}
                        >
                          {String(aluno.status || "").toUpperCase() || "SEM STATUS"}
                        </span>
                      </td>

                      {podeJustificarFalta ? (
                        <td className="px-4 py-4">
                          <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                            <input
                              type="checkbox"
                              checked={item.faltaJustificada}
                              disabled={item.status !== "FALTA" || Boolean(bloqueioCalendario)}
                              onChange={() => handleAlternarFaltaJustificada(aluno.id)}
                            />
                            Justificada
                          </label>
                        </td>
                      ) : null}

                      <td className="px-4 py-4">
                        <input
                          type="text"
                          value={item.observacao}
                          onChange={(e) =>
                            atualizarObservacao(aluno.id, e.target.value)
                          }
                          placeholder="Opcional"
                          disabled={
                            Boolean(bloqueioCalendario) ||
                            (user?.role === "PROFESSOR" && item.faltaJustificada)
                          }
                          className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:opacity-70"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card-base p-5">
        <button
          type="button"
          onClick={handleSalvarFrequencia}
          disabled={saving || loading || !alunos.length || Boolean(bloqueioCalendario)}
          className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? "Salvando..." : "Salvar frequência"}
        </button>
      </div>

      <div className="card-base p-5">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:items-end">
          <div>
            <h3 className="text-lg font-bold text-slate-900">
              Relatório mensal da turma
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              Abaixo você visualiza os registros do mês selecionado para a turma e disciplina escolhidas.
            </p>
          </div>

          <div>
            <label className="text-sm font-medium text-slate-700">Mês</label>
            <input
              type="month"
              value={mesReferencia}
              onChange={(e) => setMesReferencia(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
            />
          </div>
        </div>

        <div className="mt-5 overflow-x-auto">
          {loadingResumoMensal ? (
            <div className="rounded-xl border border-slate-200 p-4 text-sm text-slate-500">
              Carregando relatório mensal...
            </div>
          ) : !resumoMensal || resumoMensal.alunos.length === 0 ? (
            <div className="rounded-xl border border-slate-200 p-4 text-sm text-slate-500">
              Nenhum dado mensal encontrado para esta turma/disciplina.
            </div>
          ) : (
            <table className="w-full min-w-[1500px] border-collapse">
              <thead>
                <tr className="bg-slate-50">
                  <th className="sticky left-0 z-10 bg-slate-50 px-4 py-3 text-left text-sm font-semibold text-slate-700">
                    Aluno
                  </th>

                  {resumoMensal.dias.map((dia) => (
                    <th
                      key={dia}
                      className="px-2 py-3 text-center text-xs font-semibold text-slate-700"
                    >
                      {dia}
                    </th>
                  ))}

                  <th className="px-4 py-3 text-center text-xs font-semibold text-slate-700">
                    Pres.
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-slate-700">
                    Falt.
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-slate-700">
                    % Pres.
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-slate-700">
                    % Falt.
                  </th>
                </tr>
              </thead>

              <tbody>
                {resumoMensal.alunos.map((aluno) => {
                  const resumoAluno = calcularResumoAlunoNoMes(
                    aluno.id,
                    resumoMensal.frequencias
                  );

                  return (
                    <tr key={aluno.id} className="border-t border-slate-200">
                      <td className="sticky left-0 bg-white px-4 py-3 text-sm font-medium text-slate-900">
                        <div className="flex flex-col">
                          <span>{aluno.name}</span>
                          <span className="text-xs text-slate-500">
                            {aluno.matricula || "Sem matrícula"}
                          </span>
                        </div>
                      </td>

                      {resumoMensal.dias.map((dia) => {
                        const item = obterFrequenciaMensalAluno(aluno.id, dia);

                        return (
                          <td key={`${aluno.id}-${dia}`} className="px-2 py-3">
                            <div
                              title={
                                item
                                  ? item.status === "FALTA" && item.faltaJustificada
                                    ? "Falta justificada"
                                    : item.status === "FALTA"
                                      ? "Falta"
                                      : "Presença"
                                  : "Sem lançamento"
                              }
                              className={`mx-auto flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${obterClassesCelulaMensal(
                                item
                              )}`}
                            >
                              {obterTextoCelulaMensal(item)}
                            </div>
                          </td>
                        );
                      })}

                      <td className="px-4 py-3 text-center text-sm font-semibold text-blue-700">
                        {resumoAluno.totalPresencas}
                      </td>
                      <td className="px-4 py-3 text-center text-sm font-semibold text-red-700">
                        {resumoAluno.totalFaltas}
                      </td>
                      <td className="px-4 py-3 text-center text-sm font-semibold text-slate-700">
                        {String(resumoAluno.percentualPresenca).replace(".", ",")}%
                      </td>
                      <td className="px-4 py-3 text-center text-sm font-semibold text-slate-700">
                        {String(resumoAluno.percentualFalta).replace(".", ",")}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="card-base p-5">
        <h3 className="text-sm font-bold text-slate-900">Legenda</h3>

        <div className="mt-4 flex flex-wrap gap-4">
          <div className="flex items-center gap-2">
            <span className="h-4 w-4 rounded bg-blue-100" />
            <span className="text-sm text-slate-700">Azul: presente</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="h-4 w-4 rounded bg-red-100" />
            <span className="text-sm text-slate-700">Vermelho: falta</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="h-4 w-4 rounded bg-emerald-100" />
            <span className="text-sm text-slate-700">
              Verde: falta justificada
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
              •
            </span>
            <span className="text-sm text-slate-700">• = presença</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-xs font-bold text-white">
              F
            </span>
            <span className="text-sm text-slate-700">F = falta</span>
          </div>
        </div>
      </div>
    </section>
  );
}

export default function FrequenciaPage() {
  const { user } = useAuth();

  if (user?.role === "ALUNO" || user?.role === "RESPONSAVEL") {
    return <MinhaFrequenciaAlunoResponsavel />;
  }

  return <ProfessorGestaoFrequencia />;
}
