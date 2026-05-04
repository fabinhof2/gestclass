"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BookOpenCheck,
  CalendarDays,
  ClipboardCheck,
  MessageCircle,
  Pencil,
  Trash2,
} from "lucide-react";
import PageHeader from "@/components/ui/page-header";
import { useAuth } from "@/context/auth-context";
import { API_URL, apiUrl } from "@/lib/api";
import { formatTurno } from "@/lib/turno";

type Turma = {
  id: string;
  name: string;
  turno?: string | null;
  schoolId: string;
  createdAt?: string;
  updatedAt?: string;
  alunos?: Array<{
    id: string;
    name: string;
    matricula?: string | null;
    fotoUrl?: string | null;
    userId?: string | null;
    status?: string | null;
  }>;
};

type Professor = {
  id: string;
  name: string;
  email: string;
  role: string;
};

type ModulacaoItem = {
  id?: string;
  disciplina?: string;
  cargaHoraria?: number;
  diasSemana?: string[];
  professor?: {
    id: string;
    name: string;
    email?: string;
  };
};

type ModulacaoFormState = {
  professorId: string;
  disciplina: string;
  cargaHoraria: string;
  saving: boolean;
};

type TurmaDetalheView = "alunos" | "professores";
type ProfessorAlunoTab = "notas" | "frequencias" | "agendamentos";
type PeriodoAvaliacao = "PRIMEIRO" | "SEGUNDO" | "TERCEIRO" | "QUARTO";

const PERIODO_LABELS: Record<PeriodoAvaliacao, string> = {
  PRIMEIRO: "1º bimestre",
  SEGUNDO: "2º bimestre",
  TERCEIRO: "3º bimestre",
  QUARTO: "4º bimestre",
};

function createEmptyModulacaoForm(): ModulacaoFormState {
  return {
    professorId: "",
    disciplina: "",
    cargaHoraria: "1",
    saving: false,
  };
}

function getTurmaSortInfo(name: string) {
  const normalized = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
  const numberMatch = normalized.match(/\d+/);
  const number = numberMatch ? Number(numberMatch[0]) : 999;
  const isAno =
    normalized.includes(" ANO") || /\d+\s*[ºª]?\s*ANO\b/.test(normalized);
  const isSerie =
    normalized.includes("SERIE") ||
    normalized.includes("ENSINO MEDIO") ||
    /\d+\s*[ªA]?\s*SERIE\b/.test(normalized);
  const suffixMatch = normalized.match(
    /\d+\s*[ºª]?\s*(?:ANO|SERIE)?\s*([A-Z])\b/,
  );
  const suffix = suffixMatch?.[1] || "";

  return {
    group: isAno ? 0 : isSerie ? 1 : 2,
    number,
    suffix,
    normalized,
  };
}

function sortTurmasByEtapa(a: Turma, b: Turma) {
  const turmaA = getTurmaSortInfo(a.name);
  const turmaB = getTurmaSortInfo(b.name);

  return (
    turmaA.group - turmaB.group ||
    turmaA.number - turmaB.number ||
    turmaA.suffix.localeCompare(turmaB.suffix) ||
    turmaA.normalized.localeCompare(turmaB.normalized)
  );
}

