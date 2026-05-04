"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  ChevronRight,
  ImagePlus,
  Megaphone,
  MessageCircle,
  RotateCcw,
  ShieldAlert,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  Users,
  Video,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { API_URL, apiUrl } from "@/lib/api";
import {
  communicationBackgroundKey,
  communicationBackgroundOptions,
} from "@/lib/communication-background";
import { formatTurno } from "@/lib/turno";
import { useAuth, UserRole } from "@/context/auth-context";

type Pessoa = {
  id: string;
  name: string;
  email?: string;
  role: UserRole;
  fotoUrl?: string | null;
  comunicacaoSuspensoAte?: string | null;
  comunicacaoSuspensoMotivo?: string | null;
};

type Grupo = {
  id: string;
  nome: string;
  turma?: { id: string; name: string; turno?: string | null } | null;
  membros: Array<{ user: Pessoa }>;
  _count?: { posts: number; mensagens: number };
};

const COLABORADORES_GROUP_NAME = "Colaboradores";

type Comentario = {
  id: string;
  texto: string;
  createdAt: string;
  author: Pessoa;
};

type Post = {
  id: string;
  tipo: "POST" | "AVISO";
  texto?: string | null;
  mediaUrl?: string | null;
  mediaMime?: string | null;
  createdAt: string;
  author: Pessoa;
  comentarios: Comentario[];
  moderado?: boolean;
  moderadoAt?: string | null;
  motivoModeracao?: string | null;
  reacoes: {
    gostei: number;
    naoGostei: number;
    minhaReacao: "LIKE" | "DISLIKE" | null;
  };
};

function formatRole(role: string) {
  return role.split("_").join(" ");
}

