"use client";

import { useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/ui/page-header";
import { useAuth } from "@/context/auth-context";
import { apiUrl } from "@/lib/api";

type Disciplina = {
  id: string;
  disciplina: string;
  professor?: {
    id?: string;
    name: string;
  };
  turma: {
    name: string;
    turno?: string | null;
  };
};

type AulaPlanejada = {
  aulaId: string;
  data: string;
  horaInicio: string;
  horaFim: string;
  bloqueado: boolean;
  planejamento: {
    conteudo?: string | null;
    objetivo?: string | null;
    metodologia?: string | null;
    atividades?: string | null;
  } | null;
};

type PlanoResponse = {
  turmaProfessor: Disciplina;
  aulas: AulaPlanejada[];
};

type AulaAluno = {
  id: string;
  data: string;
  conteudo?: string | null;
  objetivo?: string | null;
  metodologia?: string | null;
  atividades?: string | null;
  planejado: boolean;
  aula: {
    horaInicio: string;
    horaFim: string;
  };
  turmaProfessor: {
    disciplina: string;
    professor?: {
      name: string;
    };
    turma: {
      name: string;
      turno?: string | null;
    };
  };
};

type AlunoResponsavel = {
  id: string;
  name: string;
  turma?: {
    id: string;
    name: string;
    turno?: string | null;
  } | null;
};

type PlanejamentoForm = {
  aulaId: string;
  data: string;
  conteudo: string;
  objetivo: string;
  metodologia: string;
  atividades: string;
};

const hoje = new Date();
const MES_ATUAL = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(
  2,
  "0",
)}`;
const DATA_ATUAL = `${MES_ATUAL}-${String(hoje.getDate()).padStart(2, "0")}`;

const DIAS_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"];

function formatarData(data: string) {
  const [ano, mes, dia] = data.slice(0, 10).split("-");
  return `${dia}/${mes}/${ano}`;
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function vazio(valor?: string | null) {
  return valor || "";
}

function texto(valor?: string | null) {
  return valor?.trim() || "-";
}

function temPlanejamento(item?: {
  conteudo?: string | null;
  objetivo?: string | null;
  metodologia?: string | null;
  atividades?: string | null;
}) {
  return Boolean(
    item?.conteudo?.trim() ||
      item?.objetivo?.trim() ||
      item?.metodologia?.trim() ||
      item?.atividades?.trim(),
  );
}

function montarDiasDoMes(mesReferencia: string) {
  const [ano, mes] = mesReferencia.split("-").map(Number);
  const totalDias = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  const primeiroDiaSemana = new Date(Date.UTC(ano, mes - 1, 1)).getUTCDay();
  const dias: Array<string | null> = Array.from(
    { length: primeiroDiaSemana },
    () => null,
  );

  for (let dia = 1; dia <= totalDias; dia += 1) {
    dias.push(`${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`);
  }

  return dias;
}

export default function PlanejamentoPage() {
  const { token, user, selectedSchool } = useAuth();

  const [disciplinas, setDisciplinas] = useState<Disciplina[]>([]);
  const [professorFiltroId, setProfessorFiltroId] = useState("");
  const [turmaProfessorId, setTurmaProfessorId] = useState("");
  const [mes, setMes] = useState(MES_ATUAL);
  const [dataSelecionada, setDataSelecionada] = useState(DATA_ATUAL);
  const [plano, setPlano] = useState<PlanoResponse | null>(null);
  const [planejamentos, setPlanejamentos] = useState<Record<string, PlanejamentoForm>>({});
  const [aulasAluno, setAulasAluno] = useState<AulaAluno[]>([]);
  const [conteudosAluno, setConteudosAluno] = useState<AulaAluno[]>([]);
  const [alunosResponsavel, setAlunosResponsavel] = useState<AlunoResponsavel[]>([]);
  const [alunoResponsavelId, setAlunoResponsavelId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const podeEditar = user?.role === "PROFESSOR";
  const podeGerir =
    user?.role === "SUPERUSUARIO" ||
    user?.role === "ADMIN_ESCOLA" ||
    user?.role === "GESTOR" ||
    user?.role === "SECRETARIA";
  const podeVerAluno = user?.role === "ALUNO" || user?.role === "RESPONSAVEL";
  const isResponsavel = user?.role === "RESPONSAVEL";
  const tituloPagina = podeVerAluno ? "Conteúdo do dia" : "Planejamento";
  const descricaoPagina = podeVerAluno
    ? "Consulte apenas os conteúdos planejados e liberados para o dia."
    : "Selecione o mês, clique no dia e registre o planejamento da aula.";

  const ano = Number(mes.slice(0, 4));
  const diasDoMes = useMemo(() => montarDiasDoMes(mes), [mes]);
  const aulasPlanejaveis = useMemo(
    () => (plano?.aulas || []).filter((aula) => !aula.bloqueado),
    [plano],
  );
  const aulasDoDia = useMemo(
    () => aulasPlanejaveis.filter((aula) => aula.data === dataSelecionada),
    [aulasPlanejaveis, dataSelecionada],
  );
  const aulasAlunoDoDia = useMemo(
    () => aulasAluno.filter((aula) => aula.data === dataSelecionada),
    [aulasAluno, dataSelecionada],
  );
  const professoresPlanejamento = useMemo(() => {
    const mapa = new Map<string, { id: string; name: string }>();

    disciplinas.forEach((item) => {
      const professorId = item.professor?.id;
      const professorName = item.professor?.name?.trim();

      if (!professorId || !professorName) return;
      mapa.set(professorId, { id: professorId, name: professorName });
    });

    return Array.from(mapa.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [disciplinas]);
  const disciplinasFiltradasPorProfessor = useMemo(() => {
    if (!podeGerir || !professorFiltroId) return [];

    return disciplinas.filter((item) => item.professor?.id === professorFiltroId);
  }, [disciplinas, podeGerir, professorFiltroId]);
  const conteudosAlunoDoDia = useMemo(() => conteudosAluno, [conteudosAluno]);
  const aulaSelecionada = useMemo(
    () =>
      aulasDoDia.find((aula) => temPlanejamento(aula.planejamento || undefined)) ||
      aulasDoDia[0] ||
      null,
    [aulasDoDia],
  );
  const chaveSelecionada = aulaSelecionada
    ? `${aulaSelecionada.aulaId}|${aulaSelecionada.data}`
    : `dia|${dataSelecionada}`;
  const planejamentoSelecionado = planejamentos[chaveSelecionada] || {
    aulaId: aulaSelecionada?.aulaId || "",
    data: dataSelecionada,
    conteudo: vazio(aulaSelecionada?.planejamento?.conteudo),
    objetivo: vazio(aulaSelecionada?.planejamento?.objetivo),
    metodologia: vazio(aulaSelecionada?.planejamento?.metodologia),
    atividades: vazio(aulaSelecionada?.planejamento?.atividades),
  };

  function authHeaders(extra?: Record<string, string>) {
    return {
      Authorization: `Bearer ${token}`,
      ...(selectedSchool?.id ? { "x-school-id": selectedSchool.id } : {}),
      ...(extra || {}),
    };
  }

  async function carregarDisciplinas() {
    if (!token || (!podeEditar && !podeGerir)) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError("");

      const response = await fetch(apiUrl("/conteudo-do-dia/disciplinas"), {
        headers: authHeaders(),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Erro ao carregar turmas.");
      }

      const lista = Array.isArray(data) ? data : [];
      setDisciplinas(lista);
      if (podeGerir) {
        const primeiroProfessorId = lista[0]?.professor?.id || "";
        setProfessorFiltroId(primeiroProfessorId);
        setTurmaProfessorId(
          lista.find((item) => item.professor?.id === primeiroProfessorId)?.id || "",
        );
      } else {
        setTurmaProfessorId(lista[0]?.id || "");
      }
    } catch (err) {
      setDisciplinas([]);
      setProfessorFiltroId("");
      setTurmaProfessorId("");
      setError(getErrorMessage(err, "Erro ao carregar turmas."));
    } finally {
      setLoading(false);
    }
  }

  async function carregarPlano() {
    if (!token || !turmaProfessorId || (!podeEditar && !podeGerir)) return;

    try {
      setLoading(true);
      setError("");

      const params = new URLSearchParams({
        turmaProfessorId,
        ano: String(ano),
      });

      const response = await fetch(apiUrl(`/conteudo-do-dia/plano?${params}`), {
        headers: authHeaders(),
      });
      const data: PlanoResponse = await response.json();

      if (!response.ok) {
        throw new Error((data as any).message || "Erro ao carregar planejamento.");
      }

      const mapa: Record<string, PlanejamentoForm> = {};

      data.aulas.forEach((aula) => {
        mapa[`${aula.aulaId}|${aula.data}`] = {
          aulaId: aula.aulaId,
          data: aula.data,
          conteudo: vazio(aula.planejamento?.conteudo),
          objetivo: vazio(aula.planejamento?.objetivo),
          metodologia: vazio(aula.planejamento?.metodologia),
          atividades: vazio(aula.planejamento?.atividades),
        };
      });

      setPlano(data);
      setPlanejamentos(mapa);
    } catch (err) {
      setPlano(null);
      setPlanejamentos({});
      setError(getErrorMessage(err, "Erro ao carregar planejamento."));
    } finally {
      setLoading(false);
    }
  }

  async function carregarCalendarioAluno() {
    if (!token || !podeVerAluno) return;

    try {
      setLoading(true);
      setError("");

      const params = new URLSearchParams({ mes });
      if (isResponsavel && alunoResponsavelId) {
        params.set("alunoId", alunoResponsavelId);
      }

      const response = await fetch(apiUrl(`/conteudo-do-dia/meu-calendario?${params}`), {
        headers: authHeaders(),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Erro ao carregar planejamento.");
      }

      setAulasAluno(Array.isArray(data) ? data : []);
    } catch (err) {
      setAulasAluno([]);
      setError(getErrorMessage(err, "Erro ao carregar planejamento."));
    } finally {
      setLoading(false);
    }
  }

  async function carregarConteudosAlunoDoDia() {
    if (!token || !podeVerAluno) return;

    try {
      setLoading(true);
      setError("");

      const params = new URLSearchParams({ data: dataSelecionada });
      if (isResponsavel && alunoResponsavelId) {
        params.set("alunoId", alunoResponsavelId);
      }

      const response = await fetch(apiUrl(`/conteudo-do-dia/meus-conteudos?${params}`), {
        headers: authHeaders(),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Erro ao carregar conteúdos do dia.");
      }

      setConteudosAluno(Array.isArray(data) ? data : []);
    } catch (err) {
      setConteudosAluno([]);
      setError(getErrorMessage(err, "Erro ao carregar conteúdos do dia."));
    } finally {
      setLoading(false);
    }
  }

  async function carregarAlunosResponsavel() {
    if (!token || !isResponsavel) return;

    try {
      const response = await fetch(apiUrl("/notas/responsavel"), {
        headers: authHeaders(),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Erro ao carregar alunos vinculados.");
      }

      const lista = Array.isArray(data) ? data : [];
      setAlunosResponsavel(lista);
      setAlunoResponsavelId((atual) => atual || lista[0]?.id || "");
    } catch (err) {
      setAlunosResponsavel([]);
      setError(getErrorMessage(err, "Erro ao carregar alunos vinculados."));
    }
  }

  useEffect(() => {
    carregarDisciplinas();
  }, [token, user?.id, podeEditar, podeGerir]);

  useEffect(() => {
    if (!podeGerir) return;

    setProfessorFiltroId((atual) => {
      if (atual && professoresPlanejamento.some((professor) => professor.id === atual)) {
        return atual;
      }

      return professoresPlanejamento[0]?.id || "";
    });
  }, [podeGerir, professoresPlanejamento]);

  useEffect(() => {
    if (!podeGerir) return;

    setTurmaProfessorId((atual) => {
      if (
        atual &&
        disciplinasFiltradasPorProfessor.some((item) => item.id === atual)
      ) {
        return atual;
      }

      return disciplinasFiltradasPorProfessor[0]?.id || "";
    });
  }, [disciplinasFiltradasPorProfessor, podeGerir]);

  useEffect(() => {
    carregarPlano();
  }, [token, turmaProfessorId, ano, podeEditar, podeGerir]);

  useEffect(() => {
    carregarCalendarioAluno();
  }, [token, mes, podeVerAluno, alunoResponsavelId]);

  useEffect(() => {
    carregarConteudosAlunoDoDia();
  }, [token, dataSelecionada, podeVerAluno, alunoResponsavelId]);

  useEffect(() => {
    carregarAlunosResponsavel();
  }, [token, isResponsavel]);

  function mudarMes(valor: string) {
    setMes(valor);
    setDataSelecionada(`${valor}-01`);
    setSuccess("");
  }

  function atualizarPlanejamento(key: string, campo: keyof PlanejamentoForm, valor: string) {
    setPlanejamentos((atual) => ({
      ...atual,
      [key]: {
        ...atual[key],
        aulaId: aulaSelecionada?.aulaId || atual[key]?.aulaId || "",
        data: dataSelecionada,
        [campo]: valor,
      },
    }));
  }

  function statusDia(data: string) {
    if (podeVerAluno) {
      const aulas = aulasAluno.filter((aula) => aula.data === data);
      if (!aulas.length) return "vazio";
      return aulas.some((aula) => aula.planejado || temPlanejamento(aula))
        ? "planejado"
        : "vazio";
    }

    const aulas = aulasPlanejaveis.filter((aula) => aula.data === data);
    if (!aulas.length) {
      return "vazio";
    }

    return aulas.some((aula) => {
      const item = planejamentos[`${aula.aulaId}|${aula.data}`];
      return temPlanejamento(item);
    })
      ? "planejado"
      : "pendente";
  }

  function classeDia(data: string) {
    const status = statusDia(data);
    const selecionado = data === dataSelecionada;

    if (status === "planejado") {
      return selecionado
        ? "border-emerald-900 bg-emerald-600 text-white shadow-sm ring-2 ring-emerald-200"
        : "border-emerald-600 bg-emerald-500 text-white hover:bg-emerald-600";
    }

    if (status === "pendente") {
      return selecionado
        ? "border-blue-900 bg-blue-600 text-white shadow-sm ring-2 ring-blue-200"
        : "border-blue-600 bg-blue-500 text-white hover:bg-blue-600";
    }

    return selecionado
      ? "border-slate-500 bg-slate-200 text-slate-900"
      : "border-slate-200 bg-white text-slate-400 hover:bg-slate-50";
  }

  async function salvarPlanejamento() {
    if (!token || !turmaProfessorId || !podeEditar) return;

    try {
      setSaving(true);
      setError("");
      setSuccess("");

      const item = planejamentoSelecionado;

      const response = await fetch(apiUrl("/conteudo-do-dia/planejamento-diario"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          turmaProfessorId,
          data: dataSelecionada,
          conteudo: item?.conteudo || "",
          objetivo: item?.objetivo || "",
          metodologia: item?.metodologia || "",
          atividades: item?.atividades || "",
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Erro ao salvar planejamento.");
      }

      setSuccess("Planejamento salvo com sucesso.");
      await carregarPlano();
    } catch (err) {
      setError(getErrorMessage(err, "Erro ao salvar planejamento."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-6">
      <PageHeader
        title={tituloPagina}
        description={descricaoPagina}
      />

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {success ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {success}
        </div>
      ) : null}

      <div className="card-base p-5">
        <div className="grid gap-4 md:grid-cols-[1fr_180px] md:items-end">
          {!podeVerAluno ? (
            podeGerir ? (
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="text-sm font-medium text-slate-700">
                    Professor
                  </label>
                  <select
                    value={professorFiltroId}
                    onChange={(event) => setProfessorFiltroId(event.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
                  >
                    <option value="">Selecione</option>
                    {professoresPlanejamento.map((professor) => (
                      <option key={professor.id} value={professor.id}>
                        {professor.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700">
                    Série / turma
                  </label>
                  <select
                    value={turmaProfessorId}
                    onChange={(event) => setTurmaProfessorId(event.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
                  >
                    <option value="">Selecione</option>
                    {disciplinasFiltradasPorProfessor.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.turma.name}
                        {item.turma.turno ? ` - ${item.turma.turno}` : ""}
                        {item.disciplina ? ` - ${item.disciplina}` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ) : (
              <div>
                <label className="text-sm font-medium text-slate-700">
                  Disciplina / turma
                </label>
                <select
                  value={turmaProfessorId}
                  onChange={(event) => setTurmaProfessorId(event.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
                >
                  <option value="">Selecione</option>
                  {disciplinas.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.disciplina} - {item.turma.name}
                      {item.professor?.name ? ` - ${item.professor.name}` : ""}
                    </option>
                  ))}
                </select>
              </div>
            )
          ) : (
            <div>
              {isResponsavel ? (
                <>
                  <label className="text-sm font-medium text-slate-700">
                    Aluno
                  </label>
                  <select
                    value={alunoResponsavelId}
                    onChange={(event) => setAlunoResponsavelId(event.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
                  >
                    <option value="">Selecione</option>
                    {alunosResponsavel.map((aluno) => (
                      <option key={aluno.id} value={aluno.id}>
                        {aluno.name}
                        {aluno.turma?.name ? ` - ${aluno.turma.name}` : ""}
                      </option>
                    ))}
                  </select>
                </>
              ) : (
                <>
                  <p className="text-sm font-medium text-slate-700">
                    Conteúdo diário
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    Selecione um dia para ver apenas os conteúdos já planejados.
                  </p>
                </>
              )}
            </div>
          )}

          <div>
            <label className="text-sm font-medium text-slate-700">Mês e ano</label>
            <input
              type="month"
              value={mes}
              onChange={(event) => mudarMes(event.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
            />
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
        <div className="card-base p-5">
          {podeVerAluno ? (
            <div className="mb-4 flex flex-wrap items-center gap-3 text-xs font-semibold">
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-700">
                Verde: conteúdo disponível no dia
              </span>
            </div>
          ) : (
            <div className="mb-4 flex flex-wrap items-center gap-3 text-xs font-semibold">
              <span className="rounded-full bg-blue-50 px-3 py-1 text-blue-700">
                Azul: não planejado
              </span>
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-700">
                Verde: planejado
              </span>
            </div>
          )}

          <div className="grid grid-cols-7 gap-2 text-center text-xs font-semibold text-slate-500">
            {DIAS_SEMANA.map((dia) => (
              <div key={dia}>{dia}</div>
            ))}
          </div>

          <div className="mt-2 grid grid-cols-7 gap-2">
            {diasDoMes.map((data, index) =>
              data ? (
                <button
                  key={data}
                  type="button"
                  onClick={() => {
                    setDataSelecionada(data);
                    setSuccess("");
                  }}
                  className={`aspect-square rounded-lg border text-sm font-bold transition ${classeDia(
                    data,
                  )}`}
                >
                  {Number(data.slice(8, 10))}
                </button>
              ) : (
                <div key={`empty-${index}`} className="aspect-square" />
              ),
            )}
          </div>
        </div>

        <div className="card-base overflow-hidden">
          <div className="border-b border-slate-200 bg-slate-50 px-5 py-4">
            <h3 className="font-bold text-slate-900">
              {formatarData(dataSelecionada)}
            </h3>
          </div>

          {loading ? (
            <div className="p-6 text-sm text-slate-500">Carregando...</div>
          ) : podeVerAluno ? (
            <div className="divide-y divide-slate-200">
              {conteudosAlunoDoDia.length === 0 ? (
                <div className="p-6 text-sm text-slate-500">
                  Nenhum conteúdo planejado foi liberado para este dia.
                </div>
              ) : (
                conteudosAlunoDoDia.map((aula) => (
                  <div key={aula.id} className="p-5">
                    <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="font-bold text-slate-900">
                          {aula.turmaProfessor.disciplina}
                        </p>
                        <p className="text-sm text-slate-500">
                          {aula.turmaProfessor.professor?.name || "Professor"}{" "}
                          • {aula.aula.horaInicio} às {aula.aula.horaFim}
                        </p>
                      </div>
                      <span className="w-fit rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                        Conteúdo disponível
                      </span>
                    </div>

                    <div className="mt-4">
                      <p className="text-sm font-semibold text-slate-900">
                        Conteúdo
                      </p>
                      <p className="mt-1 text-sm leading-6 text-slate-600">
                        {texto(aula.conteudo)}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          ) : !turmaProfessorId ? (
            <div className="p-6 text-sm text-slate-500">
              Selecione uma disciplina/turma.
            </div>
          ) : !podeEditar && aulasDoDia.length === 0 ? (
            <div className="p-6 text-sm text-slate-500">
              Não há aula desta disciplina/turma no dia selecionado.
            </div>
          ) : (
            <div className="divide-y divide-slate-200">
              {[aulaSelecionada].map((aula) => {
                const key = chaveSelecionada;
                const item = planejamentoSelecionado;

                return (
                  <div key={key} className="p-5">
                    <p className="mb-4 text-sm font-bold text-slate-900">
                      {aula
                        ? aula.horaInicio === "00:00" && aula.horaFim === "00:00"
                          ? "Dia selecionado"
                          : `${aula.horaInicio} às ${aula.horaFim}`
                        : "Dia selecionado"}
                    </p>

                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <label className="text-sm font-medium text-slate-700">
                          Conteúdo
                        </label>
                        <textarea
                          value={item?.conteudo || ""}
                          onChange={(event) =>
                            atualizarPlanejamento(key, "conteudo", event.target.value)
                          }
                          disabled={!podeEditar}
                          className="mt-1 h-24 w-full rounded-xl border border-slate-300 px-3 py-2 disabled:bg-slate-100"
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium text-slate-700">
                          Objetivo
                        </label>
                        <textarea
                          value={item?.objetivo || ""}
                          onChange={(event) =>
                            atualizarPlanejamento(key, "objetivo", event.target.value)
                          }
                          disabled={!podeEditar}
                          className="mt-1 h-24 w-full rounded-xl border border-slate-300 px-3 py-2 disabled:bg-slate-100"
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium text-slate-700">
                          Metodologia
                        </label>
                        <textarea
                          value={item?.metodologia || ""}
                          onChange={(event) =>
                            atualizarPlanejamento(
                              key,
                              "metodologia",
                              event.target.value,
                            )
                          }
                          disabled={!podeEditar}
                          className="mt-1 h-24 w-full rounded-xl border border-slate-300 px-3 py-2 disabled:bg-slate-100"
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium text-slate-700">
                          Observação
                        </label>
                        <textarea
                          value={item?.atividades || ""}
                          onChange={(event) =>
                            atualizarPlanejamento(
                              key,
                              "atividades",
                              event.target.value,
                            )
                          }
                          disabled={!podeEditar}
                          className="mt-1 h-24 w-full rounded-xl border border-slate-300 px-3 py-2 disabled:bg-slate-100"
                        />
                      </div>
                    </div>
                  </div>
                );
              })}

              {podeEditar ? (
                <div className="p-5">
                  <button
                    type="button"
                    onClick={salvarPlanejamento}
                    disabled={saving}
                    className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {saving ? "Salvando..." : "Salvar planejamento"}
                  </button>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}