export default function TurmasPage() {
  const { token, user } = useAuth();
  const router = useRouter();

  const [turmas, setTurmas] = useState<Turma[]>([]);
  const [professores, setProfessores] = useState<Professor[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingProfessores, setLoadingProfessores] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingTurmaId, setEditingTurmaId] = useState<string | null>(null);
  const [deletingTurmaId, setDeletingTurmaId] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState("");
  const [form, setForm] = useState({
    name: "",
    turno: "MANHA",
  });

  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const [modulacoes, setModulacoes] = useState<Record<string, ModulacaoItem[]>>(
    {},
  );
  const [loadingModulacoes, setLoadingModulacoes] = useState<
    Record<string, boolean>
  >({});
  const [expandedTurmas, setExpandedTurmas] = useState<Record<string, boolean>>(
    {},
  );
  const [showModulacaoForm, setShowModulacaoForm] = useState<
    Record<string, boolean>
  >({});
  const [turmaDetalheViews, setTurmaDetalheViews] = useState<
    Record<string, TurmaDetalheView>
  >({});
  const [modulacaoForms, setModulacaoForms] = useState<
    Record<string, ModulacaoFormState>
  >({});
  const [professorAluno, setProfessorAluno] = useState<any>(null);
  const [professorAlunoVisao, setProfessorAlunoVisao] = useState<any>(null);
  const [professorAlunoTab, setProfessorAlunoTab] =
    useState<ProfessorAlunoTab>("notas");
  const [professorPeriodo, setProfessorPeriodo] =
    useState<PeriodoAvaliacao>("PRIMEIRO");
  const [professorAno, setProfessorAno] = useState(new Date().getFullYear());
  const [loadingProfessorVisao, setLoadingProfessorVisao] = useState(false);

  async function fetchTurmas() {
    try {
      setLoading(true);
      setErrorMessage("");

      const response = await fetch(apiUrl("/turmas"), {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Erro ao buscar turmas");
      }

      setTurmas(Array.isArray(data) ? data : []);
    } catch (error: any) {
      console.error("Erro ao carregar turmas:", error);
      setErrorMessage(error.message || "Não foi possível carregar as turmas.");
    } finally {
      setLoading(false);
    }
  }

  async function fetchProfessores() {
    try {
      setLoadingProfessores(true);

      const response = await fetch(apiUrl("/users"), {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Erro ao carregar professores");
      }

      const onlyProfessors = Array.isArray(data)
        ? data.filter((item) => item.role === "PROFESSOR")
        : [];

      setProfessores(onlyProfessors);
    } catch (error: any) {
      console.error("Erro ao carregar professores:", error);
      setErrorMessage(
        error.message || "Não foi possível carregar os professores.",
      );
    } finally {
      setLoadingProfessores(false);
    }
  }

  async function fetchModulacoes(turmaId: string) {
    try {
      setLoadingModulacoes((prev) => ({
        ...prev,
        [turmaId]: true,
      }));

      const response = await fetch(
        apiUrl(`/turma-professor/${turmaId}`),
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Erro ao carregar professores");
      }

      setModulacoes((prev) => ({
        ...prev,
        [turmaId]: Array.isArray(data) ? data : [],
      }));
    } catch (error) {
      console.error("Erro ao carregar modulações", error);
      setErrorMessage("Não foi possível carregar as modulações da turma.");
    } finally {
      setLoadingModulacoes((prev) => ({
        ...prev,
        [turmaId]: false,
      }));
    }
  }

  useEffect(() => {
    if (token) {
      fetchTurmas();
      if (user?.role !== "PROFESSOR") {
        fetchProfessores();
      } else {
        setLoadingProfessores(false);
      }
    }
  }, [token, user?.role]);

  useEffect(() => {
    if (!showForm && editingTurmaId) {
      setEditingTurmaId(null);
    }
  }, [showForm, editingTurmaId]);

  function resetForm() {
    setForm({
      name: "",
      turno: "MANHA",
    });
    setEditingTurmaId(null);
  }

  function openModulacaoForm(turmaId: string) {
    setTurmaDetalheViews((prev) => ({
      ...prev,
      [turmaId]: "professores",
    }));

    setShowModulacaoForm((prev) => ({
      ...prev,
      [turmaId]: true,
    }));

    setModulacaoForms((prev) => ({
      ...prev,
      [turmaId]: prev[turmaId] || createEmptyModulacaoForm(),
    }));
  }

  function closeModulacaoForm(turmaId: string) {
    setShowModulacaoForm((prev) => ({
      ...prev,
      [turmaId]: false,
    }));

    setModulacaoForms((prev) => ({
      ...prev,
      [turmaId]: createEmptyModulacaoForm(),
    }));
  }

  function updateModulacaoForm(
    turmaId: string,
    field: keyof ModulacaoFormState,
    value: string | boolean,
  ) {
    setModulacaoForms((prev) => ({
      ...prev,
      [turmaId]: {
        ...(prev[turmaId] || createEmptyModulacaoForm()),
        [field]: value,
      },
    }));
  }

  async function handleCreateTurma(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setErrorMessage("");
    setSuccessMessage("");

    if (!form.name.trim()) {
      setErrorMessage("Informe o nome da turma.");
      return;
    }

    try {
      setIsSubmitting(true);

      const isEditing = Boolean(editingTurmaId);
      const response = await fetch(
        apiUrl(isEditing ? `/turmas/${editingTurmaId}` : "/turmas"),
        {
          method: isEditing ? "PATCH" : "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            name: form.name.trim(),
            turno: form.turno,
          }),
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Erro ao salvar turma");
      }

      setSuccessMessage(
        isEditing ? "Turma atualizada com sucesso." : "Turma criada com sucesso.",
      );
      resetForm();
      setShowForm(false);
      await fetchTurmas();
    } catch (error: any) {
      console.error("Erro ao salvar turma:", error);
      setErrorMessage(error.message || "Não foi possível salvar a turma.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleEditTurma(turma: Turma) {
    setEditingTurmaId(turma.id);
    setForm({
      name: turma.name || "",
      turno: turma.turno || "MANHA",
    });
    setShowForm(true);
    setErrorMessage("");
    setSuccessMessage("");
  }

  async function handleDeleteTurma(turma: Turma) {
    const confirmed = window.confirm(
      `Deseja excluir a turma "${turma.name}"? Esta ação não pode ser desfeita.`,
    );

    if (!confirmed) {
      return;
    }

    try {
      setDeletingTurmaId(turma.id);
      setErrorMessage("");
      setSuccessMessage("");

      const response = await fetch(apiUrl(`/turmas/${turma.id}`), {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Erro ao excluir turma");
      }

      setSuccessMessage(data.message || "Turma excluída com sucesso.");
      if (editingTurmaId === turma.id) {
        resetForm();
        setShowForm(false);
      }

      setExpandedTurmas((prev) => {
        const next = { ...prev };
        delete next[turma.id];
        return next;
      });
      setShowModulacaoForm((prev) => {
        const next = { ...prev };
        delete next[turma.id];
        return next;
      });
      setTurmaDetalheViews((prev) => {
        const next = { ...prev };
        delete next[turma.id];
        return next;
      });

      await fetchTurmas();
    } catch (error: any) {
      console.error("Erro ao excluir turma:", error);
      setErrorMessage(error.message || "Não foi possível excluir a turma.");
    } finally {
      setDeletingTurmaId(null);
    }
  }

  async function handleSaveModulacao(turmaId: string) {
    const currentForm = modulacaoForms[turmaId] || createEmptyModulacaoForm();

    setErrorMessage("");
    setSuccessMessage("");

    if (!currentForm.professorId) {
      setErrorMessage("Selecione o professor.");
      return;
    }

    if (!currentForm.disciplina.trim()) {
      setErrorMessage("Informe a disciplina.");
      return;
    }

    if (!currentForm.cargaHoraria || Number(currentForm.cargaHoraria) <= 0) {
      setErrorMessage("Informe uma carga horária válida.");
      return;
    }

    try {
      updateModulacaoForm(turmaId, "saving", true);

      const response = await fetch(apiUrl("/turma-professor"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          turmaId,
          professorId: currentForm.professorId,
          disciplina: currentForm.disciplina.trim(),
          cargaHoraria: Number(currentForm.cargaHoraria),
          diasSemana: [],
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Erro ao salvar modulação");
      }

      setSuccessMessage("Modulação salva com sucesso.");
      await fetchModulacoes(turmaId);
      closeModulacaoForm(turmaId);

      setExpandedTurmas((prev) => ({
        ...prev,
        [turmaId]: true,
      }));
    } catch (error: any) {
      console.error("Erro ao salvar modulação:", error);
      setErrorMessage(error.message || "Não foi possível salvar a modulação.");
      updateModulacaoForm(turmaId, "saving", false);
    }
  }

  async function toggleExpandedTurma(turmaId: string) {
    const isExpanded = expandedTurmas[turmaId];

    if (isExpanded) {
      setExpandedTurmas((prev) => ({
        ...prev,
        [turmaId]: false,
      }));

      setShowModulacaoForm((prev) => ({
        ...prev,
        [turmaId]: false,
      }));

      return;
    }

    setExpandedTurmas((prev) => ({
      ...prev,
      [turmaId]: true,
    }));

    setTurmaDetalheViews((prev) => ({
      ...prev,
      [turmaId]: prev[turmaId] || "alunos",
    }));

    await fetchModulacoes(turmaId);
  }

  const filteredTurmas = useMemo(() => {
    return turmas
      .filter((turma) =>
        turma.name.toLowerCase().includes(searchTerm.toLowerCase()),
      )
      .sort(sortTurmasByEtapa);
  }, [turmas, searchTerm]);

  const canCreateTurma =
    user?.role === "ADMIN_ESCOLA" ||
    user?.role === "GESTOR" ||
    user?.role === "SUPERUSUARIO";
  const canManageTurma = canCreateTurma;
  const isProfessor = user?.role === "PROFESSOR";
  const canSeeAlunoShortcuts =
    !!user?.role &&
    user.role !== "ALUNO" &&
    user.role !== "RESPONSAVEL";
  const canManageModulacao =
    user?.role === "ADMIN_ESCOLA" ||
    user?.role === "GESTOR" ||
    user?.role === "SECRETARIA" ||
    user?.role === "SUPERUSUARIO";

  async function fetchProfessorAlunoVisao(
    aluno: NonNullable<Turma["alunos"]>[number],
    tab = professorAlunoTab,
  ) {
    if (!token) return;

    try {
      setErrorMessage("");
      setLoadingProfessorVisao(true);
      const params = new URLSearchParams({
        periodo: professorPeriodo,
        ano: String(professorAno),
      });
      const response = await fetch(
        apiUrl(`/alunos/${aluno.id}/professor-visao?${params.toString()}`),
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Erro ao carregar dados do aluno.");
      }

      setProfessorAluno(aluno);
      setProfessorAlunoTab(tab);
      setProfessorAlunoVisao(data);
    } catch (error: any) {
      setErrorMessage(error.message || "Erro ao carregar dados do aluno.");
    } finally {
      setLoadingProfessorVisao(false);
    }
  }

  useEffect(() => {
    if (professorAluno) {
      fetchProfessorAlunoVisao(professorAluno, professorAlunoTab);
    }
  }, [professorAluno, professorAlunoTab, professorPeriodo, professorAno]);

  async function abrirChatAluno(alunoUserId?: string | null) {
    if (!alunoUserId || !token) return;

    try {
      setErrorMessage("");
      const response = await fetch(apiUrl("/comunicacao/chat/privado"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ targetUserId: alunoUserId }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Não foi possível abrir o chat.");
      }

      router.push(`/feed/chat?grupoId=${data.id}`);
    } catch (error: any) {
      setErrorMessage(error.message || "Não foi possível abrir o chat.");
    }
  }

  return (
    <section className="space-y-6">
      <PageHeader
        title="Turmas"
        description="Gerencie turmas, organização acadêmica e estrutura escolar."
      />

      <div className="card-base space-y-6 p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">
              Gestão de turmas
            </h2>
            <p className="text-sm text-slate-500">
              Visualize e cadastre turmas reais do sistema.
            </p>
          </div>

          {canCreateTurma ? (
            <button
              type="button"
              onClick={() => {
                setShowForm((prev) => !prev);
                setErrorMessage("");
                setSuccessMessage("");
              }}
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              {showForm ? "Fechar formulário" : "Nova turma"}
            </button>
          ) : null}
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

        {showForm && canCreateTurma ? (
          <form
            onSubmit={handleCreateTurma}
            className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-4"
          >
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Nome da turma
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, name: e.target.value }))
                  }
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
                  placeholder="Ex.: 6º Ano A"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Turno
                </label>
                <select
                  value={form.turno}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, turno: e.target.value }))
                  }
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
                >
                  <option value="MANHA">Matutino</option>
                  <option value="TARDE">Vespertino</option>
                  <option value="INTEGRAL">Integral</option>
                  <option value="NOITE">Noturno</option>
                </select>
              </div>
            </div>

            <div className="flex flex-col gap-3 pt-2 md:flex-row">
              <button
                type="submit"
                disabled={isSubmitting}
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? "Salvando..." : "Salvar turma"}
              </button>

              <button
                type="button"
                onClick={() => {
                  resetForm();
                  setShowForm(false);
                  setErrorMessage("");
                  setSuccessMessage("");
                }}
                className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancelar
              </button>
            </div>
          </form>
        ) : null}

        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Buscar turma
          </label>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Digite o nome da turma"
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
          />
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm font-medium text-slate-700">
            Turmas encontradas: {filteredTurmas.length}
          </p>
          <p className="text-xs text-slate-500">
            Total carregado do sistema: {turmas.length}
          </p>
        </div>

        {loading ? (
          <p className="text-sm text-slate-500">Carregando turmas...</p>
        ) : filteredTurmas.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
            <p className="text-sm font-medium text-slate-700">
              Nenhuma turma encontrada.
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Cadastre uma turma nova ou altere o texto da busca.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {filteredTurmas.map((turma) => {
              const turmaForm =
                modulacaoForms[turma.id] || createEmptyModulacaoForm();
              const isExpanded = expandedTurmas[turma.id];
              const isFormOpen = showModulacaoForm[turma.id];
              const isLoadingModulacoes = loadingModulacoes[turma.id];
              const detalheView = isProfessor
                ? "alunos"
                : turmaDetalheViews[turma.id] || "alunos";
              const alunosAtivos = turma.alunos?.length || 0;

              return (
                <div
                  key={turma.id}
                  className="rounded-2xl border border-white/35 bg-transparent p-4 shadow-none transition hover:border-blue-200"
                >
                  <div className="flex flex-col gap-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <strong className="block truncate text-base text-slate-800">
                          {turma.name}
                        </strong>
                        <span className="text-sm text-slate-500">
                          Turno: {formatTurno(turma.turno)}
                        </span>
                      </div>

                      <div className="shrink-0 rounded-2xl border border-blue-200/70 bg-transparent px-3 py-2 text-right">
                        <p className="text-lg font-bold leading-none text-blue-700">
                          {alunosAtivos}
                        </p>
                        <p className="mt-1 text-[11px] font-semibold uppercase text-blue-600">
                          alunos ativos
                        </p>
                      </div>
                    </div>

                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => toggleExpandedTurma(turma.id)}
                        className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:opacity-90"
                      >
                        {isExpanded
                          ? "Ocultar detalhes"
                          : isProfessor
                            ? "Ver alunos"
                            : "Ver detalhes"}
                      </button>

                      {canManageModulacao ? (
                        <button
                          type="button"
                          onClick={async () => {
                            if (!expandedTurmas[turma.id]) {
                              setExpandedTurmas((prev) => ({
                                ...prev,
                                [turma.id]: true,
                              }));
                              setTurmaDetalheViews((prev) => ({
                                ...prev,
                                [turma.id]: "professores",
                              }));
                              await fetchModulacoes(turma.id);
                            }

                            openModulacaoForm(turma.id);
                          }}
                          className="rounded-lg bg-green-600 px-3 py-2 text-xs font-medium text-white hover:opacity-90"
                        >
                          + Adicionar professor
                        </button>
                      ) : null}

                      {canManageTurma ? (
                        <button
                          type="button"
                          onClick={() => handleEditTurma(turma)}
                          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                        >
                          <Pencil size={14} />
                          Editar
                        </button>
                      ) : null}

                      {canManageTurma ? (
                        <button
                          type="button"
                          onClick={() => handleDeleteTurma(turma)}
                          disabled={deletingTurmaId === turma.id}
                          className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <Trash2 size={14} />
                          {deletingTurmaId === turma.id ? "Excluindo..." : "Excluir"}
                        </button>
                      ) : null}
                    </div>

                    {isExpanded ? (
                      <div className="mt-3 space-y-3">
                        {!isProfessor ? (
                          <div className="flex flex-wrap gap-2 rounded-xl border border-white/35 bg-transparent p-2">
                            <button
                              type="button"
                              onClick={() =>
                                setTurmaDetalheViews((prev) => ({
                                  ...prev,
                                  [turma.id]: "alunos",
                                }))
                              }
                              className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${
                                detalheView === "alunos"
                                  ? "bg-slate-900 text-white"
                                  : "text-slate-700 hover:bg-white"
                              }`}
                            >
                              Alunos
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setTurmaDetalheViews((prev) => ({
                                  ...prev,
                                  [turma.id]: "professores",
                                }))
                              }
                              className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${
                                detalheView === "professores"
                                  ? "bg-slate-900 text-white"
                                  : "text-slate-700 hover:bg-white"
                              }`}
                            >
                              Professores modulados
                            </button>
                          </div>
                        ) : null}

                        {detalheView === "alunos" ? (
                        <div className="rounded-xl border border-white/35 bg-transparent p-3">
                          <div className="mb-3">
                            <h3 className="text-sm font-semibold text-slate-800">
                              Alunos da turma
                            </h3>
                            <p className="text-xs text-slate-500">
                              Lista de alunos ativos vinculados a esta turma.
                            </p>
                          </div>

                          {!turma.alunos || turma.alunos.length === 0 ? (
                            <div className="rounded-lg border border-dashed border-white/45 bg-transparent p-3 text-xs text-slate-500">
                              Nenhum aluno ativo vinculado a esta turma.
                            </div>
                          ) : (
                            <div className="grid gap-2 md:grid-cols-2">
                              {turma.alunos.map((aluno) => (
                                <div
                                  key={aluno.id}
                                  className="rounded-2xl border border-slate-200/70 bg-white/65 p-3 shadow-[0_10px_24px_rgba(15,23,42,0.06)]"
                                >
                                  <div className="flex items-center gap-3">
                                  {aluno.fotoUrl ? (
                                    <img
                                      src={`${API_URL}${aluno.fotoUrl}`}
                                      alt={aluno.name}
                                      className="h-11 w-11 rounded-2xl object-cover ring-2 ring-white/80"
                                    />
                                  ) : (
                                    <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#0f172a,#334155)] text-sm font-bold text-white shadow-sm">
                                      {aluno.name.slice(0, 1).toUpperCase()}
                                    </span>
                                  )}
                                  <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-semibold text-slate-800">
                                      {aluno.name}
                                    </p>
                                    <p className="text-xs text-slate-500">
                                      Matrícula: {aluno.matricula || "Não informada"}
                                    </p>
                                  </div>
                                  </div>
                                  {canSeeAlunoShortcuts ? (
                                    <div className="mt-3 border-t border-slate-200/80 pt-3">
                                      <div className="flex items-center justify-start gap-2">
                                        <button
                                          type="button"
                                          onClick={() => abrirChatAluno(aluno.userId)}
                                          disabled={!aluno.userId}
                                          title="Abrir chat"
                                          aria-label="Abrir chat"
                                          className="group inline-flex h-11 w-11 items-center justify-center rounded-xl border border-blue-200/70 bg-[linear-gradient(135deg,#eff6ff,#dbeafe)] text-blue-700 shadow-sm transition hover:-translate-y-0.5 hover:shadow-[0_10px_18px_rgba(59,130,246,0.18)] disabled:cursor-not-allowed disabled:opacity-50"
                                        >
                                          <MessageCircle size={18} />
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => fetchProfessorAlunoVisao(aluno, "notas")}
                                          title="Notas"
                                          aria-label="Notas"
                                          className="group inline-flex h-11 w-11 items-center justify-center rounded-xl border border-violet-200/70 bg-[linear-gradient(135deg,#f5f3ff,#ede9fe)] text-violet-700 shadow-sm transition hover:-translate-y-0.5 hover:shadow-[0_10px_18px_rgba(139,92,246,0.18)]"
                                        >
                                          <BookOpenCheck size={18} />
                                        </button>
                                      <button
                                        type="button"
                                        onClick={() => fetchProfessorAlunoVisao(aluno, "frequencias")}
                                        title="Frequências e faltas"
                                        aria-label="Frequências e faltas"
                                        className="hidden"
                                      >
                                        <ClipboardCheck size={17} />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => fetchProfessorAlunoVisao(aluno, "agendamentos")}
                                        title="Agendamentos"
                                        aria-label="Agendamentos"
                                        className="hidden"
                                      >
                                        <CalendarDays size={17} />
                                      </button>
                                        <button
                                          type="button"
                                          onClick={() => fetchProfessorAlunoVisao(aluno, "frequencias")}
                                          title="Frequencias e faltas"
                                          aria-label="Frequencias e faltas"
                                          className="group inline-flex h-11 w-11 items-center justify-center rounded-xl border border-emerald-200/70 bg-[linear-gradient(135deg,#ecfdf5,#d1fae5)] text-emerald-700 shadow-sm transition hover:-translate-y-0.5 hover:shadow-[0_10px_18px_rgba(16,185,129,0.18)]"
                                        >
                                          <ClipboardCheck size={18} />
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => fetchProfessorAlunoVisao(aluno, "agendamentos")}
                                          title="Agendamentos"
                                          aria-label="Agendamentos"
                                          className="group inline-flex h-11 w-11 items-center justify-center rounded-xl border border-amber-200/70 bg-[linear-gradient(135deg,#fffbeb,#fde68a)] text-amber-700 shadow-sm transition hover:-translate-y-0.5 hover:shadow-[0_10px_18px_rgba(245,158,11,0.18)]"
                                        >
                                          <CalendarDays size={18} />
                                        </button>
                                      </div>
                                    </div>
                                  ) : null}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                        ) : null}

                        {!isProfessor && detalheView === "professores" ? (
                        <div className="rounded-xl border border-white/35 bg-transparent p-3">
                        <div className="mb-3 flex items-center justify-between gap-2">
                          <div>
                            <h3 className="text-sm font-semibold text-slate-800">
                              Professores da turma
                            </h3>
                            <p className="text-xs text-slate-500">
                              Visualize e gerencie as modulações desta turma.
                            </p>
                          </div>
                        </div>

                        {isFormOpen && canManageModulacao ? (
                          <div className="mb-4 rounded-xl border border-white/35 bg-transparent p-3">
                            <div className="grid gap-3">
                              <div>
                                <label className="mb-1 block text-xs font-medium text-slate-700">
                                  Professor
                                </label>
                                <select
                                  value={turmaForm.professorId}
                                  onChange={(e) =>
                                    updateModulacaoForm(
                                      turma.id,
                                      "professorId",
                                      e.target.value,
                                    )
                                  }
                                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
                                >
                                  <option value="">
                                    {loadingProfessores
                                      ? "Carregando professores..."
                                      : "Selecione um professor"}
                                  </option>
                                  {professores.map((professor) => (
                                    <option
                                      key={professor.id}
                                      value={professor.id}
                                    >
                                      {professor.name} — {professor.email}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              <div>
                                <label className="mb-1 block text-xs font-medium text-slate-700">
                                  Disciplina
                                </label>
                                <input
                                  type="text"
                                  value={turmaForm.disciplina}
                                  onChange={(e) =>
                                    updateModulacaoForm(
                                      turma.id,
                                      "disciplina",
                                      e.target.value,
                                    )
                                  }
                                  placeholder="Ex.: Matemática"
                                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
                                />
                              </div>

                              <div>
                                <label className="mb-1 block text-xs font-medium text-slate-700">
                                  Carga horária semanal
                                </label>
                                <input
                                  type="number"
                                  min={1}
                                  value={turmaForm.cargaHoraria}
                                  onChange={(e) =>
                                    updateModulacaoForm(
                                      turma.id,
                                      "cargaHoraria",
                                      e.target.value,
                                    )
                                  }
                                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
                                />
                              </div>

                              <div className="flex flex-wrap gap-2 pt-1">
                                <button
                                  type="button"
                                  onClick={() => handleSaveModulacao(turma.id)}
                                  disabled={turmaForm.saving}
                                  className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  {turmaForm.saving
                                    ? "Salvando..."
                                    : "Salvar modulação"}
                                </button>

                                <button
                                  type="button"
                                  onClick={() => closeModulacaoForm(turma.id)}
                                  className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                                >
                                  Cancelar
                                </button>
                              </div>
                            </div>
                          </div>
                        ) : null}

                        {isLoadingModulacoes ? (
                          <p className="text-xs text-slate-500">
                            Carregando professores da turma...
                          </p>
                        ) : !modulacoes[turma.id] || modulacoes[turma.id].length === 0 ? (
                          <div className="rounded-lg border border-dashed border-white/45 bg-transparent p-3 text-xs text-slate-500">
                            Nenhum professor vinculado a esta turma.
                          </div>
                        ) : (
                          <div className="space-y-3">
                            {modulacoes[turma.id].map((m, index) => (
                              <div
                                key={m.id || `item-${turma.id}-${index}`}
                                className="rounded-xl border border-white/35 bg-transparent p-3"
                              >
                                <div className="text-sm font-semibold text-slate-800">
                                  {m.professor?.name || "Professor não identificado"}
                                </div>

                                <div className="mt-2 flex flex-wrap gap-2">
                                  <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
                                    {m.disciplina || "Disciplina não informada"}
                                  </span>

                                  <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
                                    {m.cargaHoraria || 0} aulas/semana
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                        ) : null}
                      </div>
                    ) : null}

                    <div className="mt-1">
                      <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
                        Turma ativa no sistema
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {professorAluno ? (
          <div className="rounded-2xl border border-white/35 bg-transparent p-5 shadow-none">
            <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">
                  Acompanhamento do aluno: {professorAluno.name}
                </h3>
                <p className="text-sm text-slate-500">
                  Dados restritos às disciplinas vinculadas ao professor.
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  setProfessorAluno(null);
                  setProfessorAlunoVisao(null);
                }}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Fechar
              </button>
            </div>

            <div className="mb-4 grid gap-3 md:grid-cols-[1fr_160px_160px]">
              <div className="flex flex-wrap gap-2">
                {(["notas", "frequencias", "agendamentos"] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setProfessorAlunoTab(tab)}
                    className={`rounded-xl px-4 py-2 text-sm font-semibold ${
                      professorAlunoTab === tab
                        ? "bg-blue-600 text-white"
                        : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                    }`}
                  >
                    {tab === "notas"
                      ? "Notas"
                      : tab === "frequencias"
                        ? "Frequências e faltas"
                        : "Agendamentos"}
                  </button>
                ))}
              </div>

              <select
                value={professorPeriodo}
                onChange={(event) =>
                  setProfessorPeriodo(event.target.value as PeriodoAvaliacao)
                }
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
              >
                {Object.entries(PERIODO_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>

              <input
                type="number"
                min={2000}
                max={2100}
                value={professorAno}
                onChange={(event) => setProfessorAno(Number(event.target.value))}
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
              />
            </div>

            {loadingProfessorVisao ? (
              <p className="text-sm text-slate-500">Carregando acompanhamento...</p>
            ) : null}

            {!loadingProfessorVisao &&
            professorAlunoVisao &&
            professorAlunoTab === "notas" ? (
              <div className="space-y-4">
                {professorAlunoVisao.notas?.itens?.length === 0 &&
                professorAlunoVisao.notas?.finais?.length === 0 ? (
                  <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
                    Nenhuma nota encontrada para {PERIODO_LABELS[professorPeriodo]}.
                  </p>
                ) : null}

                {professorAlunoVisao.notas?.itens?.map((item: any) => (
                  <div key={item.id} className="rounded-xl border border-slate-200 bg-white p-4">
                    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="font-semibold text-slate-900">
                          {item.atividadeModelo?.titulo || "Atividade"}
                        </p>
                        <p className="text-sm text-slate-500">
                          {item.turmaProfessor?.disciplina} • {item.atividadeModelo?.tipoAtividade}
                        </p>
                      </div>
                      <div className="rounded-xl bg-violet-50 px-3 py-2 text-sm font-bold text-violet-700">
                        {Number(item.notaConsiderada).toFixed(2)} / {Number(item.atividadeModelo?.valorMaximo || 0).toFixed(2)}
                      </div>
                    </div>
                    {item.notaRecuperacao ? (
                      <p className="mt-2 text-xs text-slate-500">
                        Recuperação: {Number(item.notaRecuperacao).toFixed(2)}
                      </p>
                    ) : null}
                    {item.observacao ? (
                      <p className="mt-2 text-sm text-slate-600">{item.observacao}</p>
                    ) : null}
                  </div>
                ))}

                {professorAlunoVisao.notas?.finais?.map((nota: any) => (
                  <div key={nota.id} className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                    <p className="text-sm font-semibold text-emerald-800">
                      Média final em {nota.turmaProfessor?.disciplina}: {Number(nota.notaFinal).toFixed(2)}
                    </p>
                    {nota.observacao ? (
                      <p className="mt-1 text-sm text-emerald-700">{nota.observacao}</p>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}

            {!loadingProfessorVisao &&
            professorAlunoVisao &&
            professorAlunoTab === "frequencias" ? (
              <div className="space-y-4">
                <div className="grid gap-3 md:grid-cols-4">
                  <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
                    Total: <strong>{professorAlunoVisao.resumoFrequencia?.total || 0}</strong>
                  </div>
                  <div className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">
                    Presenças: <strong>{professorAlunoVisao.resumoFrequencia?.presenas || 0}</strong>
                  </div>
                  <div className="rounded-xl bg-red-50 p-3 text-sm text-red-700">
                    Faltas: <strong>{professorAlunoVisao.resumoFrequencia?.faltas || 0}</strong>
                  </div>
                  <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-700">
                    Justificadas: <strong>{professorAlunoVisao.resumoFrequencia?.faltasJustificadas || 0}</strong>
                  </div>
                </div>

                {professorAlunoVisao.frequencias?.length === 0 ? (
                  <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
                    Nenhum lançamento de frequência encontrado para {PERIODO_LABELS[professorPeriodo]}.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {professorAlunoVisao.frequencias.map((freq: any) => (
                      <div key={freq.id} className="rounded-xl border border-slate-200 bg-white p-4">
                        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                          <div>
                            <p className="font-semibold text-slate-900">
                              {new Date(freq.dataLancamento).toLocaleDateString("pt-BR")}
                            </p>
                            <p className="text-sm text-slate-500">
                              {freq.turmaProfessor?.disciplina}
                            </p>
                          </div>
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-bold ${
                              freq.status === "FALTA"
                                ? "bg-red-50 text-red-700"
                                : "bg-emerald-50 text-emerald-700"
                            }`}
                          >
                            {freq.status === "FALTA"
                              ? freq.faltaJustificada
                                ? "Falta justificada"
                                : "Falta"
                              : "Presente"}
                          </span>
                        </div>
                        {freq.observacao ? (
                          <p className="mt-2 text-sm text-slate-600">{freq.observacao}</p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : null}

            {!loadingProfessorVisao &&
            professorAlunoVisao &&
            professorAlunoTab === "agendamentos" ? (
              <div className="space-y-3">
                {professorAlunoVisao.agendamentos?.length === 0 ? (
                  <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
                    Até o momento não há agendamentos para {PERIODO_LABELS[professorPeriodo]}.
                  </p>
                ) : (
                  professorAlunoVisao.agendamentos.map((agenda: any) => (
                    <div key={agenda.id} className="rounded-xl border border-slate-200 bg-white p-4">
                      <p className="font-semibold text-slate-900">{agenda.titulo}</p>
                      <p className="text-sm text-slate-500">
                        {new Date(agenda.data).toLocaleDateString("pt-BR")}
                      </p>
                      {agenda.descricao ? (
                        <p className="mt-2 text-sm text-slate-600">{agenda.descricao}</p>
                      ) : null}
                    </div>
                  ))
                )}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}

