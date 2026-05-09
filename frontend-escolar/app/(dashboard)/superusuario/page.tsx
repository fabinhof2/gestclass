"use client";

import Link from "next/link";
import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  BarChart3,
  Building2,
  CreditCard,
  Download,
  ExternalLink,
  FileUp,
  Loader2,
  Lock,
  Pencil,
  Plus,
  RefreshCcw,
  School,
  ShieldCheck,
  Trash2,
  Unlock,
  Users,
} from "lucide-react";
import ProtectedRoute from "@/components/auth/protected-route";
import PageHeader from "@/components/ui/page-header";
import { useAuth } from "@/context/auth-context";
import { apiUrl } from "@/lib/api";

type SchoolPlan = "TESTE_15_DIAS" | "BASICO" | "PRO" | "PREMIUM";
type SchoolStatus = "ATIVA" | "TESTE_GRATIS" | "INADIMPLENTE" | "SUSPENSA" | "CANCELADA";
type TipoAvaliacao = "BIMESTRAL" | "TRIMESTRAL";

type SchoolItem = {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  status?: SchoolStatus | null;
  plan?: SchoolPlan | null;
  tipoAvaliacao?: TipoAvaliacao | null;
  mediaAprovacao?: number | string | null;
  users?: Array<{ id: string; name: string; email?: string | null; role: string }>;
  userSchoolLinks?: Array<{ user?: { id: string; name: string; email?: string | null; role: string } }>;
};

type Summary = {
  totalSchools?: number;
  activeSchools?: number;
  trialSchools?: number;
  delinquentSchools?: number;
  totalUsers?: number;
  totalAlunos?: number;
  totalFuncionarios?: number;
};

type SchoolForm = {
  name: string;
  email: string;
  phone: string;
  status: SchoolStatus;
  plan: SchoolPlan;
  tipoAvaliacao: TipoAvaliacao;
  mediaAprovacao: string;
  adminName: string;
  adminIdentifier: string;
  adminEmail: string;
  adminPassword: string;
};

const emptyForm: SchoolForm = {
  name: "",
  email: "",
  phone: "",
  status: "ATIVA",
  plan: "TESTE_15_DIAS",
  tipoAvaliacao: "BIMESTRAL",
  mediaAprovacao: "7",
  adminName: "",
  adminIdentifier: "",
  adminEmail: "",
  adminPassword: "",
};

const planLabels: Record<SchoolPlan, string> = {
  TESTE_15_DIAS: "Teste de 15 dias",
  BASICO: "Básico",
  PRO: "Pro",
  PREMIUM: "Premium",
};

const statusLabels: Record<SchoolStatus, string> = {
  ATIVA: "Ativa",
  TESTE_GRATIS: "Teste grátis",
  INADIMPLENTE: "Inadimplente",
  SUSPENSA: "Suspensa",
  CANCELADA: "Cancelada",
};

function statusClass(status?: string | null) {
  switch (status) {
    case "ATIVA":
      return "bg-emerald-50 text-emerald-700 ring-emerald-200";
    case "TESTE_GRATIS":
      return "bg-blue-50 text-blue-700 ring-blue-200";
    case "INADIMPLENTE":
      return "bg-amber-50 text-amber-700 ring-amber-200";
    case "SUSPENSA":
      return "bg-orange-50 text-orange-700 ring-orange-200";
    case "CANCELADA":
      return "bg-rose-50 text-rose-700 ring-rose-200";
    default:
      return "bg-slate-50 text-slate-600 ring-slate-200";
  }
}

function getAdminName(school: SchoolItem) {
  const users = [
    ...(school.users || []),
    ...(school.userSchoolLinks || []).map((link) => link.user).filter(Boolean),
  ] as Array<{ name: string; role: string }>;

  return users.find((user) => user.role === "ADMIN_ESCOLA")?.name || "Admin não informado";
}

