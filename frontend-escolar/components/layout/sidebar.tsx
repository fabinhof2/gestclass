"use client";

import {
  BarChart3,
  BookOpen,
  CalendarClock,
  CalendarDays,
  ClipboardList,
  Clock3,
  CreditCard,
  Crown,
  FileText,
  LayoutDashboard,
  MessageCircle,
  MessagesSquare,
  NotebookPen,
  School,
  Settings,
  ShieldAlert,
  Users,
  Wallet,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/context/auth-context";
import type { UserRole } from "@/context/auth-context";
import { apiUrl } from "@/lib/api";

type MenuItem = {
  label: string;
  icon: LucideIcon;
  href: string;
  roles: UserRole[];
  soon?: boolean;
};

type EscolaSidebar = {
  id: string;
  name: string;
  logoUrl?: string | null;
};

type FinanceiroResumoResponsavel = {
  enabled: boolean;
  totalAbertos: number;
  cobrancasAbertasIds: string[];
};

type ComunicacaoResumoResponse = {
  total?: number | string | null;
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

type EscolasResponse = EscolaSidebar | EscolaSidebar[] | null;

function financeiroSeenKey(userId?: string) {
  return `gestclass_financeiro_seen_debitos_${userId || "anon"}`;
}

function readSeenFinanceiroIds(userId?: string) {
  if (typeof window === "undefined") return new Set<string>();

  try {
    const parsed = JSON.parse(
      localStorage.getItem(financeiroSeenKey(userId)) || "[]",
    );
    return new Set<string>(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set<string>();
  }
}

function writeSeenFinanceiroIds(userId: string | undefined, ids: string[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(financeiroSeenKey(userId), JSON.stringify(ids));
}

async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

const items: MenuItem[] = [
  {
    label: "Painel Superusuário",
    icon: Crown,
    href: "/superusuario",
    roles: ["SUPERUSUARIO"],
  },
  {
    label: "Dashboard",
    icon: LayoutDashboard,
    href: "/dashboard",
    roles: [
      "ADMIN_ESCOLA",
      "GESTOR",
      "SECRETARIA",
      "PROFESSOR",
      "RESPONSAVEL",
      "ALUNO",
    ],
  },
  {
    label: "Escolas",
    icon: School,
    href: "/escolas",
    roles: ["SUPERUSUARIO", "ADMIN_ESCOLA", "GESTOR", "SECRETARIA"],
  },
  {
    label: "Usuários",
    icon: Users,
    href: "/usuarios",
    roles: ["SUPERUSUARIO", "ADMIN_ESCOLA", "GESTOR", "SECRETARIA"],
  },
  {
    label: "Turmas",
    icon: BookOpen,
    href: "/turmas",
    roles: ["ADMIN_ESCOLA", "GESTOR", "SECRETARIA", "PROFESSOR"],
  },
  {
    label: "Disciplinas",
    icon: BookOpen,
    href: "/disciplinas",
    roles: ["ADMIN_ESCOLA", "GESTOR", "SECRETARIA"],
  },
  {
    label: "Modulação de Professores",
    icon: BookOpen,
    href: "/cadastro-turma",
    roles: ["ADMIN_ESCOLA", "GESTOR", "SECRETARIA"],
  },
  {
    label: "Modulação Individual",
    icon: ClipboardList,
    href: "/modulacao-individual",
    roles: ["ADMIN_ESCOLA", "GESTOR", "SECRETARIA"],
  },
  {
    label: "Modulador de Horário",
    icon: CalendarClock,
    href: "/modulador",
    roles: ["ADMIN_ESCOLA", "GESTOR", "SECRETARIA"],
  },
  {
    label: "Alunos",
    icon: Users,
    href: "/alunos",
    roles: ["ADMIN_ESCOLA", "GESTOR", "SECRETARIA", "PROFESSOR"],
  },
  {
    label: "Horários",
    icon: Clock3,
    href: "/horarios",
    roles: ["ADMIN_ESCOLA", "GESTOR", "SECRETARIA", "PROFESSOR", "RESPONSAVEL", "ALUNO"],
  },
  {
    label: "Frequência",
    icon: ClipboardList,
    href: "/frequencia",
    roles: [
      "ADMIN_ESCOLA",
      "GESTOR",
      "SECRETARIA",
      "PROFESSOR",
      "RESPONSAVEL",
      "ALUNO",
    ],
  },
  {
    label: "Avaliações",
    icon: FileText,
    href: "/avaliacoes",
    roles: ["GESTOR", "PROFESSOR", "RESPONSAVEL", "ALUNO"],
  },
  {
    label: "Notas",
    icon: NotebookPen,
    href: "/notas",
    roles: ["PROFESSOR", "ALUNO"],
  },
  {
    label: "Boletim",
    icon: ClipboardList,
    href: "/boletim",
    roles: [
      "ADMIN_ESCOLA",
      "GESTOR",
      "SECRETARIA",
      "RESPONSAVEL",
      "ALUNO",
    ],
  },
  {
    label: "Notas Professor",
    icon: NotebookPen,
    href: "/notas-professor",
    roles: ["PROFESSOR"],
  },
  {
    label: "Notas Gestão",
    icon: NotebookPen,
    href: "/notas-gestao",
    roles: ["ADMIN_ESCOLA", "GESTOR", "SECRETARIA"],
  },
  {
    label: "Notas do aluno",
    icon: ClipboardList,
    href: "/notas-responsavel",
    roles: ["RESPONSAVEL"],
  },
  {
    label: "Planejamento",
    icon: CalendarDays,
    href: "/conteudo-do-dia",
    roles: [
      "ADMIN_ESCOLA",
      "GESTOR",
      "SECRETARIA",
      "PROFESSOR",
      "RESPONSAVEL",
      "ALUNO",
    ],
  },
  {
    label: "Comunicação",
    icon: MessageCircle,
    href: "/feed",
    roles: [
      "ADMIN_ESCOLA",
      "GESTOR",
      "SECRETARIA",
      "PROFESSOR",
      "RESPONSAVEL",
      "ALUNO",
    ],
  },
  {
    label: "Solicitações",
    icon: FileText,
    href: "/solicitacoes",
    roles: [
      "SUPERUSUARIO",
      "ADMIN_ESCOLA",
      "FINANCEIRO",
      "GESTOR",
      "COORDENADOR",
      "SECRETARIA",
      "AUXILIAR",
      "PROFESSOR",
      "RESPONSAVEL",
      "ALUNO",
    ],
  },
  {
    label: "Financeiro",
    icon: Wallet,
    href: "/financeiro",
    roles: [
      "SUPERUSUARIO",
      "ADMIN_ESCOLA",
      "GESTOR",
      "SECRETARIA",
      "FINANCEIRO",
      "RESPONSAVEL",
    ],
  },
  {
    label: "Assinatura",
    icon: CreditCard,
    href: "/assinatura",
    roles: ["ADMIN_ESCOLA"],
  },
  {
    label: "Fórum",
    icon: MessagesSquare,
    href: "/forum",
    roles: [
      "ADMIN_ESCOLA",
      "GESTOR",
      "PROFESSOR",
      "RESPONSAVEL",
      "ALUNO",
    ],
  },
  {
    label: "Calendário",
    icon: CalendarDays,
    href: "/calendario",
    roles: [
      "ADMIN_ESCOLA",
      "GESTOR",
      "SECRETARIA",
      "PROFESSOR",
      "RESPONSAVEL",
      "ALUNO",
    ],
  },
  {
    label: "Moderação",
    icon: ShieldAlert,
    href: "#",
    roles: ["SUPERUSUARIO"],
    soon: true,
  },
  {
    label: "Configuração",
    icon: Settings,
    href: "/configuracao",
    roles: [
      "SUPERUSUARIO",
      "ADMIN_ESCOLA",
      "GESTOR",
      "SECRETARIA",
      "PROFESSOR",
      "RESPONSAVEL",
      "ALUNO",
    ],
  },
  {
    label: "Assinaturas",
    icon: CreditCard,
    href: "/superusuario",
    roles: ["SUPERUSUARIO"],
  },
  {
    label: "Métricas Globais",
    icon: BarChart3,
    href: "/superusuario",
    roles: ["SUPERUSUARIO"],
  },
];

type SidebarProps = {
  mobileOpen?: boolean;
  onClose?: () => void;
};

export default function Sidebar({
  mobileOpen = false,
  onClose,
}: SidebarProps) {
  const { user, token, logout, selectedSchool } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const userId = user?.id;
  const userRole = user?.role;
  const userPlan = user?.plan;
  const isAdminEscola = userRole === "ADMIN_ESCOLA";
  const isResponsavel = userRole === "RESPONSAVEL";
  const isFinanceiroResponsavelPlanEnabled =
    !userPlan || userPlan === "PRO" || userPlan === "PREMIUM";
  const currentSchoolId = selectedSchool?.id || user?.schoolId || "";
  const canAccessFeed = useMemo(
    () =>
      userRole !== undefined &&
      items.some(
        (item) => item.href === "/feed" && item.roles.includes(userRole),
      ),
    [userRole],
  );
  const canAccessFinanceiroResponsavel =
    Boolean(token) && isResponsavel && isFinanceiroResponsavelPlanEnabled;

  const [escolasAdmin, setEscolasAdmin] = useState<EscolaSidebar[]>([]);
  const [activeSchool, setActiveSchool] = useState<EscolaSidebar | null>(null);
  const [comunicacaoNovidades, setComunicacaoNovidades] = useState(0);
  const [financeiroNovidades, setFinanceiroNovidades] = useState(0);
  const [financeiroResponsavelDisponivel, setFinanceiroResponsavelDisponivel] =
    useState(true);
  const [financeiroGestaoDisponivel, setFinanceiroGestaoDisponivel] =
    useState(true);
  const sidebarLogoUrl =
    activeSchool?.logoUrl ||
    selectedSchool?.logoUrl ||
    escolasAdmin[0]?.logoUrl ||
    null;

  useEffect(() => {
    async function fetchEscolasAdmin() {
      if (!token || !isAdminEscola) {
        setEscolasAdmin([]);
        return;
      }

      try {
        const response = await fetch(apiUrl("/schools"), {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        const data = await readJson<EscolasResponse>(response);

        if (!response.ok) return;

        setEscolasAdmin(Array.isArray(data) ? data : data ? [data] : []);
      } catch {
        setEscolasAdmin([]);
      }
    }

    fetchEscolasAdmin();
  }, [token, isAdminEscola]);

  useEffect(() => {
    let ignore = false;

    async function fetchActiveSchool() {
      if (!token || !currentSchoolId) {
        if (!ignore) {
          setActiveSchool(null);
        }
        return;
      }

      try {
        const response = await fetch(apiUrl("/schools"), {
          headers: {
            Authorization: `Bearer ${token}`,
            "x-school-id": currentSchoolId,
          },
        });
        const data = await readJson<EscolasResponse>(response);

        if (!response.ok || ignore) return;

        const schoolData = Array.isArray(data) ? data[0] : data;
        setActiveSchool(schoolData || null);
      } catch {
        if (!ignore) {
          setActiveSchool(null);
        }
      }
    }

    fetchActiveSchool();

    return () => {
      ignore = true;
    };
  }, [currentSchoolId, token]);

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
        const data = await readJson<FinanceiroAcessoResponse>(response);

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

    async function fetchResumo() {
      if (!token || !canAccessFeed) {
        if (!ignore) setComunicacaoNovidades(0);
        return;
      }

      try {
        const response = await fetch(apiUrl("/comunicacao/resumo"), {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        const data = await readJson<ComunicacaoResumoResponse>(response);

        if (!response.ok || ignore) return;

        const total = Number(data?.total || 0);
        const seen = Number(
          localStorage.getItem("gestclass_comunicacao_seen") || 0,
        );

        if (pathname.startsWith("/feed")) {
          localStorage.setItem("gestclass_comunicacao_seen", String(total));
          setComunicacaoNovidades(0);
        } else {
          setComunicacaoNovidades(Math.max(total - seen, 0));
        }
      } catch {
        if (!ignore) setComunicacaoNovidades(0);
      }
    }

    fetchResumo();
    if (!token || !canAccessFeed) {
      return () => {
        ignore = true;
      };
    }

    const interval = window.setInterval(fetchResumo, 30000);

    return () => {
      ignore = true;
      window.clearInterval(interval);
    };
  }, [token, canAccessFeed, pathname]);

  useEffect(() => {
    let ignore = false;

    async function fetchResumoFinanceiro() {
      if (!token || !isResponsavel) {
        if (!ignore) {
          setFinanceiroNovidades(0);
          setFinanceiroResponsavelDisponivel(true);
        }
        return;
      }

      if (!canAccessFinanceiroResponsavel) {
        if (!ignore) {
          setFinanceiroNovidades(0);
          setFinanceiroResponsavelDisponivel(false);
        }
        return;
      }

      try {
        const response = await fetch(apiUrl("/financeiro/resumo-responsavel"), {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        const data = await readJson<FinanceiroResumoResponsavel>(response);

        if (!response.ok || ignore) return;

        setFinanceiroResponsavelDisponivel(Boolean(data.enabled));

        const ids = Array.isArray(data.cobrancasAbertasIds)
          ? data.cobrancasAbertasIds
          : [];

        if (!data.enabled) {
          setFinanceiroNovidades(0);
          return;
        }

        if (pathname.startsWith("/financeiro")) {
          writeSeenFinanceiroIds(userId, ids);
          setFinanceiroNovidades(0);
          return;
        }

        const seen = readSeenFinanceiroIds(userId);
        setFinanceiroNovidades(ids.filter((id) => !seen.has(id)).length);
      } catch {
        if (!ignore) {
          setFinanceiroNovidades(0);
          setFinanceiroResponsavelDisponivel(false);
        }
      }
    }

    fetchResumoFinanceiro();
    if (!canAccessFinanceiroResponsavel) {
      return () => {
        ignore = true;
      };
    }

    const interval = window.setInterval(fetchResumoFinanceiro, 30000);

    return () => {
      ignore = true;
      window.clearInterval(interval);
    };
  }, [
    token,
    userId,
    isResponsavel,
    canAccessFinanceiroResponsavel,
    pathname,
  ]);

  const filteredItems = useMemo(() => {
    if (!userRole) return [];

    return items
      .filter((item) => {
        if (!item.roles.includes(userRole)) return false;

        if (item.href === "/financeiro" && userRole === "RESPONSAVEL") {
          return financeiroResponsavelDisponivel;
        }

        if (
          item.href === "/financeiro" &&
          (userRole === "GESTOR" || userRole === "SECRETARIA")
        ) {
          return financeiroGestaoDisponivel;
        }

        return true;
      })
      .map((item) => {
        if (item.href === "/escolas" && isAdminEscola) {
          return {
            ...item,
            label: escolasAdmin.length > 1 ? "Escolas" : "Escola",
          };
        }

        if (
          item.href === "/conteudo-do-dia" &&
          (userRole === "RESPONSAVEL" || userRole === "ALUNO")
        ) {
          return {
            ...item,
            label: "Conteúdo do dia",
          };
        }

        return item;
      });
  }, [
    userRole,
    isAdminEscola,
    escolasAdmin,
    financeiroResponsavelDisponivel,
    financeiroGestaoDisponivel,
  ]);

  const handleLogout = useCallback(() => {
    onClose?.();
    logout();
    router.push("/login");
  }, [logout, onClose, router]);

  return (
    <>
      <aside className="glass-panel hidden min-h-screen w-[19rem] border-r border-white/30 bg-[linear-gradient(180deg,rgba(255,252,247,0.9),rgba(250,245,238,0.78))] lg:flex lg:flex-col">
      <div className="border-b border-white/40 px-6 py-7">
        <div className="flex items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-[1.4rem] bg-[linear-gradient(135deg,#2f6c67,#8eb9ad)] p-1 text-xl font-bold text-white shadow-[0_16px_30px_rgba(47,108,103,0.28)]">
            {sidebarLogoUrl ? (
              <div className="flex h-full w-full items-center justify-center rounded-[1rem] bg-white/90 p-1">
                <img
                  src={apiUrl(sidebarLogoUrl)}
                  alt="Logo da escola"
                  className="h-full w-full object-contain"
                />
              </div>
            ) : (
              "GC"
            )}
          </div>
          <div>
            <h1 className="font-[var(--font-display)] text-2xl font-bold tracking-[-0.03em] text-slate-900">
              GestClass
            </h1>
            <p className="text-sm text-slate-500">
              {"Painel escolar com presen\u00e7a premium"}
            </p>

            {user && (
              <p className="mt-1 inline-flex rounded-full bg-[rgba(47,108,103,0.1)] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--primary)]">
                Perfil: {user.role}
              </p>
            )}
          </div>
        </div>
      </div>

      <nav className="flex-1 space-y-2 overflow-y-auto px-4 py-5">
        {filteredItems.map((item) => {
          const Icon = item.icon;
          const isActive =
            item.href !== "#" &&
            (pathname === item.href || pathname.startsWith(`${item.href}/`));
          const className = `menu-item ${isActive ? "menu-item-active" : ""} ${
            item.soon || item.href === "#" ? "opacity-60 cursor-not-allowed" : ""
          }`;

          if (item.soon || item.href === "#") {
            return (
              <button
                key={item.label}
                type="button"
                className={`${className} w-full`}
                disabled
                title="Recurso em breve"
              >
                <Icon size={18} />
                <span className="flex-1 text-left">{item.label}</span>
                <span className="rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                  Em breve
                </span>
              </button>
            );
          }

          return (
            <Link
              key={item.label}
              href={item.href}
              className={`${className} relative`}
            >
              <Icon size={18} />
              <span>{item.label}</span>
              {item.href === "/feed" && comunicacaoNovidades > 0 ? (
                <span className="absolute bottom-1 left-2 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-none text-white">
                  {comunicacaoNovidades > 99 ? "99+" : comunicacaoNovidades}
                </span>
              ) : null}
              {item.href === "/financeiro" && financeiroNovidades > 0 ? (
                <span className="absolute bottom-1 left-2 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-none text-white">
                  {financeiroNovidades > 99 ? "99+" : financeiroNovidades}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      <div className="space-y-3 p-4">
        <div className="overflow-hidden rounded-[1.6rem] border border-white/40 bg-[linear-gradient(145deg,#2f6c67,#d88d62)] p-5 text-white shadow-[0_20px_38px_rgba(47,108,103,0.22)]">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/80">
            Experiência Premium
          </p>
          <p className="mt-3 font-[var(--font-display)] text-2xl font-semibold leading-none">
            Gestão que encanta.
          </p>
          <p className="mt-3 text-sm text-white/85">
            Uma interface mais acolhedora, elegante e pronta para impressionar
            famílias e equipes.
          </p>
        </div>

        {user && (
          <button
            type="button"
            onClick={handleLogout}
            className="w-full rounded-2xl border border-white/50 bg-white/65 px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-white"
          >
            Sair
          </button>
        )}
      </div>
    </aside>

      {mobileOpen ? (
        <div className="fixed inset-0 z-[200] flex lg:hidden">
          <button
            type="button"
            onClick={onClose}
            className="absolute inset-0 bg-slate-950/45 backdrop-blur-[2px]"
            aria-label="Fechar menu"
          />

          <aside className="glass-panel relative z-[201] flex h-full w-[min(88vw,22rem)] flex-col border-r border-white/30 bg-[linear-gradient(180deg,rgba(255,252,247,0.98),rgba(250,245,238,0.94))] shadow-[0_24px_64px_rgba(15,23,42,0.28)]">
            <div className="border-b border-white/40 px-6 py-7">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-[1.4rem] bg-[linear-gradient(135deg,#2f6c67,#8eb9ad)] p-1 text-xl font-bold text-white shadow-[0_16px_30px_rgba(47,108,103,0.28)]">
                    {sidebarLogoUrl ? (
                      <div className="flex h-full w-full items-center justify-center rounded-[1rem] bg-white/90 p-1">
                        <img
                          src={apiUrl(sidebarLogoUrl)}
                          alt="Logo da escola"
                          className="h-full w-full object-contain"
                        />
                      </div>
                    ) : (
                      "GC"
                    )}
                  </div>
                  <div>
                    <h1 className="font-[var(--font-display)] text-2xl font-bold tracking-[-0.03em] text-slate-900">
                      GestClass
                    </h1>
                    <p className="text-sm text-slate-500">
                      {"Painel escolar com presen\u00e7a premium"}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={onClose}
                  className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/45 bg-white/70 text-slate-600 shadow-sm"
                  title="Fechar menu"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            <nav className="flex-1 space-y-2 overflow-y-auto px-4 py-5">
              {filteredItems.map((item) => {
                const Icon = item.icon;
                const isActive =
                  item.href !== "#" &&
                  (pathname === item.href || pathname.startsWith(`${item.href}/`));
                const className = `menu-item ${isActive ? "menu-item-active" : ""} ${
                  item.soon || item.href === "#" ? "opacity-60 cursor-not-allowed" : ""
                }`;

                if (item.soon || item.href === "#") {
                  return (
                    <button
                      key={`mobile-${item.label}`}
                      type="button"
                      className={`${className} w-full`}
                      disabled
                      title="Recurso em breve"
                    >
                      <Icon size={18} />
                      <span className="flex-1 text-left">{item.label}</span>
                      <span className="rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                        Em breve
                      </span>
                    </button>
                  );
                }

                return (
                  <Link
                    key={`mobile-${item.label}`}
                    href={item.href}
                    onClick={() => onClose?.()}
                    className={`${className} relative`}
                  >
                    <Icon size={18} />
                    <span>{item.label}</span>
                    {item.href === "/feed" && comunicacaoNovidades > 0 ? (
                      <span className="absolute bottom-1 left-2 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-none text-white">
                        {comunicacaoNovidades > 99 ? "99+" : comunicacaoNovidades}
                      </span>
                    ) : null}
                    {item.href === "/financeiro" && financeiroNovidades > 0 ? (
                      <span className="absolute bottom-1 left-2 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-none text-white">
                        {financeiroNovidades > 99 ? "99+" : financeiroNovidades}
                      </span>
                    ) : null}
                  </Link>
                );
              })}
            </nav>

            <div className="space-y-3 p-4">
              {user && (
                <button
                  type="button"
                  onClick={handleLogout}
                  className="w-full rounded-2xl border border-white/50 bg-white/65 px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-white"
                >
                  Sair
                </button>
              )}
            </div>
          </aside>
        </div>
      ) : null}
    </>
  );
}
