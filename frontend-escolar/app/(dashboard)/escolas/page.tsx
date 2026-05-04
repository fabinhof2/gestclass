"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import PageHeader from "@/components/ui/page-header";
import { useAuth } from "@/context/auth-context";
import { API_URL, apiUrl } from "@/lib/api";

type School = {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  logoUrl?: string;
  status?: string;
  plan?: string;
  tipoAvaliacao?: "BIMESTRAL" | "TRIMESTRAL";
  mediaAprovacao?: number | string;
};

const IMPORT_BLOCK_LABELS: Record<string, string> = {
  turmas: "Turmas",
  usuarios: "Usuários",
  responsaveis: "Responsáveis",
  alunos: "Alunos",
  alunoResponsaveis: "Vínculos aluno-responsável",
  modulacaoProfessores: "Modulação de professores",
  aulasHorarios: "Aulas e horários",
};

function formatPlan(plan?: string) {
  switch (plan) {
    case "TESTE_15_DIAS":
      return "Teste de 15 dias";
    case "BASICO":
      return "Básico";
    case "PRO":
      return "Pró";
    case "PREMIUM":
      return "Premium";
    default:
      return "Não definido";
  }
}

function formatTipoAvaliacao(tipo?: string) {
  switch (tipo) {
    case "BIMESTRAL":
      return "Bimestral";
    case "TRIMESTRAL":
      return "Trimestral";
    default:
      return "Bimestral";
  }
}

function getImportBlockKeys(importResult: any) {
  return Object.keys(IMPORT_BLOCK_LABELS).filter((key) => {
    const bloco = importResult?.[key];
    return (
      bloco &&
      typeof bloco === "object" &&
      Array.isArray(bloco.created) &&
      Array.isArray(bloco.updated) &&
      Array.isArray(bloco.skipped) &&
      Array.isArray(bloco.failed)
    );
  });
}

function getImportOverview(importResult: any) {
  const blockKeys = getImportBlockKeys(importResult);

  return blockKeys.reduce(
    (acc, key) => {
      acc.created += importResult?.[key]?.created?.length || 0;
      acc.updated += importResult?.[key]?.updated?.length || 0;
      acc.skipped += importResult?.[key]?.skipped?.length || 0;
      acc.failed += importResult?.[key]?.failed?.length || 0;
      return acc;
    },
    { created: 0, updated: 0, skipped: 0, failed: 0 }
  );
}

function formatImportItem(item: any) {
  if (!item || typeof item !== "object") {
    return String(item || "");
  }

  const principais = [
    item.nome,
    item.email,
    item.matricula,
    item.matriculaAluno,
    item.professorEmail,
    item.turmaNome,
    item.disciplina,
    item.diaSemana,
    item.horaInicio,
    item.horaFim,
  ].filter(Boolean);

  const motivo = item.motivo ? ` — ${item.motivo}` : "";

  if (principais.length > 0) {
    return `${principais.join(" • ")}${motivo}`;
  }

  return JSON.stringify(item);
}

