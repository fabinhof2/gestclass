"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/ui/page-header";
import { useAuth } from "@/context/auth-context";
import { apiUrl } from "@/lib/api";
import { formatTurno } from "@/lib/turno";

type Turma = {
  id: string;
  name: string;
  turno?: string | null;
};

type Disciplina = {
  id: string;
  turmaId: string;
  série: string;
  nome: string;
  cargaHoraria: number;
};

type ReplicarDisciplinaDraft = {
  id: string;
  nome: string;
  cargaHoraria: string;
  selected: boolean;
};

type ReplicationMode = "manual" | "série" | "all";

function deriveSérieLabel(turmaName: string) {
  const normalized = String(turmaName || "")
    .replace(/\s+/g, " ")
    .trim();

  const yearMatch = normalized.match(
    /\d{1,2}\s*(?:º|°)?\s*(?:ano|anos|série|série)/i,
  );

  if (yearMatch) {
    return yearMatch[0]
      .replace(/\s+/g, " ")
      .replace(/série/i, "Série")
      .replace(/série/i, "Série")
      .replace(/ano/i, "Ano")
      .trim();
  }

  const stageMatch = normalized.match(
    /(berçário|bercario|maternal|jardim|infantil|pré|pre)\s*\w*/i,
  );

  if (stageMatch) {
    return stageMatch[0].replace(/\s+/g, " ").trim();
  }

  const fallback = normalized.split(" ").slice(0, 2).join(" ").trim();
  return fallback || "Sem série";
}

