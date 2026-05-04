"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/ui/page-header";
import { useAuth } from "@/context/auth-context";
import { apiUrl } from "@/lib/api";
import {
  buildProfessorColorMap,
  getProfessorColorStyle,
} from "@/lib/professor-colors";
import { formatTurno } from "@/lib/turno";

type Turma = {
  id: string;
  name: string;
  turno?: string | null;
};

type Professor = {
  id: string;
  name: string;
  email: string;
  role: string;
};

type Disciplina = {
  id: string;
  turmaId: string;
  serie: string;
  nome: string;
  cargaHoraria: number;
  turma?: Turma | null;
};

type Modulacao = {
  id: string;
  turmaId: string;
  professorId: string;
  disciplina: string;
  disciplinaId?: string | null;
  cargaHoraria: number;
  professor?: {
    id: string;
    name: string;
    email?: string | null;
  };
  turma?: Turma | null;
};

type TurmaDraft = {
  selected: boolean;
  cargaHoraria: string;
  disciplinaId: string;
  conflitoCom?: string;
  modulaçãoId?: string;
};

type GradeSérieItem = {
  modulaçãoId: string;
  turmaId: string;
  turmaNome: string;
  professorId: string;
  disciplina: string;
  professorNome: string;
  cargaHoraria: number;
};

function normalizeText(value?: string | null) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();
}

function buildGroupKey(professorId?: string | null, disciplina?: string | null) {
  return `${String(professorId || "").trim()}::${normalizeText(disciplina)}`;
}

function getTurnoTabelaLabel(turno?: string | null) {
  const normalized = normalizeText(turno);

  if (normalized === "MANHA") return "MATUTINO";
  if (normalized === "TARDE") return "VESPERTINO";
  if (normalized === "NOITE") return "NOTURNO";

  return "";
}

function formatProfessorTabelaNome(name?: string | null) {
  const tokens = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (tokens.length === 0) return "SEM";

  return String(tokens[0]).toUpperCase();
}

