"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { formatTurno } from "@/lib/turno";
import {
  Banknote,
  CheckCircle2,
  Copy,
  CreditCard,
  FileText,
  QrCode,
  RefreshCw,
  RotateCcw,
  Save,
  Settings,
  Send,
  Wallet,
  XCircle,
} from "lucide-react";
import PageHeader from "@/components/ui/page-header";
import { useAuth } from "@/context/auth-context";
import { apiUrl } from "@/lib/api";

type StatusCobranca = "PENDENTE" | "PAGO" | "ATRASADO" | "CANCELADO";
type Gateway = "MERCADO_PAGO" | "PAYPAL" | "OUTRO";
type SchoolPlan = "TESTE_15_DIAS" | "BASICO" | "PRO" | "PREMIUM";
type NotaFiscalStatus =
  | "NAO_EMITIDA"
  | "EM_PROCESSAMENTO"
  | "EMITIDA"
  | "REJEITADA"
  | "CANCELADA";
type NotaFiscalAmbiente = "HOMOLOGACAO" | "PRODUCAO";
type NotaFiscalProvedor = "MUNICIPAL_API" | "FOCUS_NFE" | "NFE_IO" | "WEBMANIA" | "OUTRO";

type NotaFiscal = {
  id: string;
  status: NotaFiscalStatus;
  ambiente: NotaFiscalAmbiente;
  provedor: NotaFiscalProvedor;
  numero?: string | null;
  codigoVerificacao?: string | null;
  linkPdf?: string | null;
  linkXml?: string | null;
  mensagem?: string | null;
  emitidaEm?: string | null;
};

type FinanceiroConfig = {
  beneficiario?: string | null;
  documento?: string | null;
  banco?: string | null;
  agencia?: string | null;
  conta?: string | null;
  pixKey?: string | null;
  mensalidadePadrao: string | number;
  vencimentoDia: number;
  gestorAccessEnabled?: boolean;
  secretariaAccessEnabled?: boolean;
  gateway?: Gateway | null;
  gatewayPublicKey?: string | null;
  gatewayAccessToken?: string | null;
  webhookUrl?: string | null;
  fiscalEnabled?: boolean;
  fiscalAmbiente?: NotaFiscalAmbiente;
  fiscalProvedor?: NotaFiscalProvedor;
  fiscalEndpointUrl?: string | null;
  fiscalApiToken?: string | null;
  fiscalMunicipioIbge?: string | null;
  fiscalInscricaoMunicipal?: string | null;
  fiscalCnae?: string | null;
  fiscalServicoCodigo?: string | null;
  fiscalAliquotaIss?: string | number;
  fiscalDescricaoPadrao?: string | null;
  fiscalEmitirAutomaticamente?: boolean;
  fiscalConfigurado?: boolean;
  valorTeste15Dias?: string | number;
  valorBasico?: string | number;
  valorPro: string | number;
  valorPremium?: string | number;
};

type Cobranca = {
  id: string;
  mes: number;
  ano: number;
  descricao: string;
  valor: string | number;
  vencimento: string;
  status: StatusCobranca;
  pagoEm?: string | null;
  formaPagamento?: string | null;
  gatewayPaymentId?: string | null;
  notaFiscal?: NotaFiscal | null;
  aluno: {
    id: string;
    name: string;
    matricula?: string | null;
    turma?: {
      name: string;
      turno?: string | null;
    } | null;
  };
  responsavel?: {
    id: string;
    name: string;
    email: string;
    phone?: string | null;
  } | null;
};

type AssinaturaCobranca = {
  id: string;
  mes: number;
  ano: number;
  descricao: string;
  valor: string | number;
  vencimento: string;
  status: StatusCobranca;
  pagoEm?: string | null;
  formaPagamento?: string | null;
  gatewayPaymentId?: string | null;
  notaFiscal?: NotaFiscal | null;
  school: {
    id: string;
    name: string;
    email?: string | null;
    phone?: string | null;
    plan: SchoolPlan;
    status: string;
    users?: {
      id: string;
      name: string;
      email: string;
      phone?: string | null;
    }[];
  };
};

type FinanceiroResponse = {
  modo: "GESTAO" | "RESPONSAVEL" | "BLOQUEADO" | "SUPERUSUARIO";
  plan?: SchoolPlan | null;
  config: FinanceiroConfig | null;
  assinaturaConfig?: FinanceiroConfig | null;
  resumo: {
    total: number;
    recebido: number;
    emAberto: number;
    atrasado: number;
    quantidade: number;
    pagos: number;
    atrasados: number;
  };
  cobrancas: Cobranca[];
  cobrancasAssinatura?: AssinaturaCobranca[];
  turmas?: {
    id: string;
    name: string;
    turno?: string | null;
  }[];
};

type FinanceiroAcessoResponse = {
  visible: boolean;
  enabled: boolean;
  gestorAccessEnabled: boolean;
  secretariaAccessEnabled: boolean;
};

function getFinanceiroRoleEnabled(
  access: FinanceiroAcessoResponse | null,
  role?: string,
) {
  if (!access) return true;

  if (role === "GESTOR") {
    return Boolean(access.gestorAccessEnabled);
  }

  if (role === "SECRETARIA") {
    return Boolean(access.secretariaAccessEnabled);
  }

  return Boolean(access.enabled);
}

const emptyConfig: FinanceiroConfig = {
  beneficiario: "",
  documento: "",
  banco: "",
  agencia: "",
  conta: "",
  pixKey: "",
  mensalidadePadrao: 0,
  vencimentoDia: 10,
  gestorAccessEnabled: true,
  secretariaAccessEnabled: true,
  gateway: null,
  gatewayPublicKey: "",
  gatewayAccessToken: "",
  webhookUrl: "",
  fiscalEnabled: false,
  fiscalAmbiente: "HOMOLOGACAO",
  fiscalProvedor: "MUNICIPAL_API",
  fiscalEndpointUrl: "",
  fiscalApiToken: "",
  fiscalMunicipioIbge: "",
  fiscalInscricaoMunicipal: "",
  fiscalCnae: "",
  fiscalServicoCodigo: "",
  fiscalAliquotaIss: 0,
  fiscalDescricaoPadrao: "",
  fiscalEmitirAutomaticamente: false,
  valorTeste15Dias: 0,
  valorBasico: 0,
  valorPro: 0,
  valorPremium: 0,
};