export default function EscolasPage() {
  const auth = useAuth() as any;
  const { token, selectedSchool, switchSchool, user } = auth;
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const importFileInputRef = useRef<HTMLInputElement | null>(null);

  const [schools, setSchools] = useState<School[]>([]);
  const [selectedSchoolId, setSelectedSchoolId] = useState("");
  const [loading, setLoading] = useState(true);
  const [switchingSchool, setSwitchingSchool] = useState(false);
  const [saving, setSaving] = useState(false);
  const [downloadingBackup, setDownloadingBackup] = useState(false);
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);
  const [validatingImport, setValidatingImport] = useState(false);
  const [importingTurmas, setImportingTurmas] = useState(false);
  const [importingAll, setImportingAll] = useState(false);
  const [downloadingImportReport, setDownloadingImportReport] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [tipoAvaliacao, setTipoAvaliacao] = useState<"BIMESTRAL" | "TRIMESTRAL">(
    "BIMESTRAL"
  );
  const [mediaAprovacao, setMediaAprovacao] = useState("7");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string>("");

  const [validationResult, setValidationResult] = useState<any | null>(null);
  const [validatedPayload, setValidatedPayload] = useState<any | null>(null);
  const [importResult, setImportResult] = useState<any | null>(null);

  const school = useMemo(() => {
    return schools.find((item) => item.id === selectedSchoolId) || null;
  }, [schools, selectedSchoolId]);

  const importOverview = useMemo(() => {
    return importResult ? getImportOverview(importResult) : null;
  }, [importResult]);

  const importBlockKeys = useMemo(() => {
    return importResult ? getImportBlockKeys(importResult) : [];
  }, [importResult]);

  async function fetchSchools() {
    if (!token) return;

    try {
      setLoading(true);
      setError("");

      const res = await fetch(apiUrl("/schools"), {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Erro ao carregar escolas");
      }

      const lista = Array.isArray(data) ? data : data ? [data] : [];
      setSchools(lista);

      const preferida =
        (selectedSchool?.id && lista.find((item) => item.id === selectedSchool.id)) ||
        lista[0] ||
        null;

      setSelectedSchoolId(preferida?.id || "");

      if (preferida) {
        setName(preferida.name || "");
        setEmail(preferida.email || "");
        setPhone(preferida.phone || "");
        setTipoAvaliacao(preferida.tipoAvaliacao || "BIMESTRAL");
        setMediaAprovacao(String(preferida.mediaAprovacao || 7));
      }

      setLogoFile(null);
      setLogoPreview("");
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Erro ao carregar escolas");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchSchools();
  }, [token]);

  useEffect(() => {
    if (!school) return;

    setName(school.name || "");
    setEmail(school.email || "");
    setPhone(school.phone || "");
    setTipoAvaliacao(school.tipoAvaliacao || "BIMESTRAL");
    setMediaAprovacao(String(school.mediaAprovacao || 7));
    setLogoFile(null);
    setLogoPreview("");
    setValidationResult(null);
    setValidatedPayload(null);
    setImportResult(null);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }

    if (importFileInputRef.current) {
      importFileInputRef.current.value = "";
    }
  }, [school?.id]);

  function handleSelectLogoClick() {
    fileInputRef.current?.click();
  }

  function handleSelectImportFileClick() {
    importFileInputRef.current?.click();
  }

  function handleLogoChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] || null;

    if (!file) {
      setLogoFile(null);
      setLogoPreview("");
      return;
    }

    if (!file.type.startsWith("image/")) {
      setError("Selecione um arquivo de imagem válido.");
      setLogoFile(null);
      setLogoPreview("");
      e.target.value = "";
      return;
    }

    setError("");
    setLogoFile(file);

    const previewUrl = URL.createObjectURL(file);
    setLogoPreview(previewUrl);
  }

  function clearSelectedLogo() {
    setLogoFile(null);
    setLogoPreview("");

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  async function handleTrocarEscola(novoSchoolId: string) {
    const novaEscola = schools.find((item) => item.id === novoSchoolId);

    if (!novaEscola) return;

    try {
      setSwitchingSchool(true);
      setError("");
      setSuccess("");

      await switchSchool({
        id: novaEscola.id,
        name: novaEscola.name,
        status: novaEscola.status,
      });

      setSelectedSchoolId(novaEscola.id);
      setSuccess(`Escola ativa alterada para "${novaEscola.name}".`);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Erro ao trocar a escola ativa.");
    } finally {
      setSwitchingSchool(false);
    }
  }

  async function baixarArquivoDaRota(url: string, nomePadrao: string) {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      let mensagem = "Erro ao baixar arquivo.";
      try {
        const data = await response.json();
        mensagem = data.message || mensagem;
      } catch {}
      throw new Error(mensagem);
    }

    const blob = await response.blob();
    const objectUrl = window.URL.createObjectURL(blob);

    const disposition = response.headers.get("Content-Disposition");
    const match = disposition?.match(/filename="(.+)"/i);
    const fileName =
      match?.[1] ||
      `${nomePadrao}-${school?.name?.toLowerCase().replace(/[^a-z0-9]+/gi, "-")}.json`;

    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();

    window.URL.revokeObjectURL(objectUrl);
  }

  async function handleDownloadBackup() {
    if (!school || !token) return;

    try {
      setDownloadingBackup(true);
      setError("");
      setSuccess("");

      await baixarArquivoDaRota(
        apiUrl(`/schools/${school.id}/backup-json`),
        "backup"
      );

      setSuccess(
        user?.role === "SUPERUSUARIO"
          ? "Backup completo baixado com sucesso."
          : "Backup da escola baixado com sucesso."
      );
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Erro ao baixar backup.");
    } finally {
      setDownloadingBackup(false);
    }
  }

  async function handleDownloadTemplate() {
    if (!school || !token) return;

    try {
      setDownloadingTemplate(true);
      setError("");
      setSuccess("");

      await baixarArquivoDaRota(
        apiUrl(`/schools/${school.id}/import-template-json`),
        "modelo-importacao"
      );

      setSuccess("Modelo de importação baixado com sucesso.");
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Erro ao baixar modelo de importação.");
    } finally {
      setDownloadingTemplate(false);
    }
  }

  async function handleValidateImportFile(
    e: ChangeEvent<HTMLInputElement>
  ) {
    const file = e.target.files?.[0] || null;

    if (!file || !school || !token) {
      return;
    }

    try {
      setValidatingImport(true);
      setError("");
      setSuccess("");
      setValidationResult(null);
      setValidatedPayload(null);
      setImportResult(null);

      const text = await file.text();
      const parsed = JSON.parse(text);

      const response = await fetch(
        apiUrl(`/schools/${school.id}/validate-import-json`),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(parsed),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Erro ao validar arquivo de importação.");
      }

      setValidationResult(data);
      setValidatedPayload(parsed);

      if (data?.summary?.isValid) {
        setSuccess("Arquivo validado com sucesso. Nenhum erro encontrado.");
      } else {
        setSuccess("Validação concluída. Revise os erros e avisos abaixo.");
      }
    } catch (err: any) {
      console.error(err);
      if (err instanceof SyntaxError) {
        setError("O arquivo JSON está inválido.");
      } else {
        setError(err.message || "Erro ao validar arquivo.");
      }
    } finally {
      setValidatingImport(false);
      if (importFileInputRef.current) {
        importFileInputRef.current.value = "";
      }
    }
  }

  async function handleImportTurmas() {
    if (!school || !token || !validatedPayload) return;

    try {
      setImportingTurmas(true);
      setError("");
      setSuccess("");
      setImportResult(null);

      const response = await fetch(
        apiUrl(`/schools/${school.id}/import-turmas-json`),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(validatedPayload),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Erro ao importar turmas.");
      }

      setImportResult(data);
      setSuccess("Importação inteligente de turmas concluída.");
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Erro ao importar turmas.");
    } finally {
      setImportingTurmas(false);
    }
  }

  async function handleImportAll() {
    if (!school || !token || !validatedPayload) return;

    try {
      setImportingAll(true);
      setError("");
      setSuccess("");
      setImportResult(null);

      const response = await fetch(
        apiUrl(`/schools/${school.id}/import-all-json`),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(validatedPayload),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Erro ao importar todos os blocos.");
      }

      setImportResult(data);
      setSuccess("Importação inteligente completa concluída.");
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Erro ao importar tudo.");
    } finally {
      setImportingAll(false);
    }
  }

  async function handleDownloadImportReport() {
    if (!importResult) {
      setError("Nenhum relatório de importação disponível para baixar.");
      return;
    }

    try {
      setDownloadingImportReport(true);
      setError("");
      setSuccess("");

      const blob = new Blob([JSON.stringify(importResult, null, 2)], {
        type: "application/json;charset=utf-8",
      });

      const objectUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      const schoolSlug = String(school?.name || "escola")
        .toLowerCase()
        .replace(/[^a-z0-9]+/gi, "-");
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

      link.href = objectUrl;
      link.download = `relatorio-importacao-${schoolSlug}-${timestamp}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(objectUrl);

      setSuccess("Relatório da importação baixado com sucesso.");
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Erro ao baixar relatório da importação.");
    } finally {
      setDownloadingImportReport(false);
    }
  }

  async function handleSave() {
    if (!school || !token) return;

    try {
      setSaving(true);
      setError("");
      setSuccess("");

      if (logoFile) {
        const formData = new FormData();
        formData.append("file", logoFile);

        const logoRes = await fetch(
          apiUrl(`/schools/${school.id}/logo`),
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
            },
            body: formData,
          }
        );

        const logoData = await logoRes.json();

        if (!logoRes.ok) {
          throw new Error(logoData.message || "Erro ao enviar logomarca");
        }
      }

      const mediaAprovacaoNumerica = Number(mediaAprovacao);

      if (
        Number.isNaN(mediaAprovacaoNumerica) ||
        mediaAprovacaoNumerica < 0 ||
        mediaAprovacaoNumerica > 10
      ) {
        throw new Error("A média de aprovação deve estar entre 0 e 10.");
      }

      const res = await fetch(apiUrl(`/schools/${school.id}`), {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name,
          email,
          phone,
          tipoAvaliacao,
          mediaAprovacao: mediaAprovacaoNumerica,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Erro ao atualizar escola");
      }

      setSuccess("Dados da escola atualizados com sucesso!");
      await fetchSchools();
      setSelectedSchoolId(school.id);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-6">
      <PageHeader
        title={schools.length > 1 ? "Configuração das Escolas" : "Configuração da Escola"}
        description="Gerencie identidade, informações e personalização das escolas às quais você tem acesso."
      />

      {loading ? (
        <div className="card-base p-6">
          <p className="text-sm text-slate-500">Carregando...</p>
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

      {schools.length > 1 ? (
        <div className="card-base p-6">
          <label className="text-sm font-medium text-slate-700">
            Escolas vinculadas ao seu acesso
          </label>

          <div className="mt-2 grid gap-3 md:grid-cols-[1fr_auto]">
            <select
              value={selectedSchoolId}
              onChange={(e) => setSelectedSchoolId(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2"
            >
              <option value="">Selecione uma escola</option>
              {schools.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => handleTrocarEscola(selectedSchoolId)}
              disabled={!selectedSchoolId || switchingSchool}
              className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {switchingSchool ? "Trocando..." : "Usar esta escola"}
            </button>
          </div>
        </div>
      ) : null}

      {school ? (
        <>
          <div className="card-base space-y-6 p-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <h2 className="text-xl font-bold text-slate-900">
                  Informações da escola
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Atualize os dados principais e a identidade visual da escola ativa.
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={handleDownloadBackup}
                  disabled={downloadingBackup}
                  className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {downloadingBackup ? "Baixando backup..." : "Baixar backup JSON"}
                </button>

                <button
                  type="button"
                  onClick={handleDownloadTemplate}
                  disabled={downloadingTemplate}
                  className="rounded-xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {downloadingTemplate
                    ? "Baixando modelo..."
                    : "Baixar modelo de importação"}
                </button>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="text-sm font-medium text-slate-700">
                  Nome da escola
                </label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-slate-700">
                  E-mail
                </label>
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-slate-700">
                  Telefone
                </label>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-slate-700">
                  Plano atual
                </label>
                <input
                  value={formatPlan(school.plan)}
                  disabled
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-slate-100 px-3 py-2"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-slate-700">
                  Tipo de avaliação
                </label>
                <select
                  value={tipoAvaliacao}
                  onChange={(e) =>
                    setTipoAvaliacao(
                      e.target.value as "BIMESTRAL" | "TRIMESTRAL"
                    )
                  }
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
                >
                  <option value="BIMESTRAL">Bimestral (4 períodos)</option>
                  <option value="TRIMESTRAL">Trimestral (3 períodos)</option>
                </select>
                <p className="mt-2 text-xs text-slate-500">
                  Atual: {formatTipoAvaliacao(tipoAvaliacao)}
                </p>
              </div>

              <div>
                <label className="text-sm font-medium text-slate-700">
                  Média de aprovação
                </label>
                <input
                  type="number"
                  min="0"
                  max="10"
                  step="0.1"
                  value={mediaAprovacao}
                  onChange={(e) => setMediaAprovacao(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
                />
                <p className="mt-2 text-xs text-slate-500">
                  Usada na situação do boletim: aprovado ao atingir essa média.
                </p>
              </div>
            </div>

            <div className="grid gap-6 md:grid-cols-[220px_1fr]">
              <div>
                <label className="text-sm font-medium text-slate-700">
                  Logomarca atual
                </label>

                <div className="mt-2 flex h-40 w-full items-center justify-center overflow-hidden rounded-2xl border border-dashed border-slate-300 bg-slate-50">
                  {logoPreview ? (
                    <img
                      src={logoPreview}
                      alt="Pré-visualização da nova logomarca"
                      className="max-h-full max-w-full object-contain"
                    />
                  ) : school.logoUrl ? (
                    <img
                      src={`${API_URL}${school.logoUrl}`}
                      alt="Logomarca da escola"
                      className="max-h-full max-w-full object-contain"
                    />
                  ) : (
                    <span className="px-4 text-center text-sm text-slate-400">
                      Nenhuma logomarca enviada
                    </span>
                  )}
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-slate-700">
                  Nova logomarca
                </label>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleLogoChange}
                  className="hidden"
                />

                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={handleSelectLogoClick}
                    className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Selecionar logomarca
                  </button>

                  {logoFile ? (
                    <button
                      type="button"
                      onClick={clearSelectedLogo}
                      className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100"
                    >
                      Remover seleção
                    </button>
                  ) : null}
                </div>

                <p className="mt-3 text-xs text-slate-500">
                  Escolha uma imagem para representar a identidade visual da sua escola.
                </p>

                <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  {logoFile ? (
                    <>
                      Arquivo selecionado: <strong>{logoFile.name}</strong>
                    </>
                  ) : (
                    "Nenhum arquivo selecionado."
                  )}
                </div>
              </div>
            </div>

            <div>
              <button
                onClick={handleSave}
                disabled={saving}
                className="rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? "Salvando..." : "Salvar alterações"}
              </button>
            </div>
          </div>

          <div className="card-base space-y-5 p-6">
            <div>
              <h3 className="text-lg font-bold text-slate-900">
                Importação em massa
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                Valide o JSON, importe apenas turmas ou faça a importação inteligente completa.
              </p>
            </div>

            <input
              ref={importFileInputRef}
              type="file"
              accept=".json,application/json"
              onChange={handleValidateImportFile}
              className="hidden"
            />

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handleSelectImportFileClick}
                disabled={validatingImport}
                className="rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {validatingImport
                  ? "Validando arquivo..."
                  : "Selecionar arquivo para validar"}
              </button>

              <button
                type="button"
                onClick={handleImportTurmas}
                disabled={
                  importingTurmas ||
                  !validatedPayload ||
                  !validationResult?.summary?.isValid
                }
                className="rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {importingTurmas ? "Importando turmas..." : "Importar turmas agora"}
              </button>

              <button
                type="button"
                onClick={handleImportAll}
                disabled={
                  importingAll ||
                  !validatedPayload ||
                  !validationResult?.summary?.isValid
                }
                className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {importingAll ? "Importando tudo..." : "Importar tudo agora"}
              </button>

              <button
                type="button"
                onClick={handleDownloadImportReport}
                disabled={!importResult || downloadingImportReport}
                className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {downloadingImportReport
                  ? "Baixando relatório..."
                  : "Baixar relatório da importação"}
              </button>
            </div>

            {validationResult ? (
              <div className="space-y-4">
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-xs font-medium text-slate-500">Status</p>
                    <p className="mt-2 text-lg font-bold text-slate-900">
                      {validationResult?.summary?.isValid
                        ? "Válido"
                        : "Com erros"}
                    </p>
                  </div>

                  <div className="rounded-xl border border-red-200 bg-red-50 p-4">
                    <p className="text-xs font-medium text-red-600">Erros</p>
                    <p className="mt-2 text-lg font-bold text-red-700">
                      {validationResult?.summary?.totalErrors || 0}
                    </p>
                  </div>

                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                    <p className="text-xs font-medium text-amber-700">Avisos</p>
                    <p className="mt-2 text-lg font-bold text-amber-800">
                      {validationResult?.summary?.totalWarnings || 0}
                    </p>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 p-4">
                  <h4 className="text-sm font-semibold text-slate-900">
                    Totais identificados no arquivo
                  </h4>

                  <div className="mt-3 grid gap-3 md:grid-cols-3">
                    {Object.entries(validationResult?.totals || {}).map(
                      ([key, value]) => (
                        <div
                          key={key}
                          className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700"
                        >
                          <strong>{key}</strong>: {String(value)}
                        </div>
                      )
                    )}
                  </div>
                </div>
              </div>
            ) : null}

            {importResult ? (
              <div className="space-y-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                <div>
                  <h4 className="text-base font-bold text-emerald-800">
                    Resultado detalhado da importação
                  </h4>
                  <p className="mt-1 text-sm text-emerald-700">
                    Veja abaixo o resumo geral e o detalhamento por bloco importado.
                  </p>
                </div>

                {importOverview ? (
                  <div className="grid gap-3 md:grid-cols-5">
                    <div className="rounded-xl bg-white px-4 py-4 text-sm text-slate-700">
                      <p className="text-xs font-medium text-slate-500">Criados</p>
                      <p className="mt-2 text-xl font-bold text-emerald-700">
                        {importOverview.created}
                      </p>
                    </div>

                    <div className="rounded-xl bg-white px-4 py-4 text-sm text-slate-700">
                      <p className="text-xs font-medium text-slate-500">Atualizados</p>
                      <p className="mt-2 text-xl font-bold text-blue-700">
                        {importOverview.updated}
                      </p>
                    </div>

                    <div className="rounded-xl bg-white px-4 py-4 text-sm text-slate-700">
                      <p className="text-xs font-medium text-slate-500">Ignorados</p>
                      <p className="mt-2 text-xl font-bold text-amber-700">
                        {importOverview.skipped}
                      </p>
                    </div>

                    <div className="rounded-xl bg-white px-4 py-4 text-sm text-slate-700">
                      <p className="text-xs font-medium text-slate-500">Falhas</p>
                      <p className="mt-2 text-xl font-bold text-red-700">
                        {importOverview.failed}
                      </p>
                    </div>

                    <div className="rounded-xl bg-white px-4 py-4 text-sm text-slate-700">
                      <p className="text-xs font-medium text-slate-500">Blocos</p>
                      <p className="mt-2 text-xl font-bold text-slate-900">
                        {importBlockKeys.length}
                      </p>
                    </div>
                  </div>
                ) : null}

                {importResult?.summary ? (
                  <div className="rounded-2xl border border-emerald-200 bg-white p-4">
                    <h5 className="text-sm font-semibold text-slate-900">
                      Resumo técnico da importação
                    </h5>

                    <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                      {Object.entries(importResult.summary || {}).map(([key, value]) => (
                        <div
                          key={key}
                          className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-700"
                        >
                          <strong>{key}</strong>:{" "}
                          {typeof value === "object"
                            ? JSON.stringify(value)
                            : String(value)}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {importBlockKeys.length > 0 ? (
                  <div className="space-y-4">
                    {importBlockKeys.map((bloco) => {
                      const dados = importResult?.[bloco];
                      const titulo = IMPORT_BLOCK_LABELS[bloco] || bloco;

                      return (
                        <div
                          key={bloco}
                          className="rounded-2xl border border-slate-200 bg-white p-4"
                        >
                          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                            <div>
                              <h5 className="text-base font-bold text-slate-900">
                                {titulo}
                              </h5>
                              <p className="mt-1 text-sm text-slate-500">
                                Resultado específico deste bloco.
                              </p>
                            </div>

                            <div className="grid gap-2 sm:grid-cols-4">
                              <div className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                                <strong>Criados:</strong> {dados.created?.length || 0}
                              </div>
                              <div className="rounded-xl bg-blue-50 px-3 py-2 text-sm text-blue-700">
                                <strong>Atualizados:</strong> {dados.updated?.length || 0}
                              </div>
                              <div className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-700">
                                <strong>Ignorados:</strong> {dados.skipped?.length || 0}
                              </div>
                              <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
                                <strong>Falhas:</strong> {dados.failed?.length || 0}
                              </div>
                            </div>
                          </div>

                          <div className="mt-4 grid gap-4 xl:grid-cols-4">
                            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                              <h6 className="text-sm font-semibold text-emerald-700">
                                Itens criados
                              </h6>
                              <div className="mt-3 space-y-2">
                                {(dados.created || []).length === 0 ? (
                                  <p className="text-sm text-emerald-700">
                                    Nenhum item criado.
                                  </p>
                                ) : (
                                  dados.created.map((item: any, index: number) => (
                                    <div
                                      key={`${bloco}-created-${index}`}
                                      className="rounded-lg bg-white px-3 py-2 text-sm text-emerald-800"
                                    >
                                      {formatImportItem(item)}
                                    </div>
                                  ))
                                )}
                              </div>
                            </div>

                            <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
                              <h6 className="text-sm font-semibold text-blue-700">
                                Itens atualizados
                              </h6>
                              <div className="mt-3 space-y-2">
                                {(dados.updated || []).length === 0 ? (
                                  <p className="text-sm text-blue-700">
                                    Nenhum item atualizado.
                                  </p>
                                ) : (
                                  dados.updated.map((item: any, index: number) => (
                                    <div
                                      key={`${bloco}-updated-${index}`}
                                      className="rounded-lg bg-white px-3 py-2 text-sm text-blue-800"
                                    >
                                      {formatImportItem(item)}
                                    </div>
                                  ))
                                )}
                              </div>
                            </div>

                            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                              <h6 className="text-sm font-semibold text-amber-800">
                                Itens ignorados
                              </h6>
                              <div className="mt-3 space-y-2">
                                {(dados.skipped || []).length === 0 ? (
                                  <p className="text-sm text-amber-800">
                                    Nenhum item ignorado.
                                  </p>
                                ) : (
                                  dados.skipped.map((item: any, index: number) => (
                                    <div
                                      key={`${bloco}-skipped-${index}`}
                                      className="rounded-lg bg-white px-3 py-2 text-sm text-amber-900"
                                    >
                                      {formatImportItem(item)}
                                    </div>
                                  ))
                                )}
                              </div>
                            </div>

                            <div className="rounded-xl border border-red-200 bg-red-50 p-4">
                              <h6 className="text-sm font-semibold text-red-700">
                                Falhas
                              </h6>
                              <div className="mt-3 space-y-2">
                                {(dados.failed || []).length === 0 ? (
                                  <p className="text-sm text-red-700">
                                    Nenhuma falha.
                                  </p>
                                ) : (
                                  dados.failed.map((item: any, index: number) => (
                                    <div
                                      key={`${bloco}-failed-${index}`}
                                      className="rounded-lg bg-white px-3 py-2 text-sm text-red-800"
                                    >
                                      {formatImportItem(item)}
                                    </div>
                                  ))
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </>
      ) : !loading ? (
        <div className="card-base p-6">
          <p className="text-sm text-slate-500">
            Nenhuma escola encontrada para este acesso.
          </p>
        </div>
      ) : null}
    </section>
  );
}