export default function CadastroTurmaPage() {
  const { token, selectedSchool } = useAuth();

  const [turmas, setTurmas] = useState<Turma[]>([]);
  const [professores, setProfessores] = useState<Professor[]>([]);
  const [disciplinas, setDisciplinas] = useState<Disciplina[]>([]);
  const [modulações, setModulacoes] = useState<Modulacao[]>([]);

  const [loadingTurmas, setLoadingTurmas] = useState(true);
  const [loadingProfessores, setLoadingProfessores] = useState(true);
  const [loadingDisciplinas, setLoadingDisciplinas] = useState(true);
  const [loadingModulacoes, setLoadingModulacoes] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showModulacoesCadastradas, setShowModulacoesCadastradas] = useState(false);

  const [selectedProfessorId, setSelectedProfessorId] = useState("");
  const [selectedDisciplinaNome, setSelectedDisciplinaNome] = useState("");
  const [turmaDrafts, setTurmaDrafts] = useState<Record<string, TurmaDraft>>({});

  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const requestHeaders = useMemo(
    () => ({
      Authorization: `Bearer ${token}`,
      ...(selectedSchool?.id ? { "x-school-id": selectedSchool.id } : {}),
    }),
    [selectedSchool?.id, token],
  );

  const turmasById = useMemo(
    () => new Map(turmas.map((turma) => [turma.id, turma])),
    [turmas],
  );

  const selectedProfessor = useMemo(
    () => professores.find((item) => item.id === selectedProfessorId) || null,
    [professores, selectedProfessorId],
  );

  const disciplinaOptions = useMemo(() => {
    const grouped = new Map<
      string,
      {
        nome: string;
        totalTurmas: number;
      }
    >();

    disciplinas.forEach((disciplina) => {
      const key = normalizeText(disciplina.nome);
      const current = grouped.get(key);

      if (current) {
        current.totalTurmas += 1;
        return;
      }

      grouped.set(key, {
        nome: disciplina.nome,
        totalTurmas: 1,
      });
    });

    return Array.from(grouped.values()).sort((a, b) =>
      a.nome.localeCompare(b.nome, "pt-BR"),
    );
  }, [disciplinas]);

  const disciplinasDaSelecao = useMemo(() => {
    if (!selectedDisciplinaNome) return [];

    return disciplinas
      .filter(
        (disciplina) =>
          normalizeText(disciplina.nome) === normalizeText(selectedDisciplinaNome),
      )
      .sort((a, b) => {
        const turmaA = turmasById.get(a.turmaId)?.name || a.turma?.name || "";
        const turmaB = turmasById.get(b.turmaId)?.name || b.turma?.name || "";
        return turmaA.localeCompare(turmaB, "pt-BR");
      });
  }, [disciplinas, selectedDisciplinaNome, turmasById]);

  const disciplinasDisponiveisDaSelecao = useMemo(() => {
    if (!selectedDisciplinaNome) return [];

    return disciplinasDaSelecao.filter((disciplina) => {
      const modulaçõesDaTurma = modulações.filter(
        (item) =>
          item.turmaId === disciplina.turmaId &&
          normalizeText(item.disciplina) === normalizeText(selectedDisciplinaNome),
      );

      if (modulaçõesDaTurma.length === 0) {
        return true;
      }

      return modulaçõesDaTurma.some(
        (item) => item.professor?.id === selectedProfessorId,
      );
    });
  }, [
    disciplinasDaSelecao,
    modulações,
    selectedDisciplinaNome,
    selectedProfessorId,
  ]);

  const totalTurmasOcultas = useMemo(
    () => disciplinasDaSelecao.length - disciplinasDisponiveisDaSelecao.length,
    [disciplinasDaSelecao, disciplinasDisponiveisDaSelecao],
  );

  const groupedModulacoes = useMemo(() => {
    const grouped = new Map<
      string,
      {
        professorId: string;
        professorNome: string;
        professorEmail: string;
        disciplina: string;
        itens: Modulacao[];
      }
    >();

    modulações.forEach((modulação) => {
      const key = buildGroupKey(modulação.professor?.id, modulação.disciplina);
      const current = grouped.get(key);

      if (current) {
        current.itens.push(modulação);
        return;
      }

      grouped.set(key, {
        professorId: modulação.professor?.id || "",
        professorNome: modulação.professor?.name || "Professor não identificado",
        professorEmail: modulação.professor?.email || "",
        disciplina: modulação.disciplina,
        itens: [modulação],
      });
    });

    return Array.from(grouped.values())
      .map((group) => ({
        ...group,
        itens: [...group.itens].sort((a, b) =>
          (a.turma?.name || "").localeCompare(b.turma?.name || "", "pt-BR"),
        ),
      }))
      .sort((a, b) => {
        const byProfessor = a.professorNome.localeCompare(b.professorNome, "pt-BR");
        if (byProfessor !== 0) return byProfessor;
        return a.disciplina.localeCompare(b.disciplina, "pt-BR");
      });
  }, [modulações]);

  const gradeResumoPorSérie = useMemo(() => {
    const collator = new Intl.Collator("pt-BR", {
      numeric: true,
      sensitivity: "base",
    });
    const disciplinaMetaByKey = new Map<string, Disciplina>();
    const disciplinasMap = new Map<string, string>();
    const turmasMap = new Map<string, Turma>();
    const cells = new Map<string, GradeSérieItem>();
    const disciplinasDisponiveisPorTurma = new Set<string>();

    disciplinas.forEach((disciplina) => {
      const disciplinaKey = normalizeText(disciplina.nome);
      const turmaDisciplinaKey = `${disciplina.turmaId}::${disciplinaKey}`;

      if (!disciplinaMetaByKey.has(turmaDisciplinaKey)) {
        disciplinaMetaByKey.set(turmaDisciplinaKey, disciplina);
      }

      if (disciplina.nome && !disciplinasMap.has(disciplinaKey)) {
        disciplinasMap.set(disciplinaKey, disciplina.nome);
      }

      disciplinasDisponiveisPorTurma.add(turmaDisciplinaKey);

      const turma = turmasById.get(disciplina.turmaId) || disciplina.turma;
      if (turma && !turmasMap.has(turma.id)) {
        turmasMap.set(turma.id, turma);
      }
    });

    modulações.forEach((modulação) => {
      const disciplinaKey = normalizeText(modulação.disciplina);
      const turmaDisciplinaKey = `${modulação.turmaId}::${disciplinaKey}`;
      const disciplinaMeta = disciplinaMetaByKey.get(turmaDisciplinaKey);
      const turma = modulação.turma || turmasById.get(modulação.turmaId) || null;

      if (!disciplinasMap.has(disciplinaKey)) {
        disciplinasMap.set(disciplinaKey, modulação.disciplina);
      }

      if (turma && !turmasMap.has(turma.id)) {
        turmasMap.set(turma.id, turma);
      }

      cells.set(`${modulação.turmaId}::${disciplinaKey}`, {
        modulaçãoId: modulação.id,
        turmaId: modulação.turmaId,
        turmaNome:
          modulação.turma?.name ||
          turmasById.get(modulação.turmaId)?.name ||
          "Turma",
        professorId: modulação.professor?.id || modulação.professorId || "",
        disciplina: disciplinaMeta?.nome || modulação.disciplina,
        professorNome: modulação.professor?.name || "Professor não identificado",
        cargaHoraria: Number(modulação.cargaHoraria) || 0,
      });
    });

    const series = Array.from(turmasMap.values()).sort((a, b) =>
      collator.compare(a.name, b.name),
    );

    const disciplinasLista = Array.from(disciplinasMap.entries())
      .map(([key, label]) => ({ key, label }))
      .sort((a, b) => collator.compare(a.label, b.label));

    const professorColors = buildProfessorColorMap(
      modulações.map((modulação) => ({
        id: modulação.professor?.id || modulação.professorId,
        name: modulação.professor?.name,
      })),
    );

    const turnosTitulo = Array.from(
      new Set(
        series
          .map((turma) => getTurnoTabelaLabel(turma.turno))
          .filter(Boolean),
      ),
    ).join("/");

    const rows = disciplinasLista.map((disciplina) => ({
      disciplina,
      cells: series.map((serie) => ({
        serie,
        item: cells.get(`${serie.id}::${disciplina.key}`) || null,
        disponivel: disciplinasDisponiveisPorTurma.has(`${serie.id}::${disciplina.key}`),
      })),
    }));

    return {
      series,
      rows,
      totalModulacoes: modulações.length,
      professorColors,
      titulo: `MODULAÇÃO ${turnosTitulo || "GERAL"} ${new Date().getFullYear()}`,
    };
  }, [disciplinas, modulações, turmasById]);

  const selectedItems = useMemo(
    () =>
      disciplinasDisponiveisDaSelecao.filter(
        (disciplina) => turmaDrafts[disciplina.turmaId]?.selected,
      ),
    [disciplinasDisponiveisDaSelecao, turmaDrafts],
  );

  const hasConflictInSelection = useMemo(
    () =>
      selectedItems.some(
        (disciplina) => Boolean(turmaDrafts[disciplina.turmaId]?.conflitoCom),
      ),
    [selectedItems, turmaDrafts],
  );

  async function fetchTurmas() {
    try {
      setLoadingTurmas(true);

      const response = await fetch(apiUrl("/turmas"), {
        headers: requestHeaders,
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Erro ao carregar turmas");
      }

      setTurmas(Array.isArray(data) ? data : []);
    } catch (error: any) {
      setErrorMessage(error.message || "Não foi possível carregar as turmas.");
    } finally {
      setLoadingTurmas(false);
    }
  }

  async function fetchProfessores() {
    try {
      setLoadingProfessores(true);

      const response = await fetch(apiUrl("/users"), {
        headers: requestHeaders,
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Erro ao carregar professores");
      }

      setProfessores(
        Array.isArray(data) ? data.filter((item) => item.role === "PROFESSOR") : [],
      );
    } catch (error: any) {
      setErrorMessage(error.message || "Não foi possível carregar os professores.");
    } finally {
      setLoadingProfessores(false);
    }
  }

  async function fetchDisciplinas() {
    try {
      setLoadingDisciplinas(true);

      const response = await fetch(apiUrl("/disciplinas"), {
        headers: requestHeaders,
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Erro ao carregar disciplinas");
      }

      setDisciplinas(Array.isArray(data) ? data : []);
    } catch (error: any) {
      setErrorMessage(error.message || "Não foi possível carregar as disciplinas.");
    } finally {
      setLoadingDisciplinas(false);
    }
  }

  async function fetchModulacoes() {
    try {
      setLoadingModulacoes(true);

      const response = await fetch(apiUrl("/turma-professor"), {
        headers: requestHeaders,
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Erro ao carregar modulações");
      }

      setModulacoes(Array.isArray(data) ? data : []);
    } catch (error: any) {
      setErrorMessage(error.message || "Não foi possível carregar as modulações.");
    } finally {
      setLoadingModulacoes(false);
    }
  }

  useEffect(() => {
    if (!token) return;

    fetchTurmas();
    fetchProfessores();
    fetchDisciplinas();
    fetchModulacoes();
  }, [requestHeaders, token]);

  useEffect(() => {
    if (!selectedProfessorId || !selectedDisciplinaNome) {
      setTurmaDrafts({});
      return;
    }

    const nextDrafts: Record<string, TurmaDraft> = {};

    disciplinasDisponiveisDaSelecao.forEach((disciplina) => {
      const existing = modulações.find(
        (item) =>
          item.professor?.id === selectedProfessorId &&
          item.turmaId === disciplina.turmaId &&
          normalizeText(item.disciplina) === normalizeText(selectedDisciplinaNome),
      );

      nextDrafts[disciplina.turmaId] = {
        selected: Boolean(existing),
        cargaHoraria: String(existing?.cargaHoraria || disciplina.cargaHoraria || 1),
        disciplinaId: disciplina.id,
        modulaçãoId: existing?.id,
      };
    });

    setTurmaDrafts(nextDrafts);
  }, [
    disciplinasDisponiveisDaSelecao,
    modulações,
    selectedDisciplinaNome,
    selectedProfessorId,
  ]);

  function resetSelection() {
    setSelectedProfessorId("");
    setSelectedDisciplinaNome("");
    setTurmaDrafts({});
  }

  function openGroupForEdit(professorId: string, disciplina: string) {
    setSelectedProfessorId(professorId);
    setSelectedDisciplinaNome(disciplina);
    setErrorMessage("");
    setSuccessMessage("");
  }

  function updateTurmaDraft(
    turmaId: string,
    field: keyof TurmaDraft,
    value: string | boolean | undefined,
  ) {
    setTurmaDrafts((prev) => ({
      ...prev,
      [turmaId]: {
        ...prev[turmaId],
        [field]: value,
      },
    }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setErrorMessage("");
    setSuccessMessage("");

    if (!selectedProfessorId) {
      setErrorMessage("Selecione o professor.");
      return;
    }

    if (!selectedDisciplinaNome.trim()) {
      setErrorMessage("Selecione a disciplina.");
      return;
    }

    if (selectedItems.length === 0) {
      setErrorMessage("Selecione ao menos uma turma para esta disciplina.");
      return;
    }

    if (hasConflictInSelection) {
      setErrorMessage(
        "Existe conflito de professor na mesma disciplina. Revise as turmas marcadas antes de salvar.",
      );
      return;
    }

    const invalidCarga = selectedItems.find((disciplina) => {
      const carga = Number(turmaDrafts[disciplina.turmaId]?.cargaHoraria);
      return !Number.isFinite(carga) || carga <= 0;
    });

    if (invalidCarga) {
      setErrorMessage("Informe uma carga horária valida para todas as turmas selecionadas.");
      return;
    }

    try {
      setIsSubmitting(true);

      const response = await fetch(apiUrl("/turma-professor/sync"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...requestHeaders,
        },
        body: JSON.stringify({
          professorId: selectedProfessorId,
          disciplina: selectedDisciplinaNome.trim(),
          itens: selectedItems.map((disciplina) => ({
            turmaId: disciplina.turmaId,
            disciplinaId: turmaDrafts[disciplina.turmaId]?.disciplinaId,
            cargaHoraria: Number(turmaDrafts[disciplina.turmaId]?.cargaHoraria),
          })),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Erro ao salvar modulação");
      }

      setModulacoes(Array.isArray(data) ? data : []);
      await fetchDisciplinas();

      setSuccessMessage(
        "Modulação salva com sucesso. As turmas desta disciplina ficaram sincronizadas para o professor selecionado.",
      );
    } catch (error: any) {
      setErrorMessage(error.message || "Não foi possível salvar a modulação.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete(modulaçãoId: string) {
    if (!window.confirm("Desejá realmente excluir esta modulação?")) return;

    try {
      setDeletingId(modulaçãoId);
      setErrorMessage("");
      setSuccessMessage("");

      const response = await fetch(apiUrl(`/turma-professor/${modulaçãoId}`), {
        method: "DELETE",
        headers: requestHeaders,
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Erro ao excluir modulação");
      }

      await fetchModulacoes();
      await fetchDisciplinas();

      setSuccessMessage("Modulação excluída com sucesso.");
    } catch (error: any) {
      setErrorMessage(error.message || "Não foi possível excluir a modulação.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <section className="space-y-6">
      <PageHeader
        title="Modulação de Professores"
        description="Selecione o professor, escolha a disciplina e marque as turmas em que ele pode lecionar. A carga horária também pode ser ajustada por turma aqui mesmo."
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="card-base space-y-5 p-6">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">
              Vincular professor por disciplina
            </h2>
            <p className="text-sm text-slate-500">
              Ao escolher o mesmo professor e a mesma disciplina novamente, as turmas
              já vinculadas voltam marcadas. Desmarcar uma turma remove essa modulação.
            </p>
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

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Professor
              </label>
              <select
                value={selectedProfessorId}
                onChange={(event) => setSelectedProfessorId(event.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
              >
                <option value="">
                  {loadingProfessores
                    ? "Carregando professores..."
                    : "Selecione um professor"}
                </option>
                {professores.map((professor) => (
                  <option key={professor.id} value={professor.id}>
                    {professor.name} - {professor.email}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Disciplina
              </label>
              <select
                value={selectedDisciplinaNome}
                onChange={(event) => setSelectedDisciplinaNome(event.target.value)}
                disabled={loadingDisciplinas}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500 disabled:cursor-not-allowed disabled:bg-slate-50"
              >
                <option value="">
                  {loadingDisciplinas
                    ? "Carregando disciplinas..."
                    : disciplinaOptions.length === 0
                      ? "Cadastre disciplinas primeiro"
                      : "Selecione uma disciplina"}
                </option>
                {disciplinaOptions.map((disciplina) => (
                  <option key={normalizeText(disciplina.nome)} value={disciplina.nome}>
                    {disciplina.nome} - {disciplina.totalTurmas} turma(s)
                  </option>
                ))}
              </select>
            </div>

            {selectedProfessor ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                Professor selecionado: <strong>{selectedProfessor.name}</strong>
              </div>
            ) : null}

            {!selectedDisciplinaNome ? null : disciplinasDaSelecao.length === 0 ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                Essa disciplina ainda não existe em nenhuma turma. Cadastre primeiro no menu
                de disciplinas.
              </div>
            ) : disciplinasDisponiveisDaSelecao.length === 0 ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                Todas as turmas dessa disciplina já foram moduladas. Para alterar as turmas do
                professor, use a opção de editar grupo.
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-800">
                      Turmas disponíveis em {selectedDisciplinaNome}
                    </h3>
                    <p className="text-xs text-slate-500">
                      Marque as turmas, ajuste o numero de aulas e salve tudo de uma vez.
                    </p>
                    {totalTurmasOcultas > 0 ? (
                      <p className="mt-1 text-xs font-medium text-amber-700">
                        {totalTurmasOcultas} turma(s) já modulada(s) nesta disciplina foram
                        ocultadas da lista.
                      </p>
                    ) : null}
                  </div>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                    {selectedItems.length} selecionada(s)
                  </span>
                </div>

                <div className="space-y-3">
                  {disciplinasDisponiveisDaSelecao.map((disciplina) => {
                    const turma = turmasById.get(disciplina.turmaId) || disciplina.turma;
                    const draft = turmaDrafts[disciplina.turmaId];
                    const hasConflict = Boolean(draft?.conflitoCom);

                    return (
                      <div
                        key={disciplina.id}
                        className={`rounded-2xl border p-4 ${
                          hasConflict
                            ? "border-red-200 bg-red-50/60"
                            : draft?.selected
                              ? "border-emerald-200 bg-emerald-50/60"
                              : "border-slate-200 bg-white"
                        }`}
                      >
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                          <label className="flex flex-1 cursor-pointer items-start gap-3">
                            <input
                              type="checkbox"
                              checked={Boolean(draft?.selected)}
                              onChange={(event) =>
                                updateTurmaDraft(
                                  disciplina.turmaId,
                                  "selected",
                                  event.target.checked,
                                )
                              }
                              className="mt-1 h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-400"
                            />
                            <span className="space-y-1">
                              <span className="block text-sm font-semibold text-slate-800">
                                {turma?.name || "Turma"}
                                {turma?.turno ? ` - ${formatTurno(turma.turno)}` : ""}
                              </span>
                              <span className="block text-xs text-slate-500">
                                Série: {disciplina.serie}
                              </span>
                              {hasConflict ? (
                                <span className="block text-xs font-medium text-red-700">
                                  Conflito: {draft?.conflitoCom} já esta vinculado nesta turma
                                  para {selectedDisciplinaNome}.
                                </span>
                              ) : draft?.modulaçãoId ? (
                                <span className="block text-xs font-medium text-emerald-700">
                                  Esta turma já estava modulada para esse professor.
                                </span>
                              ) : (
                                <span className="block text-xs text-slate-500">
                                  Turma disponivel para novo vinculo.
                                </span>
                              )}
                            </span>
                          </label>

                          <div className="w-full lg:w-44">
                            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                              Aulas/semana
                            </label>
                            <input
                              type="number"
                              min={1}
                              value={draft?.cargaHoraria || ""}
                              onChange={(event) =>
                                updateTurmaDraft(
                                  disciplina.turmaId,
                                  "cargaHoraria",
                                  event.target.value,
                                )
                              }
                              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500"
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-2 pt-2">
              <button
                type="submit"
                disabled={isSubmitting || !selectedProfessorId || !selectedDisciplinaNome}
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? "Salvando..." : "Salvar modulação"}
              </button>

              <button
                type="button"
                onClick={resetSelection}
                className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Limpar selecao
              </button>
            </div>
          </form>
        </div>

        <div className="card-base space-y-5 p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-800">
                Modulacoes cadastradas
              </h2>
              <p className="text-sm text-slate-500">
                Clique em editar para reabrir o mesmo professor e disciplina com as turmas ja
                preselecionadas.
              </p>
            </div>

            <button
              type="button"
              onClick={() =>
                setShowModulacoesCadastradas((current) => !current)
              }
              className="inline-flex items-center justify-center rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              {showModulacoesCadastradas ? "Recolher" : "Expandir"}
            </button>
          </div>

          {!showModulacoesCadastradas ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-600">
              A lista foi minimizada para encurtar a tela.
            </div>
          ) : loadingTurmas || loadingModulacoes ? (
            <p className="text-sm text-slate-500">Carregando modulações...</p>
          ) : groupedModulacoes.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
              <p className="text-sm font-medium text-slate-700">
                Nenhuma modulação cadastrada.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {groupedModulacoes.map((group) => (
                <div
                  key={buildGroupKey(group.professorId, group.disciplina)}
                  className="rounded-2xl border border-slate-200 bg-white p-4"
                >
                  <div className="flex flex-col gap-3">
                    <div>
                      <strong className="text-slate-800">{group.professorNome}</strong>
                      <div className="mt-1 text-sm text-slate-500">{group.professorEmail}</div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
                        {group.disciplina}
                      </span>
                      <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
                        {group.itens.length} turma(s)
                      </span>
                    </div>

                    <div className="space-y-2">
                      {group.itens.map((item) => (
                        <div
                          key={item.id}
                          className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="text-sm font-medium text-slate-700">
                              {item.turma?.name || "Turma"}
                              {item.turma?.turno ? ` - ${formatTurno(item.turma.turno)}` : ""}
                            </div>
                            <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-600">
                              {item.cargaHoraria} aulas/semana
                            </span>
                          </div>

                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => openGroupForEdit(group.professorId, group.disciplina)}
                              className="rounded-lg border border-blue-300 px-3 py-2 text-xs font-medium text-blue-700 hover:bg-blue-50"
                            >
                              Editar grupo
                            </button>

                            <button
                              type="button"
                              onClick={() => handleDelete(item.id)}
                              disabled={deletingId === item.id}
                              className="rounded-lg border border-red-300 px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {deletingId === item.id ? "Excluindo..." : "Excluir esta turma"}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="card-base space-y-5 p-6">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">
              Tabela de modulação
            </h2>
            <p className="text-sm text-slate-500">
              Modelo visual em grade, como nas folhas anexadas, preenchendo conforme
              as modulações forem cadastradas.
            </p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
            {gradeResumoPorSérie.totalModulacoes} modulação(oes)
          </span>
        </div>

        {loadingDisciplinas || loadingModulacoes || loadingTurmas ? (
          <p className="text-sm text-slate-500">Montando tabela de modulação...</p>
        ) : gradeResumoPorSérie.series.length === 0 || gradeResumoPorSérie.rows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
            <p className="text-sm font-medium text-slate-700">
              Ainda não ha dados suficientes para montar a tabela de modulação.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-300 bg-white p-4">
            <div className="min-w-max">
              <div className="px-2 pb-4 pt-2 text-center">
                <h3 className="text-3xl font-black uppercase tracking-wide text-slate-800">
                  {gradeResumoPorSérie.titulo}
                </h3>
              </div>

              <table className="min-w-full table-fixed border-collapse text-sm">
                <thead>
                  <tr className="bg-white">
                    <th className="sticky left-0 z-20 w-[220px] border border-slate-500 bg-white px-3 py-2 text-center text-sm font-bold uppercase text-slate-800">
                      Disciplina
                    </th>
                    {gradeResumoPorSérie.series.map((serie) => (
                      <th
                        key={serie.id}
                        className="w-[120px] border border-slate-500 bg-white px-2 py-2 text-center text-sm font-bold text-slate-800"
                      >
                        {serie.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                {gradeResumoPorSérie.rows.map((row) => (
                  <tr key={row.disciplina.key}>
                    <th className="sticky left-0 z-10 border border-slate-400 bg-white px-3 py-2 text-left text-[13px] font-bold leading-tight text-slate-700">
                      {row.disciplina.label}
                    </th>
                    {row.cells.map((cell) => (
                      <td
                        key={`${row.disciplina.key}-${cell.serie.id}`}
                        className="h-[42px] border border-slate-400 px-2 py-1 text-center align-middle"
                        style={
                          cell.item
                            ? getProfessorColorStyle(
                                gradeResumoPorSérie.professorColors,
                                {
                                  id: cell.item.professorId,
                                  name: cell.item.professorNome,
                                },
                              )
                            : undefined
                        }
                      >
                        {!cell.disponivel ? null : cell.item ? (
                          <span className="block truncate text-[13px] font-bold uppercase leading-none tracking-[0.02em]">
                            {formatProfessorTabelaNome(cell.item.professorNome)}{" "}
                            {cell.item.cargaHoraria}
                          </span>
                        ) : (
                          <span className="block text-[12px] font-bold tracking-[0.18em] text-slate-500">
                            ******
                          </span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        )}
      </div>
    </section>
  );
}
