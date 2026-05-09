"use client";

import {
  FormEvent,
  KeyboardEvent,
  MouseEvent as ReactMouseEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Bell, Menu, RotateCcw, Search } from "lucide-react";
import { useAuth, UserRole } from "@/context/auth-context";
import { apiUrl } from "@/lib/api";
import { usePathname, useRouter } from "next/navigation";
import { formatTurno } from "@/lib/turno";

type HeaderSchool = {
  id: string;
  name: string;
  logoUrl?: string | null;
};

type SearchItem = {
  label: string;
  href: string;
  description: string;
  roles: UserRole[];
  keywords: string[];
};

type SearchResult = {
  key: string;
  label: string;
  href: string;
  description: string;
  score: number;
  type: "menu" | "aluno";
};

type AlunoSearchItem = {
  id: string;
  name: string;
  matricula?: string | null;
  turma?: {
    name?: string | null;
    turno?: string | null;
  } | null;
};

type NotificationItem = {
  id: string;
  label: string;
  description: string;
  href: string;
  count: number;
};

type ChatMensagemResumo = {
  texto?: string | null;
  author?: {
    id?: string | null;
    name?: string | null;
  } | null;
};

type FinanceiroResumoResponsavel = {
  enabled: boolean;
  totalAbertos: number;
  cobrancasAbertasIds: string[];
};

type FinanceiroAcessoResponse = {
  visible: boolean;
  enabled: boolean;
  gestorAccessEnabled: boolean;
  secretariaAccessEnabled: boolean;
};

function getFinanceiroGestaoDisponivel(
  access: FinanceiroAcessoResponse,
  userRole?: UserRole,
) {
  if (userRole === "GESTOR") {
    return Boolean(access.gestorAccessEnabled);
  }

  if (userRole === "SECRETARIA") {
    return Boolean(access.secretariaAccessEnabled);
  }

  return Boolean(access.enabled);
}

type SolicitacaoResumo = {
  id: string;
  status: string;
  respondedAt?: string | null;
  receivedAt?: string | null;
};

type ChatGrupoResumo = {
  id: string;
  nome?: string | null;
  turma?: {
    name?: string | null;
  } | null;
  ultimaMensagem?: ChatMensagemResumo | null;
  totalMensagens?: number | string | null;
  _count?: {
    mensagens?: number | string | null;
  };
};