export default function DisciplinasPage() {
  const { token, selectedSchool } = useAuth();

  const [turmas, setTurmas] = useState<Turma[]>([]);
  const [disciplinas, setDisciplinas] = useState<Disciplina[]>([]);
  const [selectedSérie, setSelectedSérie] = useState("");
  const [selectedTurmaId, setSelectedTurmaId] = useState("");
  const [nome, setNome] = useState("");
  const [cargaHoraria, setCargaHoraria] = useState("1");
  const [editingDisciplinaId, setEditingDisciplinaId] = useState<string | null>(
    null,
  );
  const [loadingTurmas, setLoadingTurmas] = useState(true);
  const [loadingDisciplinas, setLoadingDisciplinas] = useState(false);
  const [loadingReplicaOrigem, setLoadingReplicaOrigem] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isReplicating, setIsReplicating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isDeletingAll, setIsDeletingAll] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [sourceTurmaId, setSourceTurmaId] = useState("");
  const [replicationMode, setReplicationMode] = useState<ReplicationMode>("manual");
  const [replicaDraft, setReplicaDraft] = useState<ReplicarDisciplinaDraft[]>([]);
  const [replicaTargetTurmaIds, setReplicaTargetTurmaIds] = useState<string[]>([]);

  const requestHeaders = useMemo(
    () => ({
      Authorization: `Bearer ${token}`,
      ...(selectedSchool?.id ? { "x-school-id": selectedSchool.id } : {}),
    }),
    [selectedSchool?.id, token],
  );

  const turmasComSérie = useMemo(
    () =>
      turmas.map((turma) => ({
        ...turma,
        sérieLabel: deriveSérieLabel(turma.name),
      })),
    [turmas],
  );

  const sériesOptions = useMemo(() => {
    return Array.from(new Set(turmasComSérie.map((turma) => turma.sérieLabel))).sort(
      (a, b) => a.localeCompare(b, "pt-BR", { numeric: true }),
    );
  }, [turmasComSérie]);

  const turmasFiltradas = useMemo(() => {
    return turmasComSérie
      .filter((turma) => !selectedSérie || turma.sérieLabel === selectedSérie)
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { numeric: true }));
  }, [selectedSérie, turmasComSérie]);

  const turmaSelecionada = turmasComSérie.find(
    (turma) => turma.id === selectedTurmaId,
  );

  const sourceTurmaOptions = useMemo(() => {
    return [...turmasComSérie].sort((a, b) =>
      a.name.localeCompare(b.name, "pt-BR", { numeric: true }),
    );
  }, [turmasComSérie]);

  const targetTurmaOptions = useMemo(() => {
    return turmasComSérie
      .filter((turma) => turma.id !== sourceTurmaId)
      .sort((a, b) => {
        const sériesSort = a.sérieLabel.localeCompare(b.sérieLabel, "pt-BR", {
          numeric: true,
        });
        if (sériesSort !== 0) return sériesSort;
        return a.name.localeCompare(b.name, "pt-BR", { numeric: true });
      });
  }, [sourceTurmaId, turmasComSérie]);

  const targetTurmasBySérie = useMemo(() => {
    return targetTurmaOptions.reduce<Record<string, typeof targetTurmaOptions>>(
      (acc, turma) => {
        const key = turma.sérieLabel;
        if (!acc[key]) {
          acc[key] = [];
        }
        acc[key].push(turma);
        return acc;
      },
      {},
    );
  }, [targetTurmaOptions]);

  const targetSérieKeys = useMemo(() => {
    return Object.keys(targetTurmasBySérie).sort((a, b) =>
      a.localeCompare(b, "pt-BR", { numeric: true }),
    );
  }, [targetTurmasBySérie]);

  const selectedReplicaCount = useMemo(() => {
    return replicaDraft.filter((item) => item.selected).length;
  }, [replicaDraft]);

  const sourceTurma = turmasComSérie.find((turma) => turma.id === sourceTurmaId);

  const resolvedTargetTurmaIds = useMemo(() => {
    if (replicationMode === "all") {
      return targetTurmaOptions.map((turma) => turma.id);
    }

    if (replicationMode === "série") {
      if (!selectedSérie) return [];
      return targetTurmaOptions
        .filter((turma) => turma.sérieLabel === selectedSérie)
        .map((turma) => turma.id);
    }

    return replicaTargetTurmaIds.filter((turmaId) =>
      targetTurmaOptions.some((turma) => turma.id === turmaId),
    );
  }, [replicaTargetTurmaIds, replicationMode, selectedSérie, targetTurmaOptions]);

  const resolvedTargetTurmas = useMemo(() => {
    const ids = new Set(resolvedTargetTurmaIds);
    return targetTurmaOptions.filter((turma) => ids.has(turma.id));
  }, [resolvedTargetTurmaIds, targetTurmaOptions]);

  async function fetchTurmas() {
    try {
      setLoadingTurmas(true);
      setErrorMessage("");

      const response = await fetch(apiUrl("/turmas"), {
        headers: requestHeaders,
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Erro ao carregar turmas.");
      }

      setTurmas(Array.isArray(data) ? data : []);
    } catch (error: any) {
      setErrorMessage(error.message || "Não foi possível carregar as turmas.");
      setTurmas([]);
    } finally {
      setLoadingTurmas(false);
    }
  }

  async function fetchDisciplinas(turmaId: string) {
    if (!turmaId) {
      setDisciplinas([]);
      return;
    }

    try {
      setLoadingDisciplinas(true);
      setErrorMessage("");

      const response = await fetch(
        apiUrl(`/disciplinas?turmaId=${encodeURIComponent(turmaId)}`),
        {
          headers: requestHeaders,
        },
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Erro ao carregar disciplinas.");
      }

      setDisciplinas(Array.isArray(data) ? data : []);
    } catch (error: any) {
      setErrorMessage(error.message || "Não foi possível carregar as disciplinas.");
      setDisciplinas([]);
    } finally {
      setLoadingDisciplinas(false);
    }
  }

  async function fetchReplicaSourceDisciplinas(turmaId: string) {
    if (!turmaId) {
      setReplicaDraft([]);
      return;
    }

    try {
      setLoadingReplicaOrigem(true);
      setErrorMessage("");

      const response = await fetch(
        apiUrl(`/disciplinas?turmaId=${encodeURIComponent(turmaId)}`),
        {
          headers: requestHeaders,
        },
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Erro ao carregar disciplinas da origem.");
      }

      const lista = Array.isArray(data) ? data : [];
      setReplicaDraft(
        lista.map((disciplina) => ({
          id: disciplina.id,
          nome: disciplina.nome,
          cargaHoraria: String(disciplina.cargaHoraria),
          selected: true,
        })),
      );
    } catch (error: any) {
      setErrorMessage(
        error.message || "Não foi possível carregar as disciplinas da turma de origem.",
      );
      setReplicaDraft([]);
    } finally {
      setLoadingReplicaOrigem(false);
    }
  }

  useEffect(() => {
    if (!token) return;
    fetchTurmas();
  }, [requestHeaders, token]);

  useEffect(() => {
    if (!selectedSérie) return;

    const turmaDaSérie = turmasComSérie.some(
      (turma) => turma.id === selectedTurmaId && turma.sérieLabel === selectedSérie,
    );

    if (!turmaDaSérie) {
      setSelectedTurmaId("");
      setDisciplinas([]);
      setEditingDisciplinaId(null);
      setNome("");
      setCargaHoraria("1");
    }
  }, [selectedSérie, selectedTurmaId, turmasComSérie]);

  useEffect(() => {
    if (!token || !selectedTurmaId) {
      setDisciplinas([]);
      return;
    }

    fetchDisciplinas(selectedTurmaId);
  }, [requestHeaders, selectedTurmaId, token]);

  useEffect(() => {
    if (!selectedSérie && sériesOptions.length > 0) {
      setSelectedSérie(sériesOptions[0]);
    }
  }, [selectedSérie, sériesOptions]);

  useEffect(() => {
    if (!sourceTurmaId) {
      setReplicaDraft([]);
      return;
    }

    setReplicaTargetTurmaIds((current) =>
      current.filter((turmaId) => turmaId !== sourceTurmaId),
    );

    fetchReplicaSourceDisciplinas(sourceTurmaId);
  }, [requestHeaders, sourceTurmaId]);

  function resetForm() {
    setEditingDisciplinaId(null);
    setNome("");
    setCargaHoraria("1");
  }

  function updateReplicaCargaHoraria(id: string, value: string) {
    setReplicaDraft((current) =>
      current.map((item) => (item.id === id ? { ...item, cargaHoraria: value } : item)),
    );
  }

  function toggleReplicaDisciplina(id: string) {
    setReplicaDraft((current) =>
      current.map((item) =>
        item.id === id ? { ...item, selected: !item.selected } : item,
      ),
    );
  }

  function setAllReplicaDisciplinas(selected: boolean) {
    setReplicaDraft((current) => current.map((item) => ({ ...item, selected })));
  }

  function toggleReplicaTargetTurma(turmaId: string) {
    setReplicaTargetTurmaIds((current) =>
      current.includes(turmaId)
        ? current.filter((item) => item !== turmaId)
        : [...current, turmaId],
    );
  }

  function selectAllTargetTurmas() {
    setReplicationMode("manual");
    setReplicaTargetTurmaIds(targetTurmaOptions.map((turma) => turma.id));
  }

  function selectSérieTargetTurmas() {
    setReplicationMode("manual");
    setReplicaTargetTurmaIds(
      targetTurmaOptions
        .filter((turma) => turma.sérieLabel === selectedSérie)
        .map((turma) => turma.id),
    );
  }

  function clearTargetTurmas() {
    setReplicaTargetTurmaIds([]);
  }

  function handleEdit(disciplina: Disciplina) {
    setEditingDisciplinaId(disciplina.id);
    setNome(disciplina.nome);
    setCargaHoraria(String(disciplina.cargaHoraria));
    setErrorMessage("");
    setSuccessMessage("");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");
    setSuccessMessage("");

    if (!selectedSérie) {
      setErrorMessage("Selecione a série.");
      return;
    }

    if (!selectedTurmaId) {
      setErrorMessage("Selecione a turma.");
      return;
    }

    if (!nome.trim()) {
      setErrorMessage("Informe o nome da disciplina.");
      return;
    }

    if (!cargaHoraria || Number(cargaHoraria) <= 0) {
      setErrorMessage("Informe uma quantidade valida de aulas.");
      return;
    }

    try {
      setIsSubmitting(true);

      const isEditing = Boolean(editingDisciplinaId);
      const response = await fetch(
        apiUrl(isEditing ? `/disciplinas/${editingDisciplinaId}` : "/disciplinas"),
        {
          method: isEditing ? "PATCH" : "POST",
          headers: {
            "Content-Type": "application/json",
            ...requestHeaders,
          },
          body: JSON.stringify({
            turmaId: selectedTurmaId,
            série: selectedSérie,
            nome: nome.trim(),
            cargaHoraria: Number(cargaHoraria),
          }),
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Erro ao salvar disciplina.");
      }

      setSuccessMessage(
        isEditing
          ? "Disciplina atualizada com sucesso."
          : "Disciplina cadastrada com sucesso.",
      );
      resetForm();
      await fetchDisciplinas(selectedTurmaId);
    } catch (error: any) {
      setErrorMessage(error.message || "Não foi possível salvar a disciplina.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete(disciplina: Disciplina) {
    if (!window.confirm(`Deseja excluir a disciplina "${disciplina.nome}"?`)) {
      return;
    }

    try {
      setDeletingId(disciplina.id);
      setErrorMessage("");
      setSuccessMessage("");

      const response = await fetch(apiUrl(`/disciplinas/${disciplina.id}`), {
        method: "DELETE",
        headers: requestHeaders,
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Erro ao excluir disciplina.");
      }

      if (editingDisciplinaId === disciplina.id) {
        resetForm();
      }

      setSuccessMessage(data.message || "Disciplina excluída com sucesso.");
      await fetchDisciplinas(selectedTurmaId);
    } catch (error: any) {
      setErrorMessage(error.message || "Não foi possível excluir a disciplina.");
    } finally {
      setDeletingId(null);
    }
  }

  async function handleDeleteAllByTurma() {
    if (!selectedTurmaId || !turmaSelecionada) {
      setErrorMessage("Selecione a turma que deseja limpar.");
      return;
    }

    if (
      !window.confirm(
        `Deseja excluir todas as disciplinas da turma "${turmaSelecionada.name}"?`,
      )
    ) {
      return;
    }

    try {
      setIsDeletingAll(true);
      setErrorMessage("");
      setSuccessMessage("");

      const response = await fetch(
        apiUrl(`/disciplinas/turma/${selectedTurmaId}`),
        {
          method: "DELETE",
          headers: requestHeaders,
        },
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Erro ao excluir disciplinas da turma.");
      }

      resetForm();
      setSuccessMessage(
        data.message || "Todas as disciplinas da turma foram excluídas com sucesso.",
      );
      await fetchDisciplinas(selectedTurmaId);
    } catch (error: any) {
      setErrorMessage(
        error.message || "Não foi possível excluir as disciplinas da turma.",
      );
    } finally {
      setIsDeletingAll(false);
    }
  }

  async function handleReplicate() {
    setErrorMessage("");
    setSuccessMessage("");

    if (!sourceTurmaId) {
      setErrorMessage("Selecione a turma de origem.");
      return;
    }

    const itensSelecionados = replicaDraft.filter((item) => item.selected);

    if (itensSelecionados.length === 0) {
      setErrorMessage("Selecione ao menos uma disciplina para replicar.");
      return;
    }

    const invalidDraft = itensSelecionados.find(
      (item) => !item.nome.trim() || Number(item.cargaHoraria) <= 0,
    );

    if (invalidDraft) {
      setErrorMessage("Revise a quantidade de aulas das disciplinas selecionadas.");
      return;
    }

    if (replicationMode === "série" && !selectedSérie) {
      setErrorMessage("Selecione uma série para usar o atalho por série.");
      return;
    }

    if (resolvedTargetTurmaIds.length === 0) {
      setErrorMessage("Selecione ao menos uma turma de destino.");
      return;
    }

    try {
      setIsReplicating(true);

      const response = await fetch(apiUrl("/disciplinas/replicar"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...requestHeaders,
        },
        body: JSON.stringify({
          turmaOrigemId: sourceTurmaId,
          turmaDestinoIds: resolvedTargetTurmaIds,
          itens: itensSelecionados.map((item) => ({
            id: item.id,
            nome: item.nome.trim(),
            cargaHoraria: Number(item.cargaHoraria),
          })),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Erro ao replicar disciplinas.");
      }

      const skippedSummary = Array.isArray(data.skippedByTurma)
        ? data.skippedByTurma
            .filter((item: any) => Array.isArray(item.disciplinasIgnoradas))
            .map(
              (item: any) =>
                `${item.turmaNome}: ${item.disciplinasIgnoradas.join(", ")}`,
            )
            .join(" | ")
        : "";

      setSuccessMessage(
        skippedSummary
          ? `${data.message} Ja existentes ignoradas: ${skippedSummary}.`
          : data.message || "Disciplinas replicadas com sucesso.",
      );

      if (selectedTurmaId && resolvedTargetTurmaIds.includes(selectedTurmaId)) {
        await fetchDisciplinas(selectedTurmaId);
      }
    } catch (error: any) {
      setErrorMessage(error.message || "Não foi possível replicar as disciplinas.");
    } finally {
      setIsReplicating(false);
    }
  }

  return (
    <section className="space-y-6">
      <PageHeader
        title="Disciplinas"
        description="Cadastre as disciplinas por série e turma com a quantidade semanal de aulas."
      />

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="card-base space-y-5 p-6">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">
              {editingDisciplinaId ? "Editar disciplina" : "Nova disciplina"}
            </h2>
            <p className="text-sm text-slate-500">
              Escolha a série e a turma para montar a base usada na modulacao de
              professores.
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
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Série
                </label>
                <select
                  value={selectedSérie}
                  onChange={(event) => setSelectedSérie(event.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
                >
                  <option value="">
                    {loadingTurmas ? "Carregando séries..." : "Selecione a série"}
                  </option>
                  {sériesOptions.map((série) => (
                    <option key={série} value={série}>
                      {série}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Turma
                </label>
                <select
                  value={selectedTurmaId}
                  onChange={(event) => {
                    setSelectedTurmaId(event.target.value);
                    resetForm();
                  }}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
                >
                  <option value="">
                    {loadingTurmas ? "Carregando turmas..." : "Selecione a turma"}
                  </option>
                  {turmasFiltradas.map((turma) => (
                    <option key={turma.id} value={turma.id}>
                      {turma.name} - {formatTurno(turma.turno)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Nome da disciplina
              </label>
              <input
                type="text"
                value={nome}
                onChange={(event) => setNome(event.target.value)}
                placeholder="Ex.: Matematica"
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Quantidade semanal de aulas
              </label>
              <input
                type="number"
                min={1}
                value={cargaHoraria}
                onChange={(event) => setCargaHoraria(event.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
              />
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="submit"
                disabled={isSubmitting}
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting
                  ? "Salvando..."
                  : editingDisciplinaId
                    ? "Atualizar disciplina"
                    : "Salvar disciplina"}
              </button>

              {editingDisciplinaId ? (
                <button
                  type="button"
                  onClick={resetForm}
                  className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancelar edicao
                </button>
              ) : null}
            </div>
          </form>

          <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-800">
                Replicar disciplinas cadastradas
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                Escolha uma turma de origem, marque as disciplinas com check e
                replique para uma ou varias turmas, inclusive de outras séries.
              </p>
            </div>

            <div className="mt-4 space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Turma de origem
                </label>
                <select
                  value={sourceTurmaId}
                  onChange={(event) => setSourceTurmaId(event.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
                >
                  <option value="">Selecione a turma de origem</option>
                  {sourceTurmaOptions.map((turma) => (
                    <option key={turma.id} value={turma.id}>
                      {turma.sérieLabel} - {turma.name} - {formatTurno(turma.turno)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4">
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    Destino da replicacao
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setReplicationMode("manual")}
                      className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                        replicationMode === "manual"
                          ? "bg-slate-900 text-white"
                          : "border border-slate-300 text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      Escolher turmas
                    </button>
                    <button
                      type="button"
                      onClick={() => setReplicationMode("série")}
                      className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                        replicationMode === "série"
                          ? "bg-slate-900 text-white"
                          : "border border-slate-300 text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      Todas da série selecionada
                    </button>
                    <button
                      type="button"
                      onClick={() => setReplicationMode("all")}
                      className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                        replicationMode === "all"
                          ? "bg-slate-900 text-white"
                          : "border border-slate-300 text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      Todas as séries e turmas
                    </button>
                  </div>
                </div>

                {replicationMode === "manual" ? (
                  <div className="space-y-3">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={selectAllTargetTurmas}
                        className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        Selecionar todas as turmas
                      </button>
                      <button
                        type="button"
                        onClick={selectSérieTargetTurmas}
                        disabled={!selectedSérie}
                        className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Selecionar turmas da série
                      </button>
                      <button
                        type="button"
                        onClick={clearTargetTurmas}
                        className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        Limpar turmas
                      </button>
                    </div>

                    <div className="max-h-72 space-y-3 overflow-y-auto pr-1">
                      {targetSérieKeys.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                          Nenhuma turma disponivel para destino.
                        </div>
                      ) : (
                        targetSérieKeys.map((série) => (
                          <div
                            key={série}
                            className="rounded-xl border border-slate-200 bg-slate-50 p-3"
                          >
                            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                              {série}
                            </div>
                            <div className="space-y-2">
                              {targetTurmasBySérie[série].map((turma) => (
                                <label
                                  key={turma.id}
                                  className="flex cursor-pointer items-start gap-3 rounded-lg bg-white px-3 py-2 text-sm text-slate-700"
                                >
                                  <input
                                    type="checkbox"
                                    checked={replicaTargetTurmaIds.includes(turma.id)}
                                    onChange={() => toggleReplicaTargetTurma(turma.id)}
                                    className="mt-0.5 h-4 w-4 rounded border-slate-300"
                                  />
                                  <span>
                                    {turma.name} - {formatTurno(turma.turno)}
                                  </span>
                                </label>
                              ))}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                    {replicationMode === "série"
                      ? selectedSérie
                        ? `Serao usadas todas as turmas da série ${selectedSérie}, exceto a turma de origem.`
                        : "Escolha uma série acima para usar esse atalho."
                      : "Serao usadas todas as turmas da escola, exceto a turma de origem."}
                  </div>
                )}

                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                  {resolvedTargetTurmas.length} turma(s) selecionada(s) para receber a
                  replicacao.
                </div>
              </div>

              {!sourceTurmaId ? null : loadingReplicaOrigem ? (
                <p className="text-sm text-slate-500">
                  Carregando disciplinas da turma de origem...
                </p>
              ) : replicaDraft.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-3 text-sm text-slate-600">
                  Nenhuma disciplina encontrada na turma de origem.
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm text-slate-600">
                      Origem:{" "}
                      <span className="font-medium text-slate-800">
                        {sourceTurma?.sérieLabel} - {sourceTurma?.name}
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setAllReplicaDisciplinas(true)}
                        className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        Marcar todas
                      </button>
                      <button
                        type="button"
                        onClick={() => setAllReplicaDisciplinas(false)}
                        className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        Limpar checks
                      </button>
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                    {selectedReplicaCount} disciplina(s) marcada(s).
                  </div>

                  {replicaDraft.map((item) => (
                    <div
                      key={item.id}
                      className="grid gap-3 rounded-xl border border-slate-200 bg-white p-3 md:grid-cols-[auto_1fr_180px]"
                    >
                      <label className="flex items-start justify-center pt-2">
                        <input
                          type="checkbox"
                          checked={item.selected}
                          onChange={() => toggleReplicaDisciplina(item.id)}
                          className="h-4 w-4 rounded border-slate-300"
                        />
                      </label>

                      <div>
                        <div className="text-sm font-medium text-slate-800">
                          {item.nome}
                        </div>
                        <div className="text-xs text-slate-500">
                          Marque apenas as disciplinas que deseja replicar.
                        </div>
                      </div>

                      <div>
                        <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                          Aulas por semana
                        </label>
                        <input
                          type="number"
                          min={1}
                          value={item.cargaHoraria}
                          onChange={(event) =>
                            updateReplicaCargaHoraria(item.id, event.target.value)
                          }
                          className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
                        />
                      </div>
                    </div>
                  ))}

                  <button
                    type="button"
                    onClick={handleReplicate}
                    disabled={isReplicating}
                    className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isReplicating ? "Replicando..." : "Replicar disciplinas"}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="card-base space-y-5 p-6">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">
              Disciplinas cadastradas
            </h2>
            <p className="text-sm text-slate-500">
              {turmaSelecionada
                ? `Base da turma ${turmaSelecionada.name}.`
                : "Selecione uma turma para visualizar as disciplinas ja criadas."}
            </p>
          </div>

          {selectedTurmaId && disciplinas.length > 0 ? (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleDeleteAllByTurma}
                disabled={isDeletingAll}
                className="rounded-xl border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isDeletingAll ? "Excluindo tudo..." : "Excluir todas da turma"}
              </button>
            </div>
          ) : null}

          {!selectedTurmaId ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
              <p className="text-sm font-medium text-slate-700">
                Escolha uma série e uma turma para comecar.
              </p>
            </div>
          ) : loadingDisciplinas ? (
            <p className="text-sm text-slate-500">Carregando disciplinas...</p>
          ) : disciplinas.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
              <p className="text-sm font-medium text-slate-700">
                Nenhuma disciplina cadastrada para esta turma.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {disciplinas.map((disciplina) => (
                <div
                  key={disciplina.id}
                  className="rounded-2xl border border-slate-200 bg-white p-4"
                >
                  <div className="flex flex-col gap-3">
                    <div>
                      <strong className="text-slate-800">{disciplina.nome}</strong>
                      <div className="mt-1 text-sm text-slate-500">
                        {disciplina.série} - {disciplina.cargaHoraria} aulas/semana
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => handleEdit(disciplina)}
                        className="rounded-lg border border-blue-300 px-3 py-2 text-xs font-medium text-blue-700 hover:bg-blue-50"
                      >
                        Editar
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDelete(disciplina)}
                        disabled={deletingId === disciplina.id}
                        className="rounded-lg border border-red-300 px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {deletingId === disciplina.id ? "Excluindo..." : "Excluir"}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
