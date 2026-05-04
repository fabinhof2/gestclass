"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  BookOpenCheck,
  CheckCircle2,
  ClipboardList,
  FilePlus2,
  FileText,
  MessageSquare,
  Paperclip,
  PenLine,
  Plus,
  Send,
  Upload,
  Users,
  X,
  Trash2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import PageHeader from "@/components/ui/page-header";
import { API_URL, apiUrl } from "@/lib/api";
import { useAuth, UserRole } from "@/context/auth-context";

type ForumTab = "topicos" | "atividades" | "enquetes" | "entregas";
type ActivityType = "PDF" | "VIDEO" | "TEXTO" | "MISTA";
type DeliveryStatus = "ENTREGUE" | "PENDENTE" | "CORRIGIDO";
type PollChoiceMode = "UNICA" | "MULTIPLA";
type PollResultVisibility = "IMEDIATO" | "APOS_VOTO" | "APOS_CONCLUIR";
type PollOptionPreset = "SIM_NAO" | "PERSONALIZADA";

type Turma = { id: string; name: string; turno?: string | null };
type Pessoa = { id: string; name: string; role: UserRole; fotoUrl?: string | null };
type Comentario = { id: string; texto: string; createdAt: string; author: Pessoa };
type Topico = {
  id: string;
  titulo: string;
  conteudo: string;
  disciplina?: string | null;
  fixado: boolean;
  createdAt: string;
  author: Pessoa;
  turma?: Turma | null;
  comentarios: Comentario[];
};
type Entrega = {
  id: string;
  texto?: string | null;
  arquivoUrl?: string | null;
  arquivoNome?: string | null;
  arquivoMime?: string | null;
  status: DeliveryStatus;
  feedback?: string | null;
  updatedAt: string;
  aluno: Pessoa;
  atividade?: { id: string; titulo: string; disciplina?: string | null };
};
type Atividade = {
  id: string;
  titulo: string;
  descricao: string;
  disciplina?: string | null;
  tipo: ActivityType;
  prazo?: string | null;
  arquivoUrl?: string | null;
  arquivoNome?: string | null;
  arquivoMime?: string | null;
  professor: Pessoa;
  turma?: Turma | null;
  entregas: Entrega[];
};
type Enquete = {
  id: string;
  pergunta: string;
  modoEscolha: PollChoiceMode;
  visibilidadeResultado: PollResultVisibility;
  encerramentoEm?: string | null;
  encerradaPorPrazo?: boolean;
  concluidaEm?: string | null;
  resultadosVisiveis?: boolean;
  totalVotos?: number;
  opcoes: Array<{ id: string; texto: string; votos: Array<{ id: string }> }>;
  votos: Array<{ opcaoId: string }>;
};
type Resumo = {
  topicos: number;
  atividades: number;
  enquetes: number;
  entregasPendentes: number;
};

type SummaryCard = {
  label: string;
  value: number;
  icon: LucideIcon;
  color: string;
};

type ForumTabItem = {
  id: ForumTab;
  label: string;
  icon: LucideIcon;
};

const managerRoles: UserRole[] = [
  "SUPERUSUARIO",
  "ADMIN_ESCOLA",
  "GESTOR",
  "COORDENADOR",
  "SECRETARIA",
  "PROFESSOR",
];

const activityTypeLabels: Record<ActivityType, string> = {
  PDF: "PDF",
  VIDEO: "Vídeo",
  TEXTO: "Texto",
  MISTA: "Arquivo + texto",
};

const statusLabels: Record<DeliveryStatus, string> = {
  ENTREGUE: "Enviado",
  PENDENTE: "Pendente",
  CORRIGIDO: "Corrigido",
};

const pollVisibilityLabels: Record<PollResultVisibility, string> = {
  IMEDIATO: "Resultado instantaneo",
  APOS_VOTO: "Resultado apos votar",
  APOS_CONCLUIR: "Resultado apos concluir",
};

const tabItems: ForumTabItem[] = [
  { id: "topicos", label: "Discussões", icon: MessageSquare },
  { id: "atividades", label: "Atividades", icon: BookOpenCheck },
  { id: "enquetes", label: "Enquetes", icon: BarChart3 },
  { id: "entregas", label: "Entregas", icon: Upload },
];

function canManageForum(role?: UserRole) {
  return role ? managerRoles.includes(role) : false;
}

function mediaSrc(path?: string | null) {
  if (!path) return "";
  return path.startsWith("http") ? path : `${API_URL}${path}`;
}

function formatDate(value?: string | null) {
  if (!value) return "Sem prazo";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

async function readJson(response: Response) {
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.message || "Não foi possível concluir a ação.");
  }
  return data;
}

