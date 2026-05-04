"use client";

import Link from "next/link";
import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  Download,
  Eye,
  FileText,
  Pencil,
  Save,
  Trash2,
  Upload,
  UserRound,
  X,
  KeyRound,
  Mail,
  ShieldCheck,
} from "lucide-react";
import PageHeader from "@/components/ui/page-header";
import { useAuth } from "@/context/auth-context";
import { API_URL, apiUrl } from "@/lib/api";
import { formatTurno } from "@/lib/turno";

type ResponsavelAluno = {
  id: string;
  parentesco?: string | null;
  isFinanceiro?: boolean;
  aluno?: {
    id: string;
    name: string;
    matricula?: string | null;
    status?: string | null;
    turma?: {
      id: string;
      name: string;
      turno?: string | null;
    } | null;
  } | null;
};

type Documento = {
  id: string;
  tipo: string;
  nomeOriginal: string;
  arquivoUrl: string;
  observacao?: string | null;
  mimeType?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

type Responsavel = {
  id: string;
  name: string;
  email: string;
  username?: string | null;
  phone?: string | null;
  address?: string | null;
  cpf?: string | null;
  identidade?: string | null;
  fotoUrl?: string | null;
  isActive?: boolean;
  isActivated?: boolean;
  responsavelAlunos?: ResponsavelAluno[];
};

type EditForm = {
  name: string;
  phone: string;
  address: string;
  cpf: string;
  identidade: string;
};

type UploadForm = {
  tipo: string;
  observacao: string;
  file: File | null;
};

type AccessForm = {
  email: string;
  username: string;
  password: string;
  isActive: boolean;
};

function traduzirTipoDocumento(tipo: string) {
  switch (tipo) {
    case "IDENTIDADE":
      return "Identidade";
    case "CPF":
      return "CPF";
    case "COMPROVANTE_RESIDENCIA":
      return "Comprovante de residência";
    case "CONTRATO_PRESTACAO_SERVICO":
      return "Contrato de prestação de serviço";
    default:
      return tipo;
  }
}

function getIniciais(nome?: string) {
  if (!nome?.trim()) return "R";

  const partes = nome.trim().split(" ").filter(Boolean);
  const primeira = partes[0]?.[0] || "";
  const segunda = partes[1]?.[0] || "";

  return `${primeira}${segunda}`.toUpperCase();
}

function getFotoUrl(fotoUrl?: string | null) {
  if (!fotoUrl) return null;

  if (fotoUrl.startsWith("http://") || fotoUrl.startsWith("https://")) {
    return fotoUrl;
  }

  const caminhoNormalizado = fotoUrl.startsWith("/")
    ? fotoUrl
    : `/${fotoUrl}`;

  return `${API_URL}${caminhoNormalizado}`;
}

export default function ResponsavelPage() {
  const params = useParams();
  const { token, user } = useAuth();

  const id = Array.isArray(params?.id) ? params.id[0] : params?.id;

  const [data, setData] = useState<Responsavel | null>(null);
  const [foto, setFoto] = useState<File | null>(null);
  const [enviandoFoto, setEnviandoFoto] = useState(false);
  const [imagemAberta, setImagemAberta] = useState(false);
  const [documentos, setDocumentos] = useState<Documento[]>([]);
  const [loading, setLoading] = useState(true);

  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingAccess, setIsSavingAccess] = useState(false);
  const [deletingDocId, setDeletingDocId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [downloadingDocId, setDownloadingDocId] = useState<string | null>(null);
  const [viewingDocId, setViewingDocId] = useState<string | null>(null);

  const [editForm, setEditForm] = useState<EditForm>({
    name: "",
    phone: "",
    address: "",
    cpf: "",
    identidade: "",
  });

  const [uploadForm, setUploadForm] = useState<UploadForm>({
    tipo: "CPF",
    observacao: "",
    file: null,
  });

  const [accessForm, setAccessForm] = useState<AccessForm>({
    email: "",
    username: "",
    password: "",
    isActive: true,
  });

  const canManageResponsavel =
    user?.role === "SUPERUSUARIO" ||
    user?.role === "ADMIN_ESCOLA" ||
    user?.role === "GESTOR" ||
    user?.role === "SECRETARIA";

  async function fetchData() {
    if (!token || !id) return;

    try {
      setLoading(true);
      setErrorMessage("");

      const resUser = await fetch(apiUrl(`/users/${id}`), {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const userData = await resUser.json();

      if (!resUser.ok) {
        throw new Error(userData.message || "Erro ao carregar responsável.");
      }

      const resDocs = await fetch(apiUrl(`/users/${id}/documentos`), {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const docsData = await resDocs.json();

      if (!resDocs.ok) {
        throw new Error(docsData.message || "Erro ao carregar documentos.");
      }

      setData(userData);
      setDocumentos(Array.isArray(docsData) ? docsData : []);
      setEditForm({
        name: userData?.name || "",
        phone: userData?.phone || "",
        address: userData?.address || "",
        cpf: userData?.cpf || "",
        identidade: userData?.identidade || "",
      });
      setAccessForm({
        email: userData?.email || "",
        username: userData?.username || "",
        password: "",
        isActive: Boolean(userData?.isActive ?? true),
      });
    } catch (error: any) {
      console.error("Erro ao carregar responsável:", error);
      setErrorMessage(
        error?.message || "Não foi possível carregar os dados do responsável."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchData();
  }, [id, token]);

  function handleEditInputChange(field: keyof EditForm, value: string) {
    setEditForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  }

  function handleAccessInputChange(
    field: keyof AccessForm,
    value: string | boolean
  ) {
    setAccessForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] || null;

    setUploadForm((prev) => ({
      ...prev,
      file,
    }));
  }

  async function handleUploadFoto(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!token || !id) {
      setErrorMessage("Sessão inválida. Faça login novamente.");
      return;
    }

    if (!foto) {
      setErrorMessage("Selecione uma imagem para enviar.");
      return;
    }

    try {
      setEnviandoFoto(true);
      setErrorMessage("");
      setSuccessMessage("");

      const formData = new FormData();
      formData.append("file", foto);

      const response = await fetch(apiUrl(`/users/${id}/foto`), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      const responseData = await response.json();

      if (!response.ok) {
        throw new Error(responseData.message || "Erro ao enviar foto.");
      }

      setSuccessMessage("Foto enviada com sucesso.");
      setFoto(null);

      const fileInput = document.getElementById(
        "respons?vel-foto-file"
      ) as HTMLInputElement | null;

      if (fileInput) {
        fileInput.value = "";
      }

      await fetchData();
    } catch (error: any) {
      console.error("Erro ao enviar foto:", error);
      setErrorMessage(error?.message || "Não foi possível enviar a foto.");
    } finally {
      setEnviandoFoto(false);
    }
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!token || !id) {
      setErrorMessage("Sessão inválida. Faça login novamente.");
      return;
    }

    if (!editForm.name.trim()) {
      setErrorMessage("Informe o nome do responsável.");
      return;
    }

    try {
      setIsSaving(true);
      setErrorMessage("");
      setSuccessMessage("");

      const response = await fetch(
        apiUrl(`/users/${id}/respons?vel`),
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            name: editForm.name.trim(),
            phone: editForm.phone.trim(),
            address: editForm.address.trim(),
            cpf: editForm.cpf.trim(),
            identidade: editForm.identidade.trim(),
          }),
        }
      );

      const responseData = await response.json();

      if (!response.ok) {
        throw new Error(responseData.message || "Erro ao atualizar responsável.");
      }

      setSuccessMessage("Responsável atualizado com sucesso.");
      setIsEditing(false);
      await fetchData();
    } catch (error: any) {
      console.error("Erro ao atualizar responsável:", error);
      setErrorMessage(
        error?.message || "Não foi possível atualizar os dados do responsável."
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSaveAccess(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!token || !id) {
      setErrorMessage("Sessão inválida. Faça login novamente.");
      return;
    }

    if (!accessForm.email.trim()) {
      setErrorMessage("Informe o e-mail de acesso do responsável.");
      return;
    }

    try {
      setIsSavingAccess(true);
      setErrorMessage("");
      setSuccessMessage("");

      const response = await fetch(
        apiUrl(`/users/${id}/respons?vel-acesso`),
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            email: accessForm.email.trim(),
            username: accessForm.username.trim(),
            password: accessForm.password.trim(),
            isActive: accessForm.isActive,
          }),
        }
      );

      const responseData = await response.json();

      if (!response.ok) {
        throw new Error(
          responseData.message || "Erro ao configurar acesso do responsável."
        );
      }

      setSuccessMessage("Acesso do responsável atualizado com sucesso.");
      await fetchData();
      setAccessForm({
        email: "",
        username: "",
        password: "",
        isActive: Boolean(responseData?.isActive ?? accessForm.isActive),
      });
    } catch (error: any) {
      console.error("Erro ao configurar acesso do responsável:", error);
      setErrorMessage(
        error?.message || "Não foi possível configurar o acesso do responsável."
      );
    } finally {
      setIsSavingAccess(false);
    }
  }

  async function handleDelete(docId: string) {
    if (!token) {
      setErrorMessage("Sessão inválida. Faça login novamente.");
      return;
    }

    const confirmed = window.confirm(
      "Tem certeza que deseja excluir este documento?"
    );

    if (!confirmed) return;

    try {
      setDeletingDocId(docId);
      setErrorMessage("");
      setSuccessMessage("");

      const response = await fetch(
        apiUrl(`/users/documentos/${docId}`),
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const responseData = await response.json();

      if (!response.ok) {
        throw new Error(responseData.message || "Erro ao excluir documento.");
      }

      setSuccessMessage("Documento excluído com sucesso.");
      await fetchData();
    } catch (error: any) {
      console.error("Erro ao excluir documento:", error);
      setErrorMessage(
        error?.message || "Não foi possível excluir o documento."
      );
    } finally {
      setDeletingDocId(null);
    }
  }

  async function handleDownload(docId: string, nomeOriginal: string) {
    if (!token) {
      setErrorMessage("Sessão inválida. Faça login novamente.");
      return;
    }

    try {
      setDownloadingDocId(docId);
      setErrorMessage("");
      setSuccessMessage("");

      const response = await fetch(
        apiUrl(`/users/documentos/download/${docId}`),
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        let message = "Não foi possível baixar o documento.";

        try {
          const errorData = await response.json();
          message = errorData.message || message;
        } catch {
        }

        throw new Error(message);
      }

      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = downloadUrl;
      link.download = nomeOriginal;
      document.body.appendChild(link);
      link.click();
      link.remove();

      window.URL.revokeObjectURL(downloadUrl);
      setSuccessMessage("Download iniciado com sucesso.");
    } catch (error: any) {
      console.error("Erro ao baixar documento:", error);
      setErrorMessage(error?.message || "Erro ao baixar o documento.");
    } finally {
      setDownloadingDocId(null);
    }
  }

  async function handleView(docId: string) {
    if (!token) {
      setErrorMessage("Sessão inválida. Faça login novamente.");
      return;
    }

    try {
      setViewingDocId(docId);
      setErrorMessage("");
      setSuccessMessage("");

      const response = await fetch(
        apiUrl(`/users/documentos/view/${docId}`),
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        let message = "Não foi possível visualizar o documento.";

        try {
          const errorData = await response.json();
          message = errorData.message || message;
        } catch {
        }

        throw new Error(message);
      }

      const blob = await response.blob();
      const viewUrl = window.URL.createObjectURL(blob);
      window.open(viewUrl, "_blank", "noopener,noreferrer");
      window.setTimeout(() => window.URL.revokeObjectURL(viewUrl), 60000);
    } catch (error: any) {
      console.error("Erro ao visualizar documento:", error);
      setErrorMessage(error?.message || "Erro ao visualizar o documento.");
    } finally {
      setViewingDocId(null);
    }
  }

  async function handleUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!token || !id) {
      setErrorMessage("Sessão inválida. Faça login novamente.");
      return;
    }

    if (!uploadForm.tipo.trim()) {
      setErrorMessage("Selecione o tipo do documento.");
      return;
    }

    if (!uploadForm.file) {
      setErrorMessage("Selecione um arquivo para enviar.");
      return;
    }

    try {
      setIsUploading(true);
      setErrorMessage("");
      setSuccessMessage("");

      const formData = new FormData();
      formData.append("tipo", uploadForm.tipo);
      formData.append("observacao", uploadForm.observacao);
      formData.append("file", uploadForm.file);

      const response = await fetch(
        apiUrl(`/users/${id}/documentos`),
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: formData,
        }
      );

      const responseData = await response.json();

      if (!response.ok) {
        throw new Error(responseData.message || "Erro ao enviar documento.");
      }

      setSuccessMessage("Documento enviado com sucesso.");
      setUploadForm({
        tipo: "CPF",
        observacao: "",
        file: null,
      });

      const fileInput = document.getElementById(
        "respons?vel-documento-file"
      ) as HTMLInputElement | null;

      if (fileInput) {
        fileInput.value = "";
      }

      await fetchData();
    } catch (error: any) {
      console.error("Erro ao enviar documento:", error);
      setErrorMessage(
        error?.message || "Não foi possível enviar o documento."
      );
    } finally {
      setIsUploading(false);
    }
  }

  const totalAlunos = useMemo(() => {
    return data?.responsavelAlunos?.length || 0;
  }, [data]);

  const fotoResponsavelUrl = getFotoUrl(data?.fotoUrl);

  if (loading) {
    return (
      <section className="space-y-6">
        <PageHeader
          title="Responsável"
          description="Carregando informações do responsável."
        />

        <div className="card-base p-6">
          <p className="text-sm text-slate-500">Carregando...</p>
        </div>
      </section>
    );
  }

  if (!data) {
    return (
      <section className="space-y-6">
        <PageHeader
          title="Responsável"
          description="Não foi possível localizar esse responsável."
        />

        <div className="card-base p-6">
          <p className="text-sm text-red-600">Responsável não encontrado.</p>

          <div className="mt-4">
            <Link
              href="/usuarios"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <ArrowLeft size={16} />
              Voltar para usuários
            </Link>
          </div>
        </div>
      </section>
    );
  }

  return (
    <>
      <section className="space-y-6">
        <PageHeader
          title="Detalhes do responsável"
          description="Visualize, edite e gerencie os dados, os documentos e o acesso do responsável."
        />

        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/usuarios"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <ArrowLeft size={16} />
            Voltar para usuários
          </Link>

          {canManageResponsavel && !isEditing ? (
            <button
              type="button"
              onClick={() => {
                setIsEditing(true);
                setErrorMessage("");
                setSuccessMessage("");
              }}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              <Pencil size={16} />
              Editar responsável
            </button>
          ) : null}
        </div>

        {errorMessage ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {errorMessage}
          </div>
        ) : null}

        {successMessage ? (
          <div className="rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
            {successMessage}
          </div>
        ) : null}

        <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="card-base p-6">
            <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
              <div className="flex items-center gap-4">
                {fotoResponsavelUrl ? (
                  <button
                    type="button"
                    onClick={() => setImagemAberta(true)}
                    title="Clique para ampliar a foto"
                    className="h-20 w-20 cursor-zoom-in overflow-hidden rounded-full border border-slate-200"
                  >
                    <img
                      src={fotoResponsavelUrl}
                      alt={`Foto de ${data.name}`}
                      className="h-20 w-20 object-cover"
                    />
                  </button>
                ) : (
                  <div className="flex h-20 w-20 items-center justify-center rounded-full bg-slate-100 text-xl font-bold text-slate-700">
                    {getIniciais(data.name)}
                  </div>
                )}

                <div className="space-y-1">
                  <h2 className="text-2xl font-bold text-slate-900">{data.name}</h2>
                  <p className="text-sm text-slate-500">{data.email}</p>

                  <div className="flex flex-wrap gap-2 pt-2">
                    <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
                      Responsável
                    </span>

                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                      Alunos vinculados: {totalAlunos}
                    </span>

                    <span
                      className={`rounded-full px-3 py-1 text-xs font-medium ${
                        data.isActive
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-red-50 text-red-700"
                      }`}
                    >
                      {data.isActive ? "Acesso ativo" : "Acesso inativo"}
                    </span>
                  </div>
                </div>
              </div>

              {canManageResponsavel ? (
                <form
                  onSubmit={handleUploadFoto}
                  className="w-full max-w-sm rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-4"
                >
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    Foto do responsável
                  </label>

                  <input
                    id="respons?vel-foto-file"
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0] || null;
                      setFoto(file);
                    }}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500"
                  />

                  <button
                    type="submit"
                    disabled={enviandoFoto}
                    className="mt-3 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Upload size={16} />
                    {enviandoFoto ? "Enviando foto..." : "Enviar foto"}
                  </button>

                  <p className="mt-2 text-xs text-slate-500">
                    Envie uma imagem para aparecer no perfil do responsável.
                  </p>
                </form>
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-500">
                  Foto do responsável
                </div>
              )}
            </div>

            {isEditing && canManageResponsavel ? (
              <form onSubmit={handleSave} className="mt-6 space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">
                      Nome
                    </label>
                    <input
                      type="text"
                      value={editForm.name}
                      onChange={(e) =>
                        handleEditInputChange("name", e.target.value)
                      }
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
                      placeholder="Digite o nome"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">
                      Telefone
                    </label>
                    <input
                      type="text"
                      value={editForm.phone}
                      onChange={(e) =>
                        handleEditInputChange("phone", e.target.value)
                      }
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
                      placeholder="Digite o telefone"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="mb-1 block text-sm font-medium text-slate-700">
                      Endereço
                    </label>
                    <input
                      type="text"
                      value={editForm.address}
                      onChange={(e) =>
                        handleEditInputChange("address", e.target.value)
                      }
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
                      placeholder="Digite o endereço"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">
                      CPF
                    </label>
                    <input
                      type="text"
                      value={editForm.cpf}
                      onChange={(e) =>
                        handleEditInputChange("cpf", e.target.value)
                      }
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
                      placeholder="Digite o CPF"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">
                      Identidade
                    </label>
                    <input
                      type="text"
                      value={editForm.identidade}
                      onChange={(e) =>
                        handleEditInputChange("identidade", e.target.value)
                      }
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
                      placeholder="Digite a identidade"
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-3 pt-2 md:flex-row">
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Save size={16} />
                    {isSaving ? "Salvando..." : "Salvar alterações"}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setIsEditing(false);
                      setErrorMessage("");
                      setSuccessMessage("");
                      setEditForm({
                        name: data.name || "",
                        phone: data.phone || "",
                        address: data.address || "",
                        cpf: data.cpf || "",
                        identidade: data.identidade || "",
                      });
                    }}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    <X size={16} />
                    Cancelar
                  </button>
                </div>
              </form>
            ) : (
              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl bg-slate-50 p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    Telefone
                  </p>
                  <p className="mt-2 text-sm font-semibold text-slate-900">
                    {data.phone || "Não informado"}
                  </p>
                </div>

                <div className="rounded-2xl bg-slate-50 p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    CPF
                  </p>
                  <p className="mt-2 text-sm font-semibold text-slate-900">
                    {data.cpf || "Não informado"}
                  </p>
                </div>

                <div className="rounded-2xl bg-slate-50 p-4 md:col-span-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    Endereço
                  </p>
                  <p className="mt-2 text-sm font-semibold text-slate-900">
                    {data.address || "Não informado"}
                  </p>
                </div>

                <div className="rounded-2xl bg-slate-50 p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    Identidade
                  </p>
                  <p className="mt-2 text-sm font-semibold text-slate-900">
                    {data.identidade || "Não informado"}
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-6">
            <div className="card-base p-6">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-slate-100 p-3 text-slate-700">
                  <UserRound size={22} />
                </div>

                <div>
                  <h3 className="text-lg font-semibold text-slate-900">
                    Resumo do responsável
                  </h3>
                  <p className="text-sm text-slate-500">
                    Visão rápida dos vínculos cadastrados.
                  </p>
                </div>
              </div>

              <div className="mt-5 space-y-4">
                <div className="rounded-2xl border border-slate-200 p-4">
                  <p className="text-xs uppercase tracking-wide text-slate-500">
                    Nome
                  </p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">
                    {data.name}
                  </p>
                </div>

                <div className="rounded-2xl border border-slate-200 p-4">
                  <p className="text-xs uppercase tracking-wide text-slate-500">
                    E-mail
                  </p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">
                    {data.email}
                  </p>
                </div>

                <div className="rounded-2xl border border-slate-200 p-4">
                  <p className="text-xs uppercase tracking-wide text-slate-500">
                    Usuário de acesso
                  </p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">
                    {data.username || "Não informado"}
                  </p>
                </div>

                <div className="rounded-2xl border border-slate-200 p-4">
                  <p className="text-xs uppercase tracking-wide text-slate-500">
                    Quantidade de alunos vinculados
                  </p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">
                    {totalAlunos}
                  </p>
                </div>
              </div>
            </div>

            {canManageResponsavel ? (
              <div className="card-base p-6">
                <div className="flex items-center gap-3">
                  <div className="rounded-2xl bg-slate-100 p-3 text-slate-700">
                    <KeyRound size={22} />
                  </div>

                  <div>
                    <h3 className="text-lg font-semibold text-slate-900">
                      Acesso do responsável
                    </h3>
                    <p className="text-sm text-slate-500">
                      Configure o login que o responsável usará para entrar na plataforma.
                    </p>
                  </div>
                </div>

                <form onSubmit={handleSaveAccess} className="mt-5 space-y-4">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">
                      E-mail de acesso
                    </label>
                    <div className="relative">
                      <Mail
                        size={16}
                        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                      />
                      <input
                        type="email"
                        value={accessForm.email}
                        onChange={(e) =>
                          handleAccessInputChange("email", e.target.value)
                        }
                        className="w-full rounded-xl border border-slate-300 py-2 pl-10 pr-3 text-sm outline-none focus:border-slate-500"
                        placeholder="Digite o e-mail do responsável"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">
                      Usuário de acesso
                    </label>
                    <input
                      type="text"
                      value={accessForm.username}
                      onChange={(e) =>
                        handleAccessInputChange("username", e.target.value)
                      }
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
                      placeholder="Ex.: respons?vel.maria"
                    />
                    <p className="mt-1 text-xs text-slate-500">
                      Opcional. O responsável também poderá usar esse usuário no login.
                    </p>
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">
                      Senha de acesso
                    </label>
                    <input
                      type="text"
                      value={accessForm.password}
                      onChange={(e) =>
                        handleAccessInputChange("password", e.target.value)
                      }
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
                      placeholder="Digite uma senha nova ou deixe em branco para manter a atual"
                    />
                    <p className="mt-1 text-xs text-slate-500">
                      Se você deixar em branco, a senha atual será mantida.
                    </p>
                  </div>

                  <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <ShieldCheck size={18} className="text-slate-600" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-slate-900">
                        Acesso ativo
                      </p>
                      <p className="text-xs text-slate-500">
                        Quando desligado, o responsável não consegue entrar na plataforma.
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={accessForm.isActive}
                      onChange={(e) =>
                        handleAccessInputChange("isActive", e.target.checked)
                      }
                    />
                  </label>

                  <div className="rounded-2xl bg-slate-50 p-4">
                    <p className="text-xs uppercase tracking-wide text-slate-500">
                      Status atual
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-medium ${
                          data.isActive
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-red-50 text-red-700"
                        }`}
                      >
                        {data.isActive ? "Ativo" : "Inativo"}
                      </span>

                      <span
                        className={`rounded-full px-3 py-1 text-xs font-medium ${
                          data.isActivated
                            ? "bg-blue-50 text-blue-700"
                            : "bg-amber-50 text-amber-700"
                        }`}
                      >
                        {data.isActivated ? "Acesso configurado" : "Acesso pendente"}
                      </span>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isSavingAccess}
                    className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Save size={16} />
                    {isSavingAccess ? "Salvando acesso..." : "Salvar acesso"}
                  </button>
                </form>
              </div>
            ) : null}
          </div>
        </div>

        <div className="card-base p-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">
                Alunos vinculados
              </h3>
              <p className="text-sm text-slate-500">
                Relação dos alunos conectados a este responsável.
              </p>
            </div>

            <div className="rounded-full bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700">
              Total: {totalAlunos}
            </div>
          </div>

          <div className="mt-5">
            {data.responsavelAlunos && data.responsavelAlunos.length > 0 ? (
              <div className="grid gap-4 lg:grid-cols-2">
                {data.responsavelAlunos.map((rel) => (
                  <div
                    key={rel.id}
                    className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                  >
                    <p className="text-base font-bold text-slate-900">
                      {rel.aluno?.name || "Aluno não encontrado"}
                    </p>

                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <div className="rounded-xl bg-slate-50 p-3">
                        <p className="text-xs text-slate-500">Turma/Série</p>
                        <p className="mt-1 text-sm font-medium text-slate-800">
                          {rel.aluno?.turma?.name || "Não informada"}
                        </p>
                      </div>

                      <div className="rounded-xl bg-slate-50 p-3">
                        <p className="text-xs text-slate-500">Turno</p>
                        <p className="mt-1 text-sm font-medium text-slate-800">
                          {formatTurno(rel.aluno?.turma?.turno)}
                        </p>
                      </div>

                      <div className="rounded-xl bg-slate-50 p-3">
                        <p className="text-xs text-slate-500">Parentesco</p>
                        <p className="mt-1 text-sm font-medium text-slate-800">
                          {rel.parentesco || "Não informado"}
                        </p>
                      </div>

                      <div className="rounded-xl bg-slate-50 p-3">
                        <p className="text-xs text-slate-500">
                          Responsável financeiro
                        </p>
                        <p className="mt-1 text-sm font-medium text-slate-800">
                          {rel.isFinanceiro ? "Sim" : "Não"}
                        </p>
                      </div>
                    </div>

                    <div className="mt-3">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-medium ${
                          rel.aluno?.status === "ATIVO"
                            ? "bg-green-50 text-green-700"
                            : "bg-red-50 text-red-700"
                        }`}
                      >
                        {rel.aluno?.status || "Sem status"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
                <p className="text-sm font-medium text-slate-700">
                  Nenhum aluno vinculado a este responsável.
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="card-base p-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Documentos</h3>
              <p className="text-sm text-slate-500">
                Aqui ficam os documentos enviados para este responsável.
              </p>
            </div>

            <div className="rounded-full bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700">
              Total: {documentos.length}
            </div>
          </div>

          {canManageResponsavel ? (
            <form
              onSubmit={handleUpload}
              className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4"
            >
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Tipo do documento
                  </label>
                  <select
                    value={uploadForm.tipo}
                    onChange={(e) =>
                      setUploadForm((prev) => ({
                        ...prev,
                        tipo: e.target.value,
                      }))
                    }
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
                  >
                    <option value="CPF">CPF</option>
                    <option value="IDENTIDADE">Identidade</option>
                    <option value="COMPROVANTE_RESIDENCIA">
                      Comprovante de residência
                    </option>
                    <option value="CONTRATO_PRESTACAO_SERVICO">
                      Contrato de prestação de serviço
                    </option>
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Arquivo
                  </label>
                  <input
                    id="respons?vel-documento-file"
                    type="file"
                    onChange={handleFileChange}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Observação
                  </label>
                  <input
                    type="text"
                    value={uploadForm.observacao}
                    onChange={(e) =>
                      setUploadForm((prev) => ({
                        ...prev,
                        observacao: e.target.value,
                      }))
                    }
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
                    placeholder="Descreva o documento enviado"
                  />
                </div>
              </div>

              <div className="mt-4">
                <button
                  type="submit"
                  disabled={isUploading}
                  className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Upload size={16} />
                  {isUploading ? "Enviando..." : "Enviar documento"}
                </button>
              </div>
            </form>
          ) : null}

          <div className="mt-5">
            {documentos.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
                <p className="text-sm font-medium text-slate-700">
                  Nenhum documento cadastrado.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {documentos.map((doc) => (
                  <div
                    key={doc.id}
                    className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:flex-row lg:items-center lg:justify-between"
                  >
                    <div className="flex items-start gap-3">
                      <div className="rounded-2xl bg-slate-100 p-3 text-slate-700">
                        <FileText size={20} />
                      </div>

                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-slate-900">
                          {doc.nomeOriginal}
                        </p>

                        <p className="text-xs text-slate-500">
                          Tipo: {traduzirTipoDocumento(doc.tipo)}
                        </p>

                        <p className="text-xs text-slate-500">
                          Observação: {doc.observacao || "Sem observação"}
                        </p>
                      </div>
                    </div>

                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => handleView(doc.id)}
                          disabled={viewingDocId === doc.id}
                          className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <Eye size={16} />
                          {viewingDocId === doc.id ? "Abrindo..." : "Visualizar"}
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDownload(doc.id, doc.nomeOriginal)}
                        disabled={downloadingDocId === doc.id}
                        className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <Download size={16} />
                        {downloadingDocId === doc.id ? "Baixando..." : "Baixar"}
                      </button>

                      {canManageResponsavel ? (
                        <button
                          type="button"
                          onClick={() => handleDelete(doc.id)}
                          disabled={deletingDocId === doc.id}
                          className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <Trash2 size={16} />
                          {deletingDocId === doc.id ? "Excluindo..." : "Excluir"}
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {imagemAberta && fotoResponsavelUrl ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="relative max-h-[90vh] max-w-[90vw]">
            <button
              type="button"
              onClick={() => setImagemAberta(false)}
              className="absolute right-2 top-2 z-10 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white text-slate-700 shadow hover:bg-slate-100"
            >
              <X size={18} />
            </button>

            <img
              src={fotoResponsavelUrl}
              alt={`Foto ampliada de ${data.name}`}
              className="max-h-[90vh] max-w-[90vw] rounded-2xl object-contain shadow-2xl"
            />
          </div>
        </div>
      ) : null}
    </>
  );
}
