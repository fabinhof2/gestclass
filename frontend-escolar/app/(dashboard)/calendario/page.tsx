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

type Agenda = {
  id: string;
  data: string;
  titulo: string;
  descricao?: string | null;
  professor: {
    id: string;
    name: string;
    fotoUrl?: string | null;
  };
  turma: {
    id: string;
    name: string;
  };
};

const MONTHS = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

const WEEK_DAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"];

function toDateKey(date: Date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateLabel(dateKey: string) {
  const [year, month, day] = dateKey.split("-");
  return `${day}/${month}/${year}`;
}

function buildMonthDays(year: number, monthIndex: number) {
  const firstDay = new Date(Date.UTC(year, monthIndex, 1));
  const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const blanks = Array.from({ length: firstDay.getUTCDay() }, () => null);
  const days = Array.from({ length: daysInMonth }, (_, index) => {
    return new Date(Date.UTC(year, monthIndex, index + 1));
  });

  return [...blanks, ...days];
}

export default function CalendarioPage() {
  const { token, user } = useAuth();
  const isProfessor = user?.role === "PROFESSOR";
  const canManageAgenda =
    isProfessor ||
    user?.role === "ADMIN_ESCOLA" ||
    user?.role === "GESTOR" ||
    user?.role === "SECRETARIA";
  const currentYear = new Date().getFullYear();

  const [turmas, setTurmas] = useState<Turma[]>([]);
  const [turmaId, setTurmaId] = useState("");
  const [year, setYear] = useState(currentYear);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState("");
  const [agendas, setAgendas] = useState<Agenda[]>([]);
  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [editingId, setEditingId] = useState("");
  const [abrangencia, setAbrangencia] = useState<"TURMA" | "TODOS">("TURMA");
  const [turmasSelecionadasIds, setTurmasSelecionadasIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const selectedTurma = useMemo(
    () => turmas.find((turma) => turma.id === turmaId) || null,
    [turmas, turmaId],
  );

  const agendasByDate = useMemo(() => {
    return agendas.reduce<Record<string, Agenda[]>>((acc, item) => {
      const key = toDateKey(new Date(item.data));
      acc[key] = [...(acc[key] || []), item];
      return acc;
    }, {});
  }, [agendas]);

  const selectedDateAgendas = selectedDate ? agendasByDate[selectedDate] || [] : [];

  function headers(json = false) {
    return {
      ...(json ? { "Content-Type": "application/json" } : {}),
      Authorization: `Bearer ${token}`,
    };
  }

  async function loadTurmas() {
    if (!token) return;

    try {
      setError("");
      const response = await fetch(apiUrl("/professor-agenda/turmas"), {
        headers: headers(),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Não foi possível carregar as turmas.");
      }

      const list = Array.isArray(data) ? data : [];
      setTurmas(list);
      setTurmaId((current) => current || list[0]?.id || "");
      setTurmasSelecionadasIds((current) =>
        current.length ? current : list[0]?.id ? [list[0].id] : [],
      );
    } catch (err: any) {
      setError(err.message || "Não foi possível carregar as turmas.");
    }
  }

  async function loadAgendas(selectedTurmaId = turmaId, selectedYear = year) {
    if (!token || !selectedTurmaId) return;

    try {
      setLoading(true);
      setError("");
      const params = new URLSearchParams({
        turmaId: selectedTurmaId,
        ano: String(selectedYear),
      });
      const response = await fetch(apiUrl(`/professor-agenda?${params}`), {
        headers: headers(),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Não foi possível carregar a agenda.");
      }

      setAgendas(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setError(err.message || "Não foi possível carregar a agenda.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTurmas();
  }, [token]);

  useEffect(() => {
    if (calendarOpen && turmaId) {
      loadAgendas(turmaId, year);
    }
  }, [calendarOpen, turmaId, year, token]);

  function resetForm() {
    setTitulo("");
    setDescricao("");
    setEditingId("");
    setAbrangencia("TURMA");
    setTurmasSelecionadasIds(turmaId ? [turmaId] : []);
  }

  function selectDay(date: Date) {
    const key = toDateKey(date);
    setSelectedDate(key);
    resetForm();
    setSuccess("");
    setError("");
  }

  function startEdit(item: Agenda) {
    setSelectedDate(toDateKey(new Date(item.data)));
    setTitulo(item.titulo);
    setDescricao(item.descricao || "");
    setEditingId(item.id);
    setError("");
    setSuccess("");
  }

  async function saveAgenda(event: FormEvent) {
    event.preventDefault();
    if (!token || !canManageAgenda) return;

    try {
      setSaving(true);
      setError("");
      setSuccess("");

      const normalizedTitle = titulo.trim();
      const normalizedDescription = descricao.trim();

      if (!turmaId) {
        throw new Error("Selecione a turma.");
      }

      if (!selectedDate) {
        throw new Error("Selecione um dia no calendário.");
      }

      if (!normalizedTitle) {
        throw new Error("Digite o agendamento.");
      }

      const turmaIds = editingId
        ? [turmaId]
        : abrangencia === "TODOS"
          ? turmas.map((turma) => turma.id)
          : turmasSelecionadasIds;

      if (!turmaIds.length) {
        throw new Error("Selecione ao menos uma turma.");
      }

      const saveResults = await Promise.all(
        turmaIds.map(async (destinoTurmaId) => {
        const payload = {
          turmaId: destinoTurmaId,
          data: selectedDate,
          titulo: normalizedTitle,
          descricao: normalizedDescription,
        };

        const response = await fetch(
          apiUrl(
            editingId
              ? `/professor-agenda/${editingId}`
              : "/professor-agenda",
          ),
          {
            method: editingId ? "PATCH" : "POST",
            headers: headers(true),
            body: JSON.stringify(payload),
          },
        );
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || "Não foi possível salvar o agendamento.");
        }

          return data as Agenda;
        }),
      );

      const savedItems = saveResults.filter(Boolean);

      setAgendas((current) => {
        if (!savedItems.length) return current;

        if (editingId) {
          const updated = savedItems[0];
          return current.map((item) => (item.id === editingId ? updated : item));
        }

        const itemsToAppend = savedItems.filter((item) => item.turma.id === turmaId);
        if (!itemsToAppend.length) return current;
        return [...current, ...itemsToAppend].sort((a, b) => {
          const byDate = new Date(a.data).getTime() - new Date(b.data).getTime();
          if (byDate !== 0) return byDate;
          return a.titulo.localeCompare(b.titulo, "pt-BR");
        });
      });

      setSuccess(editingId ? "Agendamento atualizado." : "Agendamento salvo.");
      resetForm();
      await loadAgendas(turmaId, year);
    } catch (err: any) {
      setError(err.message || "Não foi possível salvar o agendamento.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteAgenda(id: string) {
    if (!token || !canManageAgenda) return;
    if (!confirm("Deseja realmente excluir este agendamento?")) return;

    try {
      setError("");
      setSuccess("");
      const response = await fetch(apiUrl(`/professor-agenda/${id}`), {
        method: "DELETE",
        headers: headers(),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Não foi possível excluir o agendamento.");
      }

      setSuccess("Agendamento excluído.");
      if (editingId === id) resetForm();
      await loadAgendas(turmaId, year);
    } catch (err: any) {
      setError(err.message || "Não foi possível excluir o agendamento.");
    }
  }

  return (
    <section className="space-y-6">
      <PageHeader
        title="Calendário"
        description="Agenda anual por turma, compartilhada entre professores e alunos."
      />

      <div className="card-base space-y-5 p-6">
        <div className="grid gap-4 md:grid-cols-[1fr_180px_auto] md:items-end">
          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">
              Turma
            </label>
            <select
              value={turmaId}
              onChange={(event) => {
                const novaTurmaId = event.target.value;
                setTurmaId(novaTurmaId);
                setTurmasSelecionadasIds(novaTurmaId ? [novaTurmaId] : []);
                setSelectedDate("");
                setTitulo("");
                setDescricao("");
                setEditingId("");
                setAbrangencia("TURMA");
              }}
              className="w-full rounded-xl border border-slate-300 px-3 py-3 text-sm outline-none focus:border-blue-500"
            >
              <option value="">Selecione a turma</option>
              {turmas.map((turma) => (
                <option key={turma.id} value={turma.id}>
                  {turma.name}
                  {turma.turno ? ` - ${formatTurno(turma.turno)}` : ""}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">
              Ano
            </label>
            <input
              type="number"
              min={2000}
              max={2100}
              value={year}
              onChange={(event) => setYear(Number(event.target.value))}
              className="w-full rounded-xl border border-slate-300 px-3 py-3 text-sm outline-none focus:border-blue-500"
            />
          </div>

          <button
            type="button"
            onClick={() => {
              setCalendarOpen(true);
              if (turmaId) loadAgendas(turmaId, year);
            }}
            disabled={!turmaId}
            className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Abrir calendário anual
          </button>
        </div>

        {selectedTurma ? (
          <p className="text-sm text-slate-500">
            Agenda selecionada:{" "}
            <span className="font-semibold text-slate-800">{selectedTurma.name}</span>
          </p>
        ) : null}

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
      </div>

      {calendarOpen ? (
        <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
          <div className="card-base p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold text-slate-900">
                  Calendário anual de {year}
                </h2>
                <p className="text-sm text-slate-500">
                  Clique em um dia para consultar ou registrar agendamentos.
                </p>
              </div>
              {loading ? (
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
                  Carregando...
                </span>
              ) : null}
            </div>

            <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
              {MONTHS.map((month, monthIndex) => (
                <div
                  key={month}
                  className="rounded-2xl border border-slate-200 bg-white p-4"
                >
                  <h3 className="mb-3 text-sm font-black uppercase tracking-wide text-slate-700">
                    {month}
                  </h3>
                  <div className="grid grid-cols-7 gap-1 text-center">
                    {WEEK_DAYS.map((day) => (
                      <span
                        key={day}
                        className="py-1 text-[10px] font-bold uppercase text-slate-400"
                      >
                        {day}
                      </span>
                    ))}
                    {buildMonthDays(year, monthIndex).map((date, index) => {
                      if (!date) {
                        return <span key={`blank-${month}-${index}`} />;
                      }

                      const key = toDateKey(date);
                      const dayAgendas = agendasByDate[key] || [];
                      const selected = selectedDate === key;

                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => selectDay(date)}
                          className={`relative min-h-12 rounded-xl border px-1 py-2 text-sm font-bold transition ${
                            selected
                              ? "border-blue-600 bg-blue-600 text-white"
                              : dayAgendas.length
                                ? "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                                : "border-slate-100 bg-slate-50 text-slate-700 hover:bg-slate-100"
                          }`}
                        >
                          {date.getUTCDate()}
                          {dayAgendas.length ? (
                            <span
                              className={`absolute bottom-1 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full ${
                                selected ? "bg-white" : "bg-emerald-600"
                              }`}
                            />
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <aside className="card-base p-5">
            {!selectedDate ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm font-semibold text-slate-500">
                Selecione um dia no calendário.
              </div>
            ) : (
              <div className="space-y-5">
                <div>
                  <p className="text-sm font-semibold text-slate-500">
                    Dia selecionado
                  </p>
                  <h2 className="text-2xl font-black text-slate-900">
                    {formatDateLabel(selectedDate)}
                  </h2>
                </div>

                {canManageAgenda ? (
                  <form
                    onSubmit={saveAgenda}
                    className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                  >
                    <p className="mb-3 text-sm font-bold text-slate-900">
                      {editingId ? "Editar agendamento" : "Novo agendamento"}
                    </p>
                    {!editingId ? (
                      <div className="mb-3 space-y-3">
                        <div>
                          <label className="mb-1 block text-xs font-bold uppercase text-slate-500">
                            Para quem vale
                          </label>
                          <select
                            value={abrangencia}
                            onChange={(event) =>
                              setAbrangencia(event.target.value as "TURMA" | "TODOS")
                            }
                            className="w-full rounded-xl border border-slate-300 px-3 py-3 text-sm outline-none focus:border-blue-500"
                          >
                            <option value="TURMA">Apenas turma(s)</option>
                            <option value="TODOS">Todos</option>
                          </select>
                        </div>

                        {abrangencia === "TURMA" ? (
                          <div>
                            <label className="mb-1 block text-xs font-bold uppercase text-slate-500">
                              Turmas envolvidas
                            </label>
                            <select
                              multiple
                              value={turmasSelecionadasIds}
                              onChange={(event) => {
                                const selected = Array.from(
                                  event.currentTarget.selectedOptions,
                                ).map((option) => option.value);
                                setTurmasSelecionadasIds(selected);
                              }}
                              className="min-h-28 w-full rounded-xl border border-slate-300 px-3 py-3 text-sm outline-none focus:border-blue-500"
                            >
                              {turmas.map((turma) => (
                                <option key={turma.id} value={turma.id}>
                                  {turma.name}
                                  {turma.turno ? ` - ${formatTurno(turma.turno)}` : ""}
                                </option>
                              ))}
                            </select>
                            <p className="mt-1 text-xs text-slate-500">
                              Segure Ctrl para selecionar mais de uma turma.
                            </p>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                    <input
                      type="text"
                      value={titulo}
                      onChange={(event) => setTitulo(event.target.value)}
                      placeholder="Ex.: Prova de matemática"
                      className="w-full rounded-xl border border-slate-300 px-3 py-3 text-sm outline-none focus:border-blue-500"
                    />
                    <textarea
                      value={descricao}
                      onChange={(event) => setDescricao(event.target.value)}
                      rows={4}
                      placeholder="Detalhes para os alunos..."
                      className="mt-3 w-full resize-none rounded-xl border border-slate-300 px-3 py-3 text-sm outline-none focus:border-blue-500"
                    />
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="submit"
                        disabled={saving}
                        className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-60"
                      >
                        {saving ? "Salvando..." : "Salvar"}
                      </button>
                      {editingId ? (
                        <button
                          type="button"
                          onClick={resetForm}
                          className="rounded-xl border border-slate-300 px-4 py-3 text-sm font-bold text-slate-700 hover:bg-white"
                        >
                          Cancelar
                        </button>
                      ) : null}
                    </div>
                  </form>
                ) : null}

                <div>
                  <h3 className="mb-3 text-sm font-bold text-slate-900">
                    Agendamentos do dia
                  </h3>
                  {selectedDateAgendas.length === 0 ? (
                    <p className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">
                      Nenhum agendamento para este dia.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {selectedDateAgendas.map((item) => (
                        <div
                          key={item.id}
                          className="rounded-2xl border border-slate-200 bg-white p-4"
                        >
                          <p className="font-bold text-slate-900">{item.titulo}</p>
                          {item.descricao ? (
                            <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">
                              {item.descricao}
                            </p>
                          ) : null}
                          <p className="mt-3 text-xs font-semibold text-slate-500">
                            Criado por: {item.professor.name}
                          </p>
                          {canManageAgenda && item.professor.id === user?.id ? (
                            <div className="mt-3 flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => startEdit(item)}
                                className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-200"
                              >
                                Editar
                              </button>
                              <button
                                type="button"
                                onClick={() => deleteAgenda(item.id)}
                                className="rounded-xl bg-red-50 px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-100"
                              >
                                Excluir
                              </button>
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </aside>
        </div>
      ) : null}
    </section>
  );
}