const searchItems: SearchItem[] = [
  {
    label: "Dashboard",
    href: "/dashboard",
    description: "Visão geral do painel.",
    roles: ["ADMIN_ESCOLA", "GESTOR", "SECRETARIA", "PROFESSOR", "RESPONSAVEL", "ALUNO"],
    keywords: ["inicio", "painel", "resumo", "principal"],
  },
  {
    label: "Escolas",
    href: "/escolas",
    description: "Dados e configuração da escola.",
    roles: ["SUPERUSUARIO", "ADMIN_ESCOLA", "GESTOR", "SECRETARIA"],
    keywords: ["escola", "instituio", "logo", "dados"],
  },
  {
    label: "Usuários",
    href: "/usuarios",
    description: "Cadastro e gestão de usuários.",
    roles: ["SUPERUSUARIO", "ADMIN_ESCOLA", "GESTOR", "SECRETARIA"],
    keywords: ["usuario", "responsavel", "professor", "gestor", "secretaria", "acesso"],
  },
  {
    label: "Turmas",
    href: "/turmas",
    description: "Séries, turmas, alunos e professores vinculados.",
    roles: ["ADMIN_ESCOLA", "GESTOR", "SECRETARIA", "PROFESSOR"],
    keywords: ["turma", "serie", "classe", "professores", "alunos"],
  },
  {
    label: "Disciplinas",
    href: "/disciplinas",
    description: "Cadastro de disciplinas e quantidade de aulas por turma.",
    roles: ["ADMIN_ESCOLA", "GESTOR", "SECRETARIA"],
    keywords: ["disciplina", "materia", "carga horaria", "serie", "turma"],
  },
  {
    label: "Modulação de Professores",
    href: "/cadastro-turma",
    description: "Vincular professores, disciplinas e carga horária.",
    roles: ["ADMIN_ESCOLA", "GESTOR", "SECRETARIA"],
    keywords: ["modulacao", "disciplina", "professor", "carga horaria"],
  },
  {
    label: "Modulação Individual",
    href: "/modulacao-individual",
    description: "Resumo individual de cada professor com suas aulas moduladas.",
    roles: ["ADMIN_ESCOLA", "GESTOR", "SECRETARIA"],
    keywords: ["modulacao individual", "professor", "aulas moduladas", "turmas", "disciplinas"],
  },
  {
    label: "Alunos",
    href: "/alunos",
    description: "Cadastro, documentos e responsáveis dos alunos.",
    roles: ["ADMIN_ESCOLA", "GESTOR", "SECRETARIA", "PROFESSOR"],
    keywords: ["aluno", "matricula", "documento", "responsavel"],
  },
  {
    label: "Horários",
    href: "/horarios",
    description: "Grade de horários e aulas.",
    roles: ["ADMIN_ESCOLA", "GESTOR", "SECRETARIA", "PROFESSOR", "RESPONSAVEL", "ALUNO"],
    keywords: ["horario", "aula", "grade", "turno"],
  },
  {
    label: "Frequência",
    href: "/frequencia",
    description: "Presenças, faltas e justificativas.",
    roles: ["ADMIN_ESCOLA", "GESTOR", "SECRETARIA", "PROFESSOR", "RESPONSAVEL", "ALUNO"],
    keywords: ["frequencia", "presena", "falta", "chamada"],
  },
  {
    label: "Avaliações",
    href: "/avaliacoes",
    description: "Provas e atividades avaliativas.",
    roles: ["GESTOR", "SECRETARIA", "PROFESSOR", "RESPONSAVEL", "ALUNO"],
    keywords: ["avaliacao", "prova", "atividade", "questoes"],
  },
  {
    label: "Notas",
    href: "/notas",
    description: "Notas do aluno.",
    roles: ["PROFESSOR", "ALUNO"],
    keywords: ["nota", "media", "avaliacao"],
  },
  {
    label: "Boletim",
    href: "/boletim",
    description: "Boletins e resultados.",
    roles: ["ADMIN_ESCOLA", "GESTOR", "SECRETARIA", "RESPONSAVEL", "ALUNO"],
    keywords: ["boletim", "resultado", "media", "nota"],
  },
  {
    label: "Notas Professor",
    href: "/notas-professor",
    description: "Lançamento de notas pelo professor.",
    roles: ["PROFESSOR"],
    keywords: ["lancar notas", "professor", "nota"],
  },
  {
    label: "Notas Gestão",
    href: "/notas-gestao",
    description: "Acompanhamento de notas pela gestão.",
    roles: ["ADMIN_ESCOLA", "GESTOR", "SECRETARIA"],
    keywords: ["notas gestao", "boletim", "media"],
  },
  {
    label: "Notas do aluno",
    href: "/notas-responsavel",
    description: "Notas dos filhos.",
    roles: ["RESPONSAVEL"],
    keywords: ["notas filhos", "responsavel", "boletim"],
  },
  {
    label: "Planejamento",
    href: "/conteudo-do-dia",
    description: "Conteúdo do dia e planejamento.",
    roles: ["ADMIN_ESCOLA", "GESTOR", "SECRETARIA", "PROFESSOR", "RESPONSAVEL", "ALUNO"],
    keywords: ["planejamento", "conteudo", "aula", "agenda"],
  },
  {
    label: "Comunicação",
    href: "/feed",
    description: "Rede social, chat e avisos.",
    roles: ["ADMIN_ESCOLA", "GESTOR", "SECRETARIA", "PROFESSOR", "RESPONSAVEL", "ALUNO"],
    keywords: ["comunicacao", "chat", "feed", "rede social", "mensagem", "aviso"],
  },
  {
    label: "Solicitações",
    href: "/solicitacoes",
    description: "Pedidos de documentos e retornos da secretaria.",
    roles: ["ADMIN_ESCOLA", "GESTOR", "SECRETARIA", "PROFESSOR", "RESPONSAVEL"],
    keywords: ["solicitacao", "declaracao", "transferencia", "historico", "documento"],
  },
  {
    label: "Financeiro",
    href: "/financeiro",
    description: "Débitos, pagamentos e cobranças.",
    roles: ["ADMIN_ESCOLA", "GESTOR", "SECRETARIA", "FINANCEIRO", "RESPONSAVEL"],
    keywords: ["financeiro", "pagamento", "pix", "mensalidade", "debito", "cobranca", "boleto", "guia"],
  },
  {
    label: "Assinatura",
    href: "/assinatura",
    description: "Boletos e cobranças da assinatura da plataforma.",
    roles: ["ADMIN_ESCOLA"],
    keywords: ["assinatura", "plano", "plataforma", "boleto", "cobranca", "mensalidade"],
  },
  {
    label: "Fórum",
    href: "/forum",
    description: "Fórum, atividades e enquetes.",
    roles: ["ADMIN_ESCOLA", "GESTOR", "PROFESSOR", "RESPONSAVEL", "ALUNO"],
    keywords: ["forum", "atividade", "enquete", "topico"],
  },
  {
    label: "Calendário",
    href: "/calendario",
    description: "Agenda anual, feriados e eventos.",
    roles: ["ADMIN_ESCOLA", "GESTOR", "SECRETARIA", "PROFESSOR", "RESPONSAVEL", "ALUNO"],
    keywords: ["calendario", "agenda", "evento", "feriado"],
  },
  {
    label: "Configuração",
    href: "/configuracao",
    description: "Senha, acesso e aparência.",
    roles: ["SUPERUSUARIO", "ADMIN_ESCOLA", "GESTOR", "SECRETARIA", "PROFESSOR", "RESPONSAVEL", "ALUNO"],
    keywords: ["configuracao", "senha", "acesso", "tema", "cores"],
  },
  {
    label: "Painel Superusuário",
    href: "/superusuario",
    description: "Gestão global das escolas.",
    roles: ["SUPERUSUARIO"],
    keywords: ["superusuario", "assinatura", "metricas", "escolas"],
  },
];