export default function ForumPage() {
  const { token, user } = useAuth();
  const canManage = canManageForum(user?.role);
  const isResponsavel = user?.role === "RESPONSAVEL";
  const canSubmit = !canManage && !isResponsavel;
  const [activeTab, setActiveTab] = useState<ForumTab>("topicos");
  const [turmas, setTurmas] = useState<Turma[]>([]);
  const [turmaId, setTurmaId] = useState("");
  const [disciplina, setDisciplina] = useState("");
  const [resumo, setResumo] = useState<Resumo>({
    topicos: 0,
    atividades: 0,
    enquetes: 0,
    entregasPendentes: 0,
  });
  const [topicos, setTopicos] = useState<Topico[]>([]);
  const [atividades, setAtividades] = useState<Atividade[]>([]);
  const [entregas, setEntregas] = useState<Entrega[]>([]);
  const [enquetes, setEnquetes] = useState<Enquete[]>([]);
  const [comentarios, setComentarios] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(true);

  const [topicTitle, setTopicTitle] = useState("");
  const [topicContent, setTopicContent] = useState("");
  const [activityTitle, setActivityTitle] = useState("");
  const [activityDescription, setActivityDescription] = useState("");
  const [activityType, setActivityType] = useState<ActivityType>("MISTA");
  const [activityDeadline, setActivityDeadline] = useState("");
  const [activityFile, setActivityFile] = useState<File | null>(null);
  const [submissionActivityId, setSubmissionActivityId] = useState("");
  const [submissionText, setSubmissionText] = useState("");
  const [submissionFile, setSubmissionFile] = useState<File | null>(null);
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptionPreset, setPollOptionPreset] = useState<PollOptionPreset>("SIM_NAO");
  const [pollChoiceMode, setPollChoiceMode] = useState<PollChoiceMode>("UNICA");
  const [pollVisibility, setPollVisibility] =
    useState<PollResultVisibility>("IMEDIATO");
  const [pollEndAt, setPollEndAt] = useState("");
  const [pollOptions, setPollOptions] = useState<string[]>(["Sim", "Nao"]);
  const [pollSelections, setPollSelections] = useState<Record<string, string[]>>({});
  const [creatingPoll, setCreatingPoll] = useState(false);

  const disciplines = useMemo(() => {
    const values = [
      ...topicos.map((item) => item.disciplina).filter(Boolean),
      ...atividades.map((item) => item.disciplina).filter(Boolean),
    ] as string[];
    return Array.from(new Set(values));
  }, [atividades, topicos]);

  const summaryCards: SummaryCard[] = [
    { label: "Tópicos", value: resumo.topicos, icon: MessageSquare, color: "text-blue-600" },
    { label: "Atividades", value: resumo.atividades, icon: BookOpenCheck, color: "text-emerald-600" },
    { label: "Enquetes", value: resumo.enquetes, icon: BarChart3, color: "text-violet-600" },
    { label: "Pendentes", value: resumo.entregasPendentes, icon: ClipboardList, color: "text-amber-600" },
  ];

  function authHeaders() {
    return { Authorization: `Bearer ${token}` };
  }

  function handleFileChange(
    event: ChangeEvent<HTMLInputElement>,
    setter: (file: File | null) => void,
  ) {
    setter(event.target.files?.[0] || null);
  }

  function setPollPreset(value: PollOptionPreset) {
    setPollOptionPreset(value);
    setPollOptions(value === "SIM_NAO" ? ["Sim", "Nao"] : ["", ""]);
  }

  function updatePollOption(index: number, value: string) {
    setPollOptions((current) =>
      current.map((option, optionIndex) => (optionIndex === index ? value : option)),
    );
  }

  function addPollOption() {
    setPollOptions((current) => [...current, ""]);
  }

  function removePollOption(index: number) {
    setPollOptions((current) =>
      current.length <= 2
        ? current
        : current.filter((_, optionIndex) => optionIndex !== index),
    );
  }

  function togglePollSelection(poll: Enquete, optionId: string) {
    if (poll.concluidaEm || isResponsavel) return;

    setPollSelections((current) => {
      const selected =
        current[poll.id] || poll.votos.map((vote) => vote.opcaoId);

      if (poll.modoEscolha === "UNICA") {
        return { ...current, [poll.id]: [optionId] };
      }

      return {
        ...current,
        [poll.id]: selected.includes(optionId)
          ? selected.filter((id) => id !== optionId)
          : [...selected, optionId],
      };
    });
  }

  async function loadForum() {
    if (!token) return;
    setLoading(true);
    setError("");

    try {
      const params = new URLSearchParams();
      if (turmaId) params.set("turmaId", turmaId);
      if (disciplina) params.set("disciplina", disciplina);

      const [turmasData, resumoData, topicosData, atividadesData, entregasData, enquetesData] =
        await Promise.all([
          fetch(apiUrl("/forum/turmas"), { headers: authHeaders() }).then(readJson),
          fetch(apiUrl("/forum/resumo"), { headers: authHeaders() }).then(readJson),
          fetch(apiUrl(`/forum/topicos?${params.toString()}`), {
            headers: authHeaders(),
          }).then(readJson),
          fetch(apiUrl(`/forum/atividades?${params.toString()}`), {
            headers: authHeaders(),
          }).then(readJson),
          fetch(apiUrl("/forum/entregas"), { headers: authHeaders() }).then(readJson),
          fetch(apiUrl(`/forum/enquetes${turmaId ? `?turmaId=${turmaId}` : ""}`), {
            headers: authHeaders(),
          }).then(readJson),
        ]);

      setTurmas(turmasData);
      if (!turmaId && turmasData[0]?.id) setTurmaId(turmasData[0].id);
      setResumo(resumoData);
      setTopicos(topicosData);
      setAtividades(atividadesData);
      setEntregas(entregasData);
      setEnquetes(enquetesData);
      if (!submissionActivityId && atividadesData[0]?.id) {
        setSubmissionActivityId(atividadesData[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar fórum.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadForum();
  }, [token, turmaId, disciplina]);

  useEffect(() => {
    if (!submissionActivityId && atividades[0]?.id) {
      setSubmissionActivityId(atividades[0].id);
    }
  }, [atividades, submissionActivityId]);

  async function createTopic(event: FormEvent) {
    event.preventDefault();
    if (!token) return;

    try {
      await readJson(
        await fetch(apiUrl("/forum/topicos"), {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify({
            turmaId: turmaId || undefined,
            disciplina: disciplina || undefined,
            titulo: topicTitle,
            conteudo: topicContent,
          }),
        }),
      );
      setTopicTitle("");
      setTopicContent("");
      setSuccess("Tópico publicado.");
      await loadForum();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao publicar tópico.");
    }
  }

  async function createComment(topicoId: string) {
    if (!token) return;
    const texto = comentarios[topicoId];

    try {
      await readJson(
        await fetch(apiUrl(`/forum/topicos/${topicoId}/comentarios`), {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify({ texto }),
        }),
      );
      setComentarios((current) => ({ ...current, [topicoId]: "" }));
      await loadForum();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao comentar.");
    }
  }

  async function createActivity(event: FormEvent) {
    event.preventDefault();
    if (!token) return;
    const data = new FormData();
    data.append("turmaId", turmaId);
    data.append("disciplina", disciplina);
    data.append("titulo", activityTitle);
    data.append("descricao", activityDescription);
    data.append("tipo", activityType);
    if (activityDeadline) data.append("prazo", activityDeadline);
    if (activityFile) data.append("file", activityFile);

    try {
      await readJson(
        await fetch(apiUrl("/forum/atividades"), {
          method: "POST",
          headers: authHeaders(),
          body: data,
        }),
      );
      setActivityTitle("");
      setActivityDescription("");
      setActivityFile(null);
      setSuccess("Atividade publicada com material armazenado.");
      await loadForum();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao publicar atividade.");
    }
  }

  async function submitWork(event: FormEvent) {
    event.preventDefault();
    if (!token) return;
    const atividadeId = submissionActivityId || atividades[0]?.id;
    if (!atividadeId) {
      setError("Nenhuma atividade disponível para envio.");
      return;
    }
    const data = new FormData();
    data.append("texto", submissionText);
    if (submissionFile) data.append("file", submissionFile);

    try {
      await readJson(
        await fetch(apiUrl(`/forum/atividades/${atividadeId}/entregas`), {
          method: "POST",
          headers: authHeaders(),
          body: data,
        }),
      );
      setSubmissionText("");
      setSubmissionFile(null);
      setSuccess("Trabalho enviado e registrado como enviado.");
      await loadForum();
      setActiveTab("entregas");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao enviar trabalho.");
    }
  }

  async function markCorrected(entregaId: string) {
    if (!token) return;
    try {
      await readJson(
        await fetch(apiUrl(`/forum/entregas/${entregaId}`), {
          method: "PATCH",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify({ status: "CORRIGIDO" }),
        }),
      );
      await loadForum();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao corrigir entrega.");
    }
  }

  function editDelivery(delivery: Entrega) {
    if (!delivery.atividade?.id) return;
    setSubmissionActivityId(delivery.atividade.id);
    setSubmissionText(delivery.texto || "");
    setSubmissionFile(null);
    setActiveTab("atividades");
    setSuccess("Entrega carregada para edição. Ajuste o texto/arquivo e envie novamente.");
  }

  async function deleteDelivery(entregaId: string) {
    if (!token) return;
    if (!confirm("Deseja realmente excluir esta entrega?")) return;

    try {
      await readJson(
        await fetch(apiUrl(`/forum/entregas/${entregaId}`), {
          method: "DELETE",
          headers: authHeaders(),
        }),
      );
      setSuccess("Entrega excluída.");
      await loadForum();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao excluir entrega.");
    }
  }

  async function createPoll(event: FormEvent) {
    event.preventDefault();
    if (!token || creatingPoll) return;

    const sanitizedQuestion = pollQuestion.trim();
    const sanitizedOptions = pollOptions
      .map((option) => option.trim())
      .filter(Boolean);

    if (!sanitizedQuestion || sanitizedOptions.length < 2) {
      setError("Informe a pergunta e pelo menos duas alternativas.");
      return;
    }

    try {
      setCreatingPoll(true);
      setError("");
      setSuccess("");
      await readJson(
        await fetch(apiUrl("/forum/enquetes"), {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify({
            turmaId: turmaId.trim() || undefined,
            pergunta: sanitizedQuestion,
            opcoes: sanitizedOptions,
            modoEscolha: pollChoiceMode,
            visibilidadeResultado: pollVisibility,
            encerramentoEm: pollEndAt ? new Date(pollEndAt).toISOString() : undefined,
          }),
        }),
      );
      setPollQuestion("");
      setPollPreset("SIM_NAO");
      setPollChoiceMode("UNICA");
      setPollVisibility("IMEDIATO");
      setPollEndAt("");
      setSuccess("Enquete criada.");
      await loadForum();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao criar enquete.");
    } finally {
      setCreatingPoll(false);
    }
  }

  async function votePoll(enqueteId: string, opcaoIds: string[]) {
    if (!token) return;
    if (opcaoIds.length === 0) {
      setError("Selecione pelo menos uma alternativa.");
      return;
    }

    try {
      await readJson(
        await fetch(apiUrl(`/forum/enquetes/${enqueteId}/votos`), {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify({ opcaoIds }),
        }),
      );
      setPollSelections((current) => ({ ...current, [enqueteId]: opcaoIds }));
      await loadForum();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao votar.");
    }
  }

  async function concludePoll(enqueteId: string) {
    if (!token) return;

    try {
      await readJson(
        await fetch(apiUrl(`/forum/enquetes/${enqueteId}/concluir`), {
          method: "POST",
          headers: authHeaders(),
        }),
      );
      setSuccess("Enquete concluida. Resultados liberados.");
      await loadForum();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao concluir enquete.");
    }
  }

  async function deletePoll(enqueteId: string) {
    if (!token) return;
    if (!confirm("Deseja realmente excluir esta enquete?")) return;

    try {
      await readJson(
        await fetch(apiUrl(`/forum/enquetes/${enqueteId}`), {
          method: "DELETE",
          headers: authHeaders(),
        }),
      );
      setSuccess("Enquete excluida.");
      await loadForum();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao excluir enquete.");
    }
  }

  return (
    <section className="space-y-6">
      <PageHeader
        title="Fórum"
        description="Ambiente real de atividades, debates, enquetes, arquivos e entregas da turma."
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

      <div className="grid gap-4 lg:grid-cols-4">
        {summaryCards.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="card-base p-5">
            <Icon className={color} size={24} />
            <p className="mt-4 text-2xl font-bold text-slate-900">{value}</p>
            <p className="text-sm font-semibold text-slate-500">{label}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-[280px_1fr]">
        <aside className="card-base h-fit p-4">
          <p className="text-sm font-bold text-slate-900">Sala virtual</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            Tudo aqui vem do banco de dados e dos arquivos enviados.
          </p>

          <label className="mt-5 block">
            <span className="text-xs font-bold uppercase text-slate-500">Turma</span>
            <select
              value={turmaId}
              onChange={(event) => setTurmaId(event.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm font-semibold outline-none focus:border-blue-500"
            >
              <option value="">Todas</option>
              {turmas.map((turma) => (
                <option key={turma.id} value={turma.id}>
                  {turma.name}
                </option>
              ))}
            </select>
          </label>

          <label className="mt-4 block">
            <span className="text-xs font-bold uppercase text-slate-500">Disciplina</span>
            <input
              value={disciplina}
              onChange={(event) => setDisciplina(event.target.value)}
              list="forum-disciplinas"
              placeholder="Todas"
              className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-3 text-sm outline-none focus:border-blue-500"
            />
            <datalist id="forum-disciplinas">
              {disciplines.map((item) => (
                <option key={item} value={item} />
              ))}
            </datalist>
          </label>

          <div className="mt-5 space-y-2">
            {tabItems.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setActiveTab(id)}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-bold transition ${
                  activeTab === id
                    ? "bg-blue-600 text-white"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                <Icon size={18} />
                {label}
              </button>
            ))}
          </div>
        </aside>

        <div className="card-base overflow-hidden">
          <div className="border-b border-slate-200 bg-slate-50 px-5 py-4">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-xs font-black uppercase text-blue-600">
                  {canManage
                    ? "Professor coordena"
                    : isResponsavel
                      ? "Responsável acompanha"
                      : "Aluno participa"}
                </p>
                <h2 className="text-xl font-bold text-slate-900">
                  {activeTab === "topicos"
                    ? "Discussões reais"
                    : activeTab === "atividades"
                      ? "Atividades publicadas"
                      : activeTab === "enquetes"
                        ? "Enquetes"
                        : "Entregas registradas"}
                </h2>
              </div>
              <div className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-2 text-xs font-bold text-slate-600">
                <Users size={15} />
                {loading ? "Carregando..." : `${turmas.length} turma(s) disponíveis`}
              </div>
            </div>
          </div>

          {activeTab === "topicos" ? (
            <div className="grid gap-5 p-5 lg:grid-cols-[1fr_360px]">
              <div className="space-y-4">
                {topicos.length === 0 ? (
                  <EmptyState text="Nenhum tópico publicado ainda." />
                ) : (
                  topicos.map((topic) => (
                    <article key={topic.id} className="rounded-2xl border border-slate-200 bg-white p-5">
                      <div className="flex flex-wrap items-center gap-2">
                        {topic.fixado ? (
                          <span className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-black uppercase text-amber-700">
                            fixado
                          </span>
                        ) : null}
                        <span className="rounded-full bg-blue-50 px-2 py-1 text-[10px] font-black uppercase text-blue-700">
                          {topic.disciplina || "Geral"}
                        </span>
                        <span className="text-xs font-semibold text-slate-500">
                          {topic.turma?.name || "Todas as turmas"}
                        </span>
                      </div>
                      <h3 className="mt-3 text-lg font-bold text-slate-900">{topic.titulo}</h3>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">
                        {topic.conteudo}
                      </p>
                      <p className="mt-3 text-xs font-semibold text-slate-500">
                        {topic.author.name} - {topic.author.role}
                      </p>
                      <div className="mt-4 space-y-2">
                        {topic.comentarios.map((comment) => (
                          <div key={comment.id} className="rounded-xl bg-slate-50 px-3 py-2">
                            <p className="text-xs font-bold text-slate-500">
                              {comment.author.name}
                            </p>
                            <p className="text-sm text-slate-700">{comment.texto}</p>
                          </div>
                        ))}
                      </div>
                      {!isResponsavel ? (
                      <div className="mt-3 flex gap-2">
                        <input
                          value={comentarios[topic.id] || ""}
                          onChange={(event) =>
                            setComentarios((current) => ({
                              ...current,
                              [topic.id]: event.target.value,
                            }))
                          }
                          placeholder="Comentar..."
                          className="min-w-0 flex-1 rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                        />
                        <button
                          type="button"
                          onClick={() => createComment(topic.id)}
                          className="rounded-xl bg-blue-600 px-3 py-2 text-sm font-bold text-white"
                        >
                          Enviar
                        </button>
                      </div>
                      ) : null}
                    </article>
                  ))
                )}
              </div>

              {!isResponsavel ? (
              <form onSubmit={createTopic} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center gap-2">
                  <PenLine className="text-blue-600" size={20} />
                  <p className="font-bold text-slate-900">Novo tópico</p>
                </div>
                <input
                  value={topicTitle}
                  onChange={(event) => setTopicTitle(event.target.value)}
                  placeholder="Título do assunto"
                  className="mt-4 w-full rounded-xl border border-slate-300 px-3 py-3 text-sm outline-none focus:border-blue-500"
                />
                <textarea
                  value={topicContent}
                  onChange={(event) => setTopicContent(event.target.value)}
                  placeholder="Escreva a pergunta, comentário ou orientação..."
                  rows={6}
                  className="mt-3 w-full resize-none rounded-xl border border-slate-300 px-3 py-3 text-sm outline-none focus:border-blue-500"
                />
                <button className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white hover:bg-blue-700">
                  <Send size={16} />
                  Publicar tópico
                </button>
              </form>
              ) : (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="font-bold text-slate-900">Acompanhamento</p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    O responsável visualiza as discussões das turmas dos filhos,
                    sem publicar ou comentar.
                  </p>
                </div>
              )}
            </div>
          ) : null}

          {activeTab === "atividades" ? (
            <div className="grid gap-5 p-5 lg:grid-cols-[1fr_360px]">
              <div className="space-y-4">
                {atividades.length === 0 ? (
                  <EmptyState text="Nenhuma atividade publicada ainda." />
                ) : (
                  atividades.map((activity) => (
                    <article key={activity.id} className="rounded-2xl border border-slate-200 bg-white p-5">
                      <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-black uppercase text-emerald-700">
                        {activityTypeLabels[activity.tipo]}
                      </span>
                      <h3 className="mt-3 text-lg font-bold text-slate-900">{activity.titulo}</h3>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">
                        {activity.descricao}
                      </p>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <span className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold text-slate-600">
                          Prazo: {formatDate(activity.prazo)}
                        </span>
                        <span className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold text-slate-600">
                          {activity.entregas.length} entrega(s)
                        </span>
                        {activity.arquivoUrl ? (
                          <a
                            href={mediaSrc(activity.arquivoUrl)}
                            target="_blank"
                            className="inline-flex items-center gap-2 rounded-xl bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700"
                          >
                            <Paperclip size={14} />
                            {activity.arquivoNome || "Material"}
                          </a>
                        ) : null}
                      </div>
                    </article>
                  ))
                )}
              </div>

              {canManage ? (
                <form onSubmit={createActivity} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center gap-2">
                    <FilePlus2 className="text-emerald-600" size={20} />
                    <p className="font-bold text-slate-900">Criar atividade real</p>
                  </div>
                  <input
                    value={activityTitle}
                    onChange={(event) => setActivityTitle(event.target.value)}
                    placeholder="Título da atividade"
                    className="mt-4 w-full rounded-xl border border-slate-300 px-3 py-3 text-sm outline-none focus:border-emerald-500"
                  />
                  <select
                    value={activityType}
                    onChange={(event) => setActivityType(event.target.value as ActivityType)}
                    className="mt-3 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm font-semibold outline-none focus:border-emerald-500"
                  >
                    {Object.entries(activityTypeLabels).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                  <input
                    type="date"
                    value={activityDeadline}
                    onChange={(event) => setActivityDeadline(event.target.value)}
                    className="mt-3 w-full rounded-xl border border-slate-300 px-3 py-3 text-sm outline-none focus:border-emerald-500"
                  />
                  <textarea
                    value={activityDescription}
                    onChange={(event) => setActivityDescription(event.target.value)}
                    placeholder="Orientações, critérios e detalhes..."
                    rows={5}
                    className="mt-3 w-full resize-none rounded-xl border border-slate-300 px-3 py-3 text-sm outline-none focus:border-emerald-500"
                  />
                  <FilePicker file={activityFile} onChange={(event) => handleFileChange(event, setActivityFile)} />
                  <button className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white hover:bg-emerald-700">
                    Publicar atividade
                  </button>
                </form>
              ) : canSubmit ? (
                <SubmissionForm
                  atividades={atividades}
                  selected={submissionActivityId}
                  setSelected={setSubmissionActivityId}
                  text={submissionText}
                  setText={setSubmissionText}
                  file={submissionFile}
                  onFile={(event) => handleFileChange(event, setSubmissionFile)}
                  onSubmit={submitWork}
                />
              ) : (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="font-bold text-slate-900">Atividades dos filhos</p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    Aqui você acompanha as atividades publicadas e as entregas
                    feitas pelos alunos sob sua responsabilidade.
                  </p>
                </div>
              )}
            </div>
          ) : null}

          {activeTab === "enquetes" ? (
            <div className="space-y-6 p-5">
              {canManage ? (
                <form
                  onSubmit={createPoll}
                  className="rounded-[1.9rem] border border-slate-200 bg-[linear-gradient(180deg,#fcfbff_0%,#f8fafc_100%)] p-5 shadow-[0_20px_50px_rgba(15,23,42,0.08)]"
                >
                  <p className="text-[11px] font-black uppercase tracking-[0.24em] text-violet-500">
                    Nova enquete
                  </p>
                  <p className="mt-2 text-2xl font-bold tracking-[-0.03em] text-slate-900">
                    Criar enquete
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-500">
                    Monte uma pergunta bonita, objetiva e pronta para a turma responder sem ruído.
                  </p>

                  <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
                    <div className="space-y-4">
                      <div className="rounded-[1.5rem] border border-slate-200 bg-white p-4">
                        <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">
                          Pergunta
                        </p>
                        <input
                          value={pollQuestion}
                          onChange={(event) => setPollQuestion(event.target.value)}
                          placeholder="Pergunta da enquete"
                          className="mt-3 w-full rounded-2xl border border-slate-300 px-4 py-3.5 text-sm outline-none transition focus:border-violet-500"
                        />
                      </div>

                      <div className="rounded-[1.5rem] border border-slate-200 bg-white p-4">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">
                            Alternativas
                          </p>
                          <span className="rounded-full bg-violet-50 px-3 py-1 text-[11px] font-bold text-violet-700">
                            {pollOptions.length} opcao(oes)
                          </span>
                        </div>
                        <div className="mt-3 space-y-3">
                          {pollOptions.map((option, index) => (
                            <div key={index} className="flex gap-2">
                              <input
                                value={option}
                                onChange={(event) => updatePollOption(index, event.target.value)}
                                placeholder={`Alternativa ${index + 1}`}
                                disabled={pollOptionPreset === "SIM_NAO"}
                                className="min-w-0 flex-1 rounded-2xl border border-slate-300 bg-white px-4 py-3.5 text-sm outline-none transition focus:border-violet-500 disabled:bg-slate-100"
                              />
                              {pollOptionPreset === "PERSONALIZADA" ? (
                                <button
                                  type="button"
                                  onClick={() => removePollOption(index)}
                                  disabled={pollOptions.length <= 2}
                                  className="inline-flex h-[3.25rem] w-[3.25rem] items-center justify-center rounded-2xl border border-red-200 text-red-700 transition hover:bg-red-50 disabled:opacity-40"
                                >
                                  <X size={16} />
                                </button>
                              ) : null}
                            </div>
                          ))}
                          {pollOptionPreset === "PERSONALIZADA" ? (
                            <button
                              type="button"
                              onClick={addPollOption}
                              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-violet-200 bg-violet-50/50 px-4 py-3 text-sm font-bold text-violet-700 transition hover:bg-violet-100"
                            >
                              <Plus size={16} />
                              Adicionar alternativa
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="grid gap-3 rounded-[1.5rem] border border-slate-200 bg-white p-4">
                        <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">
                          Configuracao
                        </p>
                        <select
                          value={pollOptionPreset}
                          onChange={(event) => setPollPreset(event.target.value as PollOptionPreset)}
                          className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3.5 text-sm font-semibold outline-none transition focus:border-violet-500"
                        >
                          <option value="SIM_NAO">Sim ou Nao</option>
                          <option value="PERSONALIZADA">Alternativas personalizadas</option>
                        </select>
                        <select
                          value={pollChoiceMode}
                          onChange={(event) => setPollChoiceMode(event.target.value as PollChoiceMode)}
                          className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3.5 text-sm font-semibold outline-none transition focus:border-violet-500"
                        >
                          <option value="UNICA">Marcacao unica</option>
                          <option value="MULTIPLA">Multiplas marcacoes</option>
                        </select>
                        <select
                          value={pollVisibility}
                          onChange={(event) =>
                            setPollVisibility(event.target.value as PollResultVisibility)
                          }
                          className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3.5 text-sm font-semibold outline-none transition focus:border-violet-500"
                        >
                          <option value="IMEDIATO">Resultado instantaneo</option>
                          <option value="APOS_VOTO">Resultado apos o voto</option>
                          <option value="APOS_CONCLUIR">Resultado apos concluir</option>
                        </select>
                        <label className="block">
                          <span className="mb-2 block text-xs font-black uppercase tracking-[0.16em] text-slate-500">
                            Encerrar automaticamente
                          </span>
                          <input
                            type="datetime-local"
                            value={pollEndAt}
                            onChange={(event) => setPollEndAt(event.target.value)}
                            className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3.5 text-sm font-semibold outline-none transition focus:border-violet-500"
                          />
                        </label>
                      </div>

                      <button
                        type="submit"
                        disabled={creatingPoll}
                        className="w-full rounded-[1.4rem] bg-[linear-gradient(90deg,#7c3aed_0%,#9333ea_52%,#2563eb_100%)] px-4 py-4 text-sm font-bold text-white shadow-[0_18px_35px_rgba(124,58,237,0.28)] transition hover:brightness-105 disabled:opacity-60"
                      >
                        {creatingPoll ? "Publicando..." : "Publicar enquete"}
                      </button>
                    </div>
                  </div>
                </form>
              ) : null}

              <div className="space-y-4">
                {enquetes.length === 0 ? (
                  <EmptyState text="Nenhuma enquete criada ainda." />
                ) : (
                  enquetes.map((poll) => {
                    const totalVotes =
                      poll.totalVotos ||
                      poll.opcoes.reduce((total, option) => total + option.votos.length, 0);
                    const selectedOptions =
                      pollSelections[poll.id] || poll.votos.map((vote) => vote.opcaoId);
                    const canVotePoll = !isResponsavel && !poll.concluidaEm;

                    return (
                      <article
                        key={poll.id}
                        className="overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white shadow-[0_18px_45px_rgba(15,23,42,0.06)]"
                      >
                        <div className="border-b border-slate-100 bg-[linear-gradient(135deg,#faf5ff_0%,#ffffff_58%,#eff6ff_100%)] px-5 py-5 md:px-6">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-[11px] font-black uppercase tracking-[0.22em] text-violet-500">
                                Enquete da turma
                              </p>
                              <h3 className="mt-2 text-xl font-bold leading-snug text-slate-900">
                                {poll.pergunta}
                              </h3>
                              <div className="mt-3 flex flex-wrap gap-2">
                                <span className="rounded-full bg-violet-100 px-3 py-1 text-[11px] font-black uppercase tracking-[0.08em] text-violet-700">
                                  {poll.modoEscolha === "MULTIPLA" ? "Multiplas escolhas" : "Escolha unica"}
                                </span>
                                <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-black uppercase tracking-[0.08em] text-slate-600">
                                  {pollVisibilityLabels[poll.visibilidadeResultado]}
                                </span>
                                {poll.concluidaEm ? (
                                  <span className="rounded-full bg-emerald-100 px-3 py-1 text-[11px] font-black uppercase tracking-[0.08em] text-emerald-700">
                                    {poll.encerradaPorPrazo ? "Encerrada" : "Concluida"}
                                  </span>
                                ) : null}
                                {poll.encerramentoEm ? (
                                  <span className="rounded-full bg-amber-100 px-3 py-1 text-[11px] font-black uppercase tracking-[0.08em] text-amber-700">
                                    Ate {new Date(poll.encerramentoEm).toLocaleString("pt-BR")}
                                  </span>
                                ) : null}
                              </div>
                            </div>
                            {canManage ? (
                              <div className="flex shrink-0 flex-wrap gap-2">
                                {!poll.concluidaEm ? (
                                  <button
                                    type="button"
                                    onClick={() => concludePoll(poll.id)}
                                    className="rounded-2xl border border-emerald-200 bg-white px-4 py-2.5 text-xs font-bold text-emerald-700 transition hover:bg-emerald-50"
                                  >
                                    Concluir
                                  </button>
                                ) : null}
                                <button
                                  type="button"
                                  onClick={() => deletePoll(poll.id)}
                                  className="inline-flex items-center gap-1.5 rounded-2xl border border-red-200 bg-white px-4 py-2.5 text-xs font-bold text-red-700 transition hover:bg-red-50"
                                >
                                  <Trash2 size={14} />
                                  Excluir
                                </button>
                              </div>
                            ) : null}
                          </div>
                        </div>

                        <div className="px-5 py-5 md:px-6">
                          <div className="grid gap-3 lg:grid-cols-2">
                            {poll.opcoes.map((option) => {
                              const selected = selectedOptions.includes(option.id);
                              const percent =
                                poll.resultadosVisiveis && totalVotes
                                  ? Math.round((option.votos.length / totalVotes) * 100)
                                  : 0;
                              return (
                                <label
                                  key={option.id}
                                  className={`block rounded-[1.35rem] border p-4 transition ${
                                    selected
                                      ? "border-violet-300 bg-violet-50/70 shadow-[0_10px_25px_rgba(139,92,246,0.12)]"
                                      : "border-slate-200 bg-slate-50/60 hover:border-violet-200 hover:bg-white"
                                  }`}
                                >
                                  <div className="flex items-start gap-3">
                                    <input
                                      type={poll.modoEscolha === "MULTIPLA" ? "checkbox" : "radio"}
                                      name={`poll-${poll.id}`}
                                      checked={selected}
                                      disabled={!canVotePoll}
                                      onChange={() => togglePollSelection(poll, option.id)}
                                      className="mt-1 h-4 w-4 shrink-0"
                                    />
                                    <div className="min-w-0 flex-1">
                                      <div className="flex flex-wrap items-center justify-between gap-3">
                                        <span className="text-sm font-bold leading-6 text-slate-800">
                                          {option.texto}
                                        </span>
                                        {poll.resultadosVisiveis ? (
                                          <span className="rounded-full bg-white px-2.5 py-1 text-xs font-black text-slate-700 ring-1 ring-slate-200">
                                            {percent}%
                                          </span>
                                        ) : null}
                                      </div>
                                      {poll.resultadosVisiveis ? (
                                        <div className="mt-3">
                                          <div className="h-2.5 overflow-hidden rounded-full bg-white ring-1 ring-slate-100">
                                            <div
                                              className="h-full rounded-full bg-[linear-gradient(90deg,#8b5cf6_0%,#2563eb_100%)]"
                                              style={{ width: `${percent}%` }}
                                            />
                                          </div>
                                          <p className="mt-2 text-xs font-semibold text-slate-500">
                                            {option.votos.length} voto(s) nesta alternativa.
                                          </p>
                                        </div>
                                      ) : null}
                                    </div>
                                  </div>
                                </label>
                              );
                            })}
                          </div>

                          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            {!poll.resultadosVisiveis ? (
                              <p className="text-sm font-semibold text-slate-500">
                                Resultado oculto conforme configuracao da enquete.
                              </p>
                            ) : (
                              <p className="text-sm font-semibold text-slate-500">
                                {totalVotes} voto(s) computado(s).
                              </p>
                            )}
                            {canVotePoll ? (
                              <button
                                type="button"
                                onClick={() => votePoll(poll.id, selectedOptions)}
                                className="inline-flex items-center justify-center rounded-2xl bg-[linear-gradient(90deg,#7c3aed_0%,#2563eb_100%)] px-5 py-3 text-sm font-bold text-white shadow-[0_14px_35px_rgba(99,102,241,0.28)] transition hover:brightness-105"
                              >
                                Enviar voto
                              </button>
                            ) : null}
                          </div>
                        </div>
                      </article>
                    );
                  })
                )}
              </div>
            </div>
          ) : null}

          {activeTab === "entregas" ? (
            <div className="p-5">
              {entregas.length === 0 ? (
                <EmptyState text="Nenhuma entrega registrada ainda." />
              ) : (
                <div className="space-y-3">
                  {entregas.map((delivery) => (
                    <div key={delivery.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="font-bold text-slate-900">{delivery.atividade?.titulo}</p>
                          <p className="mt-1 text-sm text-slate-500">
                            {delivery.aluno.name} - {delivery.atividade?.disciplina || "Geral"}
                          </p>
                        </div>
                        <span className={`rounded-full px-3 py-1 text-xs font-black ${
                          delivery.status === "CORRIGIDO"
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-blue-50 text-blue-700"
                        }`}>
                          {statusLabels[delivery.status]}
                        </span>
                      </div>
                      {delivery.texto ? (
                        <p className="mt-3 whitespace-pre-wrap rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
                          {delivery.texto}
                        </p>
                      ) : null}
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        {delivery.arquivoUrl ? (
                          <a
                            href={mediaSrc(delivery.arquivoUrl)}
                            target="_blank"
                            className="inline-flex items-center gap-2 rounded-xl bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700"
                          >
                            <FileText size={14} />
                            {delivery.arquivoNome || "Arquivo enviado"}
                          </a>
                        ) : null}
                        {canManage && delivery.status !== "CORRIGIDO" ? (
                          <button
                            type="button"
                            onClick={() => markCorrected(delivery.id)}
                            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white"
                          >
                            <CheckCircle2 size={14} />
                            Marcar corrigido
                          </button>
                        ) : null}
                        {!isResponsavel && (canManage || delivery.aluno.id === user?.id) ? (
                          <>
                            <button
                              type="button"
                              onClick={() => editDelivery(delivery)}
                              className="inline-flex items-center gap-2 rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-200"
                            >
                              Editar
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteDelivery(delivery.id)}
                              className="inline-flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-100"
                            >
                              Excluir
                            </button>
                          </>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm font-semibold text-slate-500">
      {text}
    </div>
  );
}

function FilePicker({
  file,
  onChange,
}: {
  file: File | null;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <label className="mt-3 flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white px-4 py-4 text-sm font-bold text-slate-600 hover:bg-slate-50">
      <Paperclip size={16} />
      {file ? file.name : "Anexar PDF, vídeo, imagem ou documento"}
      <input
        type="file"
        accept="application/pdf,video/*,image/*,.doc,.docx"
        onChange={onChange}
        className="hidden"
      />
    </label>
  );
}

function SubmissionForm({
  atividades,
  selected,
  setSelected,
  text,
  setText,
  file,
  onFile,
  onSubmit,
}: {
  atividades: Atividade[];
  selected: string;
  setSelected: (value: string) => void;
  text: string;
  setText: (value: string) => void;
  file: File | null;
  onFile: (event: ChangeEvent<HTMLInputElement>) => void;
  onSubmit: (event: FormEvent) => void;
}) {
  return (
    <form onSubmit={onSubmit} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-center gap-2">
        <Upload className="text-emerald-600" size={20} />
        <p className="font-bold text-slate-900">Enviar trabalho</p>
      </div>
      {atividades.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-white p-4 text-sm font-semibold text-slate-500">
          Nenhuma atividade foi publicada para esta turma/disciplina.
        </div>
      ) : null}
      <select
        value={selected}
        onChange={(event) => setSelected(event.target.value)}
        disabled={atividades.length === 0}
        className="mt-4 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm font-semibold outline-none focus:border-emerald-500"
      >
        <option value="">Selecione a atividade</option>
        {atividades.map((atividade) => (
          <option key={atividade.id} value={atividade.id}>
            {atividade.titulo}
          </option>
        ))}
      </select>
      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="Digite sua resposta ou observação..."
        rows={7}
        className="mt-3 w-full resize-none rounded-xl border border-slate-300 px-3 py-3 text-sm outline-none focus:border-emerald-500"
      />
      <FilePicker file={file} onChange={onFile} />
      <button
        disabled={atividades.length === 0}
        className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Send size={16} />
        Enviar e registrar
      </button>
    </form>
  );
}
