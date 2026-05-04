"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  FileText,
  Paperclip,
  Pencil,
  Send,
  Trash2,
  Upload,
} from "lucide-react";
import PageHeader from "@/components/ui/page-header";
import { type UserRole, useAuth } from "@/context/auth-context";
import { API_URL, apiUrl } from "@/lib/api";

type AlunoOpcao = {
  id: string;
  name: string;
  matricula?: string | null;
  turma?: { id: string; name: string; turno?: string | null } | null;
};

type Solicitacao = {
  id: string;
  tipo: string;
  especificacao?: string | null;
  descricao: string;
  status: "ENVIADA" | "RECEBIDA" | "RESPONDIDA";
  resposta?: string | null;
  anexoUrl?: string | null;
  anexoNome?: string | null;
  createdAt: string;
  protocoloAno?: number | null;
  protocoloDigitos?: number | null;
  protocoloNumero?: string | null;
  receivedAt?: string | null;
  respondedAt?: string | null;
  aluno?: AlunoOpcao | null;
  solicitante: {
    id: string;
    name: string;
    email?: string | null;
    role: string;
  };
};

const tiposSolicitante = [
  { value: "DECLARACAO", label: "Declaração" },
  { value: "TRANSFERENCIA", label: "Transferência" },
  { value: "HISTORICO_ESCOLAR", label: "Histórico escolar" },
  { value: "COMPROVANTE", label: "Comprovante" },
  { value: "INFORMACOES", label: "Informações" },
  { value: "GUIA_PAGAMENTO", label: "Guia de pagamento" },
  { value: "OUTROS", label: "Outros" },
];

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function formatarTipo(tipo: string, especificacao?: string | null) {
  const labels: Record<string, string> = {
    DECLARACAO: "Declaração",
    TRANSFERENCIA: "Transferência",
    HISTORICO_ESCOLAR: "Histórico escolar",
    COMPROVANTE: "Comprovante",
    INFORMACOES: "Informações",
    GUIA_PAGAMENTO: "Guia de pagamento",
    OUTROS: "Outros",
  };

  return tipo === "OUTROS" && especificacao
    ? `${labels[tipo]} - ${especificacao}`
    : labels[tipo] || tipo;
}

function formatarCargo(role?: UserRole | string | null) {
  const labels: Record<string, string> = {
    SUPERUSUARIO: "Superusuário",
    ADMIN_ESCOLA: "Admin",
    FINANCEIRO: "Financeiro",
    GESTOR: "Gestor",
    COORDENADOR: "Coordenador",
    SECRETARIA: "Secretaria",
    AUXILIAR: "Auxiliar",
    PROFESSOR: "Professor",
    RESPONSAVEL: "Responsável",
    ALUNO: "Aluno",
  };

  return labels[String(role || "")] || String(role || "");
}

function formatarAlunoOpcao(aluno?: AlunoOpcao | null) {
  if (!aluno) return "";

  const partes = [aluno.matricula, aluno.name].filter(Boolean);
  return partes.join(" - ");
}

function formatarCargoComAluno(
  role?: UserRole | string | null,
  aluno?: AlunoOpcao | null,
) {
  const cargo = formatarCargo(role);
  const alunoFormatado = formatarAlunoOpcao(aluno);

  return alunoFormatado ? `${cargo} - ${alunoFormatado}` : cargo;
}

function formatarStatus(status: string) {
  const labels: Record<string, string> = {
    ENVIADA: "Enviada",
    RECEBIDA: "Solicitação recebida",
    RESPONDIDA: "Respondida",
  };

  return labels[status] || status;
}

function formatarData(data?: string | null) {
  if (!data) return "-";
  return new Date(data).toLocaleString("pt-BR");
}

function formatarProtocolo(solicitacao: Solicitacao) {
  if (!solicitacao.protocoloNumero) return "Sem protocolo";
  const data = new Date(solicitacao.createdAt).toLocaleDateString("pt-BR");
  return `${data} - ${solicitacao.protocoloNumero}`;
}

function arquivoUrl(url?: string | null) {
  if (!url) return "";
  return url.startsWith("http") ? url : `${API_URL}${url}`;
}