function financeiroSeenKey(userId?: string) {
  return `gestclass_financeiro_seen_debitos_${userId || "anon"}`;
}

function solicitacoesSeenKey(userId?: string) {
  return `gestclass_solicitacoes_seen_${userId || "anon"}`;
}

function chatUnreadGroupsKey(userId?: string) {
  return `gestclass_chat_unread_groups_${userId || "anon"}`;
}

function readJsonArray(key: string) {
  if (typeof window === "undefined") return new Set<string>();

  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "[]");
    return new Set<string>(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set<string>();
  }
}

function writeJsonArray(key: string, ids: string[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(key, JSON.stringify(ids));
}

function readJsonRecord(key: string) {
  if (typeof window === "undefined") return {} as Record<string, number>;

  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsed).map(([id, value]) => [id, Number(value || 0)]),
    );
  } catch {
    return {};
  }
}

function resumirTextoChat(texto?: string | null) {
  const textoLimpo = String(texto || "").replace(/\s+/g, " ").trim();

  if (!textoLimpo) return "Nova mensagem recebida.";
  if (textoLimpo.length <= 72) return textoLimpo;

  return `${textoLimpo.slice(0, 69)}...`;
}

function canSearchAlunos(role?: UserRole) {
  return (
    role === "ADMIN_ESCOLA" ||
    role === "GESTOR" ||
    role === "SECRETARIA" ||
    role === "PROFESSOR"
  );
}

type HeaderProps = {
  onMenuToggle?: () => void;
};