function formatDate(value: string) {
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function canResetSocialPosts(role?: UserRole) {
  return (
    role === "SUPERUSUARIO" ||
    role === "ADMIN_ESCOLA" ||
    role === "GESTOR" ||
    role === "SECRETARIA"
  );
}

function mediaSrc(url?: string | null) {
  if (!url) return "";
  return url.startsWith("http") ? url : `${API_URL}${url}`;
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function getGroupLabel(grupo: Grupo) {
  if (grupo.nome === COLABORADORES_GROUP_NAME) return COLABORADORES_GROUP_NAME;
  if (grupo.nome === "Todos da escola") return "Todos da escola";
  if (!grupo.turma) return grupo.nome;
  return grupo.turma.turno
    ? `${grupo.turma.name} - ${formatTurno(grupo.turma.turno)}`
    : grupo.turma.name;
}

function isSuspensoPorModeracao(pessoa?: Pessoa | null) {
  if (!pessoa?.comunicacaoSuspensoAte) return false;

  const suspensoAte = new Date(pessoa.comunicacaoSuspensoAte);
  return !Number.isNaN(suspensoAte.getTime()) && suspensoAte.getTime() > Date.now();
}

function Avatar({
  pessoa,
  size = "md",
}: {
  pessoa: Pessoa;
  size?: "sm" | "md" | "lg";
}) {
  const sizes = {
    sm: { outer: "h-12 w-12", inner: "h-10 w-10" },
    md: { outer: "h-14 w-14", inner: "h-12 w-12" },
    lg: { outer: "h-20 w-20", inner: "h-[4.5rem] w-[4.5rem]" },
  } as const;
  const src = mediaSrc(pessoa.fotoUrl);
  const current = sizes[size];

  return (
    <div
      className={`${current.outer} flex shrink-0 items-center justify-center rounded-full bg-[conic-gradient(from_180deg_at_50%_50%,#f59e0b,#ef4444,#ec4899,#8b5cf6,#f59e0b)] p-[2px] shadow-[0_10px_30px_rgba(17,24,39,0.12)]`}
    >
      {src ? (
        <img
          src={src}
          alt={pessoa.name}
          className={`${current.inner} rounded-full border-2 border-white object-cover`}
        />
      ) : (
        <div
          className={`${current.inner} flex items-center justify-center rounded-full border-2 border-white bg-slate-900 text-sm font-bold text-white`}
        >
          {pessoa.name.slice(0, 1).toUpperCase()}
        </div>
      )}
    </div>
  );
}

export default function RedeSocialPage() {
  const { token, user } = useAuth();
  const router = useRouter();
  const isResponsavel = user?.role === "RESPONSAVEL";
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [grupoId, setGrupoId] = useState("");
  const [posts, setPosts] = useState<Post[]>([]);
  const [texto, setTexto] = useState("");
  const [tipo, setTipo] = useState<"POST" | "AVISO">("POST");
  const [file, setFile] = useState<File | null>(null);
  const [comentarios, setComentarios] = useState<Record<string, string>>({});
  const [posting, setPosting] = useState(false);
  const [cleaningPosts, setCleaningPosts] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [editingPostId, setEditingPostId] = useState("");
  const [editingPostText, setEditingPostText] = useState("");
  const [activeCommentsPostId, setActiveCommentsPostId] = useState("");
  const [cleanupGrupoIds, setCleanupGrupoIds] = useState<string[]>([]);
  const [communicationBackgroundId, setCommunicationBackgroundId] =
    useState("black");

  const grupoAtual = useMemo(
    () => grupos.find((grupo) => grupo.id === grupoId) || null,
    [grupos, grupoId],
  );
  const communicationTheme = useMemo(
    () =>
      communicationBackgroundOptions.find(
        (option) => option.id === communicationBackgroundId,
      ) || communicationBackgroundOptions[0],
    [communicationBackgroundId],
  );
  const activeCommentsPost = useMemo(
    () => posts.find((post) => post.id === activeCommentsPostId) || null,
    [posts, activeCommentsPostId],
  );
  const socialGroups = useMemo(
    () =>
      grupos.filter(
        (grupo) =>
          Boolean(grupo.turma) || grupo.nome === COLABORADORES_GROUP_NAME,
      ),
    [grupos],
  );
  const canResetPosts = canResetSocialPosts(user?.role);
  const isDarkCommunicationTheme = communicationBackgroundId === "black";
  const floatingPrimaryTextClass = isDarkCommunicationTheme
    ? "text-slate-50"
    : "text-slate-950";
  const floatingSecondaryTextClass = isDarkCommunicationTheme
    ? "text-slate-200"
    : "text-slate-700";
  const floatingMutedTextClass = isDarkCommunicationTheme
    ? "text-slate-300"
    : "text-slate-500";
  const floatingBorderClass = isDarkCommunicationTheme
    ? "border-white/45"
    : "border-slate-300";
  const canModerateSocial =
    user?.role === "ADMIN_ESCOLA" ||
    user?.role === "GESTOR" ||
    user?.role === "SECRETARIA";
  const allCleanupGroupsSelected =
    socialGroups.length > 0 && cleanupGrupoIds.length === socialGroups.length;

  async function fetchGrupos() {
    if (!token) return;

    try {
      setError("");
      const res = await fetch(apiUrl("/comunicacao/grupos"), {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.message || "Erro ao carregar grupos.");

      const lista = Array.isArray(data) ? data : [];
      setGrupos(lista);
      setGrupoId((current) => {
        if (current && lista.some((grupo) => grupo.id === current)) {
          return current;
        }
        const grupoColaboradores = lista.find(
          (grupo) => grupo.nome === COLABORADORES_GROUP_NAME,
        );
        if (user?.role === "PROFESSOR" && grupoColaboradores) {
          return grupoColaboradores.id;
        }
        return (
          lista.find(
            (grupo) =>
              Boolean(grupo.turma) || grupo.nome === COLABORADORES_GROUP_NAME,
          )?.id ||
          lista[0]?.id ||
          ""
        );
      });
    } catch (err) {
      setError(getErrorMessage(err, "Erro ao carregar grupos."));
    }
  }

  async function fetchPosts(id: string) {
    if (!token || !id) {
      setPosts([]);
      return;
    }

    try {
      setError("");
      const res = await fetch(apiUrl(`/comunicacao/posts?grupoId=${id}`), {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.message || "Erro ao carregar posts.");
      setPosts(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(getErrorMessage(err, "Erro ao carregar posts."));
    }
  }

  useEffect(() => {
    fetchGrupos();
  }, [token, user?.role]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(communicationBackgroundKey(user?.id));
      if (
        stored &&
        communicationBackgroundOptions.some((option) => option.id === stored)
      ) {
        setCommunicationBackgroundId(stored);
      }
    } catch {
      setCommunicationBackgroundId("black");
    }
  }, [user?.id]);

  useEffect(() => {
    async function markSocialSeen() {
      if (!token) return;
      try {
        const response = await fetch(apiUrl("/comunicacao/resumo"), {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await response.json();
        if (response.ok) {
          localStorage.setItem("gestclass_social_seen", String(data?.social || 0));
          localStorage.setItem(
            "gestclass_comunicacao_seen",
            String(data?.total || 0),
          );
        }
      } catch {}
    }

    markSocialSeen();
  }, [token, posts.length]);

  useEffect(() => {
    fetchPosts(grupoId);
  }, [token, grupoId]);

  useEffect(() => {
    if (!socialGroups.length) return;
    if (!socialGroups.some((grupo) => grupo.id === grupoId)) {
      setGrupoId(socialGroups[0].id);
    }
  }, [socialGroups, grupoId]);

  useEffect(() => {
    if (
      activeCommentsPostId &&
      !posts.some((post) => post.id === activeCommentsPostId)
    ) {
      setActiveCommentsPostId("");
    }
  }, [posts, activeCommentsPostId]);

  async function handlePost(e: FormEvent) {
    e.preventDefault();
    if (!token || !grupoId) return;

    try {
      setPosting(true);
      setError("");
      setSuccess("");

      const formData = new FormData();
      formData.append("grupoId", grupoId);
      formData.append("texto", texto);
      formData.append("tipo", tipo);
      if (file) formData.append("file", file);

      const res = await fetch(apiUrl("/comunicacao/posts"), {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.message || "Erro ao publicar.");

      setTexto("");
      setFile(null);
      setTipo("POST");
      setSuccess("Publicacao enviada.");

      await fetchGrupos();
      if (data?.grupoId) {
        setGrupoId(data.grupoId);
        await fetchPosts(data.grupoId);
      } else {
        await fetchPosts(grupoId);
      }
    } catch (err) {
      setError(getErrorMessage(err, "Erro ao publicar."));
    } finally {
      setPosting(false);
    }
  }

  async function handleComentario(postId: string) {
    if (!token) return;
    const valor = String(comentarios[postId] || "").trim();
    if (!valor) return;

    const res = await fetch(apiUrl(`/comunicacao/posts/${postId}/comentarios`), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ texto: valor }),
    });
    const data = await res.json();

    if (!res.ok) {
      setError(data.message || "Erro ao comentar.");
      return;
    }

    setComentarios((prev) => ({ ...prev, [postId]: "" }));
    await fetchPosts(grupoId);
  }

  async function handleReacao(postId: string, tipo: "LIKE" | "DISLIKE") {
    if (!token) return;

    try {
      setError("");
      const res = await fetch(apiUrl(`/comunicacao/posts/${postId}/reacoes`), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ tipo }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Erro ao registrar reacao.");
      }

      setPosts((current) =>
        current.map((post) =>
          post.id === postId
            ? {
                ...post,
                reacoes: data.reacoes,
              }
            : post,
        ),
      );
    } catch (err) {
      setError(getErrorMessage(err, "Erro ao registrar reacao."));
    }
  }

  async function handleModerarPost(postId: string) {
    if (!token) return;

    try {
      setError("");
      const res = await fetch(apiUrl(`/comunicacao/posts/${postId}/moderar`), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Erro ao moderar publicacao.");
      }

      setSuccess(
        "Postagem excluida pelo moderador. O autor ficou 48 horas sem poder postar.",
      );
      await fetchPosts(grupoId);
      if (activeCommentsPostId === postId) {
        setActiveCommentsPostId("");
      }
    } catch (err) {
      setError(getErrorMessage(err, "Erro ao moderar publicacao."));
    }
  }

  async function handleLiberarAutor(authorId: string) {
    if (!token) return;

    try {
      setError("");
      const res = await fetch(
        apiUrl(`/comunicacao/autores/${authorId}/liberar-postagem`),
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Erro ao liberar autor.");
      }

      setSuccess("Autor liberado para voltar a postar.");
      await fetchGrupos();
      await fetchPosts(grupoId);
    } catch (err) {
      setError(getErrorMessage(err, "Erro ao liberar autor."));
    }
  }

  async function handleEditarPost(post: Post) {
    if (!token) return;
    const textoEditado = editingPostText.trim();
    if (!textoEditado && !post.mediaUrl) {
      setError("Escreva algo para manter a publicacao.");
      return;
    }

    try {
      setError("");
      const res = await fetch(apiUrl(`/comunicacao/posts/${post.id}`), {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ texto: textoEditado, tipo: post.tipo }),
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.message || "Erro ao editar publicacao.");

      setEditingPostId("");
      setEditingPostText("");
      setSuccess("Publicacao atualizada.");
      await fetchPosts(grupoId);
    } catch (err) {
      setError(getErrorMessage(err, "Erro ao editar publicacao."));
    }
  }

  async function handleExcluirPost(postId: string) {
    if (!token) return;
    if (!confirm("Deseja realmente excluir esta publicacao?")) return;

    try {
      setError("");
      const res = await fetch(apiUrl(`/comunicacao/posts/${postId}`), {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.message || "Erro ao excluir publicacao.");

      setSuccess("Publicacao excluida.");
      await fetchPosts(grupoId);
      await fetchGrupos();
    } catch (err) {
      setError(getErrorMessage(err, "Erro ao excluir publicacao."));
    }
  }

  function toggleCleanupGrupo(grupoIdSelecionado: string) {
    setCleanupGrupoIds((current) =>
      current.includes(grupoIdSelecionado)
        ? current.filter((id) => id !== grupoIdSelecionado)
        : [...current, grupoIdSelecionado],
    );
  }

  function toggleAllCleanupGroups() {
    setCleanupGrupoIds(
      allCleanupGroupsSelected ? [] : socialGroups.map((grupo) => grupo.id),
    );
  }

  async function handleLimparPosts(reset = false) {
    if (!token) return;
    const grupoIds = cleanupGrupoIds.length
      ? cleanupGrupoIds
      : grupoId
        ? [grupoId]
        : [];

    if (!grupoIds.length) {
      setError("Selecione pelo menos um grupo.");
      return;
    }

    const mensagemConfirmacao = reset
      ? "Resetar apaga imediatamente todas as publicacoes selecionadas. Deseja continuar?"
      : "Limpar remove apenas publicacoes com mais de 24 horas. Deseja continuar?";

    if (!confirm(mensagemConfirmacao)) return;

    try {
      setCleaningPosts(true);
      setError("");
      setSuccess("");

      const res = await fetch(apiUrl("/comunicacao/posts/limpeza"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ grupoIds, reset }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Erro ao limpar publicacoes.");
      }

      setSuccess(
        reset
          ? `${Number(data?.deleted || 0)} publicacao(oes) resetada(s).`
          : `${Number(data?.deleted || 0)} publicacao(oes) removida(s).`,
      );
      await fetchPosts(grupoId);
      await fetchGrupos();
    } catch (err) {
      setError(getErrorMessage(err, "Erro ao limpar publicacoes."));
    } finally {
      setCleaningPosts(false);
    }
  }

  async function abrirChatPrivado(targetUserId: string) {
    if (!token) return;

    const res = await fetch(apiUrl("/comunicacao/chat/privado"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ targetUserId }),
    });
    const data = await res.json();

    if (!res.ok) {
      setError(data.message || "Erro ao abrir chat privado.");
      return;
    }

    router.push(`/feed/chat?grupoId=${data.id}`);
  }

  function mencionarPessoa(pessoa: Pessoa) {
    setTexto((atual) => `${atual}${atual ? " " : ""}@${pessoa.name} `);
  }

  function escolherFundoComunicacao(backgroundId: string) {
    setCommunicationBackgroundId(backgroundId);

    try {
      localStorage.setItem(communicationBackgroundKey(user?.id), backgroundId);
    } catch {}
  }

  return (
    <section className={`min-h-screen px-4 pb-8 pt-4 md:px-6 xl:px-8 ${communicationTheme.pageClass}`}>
      <div className="mx-auto flex max-w-[1680px] flex-col gap-6">
        <div className="sticky top-0 z-20 rounded-[2rem] border border-white/60 bg-[rgba(255,252,247,0.82)] px-4 py-4 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl md:px-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">
                Rede social da escola
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <h1 className="font-[var(--font-display)] text-3xl font-bold tracking-[-0.04em] text-slate-950 md:text-4xl">
                  {grupoAtual ? getGroupLabel(grupoAtual) : "Comunidade escolar"}
                </h1>
                <span className="rounded-full bg-white/80 px-3 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">
                  {grupoAtual?.membros?.length || 0} integrantes
                </span>
              </div>
              <p className="mt-2 max-w-3xl text-sm text-slate-600">
                {grupoAtual?.nome === COLABORADORES_GROUP_NAME
                  ? "Espaco reservado aos professores para trocar ideias, avisos e conversar entre colaboradores."
                  : "Um feed mais amplo para avisos, fotos, videos e conversas da comunidade."}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => router.push("/dashboard")}
                className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Voltar ao dashboard
              </button>
              <select
                value={grupoId}
                onChange={(e) => setGrupoId(e.target.value)}
                className="min-w-[220px] rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 outline-none"
              >
                {socialGroups.map((grupo) => (
                  <option key={grupo.id} value={grupo.id}>
                    {getGroupLabel(grupo)}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => router.push("/feed/chat")}
                className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                <MessageCircle size={16} />
                Abrir chat
              </button>
            </div>
          </div>
        </div>

        {error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}
        {success ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {success}
          </div>
        ) : null}

        <div className="rounded-[2rem] border border-white/35 bg-transparent p-4 shadow-none md:p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className={`text-sm font-bold ${floatingPrimaryTextClass}`}>Integrantes em destaque</p>
              <p className={`text-xs ${floatingMutedTextClass}`}>
                Os avatares da turma ficam expostos como stories para acesso rapido.
              </p>
            </div>
            <span className={`hidden rounded-full border px-3 py-1 text-xs font-semibold md:inline-flex ${floatingBorderClass} ${floatingSecondaryTextClass}`}>
              Estilo comunidade
            </span>
          </div>

          <div className="mt-4 flex gap-3 overflow-x-auto pb-2">
            {(grupoAtual?.membros || []).map((membro) => (
              <div
                key={membro.user.id}
                className="flex min-w-[82px] shrink-0 flex-col items-center text-center"
              >
                <button
                  type="button"
                  onClick={() => abrirChatPrivado(membro.user.id)}
                  disabled={membro.user.id === user?.id}
                  className="group flex flex-col items-center disabled:cursor-default disabled:opacity-80"
                >
                  <Avatar pessoa={membro.user} size="md" />
                  <span className={`mt-2 line-clamp-2 text-[11px] font-semibold ${floatingSecondaryTextClass} ${isDarkCommunicationTheme ? "group-hover:text-white" : "group-hover:text-slate-950"}`}>
                    {membro.user.name}
                  </span>
                  <span className={`mt-0.5 text-[10px] uppercase tracking-[0.12em] ${floatingMutedTextClass}`}>
                    {formatRole(membro.user.role)}
                  </span>
                </button>
                {canModerateSocial && isSuspensoPorModeracao(membro.user) ? (
                  <button
                    type="button"
                    onClick={() => handleLiberarAutor(membro.user.id)}
                    className="mt-2 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-700"
                  >
                    Desbloquear
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[260px_minmax(0,1fr)_340px]">
          <aside className="space-y-5">
            <div className="rounded-[2rem] border border-white/35 bg-transparent p-4 shadow-none">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className={`text-sm font-bold ${floatingPrimaryTextClass}`}>Grupos</p>
                  <p className={`mt-1 text-xs leading-5 ${floatingMutedTextClass}`}>
                    Troque entre turmas e a comunidade exclusiva de colaboradores.
                  </p>
                </div>
                <Users size={18} className={isDarkCommunicationTheme ? "text-slate-300" : "text-slate-400"} />
              </div>

              <div className="mt-4 space-y-2">
                {socialGroups.map((grupo) => {
                  const isActive = grupo.id === grupoId;
                  return (
                    <button
                      key={grupo.id}
                      type="button"
                      onClick={() => setGrupoId(grupo.id)}
                      className={`flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left transition ${
                        isActive
                          ? `border bg-transparent ${isDarkCommunicationTheme ? "border-white text-white" : "border-slate-900 text-slate-950"}`
                          : `border bg-transparent ${floatingBorderClass} ${floatingSecondaryTextClass} ${isDarkCommunicationTheme ? "hover:border-white/70" : "hover:border-slate-300"}`
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">
                          {getGroupLabel(grupo)}
                        </p>
                        <p
                          className={`mt-1 text-xs ${
                            isActive
                              ? isDarkCommunicationTheme
                                ? "text-slate-200"
                                : "text-slate-700"
                              : floatingMutedTextClass
                          }`}
                        >
                          {grupo.membros.length} integrantes
                        </p>
                      </div>
                      <ChevronRight
                        size={16}
                        className={
                          isActive
                            ? isDarkCommunicationTheme
                              ? "text-slate-100"
                              : "text-slate-800"
                            : isDarkCommunicationTheme
                              ? "text-slate-300"
                              : "text-slate-400"
                        }
                      />
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="rounded-[2rem] border border-white/35 bg-transparent p-4 shadow-none">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className={`text-sm font-bold ${floatingPrimaryTextClass}`}>Limpeza</h3>
                  <p className={`mt-1 text-xs leading-5 ${floatingMutedTextClass}`}>
                    Posts saem sozinhos apos 4 dias. Aqui voce pode limpar ou resetar.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={toggleAllCleanupGroups}
                  className={`rounded-xl border bg-transparent px-3 py-1.5 text-[11px] font-bold ${floatingBorderClass} ${floatingSecondaryTextClass}`}
                >
                  {allCleanupGroupsSelected ? "Desmarcar" : "Todos"}
                </button>
              </div>

              <div className="mt-4 max-h-48 space-y-2 overflow-y-auto pr-1">
                {socialGroups.map((grupo) => (
                  <label
                    key={grupo.id}
                    className={`flex cursor-pointer items-center gap-3 rounded-xl border bg-transparent px-3 py-2 text-xs ${floatingBorderClass} ${floatingSecondaryTextClass}`}
                  >
                    <input
                      type="checkbox"
                      checked={cleanupGrupoIds.includes(grupo.id)}
                      onChange={() => toggleCleanupGrupo(grupo.id)}
                      className="h-4 w-4 rounded border-slate-300"
                    />
                    <span className="min-w-0 flex-1 truncate">{getGroupLabel(grupo)}</span>
                  </label>
                ))}
              </div>

              <div className="mt-4 grid gap-2">
                <button
                  type="button"
                  onClick={() => handleLimparPosts(false)}
                  disabled={cleaningPosts}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-xs font-bold text-white disabled:opacity-60"
                >
                  <Trash2 size={14} />
                  Limpar antigos
                </button>
                {canResetPosts ? (
                  <button
                    type="button"
                    onClick={() => handleLimparPosts(true)}
                    disabled={cleaningPosts}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl bg-red-600 px-4 py-3 text-xs font-bold text-white disabled:opacity-60"
                  >
                    <RotateCcw size={14} />
                    Resetar tudo
                  </button>
                ) : null}
              </div>
            </div>
          </aside>

          <main className="min-w-0 space-y-6">
            {!isResponsavel ? (
              <form
                onSubmit={handlePost}
                className="rounded-[2rem] border border-white/35 bg-transparent p-5 shadow-none backdrop-blur-0"
              >
                <div className="flex items-start gap-4">
                  <Avatar
                    pessoa={{
                      id: user?.id || "",
                      name: user?.name || "Usu?rio",
                      role: user?.role || "ALUNO",
                      fotoUrl: user?.fotoUrl,
                    }}
                    size="md"
                  />
                  <div className="flex-1">
                    <textarea
                      value={texto}
                      onChange={(e) => setTexto(e.target.value)}
                      placeholder="No que sua escola esta pensando hoje?"
                      className="min-h-28 w-full resize-none rounded-[1.5rem] border border-slate-200 bg-white px-4 py-4 text-sm text-slate-700 outline-none focus:border-slate-400"
                    />
                    {file ? (
                      <div className="mt-3 rounded-2xl bg-slate-100 px-4 py-3 text-xs text-slate-700">
                        Midia selecionada: <strong>{file.name}</strong>
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700">
                    <ImagePlus size={16} />
                    <span>{file ? "Trocar imagem/video" : "Imagem ou video"}</span>
                    <input
                      type="file"
                      accept="image/*,video/*"
                      onChange={(e) => setFile(e.target.files?.[0] || null)}
                      className="hidden"
                    />
                  </label>

                  <button
                    type="button"
                    onClick={() => setTipo(tipo === "AVISO" ? "POST" : "AVISO")}
                    disabled={user?.role === "ALUNO"}
                    className={`inline-flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-medium disabled:opacity-50 ${
                      tipo === "AVISO"
                        ? "bg-amber-100 text-amber-800"
                        : "border border-slate-200 bg-white text-slate-700"
                    }`}
                  >
                    <Megaphone size={16} />
                    Aviso
                  </button>

                  <button
                    type="submit"
                    disabled={posting || !grupoId}
                    className="ml-auto rounded-2xl bg-slate-950 px-6 py-3 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    {posting ? "Publicando..." : "Publicar"}
                  </button>
                </div>
              </form>
            ) : (
              <div className="rounded-[2rem] border border-white/35 bg-transparent p-5 shadow-none backdrop-blur-0">
                <p className={`text-sm font-bold ${floatingPrimaryTextClass}`}>Acompanhamento da rede social</p>
                <p className={`mt-2 text-sm leading-6 ${floatingSecondaryTextClass}`}>
                  Voce visualiza as publicacoes das turmas dos seus filhos e da escola em modo somente leitura.
                </p>
              </div>
            )}

            <div className="grid gap-6">
              {posts.length === 0 ? (
                <div className={`rounded-[2rem] border bg-transparent p-10 text-center text-sm shadow-none backdrop-blur-0 ${floatingBorderClass} ${floatingSecondaryTextClass}`}>
                  Nenhum post ainda. A primeira publicacao deixa a comunidade viva.
                </div>
              ) : (
                posts.map((post) => (
                  <article
                    key={post.id}
                    className={`overflow-hidden rounded-[2rem] border border-white/35 bg-transparent shadow-none backdrop-blur-0 ${
                      post.tipo === "AVISO" ? "ring-1 ring-amber-300/70" : ""
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4 px-5 pb-4 pt-5 md:px-6">
                      <div className="flex min-w-0 items-center gap-3">
                        <Avatar pessoa={post.author} size="md" />
                        <div className="min-w-0">
                          <p className={`truncate text-base font-bold ${floatingPrimaryTextClass}`}>
                            {post.author.name}
                          </p>
                          <div className={`mt-1 flex flex-wrap items-center gap-2 text-xs font-medium ${floatingSecondaryTextClass}`}>
                            <span>{formatRole(post.author.role)}</span>
                            <span>•</span>
                            <span>{formatDate(post.createdAt)}</span>
                            {post.tipo === "AVISO" ? (
                              <>
                                <span>•</span>
                                <span className="font-bold uppercase tracking-[0.14em] text-amber-700">
                                  Aviso
                                </span>
                              </>
                            ) : null}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center justify-end gap-2">
                        {canModerateSocial && !post.moderado ? (
                          <button
                            type="button"
                            onClick={() => handleModerarPost(post.id)}
                            className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-700"
                          >
                            <ShieldAlert size={14} />
                            Moderar 48h
                          </button>
                        ) : null}
                        {canModerateSocial && post.moderado ? (
                          <button
                            type="button"
                            onClick={() => handleLiberarAutor(post.author.id)}
                            className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700"
                          >
                            Liberar autor
                          </button>
                        ) : null}
                        {post.author.id === user?.id ? (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingPostId(post.id);
                                setEditingPostText(post.texto || "");
                              }}
                              className={`rounded-full bg-transparent px-3 py-1 text-xs font-bold ${floatingSecondaryTextClass} ring-1 ${isDarkCommunicationTheme ? "ring-white/50" : "ring-slate-300"}`}
                            >
                              Editar
                            </button>
                            <button
                              type="button"
                              onClick={() => handleExcluirPost(post.id)}
                              className="rounded-full bg-red-50 px-3 py-1 text-xs font-bold text-red-700"
                            >
                              Excluir
                            </button>
                          </>
                        ) : null}
                      </div>
                    </div>

                    {post.moderado ? (
                      <div className="px-5 pb-5 md:px-6">
                        <div className="rounded-[1.75rem] border border-rose-200 bg-rose-50/90 px-4 py-4">
                          <p className="text-sm font-bold text-rose-800">
                            postagem excluida pelo moderador
                          </p>
                          <p className="mt-1 text-sm leading-6 text-rose-700">
                            O autor ficou 48 horas sem poder postar, ate que um moderador libere novamente.
                          </p>
                        </div>
                      </div>
                    ) : post.texto ? (
                      <div className="px-5 pb-4 md:px-6">
                        {editingPostId === post.id ? (
                          <div className="space-y-3">
                            <textarea
                              value={editingPostText}
                              onChange={(event) => setEditingPostText(event.target.value)}
                              rows={4}
                              className={`w-full resize-none rounded-2xl border bg-transparent px-4 py-3 text-sm outline-none ${floatingBorderClass} ${floatingPrimaryTextClass}`}
                            />
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => handleEditarPost(post)}
                                className="rounded-2xl bg-slate-950 px-4 py-2 text-xs font-bold text-white"
                              >
                                Salvar
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingPostId("");
                                  setEditingPostText("");
                                }}
                                className="rounded-2xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-700"
                              >
                                Cancelar
                              </button>
                            </div>
                          </div>
                        ) : (
                          <p className={`whitespace-pre-wrap text-[15px] font-medium leading-7 ${floatingPrimaryTextClass}`}>
                            {post.texto}
                          </p>
                        )}
                      </div>
                    ) : null}

                    {!post.moderado && post.mediaUrl ? (
                      post.mediaMime?.startsWith("video/") ? (
                        <video
                          src={mediaSrc(post.mediaUrl)}
                          controls
                          className="max-h-[760px] w-full bg-black object-contain"
                        />
                      ) : (
                        <img
                          src={mediaSrc(post.mediaUrl)}
                          alt="Midia da publicacao"
                          className="max-h-[860px] w-full bg-transparent object-contain"
                        />
                      )
                    ) : null}

                    {!post.moderado ? (
                      <div className="px-5 py-5 md:px-6">
                        <div className="flex flex-wrap items-center gap-3">
                        <button
                          type="button"
                          onClick={() => handleReacao(post.id, "LIKE")}
                          className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-semibold transition ${
                            post.reacoes.minhaReacao === "LIKE"
                              ? "border-emerald-600 bg-emerald-50 text-emerald-700"
                              : `${floatingBorderClass} bg-transparent ${floatingSecondaryTextClass} ${isDarkCommunicationTheme ? "hover:border-emerald-300" : "hover:border-emerald-300"}`
                          }`}
                        >
                          <ThumbsUp size={16} />
                          <span>{post.reacoes.gostei}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleReacao(post.id, "DISLIKE")}
                          className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-semibold transition ${
                            post.reacoes.minhaReacao === "DISLIKE"
                              ? "border-rose-600 bg-rose-50 text-rose-700"
                              : `${floatingBorderClass} bg-transparent ${floatingSecondaryTextClass} ${isDarkCommunicationTheme ? "hover:border-rose-300" : "hover:border-rose-300"}`
                          }`}
                        >
                          <ThumbsDown size={16} />
                          <span>{post.reacoes.naoGostei}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setActiveCommentsPostId(post.id)}
                          className={`inline-flex items-center gap-2 rounded-full border bg-transparent px-3 py-2 text-sm font-semibold transition ${floatingBorderClass} ${floatingSecondaryTextClass} ${isDarkCommunicationTheme ? "hover:border-white/70" : "hover:border-slate-300"}`}
                        >
                          <MessageCircle size={16} />
                          <span>
                            {post.comentarios.length}{" "}
                            {post.comentarios.length === 1 ? "comentario" : "comentarios"}
                          </span>
                        </button>
                        </div>
                      </div>
                    ) : null}
                  </article>
                ))
              )}
            </div>
          </main>

          <aside className="space-y-5">
            <div className="rounded-[2rem] border border-white/35 bg-transparent p-4 shadow-none">
              <p className={`text-sm font-bold ${floatingPrimaryTextClass}`}>Aparencia</p>
              <p className={`mt-1 text-xs ${floatingMutedTextClass}`}>
                O tema escolhido vale para rede social e chat neste navegador.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {communicationBackgroundOptions.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => escolherFundoComunicacao(option.id)}
                    className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold ${
                      communicationBackgroundId === option.id
                        ? "border-slate-900 bg-slate-900 text-white"
                        : `${floatingBorderClass} bg-transparent ${floatingSecondaryTextClass}`
                    }`}
                  >
                    <span
                      className="h-4 w-4 rounded-full border border-slate-300"
                      style={{ backgroundColor: option.color }}
                    />
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-[2rem] border border-white/35 bg-transparent p-4 shadow-none">
              <div className={`flex items-center gap-2 text-sm font-semibold ${floatingPrimaryTextClass}`}>
                <Video size={16} />
                Integrantes da turma
              </div>
              <p className={`mt-1 text-xs leading-5 ${floatingMutedTextClass}`}>
                A lista agora mostra fotos dos integrantes, como uma rede social visual.
              </p>

              <div className="mt-4 grid grid-cols-2 gap-2">
                {(grupoAtual?.membros || []).map((membro) => (
                  <div
                    key={membro.user.id}
                    className="rounded-2xl border border-white/30 bg-transparent p-2.5 text-center"
                  >
                    <div className="flex justify-center">
                      <Avatar pessoa={membro.user} size="sm" />
                    </div>
                    <p className={`mt-2 line-clamp-2 text-[11px] font-semibold ${floatingPrimaryTextClass}`}>
                      {membro.user.name}
                    </p>
                    <p className={`mt-1 text-[10px] uppercase tracking-[0.14em] ${floatingMutedTextClass}`}>
                      {formatRole(membro.user.role)}
                    </p>
                    <div className="mt-3 grid gap-2">
                      {canModerateSocial && isSuspensoPorModeracao(membro.user) ? (
                        <button
                          type="button"
                          onClick={() => handleLiberarAutor(membro.user.id)}
                          className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] font-bold text-emerald-700"
                        >
                          Desbloquear
                        </button>
                      ) : null}
                      {!isResponsavel ? (
                        <button
                          type="button"
                          onClick={() => mencionarPessoa(membro.user)}
                          className="rounded-xl bg-slate-900 px-3 py-2 text-[11px] font-bold text-white"
                        >
                          Mencionar
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            
          </aside>
        </div>
      </div>

      {activeCommentsPost ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
          <div className="relative flex max-h-[92vh] w-full max-w-[1180px] overflow-hidden rounded-[2rem] border border-white/20 bg-[rgba(255,255,255,0.96)] shadow-[0_30px_90px_rgba(15,23,42,0.28)]">
            <button
              type="button"
              onClick={() => setActiveCommentsPostId("")}
              className="absolute right-4 top-4 z-20 inline-flex h-10 w-10 items-center justify-center rounded-full bg-black/55 text-white"
              aria-label="Fechar comentarios"
            >
              <X size={18} />
            </button>

            {!activeCommentsPost.moderado && activeCommentsPost.mediaUrl ? (
              <div className="hidden min-h-[620px] flex-1 bg-[#0f172a] lg:flex lg:items-center lg:justify-center">
                {activeCommentsPost.mediaMime?.startsWith("video/") ? (
                  <video
                    src={mediaSrc(activeCommentsPost.mediaUrl)}
                    controls
                    className="max-h-[92vh] w-full object-contain"
                  />
                ) : (
                  <img
                    src={mediaSrc(activeCommentsPost.mediaUrl)}
                    alt="Midia da publicacao"
                    className="max-h-[92vh] w-full object-contain"
                  />
                )}
              </div>
            ) : null}

            <div className="flex w-full max-w-[420px] flex-col bg-white">
              <div className="border-b border-slate-200 px-5 py-4">
                <div className="flex items-center gap-3">
                  <Avatar pessoa={activeCommentsPost.author} size="sm" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-950">
                      {activeCommentsPost.author.name}
                    </p>
                    <p className="text-xs text-slate-500">
                      {formatDate(activeCommentsPost.createdAt)}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
                {activeCommentsPost.moderado ? (
                  <div className="rounded-[1.5rem] border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-800">
                    <p className="font-bold">postagem excluida pelo moderador</p>
                    <p className="mt-1 leading-6">
                      O conteudo foi removido da comunidade e o autor ficou 48 horas sem poder postar.
                    </p>
                  </div>
                ) : (activeCommentsPost.texto || activeCommentsPost.mediaUrl) ? (
                  <div className="flex gap-3">
                    <Avatar pessoa={activeCommentsPost.author} size="sm" />
                    <div className="min-w-0 text-sm text-slate-700">
                      <span className="font-semibold text-slate-950">
                        {activeCommentsPost.author.name}
                      </span>{" "}
                      {activeCommentsPost.texto || "Publicacao com imagem ou video"}
                    </div>
                  </div>
                ) : null}

                {!activeCommentsPost.moderado && activeCommentsPost.comentarios.length === 0 ? (
                  <p className="text-sm text-slate-500">
                    Ainda nao ha comentarios nesta publicacao.
                  </p>
                ) : !activeCommentsPost.moderado ? (
                  activeCommentsPost.comentarios.map((comentario) => (
                    <div key={comentario.id} className="flex gap-3">
                      <Avatar pessoa={comentario.author} size="sm" />
                      <div className="min-w-0 text-sm text-slate-700">
                        <span className="font-semibold text-slate-950">
                          {comentario.author.name}
                        </span>{" "}
                        {comentario.texto}
                        <p className="mt-1 text-[11px] text-slate-400">
                          {formatDate(comentario.createdAt)}
                        </p>
                      </div>
                    </div>
                  ))
                ) : null
                }
              </div>

              <div className="border-t border-slate-200 px-5 py-4">
                {!activeCommentsPost.moderado ? (
                  <>
                    <div className="mb-3 flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => handleReacao(activeCommentsPost.id, "LIKE")}
                        className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-semibold ${
                          activeCommentsPost.reacoes.minhaReacao === "LIKE"
                            ? "border-emerald-600 bg-emerald-50 text-emerald-700"
                            : "border-slate-200 text-slate-700"
                        }`}
                      >
                        <ThumbsUp size={16} />
                        {activeCommentsPost.reacoes.gostei}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleReacao(activeCommentsPost.id, "DISLIKE")}
                        className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-semibold ${
                          activeCommentsPost.reacoes.minhaReacao === "DISLIKE"
                            ? "border-rose-600 bg-rose-50 text-rose-700"
                            : "border-slate-200 text-slate-700"
                        }`}
                      >
                        <ThumbsDown size={16} />
                        {activeCommentsPost.reacoes.naoGostei}
                      </button>
                    </div>

                    <div className="flex gap-2">
                      <input
                        value={comentarios[activeCommentsPost.id] || ""}
                        onChange={(e) =>
                          setComentarios((prev) => ({
                            ...prev,
                            [activeCommentsPost.id]: e.target.value,
                          }))
                        }
                        placeholder="Adicione um comentario..."
                        className="flex-1 rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => handleComentario(activeCommentsPost.id)}
                        className="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white"
                      >
                        Comentar
                      </button>
                    </div>
                  </>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