export default function SuperusuarioPage() {
  const { token, selectedSchool, setSelectedSchool, enterSchoolAsAdmin } = useAuth();
  const backupInputRef = useRef<HTMLInputElement | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [schools, setSchools] = useState<SchoolItem[]>([]);
  const [selectedSchoolId, setSelectedSchoolId] = useState("");
  const [form, setForm] = useState<SchoolForm>(emptyForm);
  const [editingSchoolId, setEditingSchoolId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [restoringBackup, setRestoringBackup] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const selectedSchoolData = useMemo(
    () => schools.find((school) => school.id === selectedSchoolId) || null,
    [schools, selectedSchoolId],
  );
  const secondaryActionClass =
    "inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60";

  const filteredSchools = useMemo(
    () =>
      [...schools].sort((a, b) =>
        String(a.name || "").localeCompare(String(b.name || ""), "pt-BR"),
      ),
    [schools],
  );

  async function readJson(response: Response) {
    const data = await response.json();
    if (!response.ok) throw new Error(data?.message || "Não foi possível concluir a operação.");
    return data;
  }

  async function fetchData() {
    if (!token) return;

    try {
      setLoading(true);
      setError("");

      const [schoolsResponse, summaryResponse] = await Promise.all([
        fetch(apiUrl("/schools"), {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(apiUrl("/schools/dashboard-summary"), {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      const schoolsData = await readJson(schoolsResponse);
      const summaryData = await readJson(summaryResponse);
      const lista = Array.isArray(schoolsData) ? schoolsData : schoolsData ? [schoolsData] : [];

      setSchools(lista);
      setSummary(summaryData);

      const preferred =
        (selectedSchool?.id && lista.find((school) => school.id === selectedSchool.id)) ||
        lista[0] ||
        null;

      setSelectedSchoolId(preferred?.id || "");
    } catch (err: any) {
      setError(err?.message || "Erro ao carregar painel do superusuário.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchData();
  }, [token]);

  function updateForm<K extends keyof SchoolForm>(key: K, value: SchoolForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function startCreate() {
    setEditingSchoolId(null);
    setForm(emptyForm);
    setSuccess("");
    setError("");
  }

  function startEdit(school: SchoolItem) {
    setEditingSchoolId(school.id);
    setForm({
      name: school.name || "",
      email: school.email || "",
      phone: school.phone || "",
      status: school.status || "ATIVA",
      plan: school.plan || "TESTE_15_DIAS",
      tipoAvaliacao: school.tipoAvaliacao || "BIMESTRAL",
      mediaAprovacao: String(school.mediaAprovacao || 7),
      adminName: "",
      adminIdentifier: "",
      adminEmail: "",
      adminPassword: "",
    });
    setSelectedSchoolId(school.id);
    setSuccess("");
    setError("");
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!token) return;

    if (!form.name.trim()) {
      setError("Informe o nome da escola.");
      return;
    }

    try {
      setSaving(true);
      setError("");
      setSuccess("");

      const payload = {
        name: form.name.trim(),
        email: form.email.trim() || undefined,
        phone: form.phone.trim() || undefined,
        status: form.status,
        plan: form.plan,
        tipoAvaliacao: form.tipoAvaliacao,
        mediaAprovacao: Number(form.mediaAprovacao || 7),
        adminName: form.adminName.trim() || undefined,
        adminIdentifier: form.adminIdentifier.trim() || undefined,
        adminEmail: form.adminEmail.trim() || undefined,
        adminPassword: form.adminPassword.trim() || undefined,
      };

      const response = await fetch(
        apiUrl(editingSchoolId ? `/schools/${editingSchoolId}` : "/schools"),
        {
          method: editingSchoolId ? "PATCH" : "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        },
      );

      await readJson(response);
      setSuccess(editingSchoolId ? "Escola atualizada com sucesso." : "Escola criada com sucesso.");
      setEditingSchoolId(null);
      setForm(emptyForm);
      await fetchData();
    } catch (err: any) {
      setError(err?.message || "Erro ao salvar escola.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteSchool(school: SchoolItem) {
    if (!token) return;

    const confirmed = window.confirm(
      `Excluir definitivamente a escola "${school.name}"? Esta ação remove dados vinculados e não deve ser usada sem backup.`,
    );

    if (!confirmed) return;

    try {
      setActionId(school.id);
      setError("");
      setSuccess("");

      const response = await fetch(apiUrl(`/schools/${school.id}/delete-secure`), {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      await readJson(response);
      setSuccess("Escola excluída com sucesso.");
      await fetchData();
    } catch (err: any) {
      setError(err?.message || "Erro ao excluir escola.");
    } finally {
      setActionId(null);
    }
  }

  async function handleToggleBlockSchool(school: SchoolItem) {
    if (!token) return;

    const nextStatus: SchoolStatus = school.status === "SUSPENSA" ? "ATIVA" : "SUSPENSA";
    const confirmed = window.confirm(
      nextStatus === "SUSPENSA"
        ? `Bloquear a escola "${school.name}" e impedir o acesso de todos os usuários ao sistema?`
        : `Desbloquear a escola "${school.name}" e liberar novamente o acesso dos usuários?`,
    );

    if (!confirmed) return;

    try {
      setActionId(school.id);
      setError("");
      setSuccess("");

      const response = await fetch(apiUrl(`/schools/${school.id}`), {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          status: nextStatus,
        }),
      });

      await readJson(response);
      setSuccess(
        nextStatus === "SUSPENSA"
          ? "Escola bloqueada. Usuários vinculados não terão acesso ao sistema."
          : "Escola desbloqueada. Usuários vinculados podem acessar novamente.",
      );
      await fetchData();
    } catch (err: any) {
      setError(err?.message || "Erro ao alterar bloqueio da escola.");
    } finally {
      setActionId(null);
    }
  }

  async function handleEnterSchool(school: SchoolItem) {
    try {
      setActionId(school.id);
      setError("");
      setSuccess("");
      await enterSchoolAsAdmin({
        id: school.id,
        name: school.name,
        status: school.status || undefined,
      });
      window.location.href = "/dashboard";
    } catch (err: any) {
      setError(err?.message || "Erro ao acessar escola em modo manutenção.");
      setActionId(null);
    }
  }

  function handleSelectSchool(school: SchoolItem) {
    setSelectedSchool({
      id: school.id,
      name: school.name,
      status: school.status || undefined,
    });
    setSelectedSchoolId(school.id);
    setSuccess(`Escola ativa selecionada: ${school.name}.`);
  }

  async function handleDownloadBackup(school: SchoolItem) {
    if (!token) return;

    try {
      setActionId(school.id);
      setError("");
      setSuccess("");

      const response = await fetch(apiUrl(`/schools/${school.id}/backup-json`), {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        let message = "Erro ao baixar backup.";
        try {
          const data = await response.json();
          message = data?.message || message;
        } catch {}
        throw new Error(message);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      const safeName = String(school.name || "escola")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/gi, "-")
        .replace(/^-+|-+$/g, "")
        .toLowerCase();

      link.href = url;
      link.download = `backup-${safeName || "escola"}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      setSuccess("Backup baixado com sucesso.");
    } catch (err: any) {
      setError(err?.message || "Erro ao baixar backup.");
    } finally {
      setActionId(null);
    }
  }

  async function handleBackupUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] || null;
    event.target.value = "";

    if (!file || !token) return;

    if (!file.name.toLowerCase().endsWith(".json")) {
      setError("Selecione um arquivo de backup no formato JSON.");
      return;
    }

    const confirmed = window.confirm(
      "Restaurar este backup completo? Se a escola já existir, ela será substituída pelo conteúdo do arquivo.",
    );

    if (!confirmed) return;

    try {
      setRestoringBackup(true);
      setError("");
      setSuccess("");

      const text = await file.text();
      const payload = JSON.parse(text);
      const response = await fetch(apiUrl("/schools/restore-backup-json"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await readJson(response);
      const restoredSchool = data?.school;

      setSuccess(
        `Backup restaurado com sucesso${restoredSchool?.name ? `: ${restoredSchool.name}` : ""}.`,
      );
      await fetchData();

      if (restoredSchool?.id) {
        setSelectedSchoolId(restoredSchool.id);
      }
    } catch (err: any) {
      setError(err?.message || "Erro ao restaurar backup. Verifique se o JSON é um backup válido.");
    } finally {
      setRestoringBackup(false);
    }
  }

  return (
    <ProtectedRoute allowedRoles={["SUPERUSUARIO"]}>
      <section className="min-w-0 space-y-6">
        <PageHeader
          title="Painel Superusuário"
          description="Gestão global das escolas, assinaturas, métricas, backups e acesso de manutenção."
        />

        {error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {error}
          </div>
        ) : null}

        {success ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
            {success}
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-4">
          <MetricCard label="Escolas" value={summary?.totalSchools || 0} icon={Building2} />
          <MetricCard label="Ativas" value={summary?.activeSchools || 0} icon={ShieldCheck} />
          <MetricCard label="Em teste" value={summary?.trialSchools || 0} icon={School} />
          <MetricCard label="Inadimplentes" value={summary?.delinquentSchools || 0} icon={CreditCard} />
        </div>

        <div className="card-base flex min-w-0 flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <h2 className="text-xl font-bold text-slate-900">Restaurar backup completo</h2>
            <p className="text-sm text-slate-500">
              Envie o arquivo JSON gerado no botão Backup para recriar a escola com turmas, alunos, professores, horários, mensagens, notas e configurações.
            </p>
          </div>
          <input
            ref={backupInputRef}
            type="file"
            accept="application/json,.json"
            onChange={handleBackupUpload}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => backupInputRef.current?.click()}
            disabled={restoringBackup}
            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 px-5 py-3 text-sm font-bold text-white transition hover:bg-slate-800 disabled:opacity-60 md:w-auto"
          >
            {restoringBackup ? <Loader2 size={18} className="animate-spin" /> : <FileUp size={18} />}
            {restoringBackup ? "Restaurando..." : "Upload do backup"}
          </button>
        </div>

        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
          <div className="card-base min-w-0 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-xl font-bold text-slate-900">Escolas cadastradas</h2>
                <p className="text-sm text-slate-500">
                  Bloqueie acessos, gere backup completo, exclua do banco ou acesse como admin da escola.
                </p>
              </div>
              <button
                type="button"
                onClick={fetchData}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                <RefreshCcw size={16} />
                Atualizar
              </button>
            </div>

            {loading ? (
              <div className="mt-8 flex items-center gap-2 text-sm font-semibold text-slate-500">
                <Loader2 size={18} className="animate-spin" />
                Carregando painel global...
              </div>
            ) : (
              <>
                <div className="mt-5 space-y-4 md:hidden">
                  {filteredSchools.map((school) => {
                    const isBusy = actionId === school.id;

                    return (
                      <article
                        key={school.id}
                        className={`rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm ${
                          selectedSchoolId === school.id ? "ring-2 ring-blue-200" : ""
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-bold text-slate-900">{school.name}</p>
                            <p className="mt-1 text-xs text-slate-500">
                              {school.email || "E-mail não informado"}
                            </p>
                          </div>
                          <span
                            className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-bold ring-1 ${statusClass(school.status)}`}
                          >
                            {school.status ? statusLabels[school.status] : "Sem status"}
                          </span>
                        </div>

                        <dl className="mt-4 grid gap-3 text-sm text-slate-600">
                          <div>
                            <dt className="text-xs font-bold uppercase tracking-wide text-slate-400">
                              Plano
                            </dt>
                            <dd className="mt-1 font-semibold text-slate-700">
                              {school.plan ? planLabels[school.plan] : "Não definido"}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-xs font-bold uppercase tracking-wide text-slate-400">
                              Admin
                            </dt>
                            <dd className="mt-1">{getAdminName(school)}</dd>
                          </div>
                          <div>
                            <dt className="text-xs font-bold uppercase tracking-wide text-slate-400">
                              Avaliação
                            </dt>
                            <dd className="mt-1">
                              {school.tipoAvaliacao || "BIMESTRAL"} · média {school.mediaAprovacao || 7}
                            </dd>
                          </div>
                        </dl>

                        <div className="mt-4 grid gap-2">
                          <button
                            type="button"
                            onClick={() => startEdit(school)}
                            className={`${secondaryActionClass} justify-center`}
                          >
                            <Pencil size={15} />
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSelectSchool(school)}
                            className={`${secondaryActionClass} justify-center`}
                          >
                            <School size={15} />
                            Selecionar
                          </button>
                          <button
                            type="button"
                            onClick={() => handleToggleBlockSchool(school)}
                            disabled={isBusy}
                            className={`${secondaryActionClass} justify-center`}
                          >
                            {school.status === "SUSPENSA" ? <Unlock size={15} /> : <Lock size={15} />}
                            {school.status === "SUSPENSA" ? "Desbloquear" : "Bloquear"}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleEnterSchool(school)}
                            disabled={isBusy}
                            className={`${secondaryActionClass} justify-center`}
                          >
                            <ExternalLink size={15} />
                            Acessar
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDownloadBackup(school)}
                            disabled={isBusy}
                            className={`${secondaryActionClass} justify-center`}
                            title="Baixar backup completo da escola"
                          >
                            <Download size={15} />
                            Backup
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteSchool(school)}
                            disabled={isBusy}
                            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-2.5 py-2 text-xs font-bold text-red-700 transition hover:bg-red-100 disabled:opacity-60"
                            title="Excluir definitivamente a escola do banco de dados"
                          >
                            <Trash2 size={15} />
                            Excluir
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>

                <div className="mt-5 hidden overflow-x-auto md:block">
                  <table className="w-full min-w-[1120px] text-left text-sm">
                  <thead className="text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-3 py-3">Escola</th>
                      <th className="px-3 py-3">Plano</th>
                      <th className="px-3 py-3">Status</th>
                      <th className="px-3 py-3">Admin</th>
                      <th className="px-3 py-3">Avaliação</th>
                      <th className="px-3 py-3 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredSchools.map((school) => {
                      const isBusy = actionId === school.id;

                      return (
                        <tr key={school.id} className={selectedSchoolId === school.id ? "bg-blue-50/50" : ""}>
                          <td className="px-3 py-4">
                            <p className="font-bold text-slate-900">{school.name}</p>
                            <p className="text-xs text-slate-500">{school.email || "E-mail não informado"}</p>
                          </td>
                          <td className="px-3 py-4 font-semibold text-slate-700">
                            {school.plan ? planLabels[school.plan] : "Não definido"}
                          </td>
                          <td className="px-3 py-4">
                            <span className={`rounded-full px-3 py-1 text-xs font-bold ring-1 ${statusClass(school.status)}`}>
                              {school.status ? statusLabels[school.status] : "Sem status"}
                            </span>
                          </td>
                          <td className="px-3 py-4 text-slate-600">{getAdminName(school)}</td>
                          <td className="px-3 py-4 text-slate-600">
                            {school.tipoAvaliacao || "BIMESTRAL"} · média {school.mediaAprovacao || 7}
                          </td>
                          <td className="px-3 py-4">
                            <div className="flex flex-wrap justify-end gap-2">
                              <button type="button" onClick={() => startEdit(school)} className={secondaryActionClass}>
                                <Pencil size={15} />
                                Editar
                              </button>
                              <button type="button" onClick={() => handleSelectSchool(school)} className={secondaryActionClass}>
                                <School size={15} />
                                Selecionar
                              </button>
                              <button type="button" onClick={() => handleToggleBlockSchool(school)} disabled={isBusy} className={secondaryActionClass}>
                                {school.status === "SUSPENSA" ? <Unlock size={15} /> : <Lock size={15} />}
                                {school.status === "SUSPENSA" ? "Desbloquear" : "Bloquear"}
                              </button>
                              <button type="button" onClick={() => handleEnterSchool(school)} disabled={isBusy} className={secondaryActionClass}>
                                <ExternalLink size={15} />
                                Acessar
                              </button>
                              <button type="button" onClick={() => handleDownloadBackup(school)} disabled={isBusy} className={secondaryActionClass} title="Baixar backup completo da escola">
                                <Download size={15} />
                                Backup
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteSchool(school)}
                                disabled={isBusy}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-bold text-red-700 transition hover:bg-red-100 disabled:opacity-60"
                                title="Excluir definitivamente a escola do banco de dados"
                              >
                                <Trash2 size={15} />
                                Excluir
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  </table>
                </div>
              </>
            )}
          </div>

          <form onSubmit={handleSubmit} className="card-base min-w-0 p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-xl font-bold text-slate-900">
                  {editingSchoolId ? "Editar escola" : "Nova escola"}
                </h2>
                <p className="text-sm text-slate-500">
                  Plano, status, avaliação e administrador inicial.
                </p>
              </div>
              <button
                type="button"
                onClick={startCreate}
                className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold text-white"
              >
                <Plus size={15} />
                Novo
              </button>
            </div>

            <div className="mt-5 space-y-3">
              <Input label="Nome da escola" value={form.name} onChange={(value) => updateForm("name", value)} required />
              <Input label="E-mail" value={form.email} onChange={(value) => updateForm("email", value)} />
              <Input label="Telefone" value={form.phone} onChange={(value) => updateForm("phone", value)} />

              <div className="grid gap-3 md:grid-cols-2">
                <Select label="Plano" value={form.plan} onChange={(value) => updateForm("plan", value as SchoolPlan)}>
                  {Object.entries(planLabels).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </Select>
                <Select label="Status" value={form.status} onChange={(value) => updateForm("status", value as SchoolStatus)}>
                  {Object.entries(statusLabels).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </Select>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <Select label="Tipo de avaliação" value={form.tipoAvaliacao} onChange={(value) => updateForm("tipoAvaliacao", value as TipoAvaliacao)}>
                  <option value="BIMESTRAL">Bimestral</option>
                  <option value="TRIMESTRAL">Trimestral</option>
                </Select>
                <Input label="Média de aprovação" type="number" min="0" max="10" step="0.1" value={form.mediaAprovacao} onChange={(value) => updateForm("mediaAprovacao", value)} />
              </div>

              {!editingSchoolId ? (
                <div className="rounded-2xl border border-blue-100 bg-blue-50/70 p-4">
                  <p className="text-sm font-bold text-blue-900">Administrador inicial</p>
                  <div className="mt-3 space-y-3">
                    <Input label="Nome do admin" value={form.adminName} onChange={(value) => updateForm("adminName", value)} />
                    <Input label="CPF, usuário ou identificador" value={form.adminIdentifier} onChange={(value) => updateForm("adminIdentifier", value)} />
                    <Input label="E-mail do admin" value={form.adminEmail} onChange={(value) => updateForm("adminEmail", value)} />
                    <Input label="Senha inicial" type="password" value={form.adminPassword} onChange={(value) => updateForm("adminPassword", value)} />
                  </div>
                </div>
              ) : null}

              <button
                type="submit"
                disabled={saving}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-blue-700 disabled:opacity-60"
              >
                {saving ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />}
                {saving ? "Salvando..." : editingSchoolId ? "Salvar alterações" : "Criar escola"}
              </button>
            </div>
          </form>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <QuickLink href="/usuarios" icon={Users} title="Usuários globais" description="Criar e gerenciar superusuários, administradores e equipes." />
          <QuickLink href="/financeiro" icon={CreditCard} title="Financeiro global" description="Configurar cobranças e controlar assinaturas das escolas." />
          <QuickLink href="/assinatura" icon={BarChart3} title="Assinaturas" description="Abrir visão de débitos e pagamentos da plataforma." />
        </div>

        {selectedSchoolData ? (
          <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900">
            Escola selecionada nesta sessão: <strong>{selectedSchoolData.name}</strong>. Use os atalhos da lateral para administrar dados dessa escola quando o recurso exigir contexto.
          </div>
        ) : null}
      </section>
    </ProtectedRoute>
  );
}

function MetricCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number;
  icon: typeof Building2;
}) {
  return (
    <div className="card-base flex items-center justify-between p-5">
      <div>
        <p className="text-sm font-semibold text-slate-500">{label}</p>
        <p className="mt-2 text-3xl font-black text-slate-950">{value}</p>
      </div>
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
        <Icon size={22} />
      </div>
    </div>
  );
}

function QuickLink({
  href,
  icon: Icon,
  title,
  description,
}: {
  href: string;
  icon: typeof Building2;
  title: string;
  description: string;
}) {
  return (
    <Link href={href} className="card-base group flex items-center gap-4 p-5 transition hover:-translate-y-0.5 hover:shadow-lg">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-900 text-white">
        <Icon size={21} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-bold text-slate-900">{title}</p>
        <p className="text-sm text-slate-500">{description}</p>
      </div>
      <ArrowRight size={18} className="text-slate-400 transition group-hover:translate-x-1" />
    </Link>
  );
}

function Input({
  label,
  value,
  onChange,
  type = "text",
  required,
  min,
  max,
  step,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
  min?: string;
  max?: string;
  step?: string;
}) {
  return (
    <label className="block min-w-0">
      <span className="text-sm font-bold text-slate-700">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        min={min}
        max={max}
        step={step}
        className="mt-1 block w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
      />
    </label>
  );
}

function Select({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="block min-w-0">
      <span className="text-sm font-bold text-slate-700">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 block w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
      >
        {children}
      </select>
    </label>
  );
}