export default function Header({ onMenuToggle }: HeaderProps) {
  const { user, token, selectedSchool, exitSchoolMaintenance } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchRef = useRef<HTMLFormElement | null>(null);
  const [school, setSchool] = useState<HeaderSchool | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [communicationCount, setCommunicationCount] = useState(0);
  const [chatNotifications, setChatNotifications] = useState<NotificationItem[]>([]);
  const [financeiroCount, setFinanceiroCount] = useState(0);
  const [solicitacoesCount, setSolicitaesCount] = useState(0);
  const [solicitacaoIds, setSolicitacaoIds] = useState<string[]>([]);
  const [financeiroIds, setFinanceiroIds] = useState<string[]>([]);
  const [alunosSearch, setAlunosSearch] = useState<AlunoSearchItem[]>([]);
  const [financeiroGestaoDisponivel, setFinanceiroGestaoDisponivel] =
    useState(true);
  const userId = user?.id;
  const userRole = user?.role;
  const userPlan = user?.plan;

  const visibleSchool = user?.isSuperuserMaintenance
    ? {
        id: selectedSchool?.id || user.schoolId || "",
        name:
          selectedSchool?.name ||
          user.maintenanceSchoolName ||
          "Escola em manutenção",
      }
    : user?.role === "SUPERUSUARIO"
      ? null
      : school;

  function getNome() {
    if (!user) return "usuário";
    return user.name.split(" ")[0];
  }

  function getPerfil() {
    if (!user) return "";

    const map: Record<string, string> = {
      SUPERUSUARIO: "Superusuário",
      ADMIN_ESCOLA: "Administrador",
      FINANCEIRO: "Financeiro",
      GESTOR: "Gestor",
      COORDENADOR: "Coordenador",
      SECRETARIA: "Secretaria",
      AUXILIAR: "Auxiliar",
      PROFESSOR: "Professor",
      RESPONSAVEL: "Responsável",
      ALUNO: "Aluno",
    };

    return map[user.role] || user.role;
  }

  const accessibleSearchItems = useMemo(() => {
    if (!user) return [];

    return searchItems
      .filter((item) => {
        if (!item.roles.includes(user.role)) return false;

        if (
          item.href === "/financeiro" &&
          user.role === "RESPONSAVEL" &&
          user.plan &&
          user.plan !== "PRO" &&
          user.plan !== "PREMIUM"
        ) {
          return false;
        }

        if (
          item.href === "/financeiro" &&
          (user.role === "GESTOR" || user.role === "SECRETARIA") &&
          !financeiroGestaoDisponivel
        ) {
          return false;
        }

        return true;
      })
      .map((item) => {
        if (
          item.href === "/conteudo-do-dia" &&
          (user.role === "RESPONSAVEL" || user.role === "ALUNO")
        ) {
          return {
            ...item,
            label: "Conteúdo do dia",
            description: "Conteúdos planejados para o dia.",
          };
        }

        return item;
      });
  }, [financeiroGestaoDisponivel, user]);

  const searchResults = useMemo<SearchResult[]>(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) {
      return accessibleSearchItems.slice(0, 6).map((item) => ({
        key: `menu:${item.href}`,
        label: item.label,
        href: item.href,
        description: item.description,
        score: 10,
        type: "menu",
      }));
    }

    const menuResults = accessibleSearchItems
      .map((item) => {
        const haystack = [item.label, item.description, ...item.keywords]
          .join(" ")
          .toLowerCase();
        const label = item.label.toLowerCase();
        const score =
          label === term ? 0 : label.includes(term) ? 1 : haystack.includes(term) ? 2 : 99;

        return {
          key: `menu:${item.href}`,
          label: item.label,
          href: item.href,
          description: item.description,
          score,
          type: "menu" as const,
        };
      })
      .filter((item) => item.score < 99);

    const alunoResults = alunosSearch
      .map((aluno) => {
        const turmaLabel = aluno.turma?.name
          ? `${aluno.turma.name}${aluno.turma.turno ? ` - ${formatTurno(aluno.turma.turno)}` : ""}`
          : "Aluno";
        const haystack = [
          aluno.name,
          aluno.matricula || "",
          turmaLabel,
          "aluno",
          "aluna",
          "estudante",
          "matricula",
        ]
          .join(" ")
          .toLowerCase();
        const nome = String(aluno.name || "").toLowerCase();
        const score =
          nome === term ? 0 : nome.includes(term) ? 0.5 : haystack.includes(term) ? 1.5 : 99;

        return {
          key: `aluno:${aluno.id}`,
          label: aluno.name,
          href: `/alunos?busca=${encodeURIComponent(aluno.name)}`,
          description: `${turmaLabel}${aluno.matricula ? ` - Matrícula ${aluno.matricula}` : ""}`,
          score,
          type: "aluno" as const,
        };
      })
      .filter((item) => item.score < 99);

    return [...alunoResults, ...menuResults]
      .sort((a, b) => a.score - b.score || a.label.localeCompare(b.label))
      .slice(0, 8);
  }, [accessibleSearchItems, alunosSearch, searchTerm]);

  const notificationItems = useMemo<NotificationItem[]>(() => {
    const items: NotificationItem[] = [];

    items.push(...chatNotifications);

    if (financeiroCount > 0) {
      items.push({
        id: "financeiro",
        label: "Financeiro",
        description: `${financeiroCount} novo(s) débito(s) em aberto.`,
        href: "/financeiro",
        count: financeiroCount,
      });
    }

    if (solicitacoesCount > 0) {
      items.push({
        id: "solicitacoes",
        label: "Solicitações",
        description:
          user?.role === "SECRETARIA" ||
          user?.role === "GESTOR" ||
          user?.role === "SUPERUSUARIO"
            ? `${solicitacoesCount} solicitação(ões) pendente(s).`
            : `${solicitacoesCount} solicitação(ões) com atualização.`,
        href: "/solicitacoes",
        count: solicitacoesCount,
      });
    }

    return items;
  }, [chatNotifications, financeiroCount, solicitacoesCount, user?.role]);

  const totalNotifications = notificationItems.reduce(
    (total, item) => total + item.count,
    0,
  );

  function goToSearchItem(item: SearchResult) {
    setSearchTerm("");
    setSearchOpen(false);
    router.push(item.href);
  }

  function handleSearch(event: FormEvent) {
    event.preventDefault();
    const firstResult = searchResults[0];
    if (firstResult) {
      goToSearchItem(firstResult);
    }
  }

  function closeSearch(clearTerm = false) {
    setSearchOpen(false);
    if (clearTerm) setSearchTerm("");
  }

  function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeSearch();
      event.currentTarget.blur();
      return;
    }

    if (event.key === "Delete" && !searchTerm) {
      event.preventDefault();
      closeSearch();
      event.currentTarget.blur();
      return;
    }

    if (event.key === "Delete" && searchTerm) {
      event.preventDefault();
      closeSearch(true);
    }
  }

  function handleSearchContainerMouseDown(
    event: ReactMouseEvent<HTMLFormElement>,
  ) {
    if (event.target === event.currentTarget) {
      closeSearch();
    }
  }

  function openNotification(item: NotificationItem) {
    if (item.id.startsWith("chat")) {
      const currentTotal = Number(
        localStorage.getItem("gestclass_comunicacao_seen_current") || 0,
      );
      if (currentTotal) {
        localStorage.setItem("gestclass_comunicacao_seen", String(currentTotal));
      }
      setCommunicationCount(0);
      setChatNotifications([]);
    }

    if (item.id === "financeiro") {
      writeJsonArray(financeiroSeenKey(user?.id), financeiroIds);
      setFinanceiroCount(0);
    }

    if (item.id === "solicitacoes") {
      writeJsonArray(solicitacoesSeenKey(user?.id), solicitacaoIds);
      setSolicitaesCount(0);
    }

    setNotificationsOpen(false);
    router.push(item.href);
  }

  useEffect(() => {
    let ignore = false;

    async function fetchFinanceiroAcesso() {
      if (
        !token ||
        (userRole !== "GESTOR" && userRole !== "SECRETARIA")
      ) {
        if (!ignore) setFinanceiroGestaoDisponivel(true);
        return;
      }

      try {
        const response = await fetch(apiUrl("/financeiro/acesso"), {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        const data = (await response.json()) as FinanceiroAcessoResponse;

        if (!response.ok || ignore) return;

        setFinanceiroGestaoDisponivel(
          getFinanceiroGestaoDisponivel(data, userRole),
        );
      } catch {
        if (!ignore) setFinanceiroGestaoDisponivel(true);
      }
    }

    fetchFinanceiroAcesso();

    return () => {
      ignore = true;
    };
  }, [token, userRole]);

  useEffect(() => {
    let ignore = false;

    async function fetchSchoolForHeader() {
      if (
        !token ||
        !user ||
        user.role === "SUPERUSUARIO" ||
        user.isSuperuserMaintenance
      ) {
        return;
      }

      try {
        const response = await fetch(apiUrl("/schools"), {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        const data = await response.json();

        if (!response.ok || ignore) {
          return;
        }

        const schoolData = Array.isArray(data) ? data[0] : data;
        setSchool(schoolData || null);
      } catch {
        if (!ignore) {
          setSchool(null);
        }
      }
    }

    fetchSchoolForHeader();

    return () => {
      ignore = true;
    };
  }, [token, user]);

  useEffect(() => {
    let ignore = false;

    async function fetchAlunosSearch() {
      if (!token || !canSearchAlunos(userRole)) {
        await Promise.resolve();
        if (!ignore) setAlunosSearch([]);
        return;
      }

      try {
        const response = await fetch(apiUrl("/alunos"), {
          headers: {
            Authorization: `Bearer ${token}`,
            ...(selectedSchool?.id ? { "x-school-id": selectedSchool.id } : {}),
          },
        });
        const data = await response.json();

        if (!response.ok || ignore) {
          return;
        }

        setAlunosSearch(Array.isArray(data) ? data : []);
      } catch {
        if (!ignore) {
          setAlunosSearch([]);
        }
      }
    }

    fetchAlunosSearch();

    return () => {
      ignore = true;
    };
  }, [token, userRole, selectedSchool?.id]);

  useEffect(() => {
    let ignore = false;

    async function fetchNotifications() {
      if (!token || !userRole) {
        await Promise.resolve();
        if (!ignore) {
          setCommunicationCount(0);
          setChatNotifications([]);
          setFinanceiroCount(0);
          setFinanceiroIds([]);
          setSolicitaesCount(0);
          setSolicitacaoIds([]);
        }
        return;
      }

      try {
        if (
          searchItems.some(
            (item) =>
              item.href === "/feed" &&
              item.roles.includes(userRole),
          )
        ) {
          const response = await fetch(apiUrl("/comunicacao/grupos"), {
            headers: { Authorization: `Bearer ${token}` },
          });
          const data = await response.json();

          if (response.ok && !ignore) {
            const grupos: ChatGrupoResumo[] = Array.isArray(data) ? data : [];
            const vistosPorGrupo = readJsonRecord(chatUnreadGroupsKey(userId));
            const notificacoesChat = grupos
              .map((grupo) => {
                const totalMensagens = Number(
                  grupo.totalMensagens || grupo._count?.mensagens || 0,
                );
                const vistas = Number(vistosPorGrupo[grupo.id] || 0);
                const naoLidas = Math.max(totalMensagens - vistas, 0);
                const autor = grupo.ultimaMensagem?.author?.name || "Nova mensagem";
                const conversa = grupo.turma?.name || grupo.nome || "Chat";

                return {
                  id: `chat:${grupo.id}`,
                  label: autor,
                  description: `${conversa}: ${resumirTextoChat(grupo.ultimaMensagem?.texto)}`,
                  href: `/feed/chat?grupoId=${grupo.id}`,
                  count: naoLidas,
                };
              })
              .filter((item) => item.count > 0);
            const totalNaoLidas = notificacoesChat.reduce(
              (total, item) => total + item.count,
              0,
            );

            setChatNotifications(pathname.startsWith("/feed") ? [] : notificacoesChat);

            setCommunicationCount(
              pathname.startsWith("/feed") ? 0 : totalNaoLidas,
            );
          }
        } else {
          setCommunicationCount(0);
          setChatNotifications([]);
        }

        if (
          userRole === "RESPONSAVEL" &&
          (!userPlan || userPlan === "PRO" || userPlan === "PREMIUM")
        ) {
          const response = await fetch(apiUrl("/financeiro/resumo-responsavel"), {
            headers: { Authorization: `Bearer ${token}` },
          });
          const data = (await response.json()) as FinanceiroResumoResponsavel;

          if (response.ok && !ignore && data.enabled) {
            const ids = Array.isArray(data.cobrancasAbertasIds)
              ? data.cobrancasAbertasIds
              : [];
            setFinanceiroIds(ids);

            if (pathname.startsWith("/financeiro")) {
              writeJsonArray(financeiroSeenKey(userId), ids);
              setFinanceiroCount(0);
            } else {
              const seen = readJsonArray(financeiroSeenKey(userId));
              setFinanceiroCount(ids.filter((id) => !seen.has(id)).length);
            }
          }
        } else {
          setFinanceiroCount(0);
          setFinanceiroIds([]);
        }

        if (
          ["SUPERUSUARIO", "ADMIN_ESCOLA", "GESTOR", "SECRETARIA", "PROFESSOR", "RESPONSAVEL"].includes(
            userRole,
          )
        ) {
          const response = await fetch(apiUrl("/solicitacoes"), {
            headers: { Authorization: `Bearer ${token}` },
          });
          const data = await response.json();

          if (response.ok && !ignore) {
            const lista: SolicitacaoResumo[] = Array.isArray(data) ? data : [];
            const ids =
              userRole === "SECRETARIA" || userRole === "SUPERUSUARIO"
                ? lista
                    .filter((item) => item.status !== "RESPONDIDA")
                    .map((item) => item.id)
                : lista
                    .filter((item) => item.status !== "ENVIADA")
                    .map(
                      (item) =>
                        `${item.id}:${item.status}:${item.respondedAt || item.receivedAt || ""}`,
                    );

            setSolicitacaoIds(ids);

            if (pathname.startsWith("/solicitacoes")) {
              writeJsonArray(solicitacoesSeenKey(userId), ids);
              setSolicitaesCount(0);
            } else {
              const seen = readJsonArray(solicitacoesSeenKey(userId));
              setSolicitaesCount(ids.filter((id: string) => !seen.has(id)).length);
            }
          }
        } else {
          setSolicitaesCount(0);
          setSolicitacaoIds([]);
        }
      } catch {
        if (!ignore) {
          setCommunicationCount(0);
          setChatNotifications([]);
          setFinanceiroCount(0);
          setSolicitaesCount(0);
        }
      }
    }

    fetchNotifications();
    if (!token || !userRole) {
      return () => {
        ignore = true;
      };
    }

    const interval = window.setInterval(fetchNotifications, 30000);

    return () => {
      ignore = true;
      window.clearInterval(interval);
    };
  }, [token, userId, userRole, userPlan, pathname]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (
        searchOpen &&
        searchRef.current &&
        !searchRef.current.contains(event.target as Node)
      ) {
        closeSearch();
      }
    }

    document.addEventListener("mousedown", handlePointerDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [searchOpen]);

  return (
    <header className="glass-panel relative z-[120] flex flex-col gap-4 overflow-visible rounded-[1.75rem] border border-white/40 px-4 py-4 shadow-[0_18px_44px_rgba(74,93,110,0.08)] md:flex-row md:items-center md:justify-between md:px-5">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onMenuToggle}
          className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/45 bg-white/78 shadow-[0_12px_26px_rgba(85,103,120,0.08)] lg:hidden"
          title="Abrir menu"
        >
          <Menu size={18} />
        </button>

        {user?.role !== "SUPERUSUARIO" ? (
          <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl border border-white/50 bg-white/80 shadow-[0_10px_24px_rgba(92,109,126,0.12)]">
            {visibleSchool?.logoUrl ? (
              <img
                src={apiUrl(visibleSchool.logoUrl)}
                alt="Logo da escola"
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="text-xs font-semibold text-slate-400">Logo</span>
            )}
          </div>
        ) : null}

        <div>
          <h2 className="page-title text-3xl font-bold leading-none">
            Olá, {getNome()} 👋
          </h2>

          <p className="page-subtitle mt-2 text-sm">Perfil: {getPerfil()}</p>

          {user?.isSuperuserMaintenance ? (
            <p className="mt-1 text-sm font-semibold text-[color:var(--primary)]">
              Modo manutenção: {visibleSchool?.name}
            </p>
          ) : user?.role === "SUPERUSUARIO" && selectedSchool ? (
            <p className="mt-1 text-sm text-[color:var(--primary)]">
              Escola selecionada: {selectedSchool.name}
            </p>
          ) : null}
        </div>
      </div>

      <div className="flex items-center gap-3">
        {user?.isSuperuserMaintenance ? (
          <button
            type="button"
            onClick={() => {
              exitSchoolMaintenance();
              router.push("/superusuario");
            }}
            className="inline-flex items-center gap-2 rounded-2xl border border-white/40 bg-white/75 px-4 py-2.5 text-sm font-semibold text-[color:var(--primary)] shadow-sm transition hover:bg-white"
          >
            <RotateCcw size={16} />
            Voltar ao superusuário
          </button>
        ) : null}

        <form
          ref={searchRef}
          onSubmit={handleSearch}
          onMouseDown={handleSearchContainerMouseDown}
          className="relative hidden md:block"
        >
          <div className="flex items-center gap-2 rounded-2xl border border-white/45 bg-white/78 px-3.5 py-2.5 shadow-[0_12px_26px_rgba(85,103,120,0.08)] backdrop-blur-sm">
            <Search size={16} className="text-[color:var(--primary)]" />
            <input
              value={searchTerm}
              onChange={(event) => {
                setSearchTerm(event.target.value);
                setSearchOpen(true);
              }}
              onFocus={() => setSearchOpen(true)}
              onKeyDown={handleSearchKeyDown}
              placeholder="Buscar no seu acesso..."
              className="w-64 bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
            />
          </div>

          {searchOpen ? (
            <div className="absolute right-0 top-14 z-[130] w-96 overflow-hidden rounded-[1.5rem] border border-white/45 bg-[rgba(255,252,247,0.94)] shadow-[0_22px_50px_rgba(62,78,92,0.14)] backdrop-blur-xl">
              <div className="border-b border-white/55 px-4 py-3">
                <p className="text-xs font-bold uppercase text-slate-400">
                  Resultados
                </p>
              </div>
              <div className="max-h-80 overflow-y-auto p-2">
                {searchResults.length ? (
                  searchResults.map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => goToSearchItem(item)}
                      className="w-full rounded-xl px-3 py-2 text-left transition hover:bg-white/80"
                    >
                      <span className="flex items-center justify-between gap-3">
                        <span className="text-sm font-bold text-slate-900">
                          {item.label}
                        </span>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-500">
                          {item.type === "aluno" ? "Aluno" : "Menu"}
                        </span>
                      </span>
                      <span className="mt-0.5 block text-xs text-slate-500">
                        {item.description}
                      </span>
                    </button>
                  ))
                ) : (
                  <p className="px-3 py-4 text-sm text-slate-500">
                    Nenhum recurso encontrado para este acesso.
                  </p>
                )}
              </div>
            </div>
          ) : null}
        </form>

        <div className="relative">
          <button
            type="button"
            onClick={() => setNotificationsOpen((current) => !current)}
            className="relative flex h-12 w-12 items-center justify-center rounded-2xl border border-white/45 bg-white/78 shadow-[0_12px_26px_rgba(85,103,120,0.08)]"
            title="Notificações"
          >
            <Bell size={18} />
            {totalNotifications > 0 ? (
              <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-none text-white">
                {totalNotifications > 99 ? "99+" : totalNotifications}
              </span>
            ) : null}
          </button>

          {notificationsOpen ? (
            <div className="absolute right-0 top-14 z-[130] w-80 overflow-hidden rounded-[1.5rem] border border-white/45 bg-[rgba(255,252,247,0.94)] shadow-[0_22px_50px_rgba(62,78,92,0.14)] backdrop-blur-xl">
              <div className="border-b border-white/55 px-4 py-3">
                <p className="text-sm font-bold text-slate-900">
                  Notificações
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  Mensagens e novidades do seu acesso.
                </p>
              </div>

              <div className="max-h-80 overflow-y-auto p-2">
                {notificationItems.length ? (
                  notificationItems.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => openNotification(item)}
                      className="flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition hover:bg-white/80"
                    >
                      <span className="mt-0.5 flex h-6 min-w-6 items-center justify-center rounded-full bg-red-600 px-1 text-xs font-bold text-white">
                        {item.count > 99 ? "99+" : item.count}
                      </span>
                      <span>
                        <span className="block text-sm font-bold text-slate-900">
                          {item.label}
                        </span>
                        <span className="mt-0.5 block text-xs leading-5 text-slate-500">
                          {item.description}
                        </span>
                      </span>
                    </button>
                  ))
                ) : (
                  <p className="px-3 py-5 text-sm text-slate-500">
                    Nenhuma novidade no momento.
                  </p>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}