function money(value: string | number) {
  return Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function date(value: string) {
  return new Date(value).toLocaleDateString("pt-BR");
}

function financeiroSeenKey(userId?: string) {
  return `gestclass_financeiro_seen_debitos_${userId || "anon"}`;
}

function markFinanceiroDebitosAsSeen(userId: string | undefined, cobrancas: Cobranca[]) {
  if (typeof window === "undefined") return;

  const abertas = cobrancas
    .filter((cobranca) => cobranca.status === "PENDENTE" || cobranca.status === "ATRASADO")
    .map((cobranca) => cobranca.id);

  localStorage.setItem(financeiroSeenKey(userId), JSON.stringify(abertas));
}

function statusClass(status: StatusCobranca) {
  const map: Record<StatusCobranca, string> = {
    PAGO: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    PENDENTE: "bg-blue-50 text-blue-700 ring-blue-200",
    ATRASADO: "bg-red-50 text-red-700 ring-red-200",
    CANCELADO: "bg-slate-100 text-slate-600 ring-slate-200",
  };

  return map[status];
}

function notaFiscalClass(status?: NotaFiscalStatus) {
  const map: Record<NotaFiscalStatus, string> = {
    EMITIDA: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    EM_PROCESSAMENTO: "bg-amber-50 text-amber-700 ring-amber-200",
    REJEITADA: "bg-red-50 text-red-700 ring-red-200",
    CANCELADA: "bg-slate-100 text-slate-600 ring-slate-200",
    NAO_EMITIDA: "bg-slate-50 text-slate-600 ring-slate-200",
  };

  return map[status || "NAO_EMITIDA"];
}

export default function FinanceiroPage() {
  const { token, user } = useAuth();
  const [data, setData] = useState<FinanceiroResponse | null>(null);
  const [config, setConfig] = useState<FinanceiroConfig>(emptyConfig);
  const [financeiroAccess, setFinanceiroAccess] =
    useState<FinanceiroAcessoResponse | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusCobranca | "TODOS">(
    "TODOS",
  );
  const [alunoAdiantamentoId, setAlunoAdiantamentoId] = useState("");
  const [quantidadeMeses, setQuantidadeMeses] = useState(1);
  const [turmaLoteId, setTurmaLoteId] = useState("");
  const [planoLote, setPlanoLote] = useState<SchoolPlan>("BASICO");
  const [valorLote, setValorLote] = useState("");
  const [mesLote, setMesLote] = useState(new Date().getMonth() + 1);
  const [anoLote, setAnoLote] = useState(new Date().getFullYear());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingValorId, setSavingValorId] = useState("");
  const [savingLote, setSavingLote] = useState(false);
  const [valoresCobranca, setValoresCobranca] = useState<Record<string, string>>(
    {},
  );
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const isSuperuser = user?.role === "SUPERUSUARIO";
  const isAdminEscola = user?.role === "ADMIN_ESCOLA";
  const isResponsavel = user?.role === "RESPONSAVEL";
  const canManageBase =
    user?.role === "SUPERUSUARIO" ||
    user?.role === "ADMIN_ESCOLA" ||
    user?.role === "FINANCEIRO" ||
    user?.role === "SECRETARIA" ||
    user?.role === "GESTOR";
  const roleFinanceiroEnabled = getFinanceiroRoleEnabled(
    financeiroAccess,
    user?.role,
  );
  const canManage =
    canManageBase &&
    (user?.role === "GESTOR" || user?.role === "SECRETARIA"
      ? roleFinanceiroEnabled
      : true);
  const canAccess = canManage || user?.role === "RESPONSAVEL";
  const currentPlan = (data?.plan || user?.plan || null) as SchoolPlan | null;
  const isFinanceiroEnabled =
    isSuperuser || currentPlan === "PRO" || currentPlan === "PREMIUM";
  const isPremium = isSuperuser || currentPlan === "PREMIUM";
  const hasBlockedRoleAccess =
    (user?.role === "GESTOR" || user?.role === "SECRETARIA") &&
    financeiroAccess !== null &&
    !roleFinanceiroEnabled;

  useEffect(() => {
    let ignore = false;

    async function loadFinanceiroAccess() {
      if (
        !token ||
        (user?.role !== "GESTOR" &&
          user?.role !== "SECRETARIA" &&
          user?.role !== "ADMIN_ESCOLA")
      ) {
        if (!ignore) setFinanceiroAccess(null);
        return;
      }

      try {
        const response = await fetch(apiUrl("/financeiro/acesso"), {
          headers: { Authorization: `Bearer ${token}` },
        });
        const payload = (await response.json()) as FinanceiroAcessoResponse;

        if (!response.ok) {
          throw new Error("Erro ao carregar acesso financeiro.");
        }

        if (!ignore) {
          setFinanceiroAccess(payload);
        }
      } catch {
        if (!ignore) {
          setFinanceiroAccess(
            user?.role === "ADMIN_ESCOLA"
              ? {
                  visible: true,
                  enabled: true,
                  gestorAccessEnabled: true,
                  secretariaAccessEnabled: true,
                }
              : {
                  visible: true,
                  enabled: true,
                  gestorAccessEnabled: true,
                  secretariaAccessEnabled: true,
                },
          );
        }
      }
    }

    loadFinanceiroAccess();

    return () => {
      ignore = true;
    };
  }, [token, user?.role]);

  async function loadFinanceiro() {
    if (!token || !canAccess) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError("");
      const response = await fetch(apiUrl("/financeiro"), {
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.message || "Erro ao carregar financeiro.");
      }

      setData(payload);
      setConfig(payload.assinaturaConfig || payload.config || emptyConfig);
      if (
        user?.role === "RESPONSAVEL" &&
        (payload.plan === "PRO" || payload.plan === "PREMIUM")
      ) {
        markFinanceiroDebitosAsSeen(user.id, payload.cobrancas || []);
      }
      setAlunoAdiantamentoId(payload.cobrancas?.[0]?.aluno?.id || "");
      setTurmaLoteId(payload.turmas?.[0]?.id || "");
      setPlanoLote(payload.cobrancasAssinatura?.[0]?.school?.plan || "BASICO");
      setValoresCobranca(
        Object.fromEntries(
          [
            ...(payload.cobrancas || []),
            ...(payload.cobrancasAssinatura || []),
          ].map((cobranca: Cobranca | AssinaturaCobranca) => [
            cobranca.id,
            String(cobranca.valor || 0),
          ]),
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar financeiro.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (hasBlockedRoleAccess) {
      setLoading(false);
      setData(null);
      return;
    }

    loadFinanceiro();
  }, [token, user?.role, hasBlockedRoleAccess]);

  const cobrancasEscola = useMemo(() => {
    const lista = data?.cobrancas || [];
    if (statusFilter === "TODOS") return lista;
    return lista.filter((item) => item.status === statusFilter);
  }, [data, statusFilter]);

  const cobrancasAssinatura = useMemo(() => {
    const lista = data?.cobrancasAssinatura || [];
    if (statusFilter === "TODOS") return lista;
    return lista.filter((item) => item.status === statusFilter);
  }, [data, statusFilter]);

  const alunos = useMemo(() => {
    const map = new Map<string, string>();
    for (const cobranca of data?.cobrancas || []) {
      map.set(cobranca.aluno.id, cobranca.aluno.name);
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [data]);

  async function updateClassChargeValues() {
    if (!token || !turmaLoteId) return;

    try {
      setSavingLote(true);
      setError("");
      setMessage("");
      const response = await fetch(apiUrl("/financeiro/cobrancas/valor-por-turma"), {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          turmaId: turmaLoteId,
          valor: valorLote || "0",
          mes: mesLote,
          ano: anoLote,
        }),
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(payload?.message || "Não foi possível aplicar o valor.");
      }

      setMessage(
        `${payload.atualizadas || 0} mensalidade(s) atualizada(s) para a turma selecionada.`,
      );
      await loadFinanceiro();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível aplicar o valor.");
    } finally {
      setSavingLote(false);
    }
  }

  async function updatePlanChargeValues() {
    if (!token || !planoLote) return;

    try {
      setSavingLote(true);
      setError("");
      setMessage("");
      const response = await fetch(apiUrl("/financeiro/cobrancas/valor-por-plano"), {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          plan: planoLote,
          valor: valorLote || "0",
          mes: mesLote,
          ano: anoLote,
        }),
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(payload?.message || "Não foi possível aplicar o valor.");
      }

      setMessage(
        `${payload.atualizadas || 0} assinatura(s) atualizada(s) para o plano selecionado.`,
      );
      await loadFinanceiro();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível aplicar o valor.");
    } finally {
      setSavingLote(false);
    }
  }

  async function saveConfig(event: FormEvent) {
    event.preventDefault();
    if (!token) return;

    try {
      setSaving(true);
      setError("");
      setMessage("");
      const response = await fetch(apiUrl("/financeiro/configuracao"), {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          ...config,
          mensalidadePadrao: Number(config.mensalidadePadrao || 0),
          vencimentoDia: Number(config.vencimentoDia || 10),
          gestorAccessEnabled: Boolean(config.gestorAccessEnabled ?? true),
          secretariaAccessEnabled: Boolean(
            config.secretariaAccessEnabled ?? true,
          ),
          valorTeste15Dias: Number(config.valorTeste15Dias || 0),
          valorBasico: Number(config.valorBasico || 0),
          valorPro: Number(config.valorPro || 0),
          valorPremium: Number(config.valorPremium || 0),
          fiscalAliquotaIss: Number(config.fiscalAliquotaIss || 0),
        }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.message || "Erro ao salvar configuracao.");
      }

      setConfig(payload);
      setFinanceiroAccess((prev) =>
        prev
          ? {
              ...prev,
              gestorAccessEnabled: Boolean(payload.gestorAccessEnabled ?? true),
              secretariaAccessEnabled: Boolean(
                payload.secretariaAccessEnabled ?? true,
              ),
            }
          : prev,
      );
      setMessage("Configuração financeira salva.");
      await loadFinanceiro();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar configuracao.");
    } finally {
      setSaving(false);
    }
  }

  async function markPaid(cobrancaId: string, formaPagamento = "Confirmado manualmente") {
    if (!token) return;

    const response = await fetch(apiUrl(`/financeiro/cobrancas/${cobrancaId}/pagar`), {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ formaPagamento }),
    });

    if (response.ok) {
      setMessage(
        formaPagamento === "PIX"
          ? "Pagamento PIX confirmado."
          : "Pagamento confirmado.",
      );
      await loadFinanceiro();
    }
  }

  async function updateChargeValue(cobrancaId: string) {
    if (!token) return;

    try {
      setSavingValorId(cobrancaId);
      setError("");
      setMessage("");
      const response = await fetch(apiUrl(`/financeiro/cobrancas/${cobrancaId}/valor`), {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          valor: valoresCobranca[cobrancaId] || "0",
        }),
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(payload?.message || "Não foi possível salvar o valor.");
      }

      setMessage("Valor da mensalidade atualizado.");
      await loadFinanceiro();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar o valor.");
    } finally {
      setSavingValorId("");
    }
  }

  async function cancelPayment(cobrancaId: string) {
    if (!token) return;

    const response = await fetch(
      apiUrl(`/financeiro/cobrancas/${cobrancaId}/cancelar-pagamento`),
      {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
      },
    );

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      setError(payload?.message || "Não foi possível cancelar o pagamento.");
      return;
    }

    setMessage("Pagamento cancelado. A cobranca voltou para aberto.");
    await loadFinanceiro();
  }

  async function openMercadoPago(cobrancaId: string) {
    if (!token) return;

    const checkoutWindow = window.open("about:blank", "_blank");

    if (!checkoutWindow) {
      setError("O navegador bloqueou a aba do Mercado Pago. Libere pop-ups para este site.");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    checkoutWindow.opener = null;

    setError("");
    setMessage("");
    const response = await fetch(
      apiUrl(`/financeiro/cobrancas/${cobrancaId}/mercado-pago/preferencia`),
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      checkoutWindow.close();
      setError(payload?.message || "Não foi possível iniciar o Mercado Pago.");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    const checkoutUrl = payload?.sandbox_init_point || payload?.init_point;

    if (!checkoutUrl) {
      checkoutWindow.close();
      setError("O Mercado Pago nao retornou um link de pagamento.");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    checkoutWindow.location.href = checkoutUrl;
    setMessage("Checkout do Mercado Pago aberto. Depois do pagamento, atualize o status.");
    await loadFinanceiro();
  }

  async function syncMercadoPago(cobrancaId: string) {
    if (!token) return;

    setError("");
    setMessage("");
    const response = await fetch(
      apiUrl(`/financeiro/cobrancas/${cobrancaId}/mercado-pago/sincronizar`),
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      setError(payload?.message || "Não foi possível atualizar pelo Mercado Pago.");
      return;
    }

    setMessage(
      payload?.status === "PAGO"
        ? "Pagamento confirmado pelo Mercado Pago."
        : "Status consultado no Mercado Pago.",
    );
    await loadFinanceiro();
  }

  async function fiscalAction(
    cobrancaId: string,
    action: "emitir" | "sincronizar" | "cancelar",
  ) {
    if (!token) return;

    setError("");
    setMessage("");
    const response = await fetch(
      apiUrl(`/financeiro/cobrancas/${cobrancaId}/nota-fiscal/${action}`),
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      setError(payload?.message || "Não foi possível atualizar a nota fiscal.");
      return;
    }

    const labels = {
      emitir: "Nota fiscal enviada para emissao.",
      sincronizar: "Nota fiscal sincronizada.",
      cancelar: "Nota fiscal cancelada.",
    };
    setMessage(labels[action]);
    await loadFinanceiro();
  }

  async function copyPixKey() {
    const pixKey = isSuperuser ? config.pixKey : data?.config?.pixKey || config.pixKey;
    if (!pixKey) return;

    try {
      await navigator.clipboard.writeText(String(pixKey));
      setMessage("Chave PIX copiada.");
    } catch {
      setError("Não foi possível copiar a chave PIX.");
    }
  }

  async function gerarMesAtual() {
    if (!token) return;
    const response = await fetch(apiUrl("/financeiro/gerar-mes-atual"), {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });

    if (response.ok) {
      setMessage("Cobranças do mês atual atualizadas.");
      await loadFinanceiro();
    }
  }

  async function gerarAdiantadas() {
    if (!token || !alunoAdiantamentoId) return;

    const response = await fetch(apiUrl("/financeiro/adiantar"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        alunoId: alunoAdiantamentoId,
        quantidadeMeses,
      }),
    });

    if (response.ok) {
      setMessage("Boletos adiantados gerados.");
      await loadFinanceiro();
    }
  }

  if (hasBlockedRoleAccess) {
    return (
      <section className="space-y-6">
        <PageHeader
          title="Financeiro"
          description="Acesso restrito ao superusuário, administrador, secretaria, gestor, financeiro e responsáveis."
        />
        <div className="rounded-3xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
          O administrador da escola bloqueou o acesso do seu perfil ao financeiro.
        </div>
      </section>
    );
  }

  if (!canAccess) {
    return (
      <section className="space-y-6">
        <PageHeader
          title="Financeiro"
          description="Acesso restrito ao superusuário, administrador, secretaria, gestor, financeiro e responsáveis."
        />
        <div className="card-base p-6 text-sm text-slate-600">
          Seu perfil não tem acesso ao gestor financeiro.
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <PageHeader
        title={
          isSuperuser
            ? "Financeiro de assinaturas"
            : canManage
              ? "Gestor financeiro"
              : "Financeiro"
        }
        description={
          isSuperuser
            ? "Controle as assinaturas das escolas, cobranças mensais, recebimentos, atrasos e integrações da plataforma."
            : canManage
            ? "Controle mensalidades, boletos, recebimentos, atrasos e integrações bancárias."
            : "Acompanhe seus débitos, meses pagos, pendências e opções de pagamento."
        }
      />

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {message ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {message}
        </div>
      ) : null}

      {loading ? (
        <div className="card-base p-6 text-sm text-slate-500">
          Carregando financeiro...
        </div>
      ) : null}

      {!loading && !isFinanceiroEnabled ? (
        <div className="card-base p-6">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
              <Wallet size={20} />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Financeiro disponivel nos planos Pro e Premium
              </h2>
              <p className="mt-2 text-sm text-slate-600">
                Este recurso permite controlar mensalidades, pendências e pagamentos.
                Para usar o financeiro, atualize sua escola para o plano Pro ou Premium.
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {data && isFinanceiroEnabled ? (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <MetricCard icon={Wallet} label="Total" value={money(data.resumo.total)} />
            <MetricCard
              icon={CheckCircle2}
              label="Recebido"
              value={money(data.resumo.recebido)}
            />
            <MetricCard
              icon={Banknote}
              label="Em aberto"
              value={money(data.resumo.emAberto)}
            />
            <MetricCard
              icon={CreditCard}
              label="Em atraso"
              value={money(data.resumo.atrasado)}
            />
          </div>

          {canManage ? (
            <form onSubmit={saveConfig} className="card-base space-y-5 p-5">
              <div className="flex items-center gap-2">
                <Settings size={18} className="text-slate-500" />
                <h2 className="text-base font-bold text-slate-900">
                  {isSuperuser
                    ? "Dados bancarios e cobranca da plataforma"
                    : "Dados bancarios e integracao"}
                </h2>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <Input label="Beneficiário" value={config.beneficiario || ""} onChange={(value) => setConfig((prev) => ({ ...prev, beneficiario: value }))} />
                <Input label="CPF/CNPJ" value={config.documento || ""} onChange={(value) => setConfig((prev) => ({ ...prev, documento: value }))} />
                <Input label="Banco" value={config.banco || ""} onChange={(value) => setConfig((prev) => ({ ...prev, banco: value }))} />
                <Input label="Agencia" value={config.agencia || ""} onChange={(value) => setConfig((prev) => ({ ...prev, agencia: value }))} />
                <Input label="Conta" value={config.conta || ""} onChange={(value) => setConfig((prev) => ({ ...prev, conta: value }))} />
                <Input label="Chave PIX" value={config.pixKey || ""} onChange={(value) => setConfig((prev) => ({ ...prev, pixKey: value }))} />
                {!isSuperuser ? (
                  <Input label="Mensalidade padrao" type="number" value={String(config.mensalidadePadrao || 0)} onChange={(value) => setConfig((prev) => ({ ...prev, mensalidadePadrao: value }))} />
                ) : null}
                <Input label="Dia de vencimento" type="number" value={String(config.vencimentoDia || 10)} onChange={(value) => setConfig((prev) => ({ ...prev, vencimentoDia: Number(value) }))} />
                {isAdminEscola ? (
                  <div className="md:col-span-3">
                    <div className="grid gap-4 rounded-xl border border-amber-200 bg-amber-50 p-4 md:grid-cols-2">
                      <label className="flex items-start gap-3 rounded-xl border border-amber-100 bg-white px-4 py-3 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          checked={Boolean(config.gestorAccessEnabled ?? true)}
                          onChange={(event) =>
                            setConfig((prev) => ({
                              ...prev,
                              gestorAccessEnabled: event.target.checked,
                            }))
                          }
                          className="mt-0.5 h-4 w-4"
                        />
                        <span>
                          <strong className="block text-slate-900">Acesso do gestor</strong>
                          Libera ou bloqueia a opção Financeiro para usuários com perfil Gestor.
                        </span>
                      </label>
                      <label className="flex items-start gap-3 rounded-xl border border-amber-100 bg-white px-4 py-3 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          checked={Boolean(config.secretariaAccessEnabled ?? true)}
                          onChange={(event) =>
                            setConfig((prev) => ({
                              ...prev,
                              secretariaAccessEnabled: event.target.checked,
                            }))
                          }
                          className="mt-0.5 h-4 w-4"
                        />
                        <span>
                          <strong className="block text-slate-900">Acesso da secretaria</strong>
                          Libera ou bloqueia a opção Financeiro para usuários com perfil Secretaria.
                        </span>
                      </label>
                    </div>
                  </div>
                ) : null}
                {isSuperuser ? (
                  <>
                    <Input label="Valor teste 15 dias" type="number" value={String(config.valorTeste15Dias || 0)} onChange={(value) => setConfig((prev) => ({ ...prev, valorTeste15Dias: value }))} />
                    <Input label="Valor plano Basico" type="number" value={String(config.valorBasico || 0)} onChange={(value) => setConfig((prev) => ({ ...prev, valorBasico: value }))} />
                    <Input label="Valor plano Pro" type="number" value={String(config.valorPro || 0)} onChange={(value) => setConfig((prev) => ({ ...prev, valorPro: value }))} />
                    <Input label="Valor plano Premium" type="number" value={String(config.valorPremium || 0)} onChange={(value) => setConfig((prev) => ({ ...prev, valorPremium: value }))} />
                  </>
                ) : null}

                {isPremium ? (
                  <>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-slate-700">
                        Gateway
                      </label>
                      <select
                        value={config.gateway || ""}
                        onChange={(event) =>
                          setConfig((prev) => ({
                            ...prev,
                            gateway: event.target.value
                              ? (event.target.value as Gateway)
                              : null,
                          }))
                        }
                        className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                      >
                        <option value="">Sem gateway</option>
                        <option value="MERCADO_PAGO">Mercado Pago</option>
                        <option value="PAYPAL">PayPal</option>
                        <option value="OUTRO">Outro</option>
                      </select>
                    </div>

                    <Input label="Public key / Client ID" value={config.gatewayPublicKey || ""} onChange={(value) => setConfig((prev) => ({ ...prev, gatewayPublicKey: value }))} />
                    <Input label="Access token / Secret" value={config.gatewayAccessToken || ""} onChange={(value) => setConfig((prev) => ({ ...prev, gatewayAccessToken: value }))} />
                    <Input label="Webhook URL" value={config.webhookUrl || ""} onChange={(value) => setConfig((prev) => ({ ...prev, webhookUrl: value }))} />
                    <div className="md:col-span-3">
                      <div className="grid gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-3">
                        <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 md:col-span-3">
                          <input
                            type="checkbox"
                            checked={Boolean(config.fiscalEnabled)}
                            onChange={(event) =>
                              setConfig((prev) => ({
                                ...prev,
                                fiscalEnabled: event.target.checked,
                              }))
                            }
                            className="h-4 w-4"
                          />
                          Automatizacao fiscal NFS-e
                        </label>
                        <div>
                          <label className="mb-1 block text-sm font-medium text-slate-700">
                            Ambiente
                          </label>
                          <select
                            value={config.fiscalAmbiente || "HOMOLOGACAO"}
                            onChange={(event) =>
                              setConfig((prev) => ({
                                ...prev,
                                fiscalAmbiente: event.target.value as NotaFiscalAmbiente,
                              }))
                            }
                            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                          >
                            <option value="HOMOLOGACAO">Homologacao</option>
                            <option value="PRODUCAO">Producao</option>
                          </select>
                        </div>
                        <div>
                          <label className="mb-1 block text-sm font-medium text-slate-700">
                            Provedor
                          </label>
                          <select
                            value={config.fiscalProvedor || "MUNICIPAL_API"}
                            onChange={(event) =>
                              setConfig((prev) => ({
                                ...prev,
                                fiscalProvedor: event.target.value as NotaFiscalProvedor,
                              }))
                            }
                            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                          >
                            <option value="MUNICIPAL_API">API municipal/estadual</option>
                            <option value="FOCUS_NFE">Focus NFe</option>
                            <option value="NFE_IO">NFe.io</option>
                            <option value="WEBMANIA">Webmania</option>
                            <option value="OUTRO">Outro</option>
                          </select>
                        </div>
                        <Input label="Endpoint fiscal" value={config.fiscalEndpointUrl || ""} onChange={(value) => setConfig((prev) => ({ ...prev, fiscalEndpointUrl: value }))} />
                        <Input label="Token fiscal" value={config.fiscalApiToken || ""} onChange={(value) => setConfig((prev) => ({ ...prev, fiscalApiToken: value }))} />
                        <Input label="Municipio IBGE" value={config.fiscalMunicipioIbge || ""} onChange={(value) => setConfig((prev) => ({ ...prev, fiscalMunicipioIbge: value }))} />
                        <Input label="Inscricao municipal" value={config.fiscalInscricaoMunicipal || ""} onChange={(value) => setConfig((prev) => ({ ...prev, fiscalInscricaoMunicipal: value }))} />
                        <Input label="CNAE" value={config.fiscalCnae || ""} onChange={(value) => setConfig((prev) => ({ ...prev, fiscalCnae: value }))} />
                        <Input label="Codigo de servico" value={config.fiscalServicoCodigo || ""} onChange={(value) => setConfig((prev) => ({ ...prev, fiscalServicoCodigo: value }))} />
                        <Input label="Aliquota ISS (%)" type="number" value={String(config.fiscalAliquotaIss || 0)} onChange={(value) => setConfig((prev) => ({ ...prev, fiscalAliquotaIss: value }))} />
                        <Input label="Descrição do serviço" value={config.fiscalDescricaoPadrao || ""} onChange={(value) => setConfig((prev) => ({ ...prev, fiscalDescricaoPadrao: value }))} />
                        <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                          <input
                            type="checkbox"
                            checked={Boolean(config.fiscalEmitirAutomaticamente)}
                            onChange={(event) =>
                              setConfig((prev) => ({
                                ...prev,
                                fiscalEmitirAutomaticamente: event.target.checked,
                              }))
                            }
                            className="h-4 w-4"
                          />
                          Emitir ao confirmar pagamento
                        </label>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-700 md:col-span-3">
                    No plano Pro, o financeiro permite envio de débitos e pagamento via PIX/manual.
                    Integracao com contas e gateways de pagamento e exclusiva do plano Premium.
                  </div>
                )}
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {saving ? "Salvando..." : "Salvar configuracao"}
                </button>
                <button
                  type="button"
                  onClick={gerarMesAtual}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <RefreshCw size={16} />
                  Gerar mes atual
                </button>
              </div>
            </form>
          ) : null}

          {(isSuperuser ? config.pixKey : data.config?.pixKey) ? (
            <div className="card-base overflow-hidden border-emerald-200">
              <div className="flex flex-col gap-4 bg-emerald-50 p-5 md:flex-row md:items-center md:justify-between">
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white">
                    <QrCode size={21} />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-slate-900">
                      PIX disponível
                    </h2>
                    <p className="mt-1 text-sm text-slate-600">
                      {isSuperuser
                        ? "Use a chave PIX da plataforma para quitar assinaturas em aberto."
                        : "Use a chave PIX da escola para quitar boletos em aberto."}
                    </p>
                    <p className="mt-3 break-all rounded-xl bg-white px-3 py-2 text-sm font-semibold text-slate-800 ring-1 ring-emerald-100">
                      {isSuperuser ? config.pixKey : data.config?.pixKey}
                    </p>
                    {(isSuperuser ? config.beneficiario : data.config?.beneficiario) ? (
                      <p className="mt-2 text-xs text-slate-500">
                        Beneficiário: {(isSuperuser ? config.beneficiario : data.config?.beneficiario) || ""}
                      </p>
                    ) : null}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={copyPixKey}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
                >
                  <Copy size={16} />
                  Copiar chave PIX
                </button>
              </div>
            </div>
          ) : null}

          <div className="card-base space-y-4 p-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  {isSuperuser
                    ? "Controle de assinaturas"
                    : canManage
                      ? "Controle de pagamentos"
                      : "Meus débitos"}
                </h2>
                <p className="text-sm text-slate-500">
                  {data.resumo.quantidade} cobranca(s) cadastrada(s).
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                {(["TODOS", "PENDENTE", "ATRASADO", "PAGO"] as const).map(
                  (status) => (
                    <button
                      key={status}
                      type="button"
                      onClick={() => setStatusFilter(status)}
                      className={`rounded-xl px-3 py-2 text-xs font-bold ${
                        statusFilter === status
                          ? "bg-slate-900 text-white"
                          : "border border-slate-300 text-slate-700"
                      }`}
                    >
                      {status}
                    </button>
                  ),
                )}
              </div>
            </div>

            {canManage && !isSuperuser ? (
              <div className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-[1fr_120px_120px_auto]">
                <select
                  value={alunoAdiantamentoId}
                  onChange={(event) => setAlunoAdiantamentoId(event.target.value)}
                  className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
                >
                  {alunos.map((aluno) => (
                    <option key={aluno.id} value={aluno.id}>
                      {aluno.name}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min={1}
                  max={12}
                  value={quantidadeMeses}
                  onChange={(event) => setQuantidadeMeses(Number(event.target.value))}
                  className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
                />
                <button
                  type="button"
                  onClick={gerarAdiantadas}
                  className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 md:col-span-2"
                >
                  Gerar pagamento adiantado
                </button>
              </div>
            ) : null}

            {canManage && isPremium && !isSuperuser ? (
              <div className="grid gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-4 md:grid-cols-[1fr_120px_120px_140px_auto]">
                <select
                  value={turmaLoteId}
                  onChange={(event) => setTurmaLoteId(event.target.value)}
                  className="rounded-xl border border-blue-200 bg-white px-3 py-2 text-sm"
                >
                  {(data.turmas || []).map((turma) => (
                    <option key={turma.id} value={turma.id}>
                      {turma.name}
                      {turma.turno ? ` - ${formatTurno(turma.turno)}` : ""}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min={1}
                  max={12}
                  value={mesLote}
                  onChange={(event) => setMesLote(Number(event.target.value))}
                  className="rounded-xl border border-blue-200 bg-white px-3 py-2 text-sm"
                  title="Mes"
                />
                <input
                  type="number"
                  min={2000}
                  max={2100}
                  value={anoLote}
                  onChange={(event) => setAnoLote(Number(event.target.value))}
                  className="rounded-xl border border-blue-200 bg-white px-3 py-2 text-sm"
                  title="Ano"
                />
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={valorLote}
                  onChange={(event) => setValorLote(event.target.value)}
                  placeholder="Valor"
                  className="rounded-xl border border-blue-200 bg-white px-3 py-2 text-sm"
                />
                <button
                  type="button"
                  onClick={updateClassChargeValues}
                  disabled={savingLote || !turmaLoteId}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                >
                  <Save size={16} />
                  {savingLote ? "Aplicando..." : "Aplicar na turma"}
                </button>
              </div>
            ) : null}

            {isSuperuser ? (
              <div className="grid gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-4 md:grid-cols-[1fr_120px_120px_140px_auto]">
                <select
                  value={planoLote}
                  onChange={(event) => setPlanoLote(event.target.value as SchoolPlan)}
                  className="rounded-xl border border-blue-200 bg-white px-3 py-2 text-sm"
                >
                  <option value="TESTE_15_DIAS">Teste de 15 dias</option>
                  <option value="BASICO">Basico</option>
                  <option value="PRO">Pro</option>
                  <option value="PREMIUM">Premium</option>
                </select>
                <input
                  type="number"
                  min={1}
                  max={12}
                  value={mesLote}
                  onChange={(event) => setMesLote(Number(event.target.value))}
                  className="rounded-xl border border-blue-200 bg-white px-3 py-2 text-sm"
                  title="Mes"
                />
                <input
                  type="number"
                  min={2000}
                  max={2100}
                  value={anoLote}
                  onChange={(event) => setAnoLote(Number(event.target.value))}
                  className="rounded-xl border border-blue-200 bg-white px-3 py-2 text-sm"
                  title="Ano"
                />
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={valorLote}
                  onChange={(event) => setValorLote(event.target.value)}
                  placeholder="Valor"
                  className="rounded-xl border border-blue-200 bg-white px-3 py-2 text-sm"
                />
                <button
                  type="button"
                  onClick={updatePlanChargeValues}
                  disabled={savingLote}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                >
                  <Save size={16} />
                  {savingLote ? "Aplicando..." : "Aplicar no plano"}
                </button>
              </div>
            ) : null}

            <div className="overflow-x-auto">
              <table className="w-full min-w-[1080px] text-left text-sm">
                <thead className="text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-3 py-3">
                      {isSuperuser ? "Escola" : "Aluno"}
                    </th>
                    <th className="px-3 py-3">
                      {isSuperuser ? "Admin" : "Responsável"}
                    </th>
                    <th className="px-3 py-3">Mes</th>
                    <th className="px-3 py-3">Valor</th>
                    <th className="px-3 py-3">Vencimento</th>
                    <th className="px-3 py-3">Status</th>
                    <th className="px-3 py-3">NFS-e</th>
                    <th className="px-3 py-3 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(isSuperuser ? cobrancasAssinatura : cobrancasEscola).map((cobranca) => {
                    const gatewayAtual = isSuperuser ? config.gateway : data.config?.gateway;
                    const pixDisponivel = isSuperuser ? Boolean(config.pixKey) : Boolean(data.config?.pixKey);
                    const mercadoPagoDisponivel =
                      isPremium && gatewayAtual === "MERCADO_PAGO";
                    const fiscalEnabled = isSuperuser
                      ? Boolean(config.fiscalEnabled)
                      : Boolean(data.config?.fiscalEnabled);

                    return (
                      <tr key={cobranca.id}>
                        <td className="px-3 py-4">
                          <p className="font-semibold text-slate-900">
                            {isSuperuser
                              ? (cobranca as AssinaturaCobranca).school.name
                              : (cobranca as Cobranca).aluno.name}
                          </p>
                          <p className="text-xs text-slate-500">
                            {isSuperuser
                              ? `Plano ${(cobranca as AssinaturaCobranca).school.plan}`
                              : (cobranca as Cobranca).aluno.turma?.name || "Sem turma"}
                          </p>
                        </td>
                        <td className="px-3 py-4 text-slate-600">
                          {isSuperuser
                            ? (cobranca as AssinaturaCobranca).school.users?.[0]?.name || "Não informado"
                            : (cobranca as Cobranca).responsavel?.name || "Não informado"}
                        </td>
                        <td className="px-3 py-4">
                          {String(cobranca.mes).padStart(2, "0")}/{cobranca.ano}
                        </td>
                        <td className="px-3 py-4 font-semibold">
                          {canManage && cobranca.status !== "PAGO" ? (
                            <div className="flex items-center gap-2">
                              <input
                                type="number"
                                min={0}
                                step="0.01"
                                value={valoresCobranca[cobranca.id] || String(cobranca.valor || 0)}
                                onChange={(event) =>
                                  setValoresCobranca((prev) => ({
                                    ...prev,
                                    [cobranca.id]: event.target.value,
                                  }))
                                }
                                className="w-28 rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-900 outline-none focus:border-slate-500"
                              />
                              <button
                                type="button"
                                onClick={() => updateChargeValue(cobranca.id)}
                                disabled={savingValorId === cobranca.id}
                                title="Salvar valor"
                                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                              >
                                <Save size={14} />
                              </button>
                            </div>
                          ) : (
                            money(cobranca.valor)
                          )}
                        </td>
                        <td className="px-3 py-4">{date(cobranca.vencimento)}</td>
                        <td className="px-3 py-4">
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-bold ring-1 ${statusClass(
                              cobranca.status,
                            )}`}
                          >
                            {cobranca.status}
                          </span>
                        </td>
                        <td className="px-3 py-4">
                          <div className="space-y-1">
                            <span
                              className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold ring-1 ${notaFiscalClass(
                                cobranca.notaFiscal?.status,
                              )}`}
                            >
                              <FileText size={12} />
                              {cobranca.notaFiscal?.status || "NAO_EMITIDA"}
                            </span>
                            {cobranca.notaFiscal?.numero ? (
                              <p className="text-xs text-slate-500">
                                No. {cobranca.notaFiscal.numero}
                              </p>
                            ) : null}
                            {cobranca.notaFiscal?.mensagem ? (
                              <p className="max-w-48 truncate text-xs text-slate-500">
                                {cobranca.notaFiscal.mensagem}
                              </p>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-3 py-4">
                          <div className="flex justify-end gap-2">
                            {mercadoPagoDisponivel && cobranca.status !== "PAGO" ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => openMercadoPago(cobranca.id)}
                                  className="inline-flex items-center gap-1 rounded-xl bg-blue-600 px-3 py-2 text-xs font-bold text-white hover:bg-blue-700"
                                >
                                  <CreditCard size={14} />
                                  {isResponsavel ? "Pagar no Mercado Pago" : "Mercado Pago"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => syncMercadoPago(cobranca.id)}
                                  title="Atualizar Mercado Pago"
                                  className="inline-flex items-center gap-1 rounded-xl border border-blue-200 px-3 py-2 text-xs font-bold text-blue-700 hover:bg-blue-50"
                                >
                                  <RefreshCw size={14} />
                                  {isResponsavel ? "Atualizar pagamento" : "Atualizar"}
                                </button>
                              </>
                            ) : null}
                            {canManage && fiscalEnabled && cobranca.status === "PAGO" ? (
                              <>
                                {cobranca.notaFiscal?.status === "EMITIDA" ? (
                                  <>
                                    {cobranca.notaFiscal.linkPdf ? (
                                      <a
                                        href={cobranca.notaFiscal.linkPdf}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
                                      >
                                        <FileText size={14} />
                                        PDF
                                      </a>
                                    ) : null}
                                    <button
                                      type="button"
                                      onClick={() => fiscalAction(cobranca.id, "sincronizar")}
                                      title="Sincronizar NFS-e"
                                      className="inline-flex items-center gap-1 rounded-xl border border-blue-200 px-3 py-2 text-xs font-bold text-blue-700 hover:bg-blue-50"
                                    >
                                      <RefreshCw size={14} />
                                      NFS-e
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => fiscalAction(cobranca.id, "cancelar")}
                                      title="Cancelar NFS-e"
                                      className="inline-flex items-center gap-1 rounded-xl border border-red-200 px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-50"
                                    >
                                      <XCircle size={14} />
                                      NFS-e
                                    </button>
                                  </>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => fiscalAction(cobranca.id, "emitir")}
                                    className="inline-flex items-center gap-1 rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold text-white hover:bg-slate-800"
                                  >
                                    <Send size={14} />
                                    Emitir NFS-e
                                  </button>
                                )}
                              </>
                            ) : null}
                            {canManage && cobranca.status !== "PAGO" ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => markPaid(cobranca.id, "PIX")}
                                  className="inline-flex items-center gap-1 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700"
                                >
                                  <QrCode size={14} />
                                  PIX pago
                                </button>
                                <button
                                  type="button"
                                  onClick={() => markPaid(cobranca.id)}
                                  className="inline-flex items-center gap-1 rounded-xl border border-emerald-200 px-3 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-50"
                                >
                                  <CheckCircle2 size={14} />
                                  Pago
                                </button>
                              </>
                            ) : null}
                            {canManage && cobranca.status === "PAGO" ? (
                              <button
                                type="button"
                                onClick={() => cancelPayment(cobranca.id)}
                                title="Cancelar pagamento"
                                className="inline-flex items-center gap-1 rounded-xl border border-red-200 px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-50"
                              >
                                <RotateCcw size={14} />
                                Cancelar pagamento
                              </button>
                            ) : null}
                            {!canManage && cobranca.status !== "PAGO" && pixDisponivel ? (
                              <button
                                type="button"
                                onClick={copyPixKey}
                                className="inline-flex items-center gap-1 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700"
                              >
                                <QrCode size={14} />
                                {isResponsavel ? "Copiar chave PIX" : "PIX"}
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {(isSuperuser ? cobrancasAssinatura : cobrancasEscola).length === 0 ? (
              <div className="rounded-xl bg-slate-50 p-6 text-center text-sm text-slate-500">
                Nenhuma cobranca encontrada para o filtro atual.
              </div>
            ) : null}
          </div>
        </>
      ) : null}
    </section>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Wallet;
  label: string;
  value: string;
}) {
  return (
    <div className="card-base p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-500">{label}</p>
          <p className="mt-2 text-xl font-bold text-slate-900">{value}</p>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
          <Icon size={19} />
        </div>
      </div>
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-slate-700">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
      />
    </div>
  );
}