export default function SolicitacoesPage() {
  const { token, user } = useAuth();
  const isSecretaria =
    user?.role === "SECRETARIA" || user?.role === "SUPERUSUARIO";
  const canSelectAluno =
    user?.role === "ADMIN_ESCOLA" ||
    user?.role === "GESTOR" ||
    user?.role === "SECRETARIA" ||
    user?.role === "RESPONSAVEL" ||
    user?.role === "SUPERUSUARIO";

  const [alunos, setAlunos] = useState<AlunoOpcao[]>([]);
  const [solicitacoes, setSolicitacoes] = useState<Solicitacao[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [alunoId, setAlunoId] = useState("");
  const [tipo, setTipo] = useState("");
  const [descricao, setDescricao] = useState("");
  const responsavelComMultiplosAlunos =
    user?.role === "RESPONSAVEL" && alunos.length > 1;
  const alunoSelecionado =
    alunos.find((aluno) => aluno.id === alunoId) || null;
  const [respostas, setRespostas] = useState<Record<string, string>>({});
  const [arquivos, setArquivos] = useState<Record<string, File | null>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const solicitacoesPendentes = useMemo(
    () => solicitacoes.filter((item) => item.status !== "RESPONDIDA").length,
    [solicitacoes],
  );

  async function fetchDados() {
    if (!token) return;

    try {
      setLoading(true);
      setError("");

      const [solicitacoesRes, alunosRes] = await Promise.all([
        fetch(apiUrl("/solicitacoes"), {
          headers: { Authorization: `Bearer ${token}` },
        }),
        canSelectAluno
          ? fetch(apiUrl("/solicitacoes/alunos"), {
              headers: { Authorization: `Bearer ${token}` },
            })
          : Promise.resolve(null),
      ]);
      const solicitacoesData = await solicitacoesRes.json();

      if (!solicitacoesRes.ok) {
        throw new Error(
          solicitacoesData.message || "Erro ao carregar solicitações.",
        );
      }

      if (alunosRes) {
        const alunosData = await alunosRes.json();
        if (!alunosRes.ok) {
          throw new Error(alunosData.message || "Erro ao carregar alunos.");
        }

        const listaAlunos = Array.isArray(alunosData) ? alunosData : [];
        setAlunos(listaAlunos);
        setAlunoId((current) =>
          current && listaAlunos.some((aluno) => aluno.id === current)
            ? current
            : user?.role === "RESPONSAVEL" && listaAlunos.length > 1
              ? ""
              : listaAlunos[0]?.id || "",
        );
      } else {
        setAlunos([]);
        setAlunoId("");
      }

      setSolicitacoes(Array.isArray(solicitacoesData) ? solicitacoesData : []);
    } catch (err) {
      setError(getErrorMessage(err, "Erro ao carregar solicitações."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchDados();
  }, [token, canSelectAluno]);

  function resetForm() {
    setEditingId(null);
    setTipo("");
    setDescricao("");
    if (canSelectAluno) {
      setAlunoId(
        user?.role === "RESPONSAVEL" && alunos.length > 1
          ? ""
          : alunos[0]?.id || "",
      );
    } else {
      setAlunoId("");
    }
  }

  function editarSolicitacao(solicitacao: Solicitacao) {
    setEditingId(solicitacao.id);
    setTipo(solicitacao.tipo || "");
    setDescricao(solicitacao.descricao || "");
    if (canSelectAluno) {
      setAlunoId(solicitacao.aluno?.id || "");
    }
    setError("");
    setSuccess("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleEnviar(event: FormEvent) {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (canSelectAluno && !alunoId) {
      setError("Selecione o aluno antes de enviar.");
      return;
    }

    if (!tipo || !descricao.trim()) {
      setError("Preencha assunto e complementação antes de enviar.");
      return;
    }

    try {
      setSubmitting(true);

      const res = await fetch(
        editingId ? apiUrl(`/solicitacoes/${editingId}`) : apiUrl("/solicitacoes"),
        {
          method: editingId ? "PATCH" : "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            alunoId: canSelectAluno ? alunoId : undefined,
            tipo,
            descricao,
          }),
        },
      );
      const data = await res.json();

      if (!res.ok) {
        throw new Error(
          data.message ||
            (editingId
              ? "Erro ao atualizar solicitação."
              : "Erro ao enviar solicitação."),
        );
      }

      resetForm();
      setSuccess(
        editingId
          ? "Solicitação atualizada com sucesso."
          : "Solicitação enviada para a secretaria.",
      );
      await fetchDados();
    } catch (err) {
      setError(
        getErrorMessage(
          err,
          editingId
            ? "Erro ao atualizar solicitação."
            : "Erro ao enviar solicitação.",
        ),
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function excluirSolicitacao(id: string) {
    if (!token) return;
    if (!confirm("Deseja realmente excluir esta solicitação?")) return;

    try {
      setError("");
      setSuccess("");

      const res = await fetch(apiUrl(`/solicitacoes/${id}`), {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Erro ao excluir solicitação.");
      }

      if (editingId === id) {
        resetForm();
      }

      setSuccess("Solicitação exclu?da com sucesso.");
      await fetchDados();
    } catch (err) {
      setError(getErrorMessage(err, "Erro ao excluir solicitação."));
    }
  }

  async function marcarRecebida(id: string) {
    if (!token) return;

    try {
      setError("");
      setSuccess("");
      const res = await fetch(apiUrl(`/solicitacoes/${id}/recebida`), {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Erro ao receber solicitação.");
      }

      setSuccess("Solicitação marcada como recebida.");
      await fetchDados();
    } catch (err) {
      setError(getErrorMessage(err, "Erro ao receber solicitação."));
    }
  }

  async function responder(id: string) {
    if (!token) return;
    const resposta = String(respostas[id] || "").trim();
    const file = arquivos[id];

    if (!resposta && !file) {
      setError("Informe uma resposta ou anexe um arquivo.");
      return;
    }

    try {
      setError("");
      setSuccess("");
      const formData = new FormData();
      formData.append("resposta", resposta);
      if (file) formData.append("file", file);

      const res = await fetch(apiUrl(`/solicitacoes/${id}/resposta`), {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Erro ao responder solicitação.");
      }

      setRespostas((current) => ({ ...current, [id]: "" }));
      setArquivos((current) => ({ ...current, [id]: null }));
      setSuccess("Solicitação respondida.");
      await fetchDados();
    } catch (err) {
      setError(getErrorMessage(err, "Erro ao responder solicitação."));
    }
  }

  return (
    <section className="space-y-6">
      <PageHeader
        title="Solicitações"
        description={
          isSecretaria
            ? "Receba, acompanhe e responda solicitações da comunidade escolar."
            : "Envie solicitações diretamente para a secretaria da escola."
        }
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

      {isSecretaria ? (
        <div className="grid gap-4 md:grid-cols-3">
          <div className="card-base p-5">
            <p className="text-sm text-slate-500">Pendentes</p>
            <h3 className="mt-2 text-3xl font-bold text-slate-900">
              {solicitacoesPendentes}
            </h3>
            <p className="mt-2 text-sm text-blue-600">
              aguardando atendimento ou retorno
            </p>
          </div>
          <div className="card-base p-5 md:col-span-2">
            <p className="text-sm font-semibold text-slate-900">
              Atendimento da secretaria
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Clique em recebido para avisar o solicitante que o pedido entrou
              em atendimento. O retorno pode ser registrado aqui com texto e
              anexo, ou feito presencialmente quando necessario.
            </p>
          </div>
        </div>
      ) : null}

      <form onSubmit={handleEnviar} className="card-base max-w-4xl p-5">
        <div>
          <h2 className="text-lg font-bold text-slate-900">
            {editingId ? "Editar solicitacao" : "Nova solicitacao"}
          </h2>
          <p className="mt-2 text-xs leading-5 text-slate-500">
            Esta solicitacao sera enviada diretamente para a secretaria. O
            nome, o cargo e o aluno vinculado sao identificados automaticamente
            pelo sistema.
          </p>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <label className="block text-sm font-semibold text-slate-700">
            Nome do solicitante
            <input
              value={user?.name || ""}
              disabled
              className="mt-2 w-full rounded-xl border border-slate-300 bg-slate-100 px-4 py-3 text-sm text-slate-700"
            />
          </label>

          <label className="block text-sm font-semibold text-slate-700">
            Cargo
            <input
              value={formatarCargoComAluno(user?.role, alunoSelecionado)}
              disabled
              className="mt-2 w-full rounded-xl border border-slate-300 bg-slate-100 px-4 py-3 text-sm text-slate-700"
            />
          </label>

          {canSelectAluno ? (
            <label className="block text-sm font-semibold text-slate-700 md:col-span-2">
              {responsavelComMultiplosAlunos
                ? "Aluno da solicitacao"
                : "Aluno"}
              <select
                value={alunoId}
                onChange={(event) => setAlunoId(event.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-500"
              >
                <option value="">
                  {loading
                    ? "Carregando alunos..."
                    : "Selecione o aluno"}
                </option>
                {alunos.map((aluno) => (
                  <option key={aluno.id} value={aluno.id}>
                    {aluno.matricula ? `${aluno.matricula} - ` : ""}
                    {aluno.name}
                    {aluno.turma ? ` - ${aluno.turma.name}` : ""}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <label className="block text-sm font-semibold text-slate-700 md:col-span-2">
            Assunto
            <select
              value={tipo}
              onChange={(event) => setTipo(event.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-500"
            >
              <option value="">Selecione</option>
              {tiposSolicitante.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="mt-4 block text-sm font-semibold text-slate-700">
          Complementacao
          <textarea
            value={descricao}
            onChange={(event) => setDescricao(event.target.value)}
            rows={5}
            placeholder="Digite o que deseja solicitar e os detalhes do pedido."
            className="mt-2 w-full resize-none rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-500"
          />
        </label>

        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            <Send size={16} />
            {submitting
              ? editingId
                ? "Salvando..."
                : "Enviando..."
              : editingId
                ? "Salvar alteracoes"
                : "Enviar solicitacao"}
          </button>
          {editingId ? (
            <button
              type="button"
              onClick={resetForm}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancelar edicao
            </button>
          ) : null}
        </div>
      </form>

      <div className="space-y-3">
        {loading ? (
          <div className="card-base p-5 text-sm text-slate-500">
            Carregando solicitacoes...
          </div>
        ) : solicitacoes.length === 0 ? (
          <div className="card-base p-5 text-sm text-slate-500">
            Nenhuma solicitacao encontrada.
          </div>
        ) : (
          solicitacoes.map((solicitacao) => (
            <article key={solicitacao.id} className="card-base p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-base font-bold text-slate-900">
                    {formatarTipo(
                      solicitacao.tipo,
                      solicitacao.especificacao,
                    )}
                  </p>
                  <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-blue-700">
                    Protocolo: {formatarProtocolo(solicitacao)}
                  </p>
                  {solicitacao.aluno?.name ? (
                    <p className="mt-1 text-sm text-slate-500">
                      {solicitacao.aluno.matricula
                        ? `${solicitacao.aluno.matricula} - `
                        : ""}
                      {solicitacao.aluno.name}
                      {solicitacao.aluno.turma
                        ? ` - ${solicitacao.aluno.turma.name}`
                        : ""}
                    </p>
                  ) : null}
                  <p className="mt-1 text-xs text-slate-500">
                    Solicitante: {solicitacao.solicitante?.name} (
                    {formatarCargoComAluno(
                      solicitacao.solicitante?.role,
                      solicitacao.aluno,
                    )}) em{" "}
                    {formatarData(solicitacao.createdAt)}
                  </p>
                </div>
                <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">
                  {formatarStatus(solicitacao.status)}
                </span>
              </div>

              <p className="mt-4 whitespace-pre-line text-sm leading-6 text-slate-700">
                {solicitacao.descricao}
              </p>

              {solicitacao.status !== "ENVIADA" ? (
                <p className="mt-3 text-sm font-semibold text-emerald-700">
                  Solicitação recebida
                  {solicitacao.receivedAt
                    ? ` em ${formatarData(solicitacao.receivedAt)}`
                    : ""}
                  .
                </p>
              ) : null}

              {solicitacao.resposta || solicitacao.anexoUrl ? (
                <div className="mt-4 rounded-xl bg-slate-50 p-4">
                  <p className="text-sm font-bold text-slate-900">
                    Retorno da secretaria
                  </p>
                  {solicitacao.resposta ? (
                    <p className="mt-2 whitespace-pre-line text-sm text-slate-700">
                      {solicitacao.resposta}
                    </p>
                  ) : null}
                  {solicitacao.anexoUrl ? (
                    <a
                      href={arquivoUrl(solicitacao.anexoUrl)}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-blue-700 hover:underline"
                    >
                      <Paperclip size={15} />
                      {solicitacao.anexoNome || "Abrir anexo"}
                    </a>
                  ) : null}
                </div>
              ) : null}

              {isSecretaria ? (
                <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => editarSolicitacao(solicitacao)}
                      className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      <Pencil size={15} />
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => excluirSolicitacao(solicitacao.id)}
                      className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-100"
                    >
                      <Trash2 size={15} />
                      Excluir
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => marcarRecebida(solicitacao.id)}
                      className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
                    >
                      <CheckCircle2 size={16} />
                      Recebido
                    </button>
                  </div>

                  <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                    <textarea
                      value={respostas[solicitacao.id] || ""}
                      onChange={(event) =>
                        setRespostas((current) => ({
                          ...current,
                          [solicitacao.id]: event.target.value,
                        }))
                      }
                      rows={3}
                      placeholder="Digite o retorno para o solicitante..."
                      className="w-full resize-none rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-500"
                    />
                    <div className="flex flex-col gap-2">
                      <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                        <Upload size={15} />
                        Anexo
                        <input
                          type="file"
                          className="hidden"
                          onChange={(event) =>
                            setArquivos((current) => ({
                              ...current,
                              [solicitacao.id]: event.target.files?.[0] || null,
                            }))
                          }
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => responder(solicitacao.id)}
                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                      >
                        <FileText size={15} />
                        Retornar
                      </button>
                    </div>
                  </div>
                  {arquivos[solicitacao.id] ? (
                    <p className="text-xs text-slate-500">
                      Anexo selecionado: {arquivos[solicitacao.id]?.name}
                    </p>
                  ) : null}
                </div>
              ) : (
                <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
                  <button
                    type="button"
                    onClick={() => editarSolicitacao(solicitacao)}
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    <Pencil size={15} />
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => excluirSolicitacao(solicitacao.id)}
                    className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-100"
                  >
                    <Trash2 size={15} />
                    Excluir
                  </button>
                </div>
              )}
            </article>
          ))
        )}
      </div>
    </section>
  );
}
