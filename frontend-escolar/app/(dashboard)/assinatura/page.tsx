"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Copy,
  CreditCard,
  QrCode,
  RefreshCw,
  Wallet,
  CheckCircle2,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import ProtectedRoute from "@/components/auth/protected-route";
import PageHeader from "@/components/ui/page-header";
import { useAuth } from "@/context/auth-context";
import { apiUrl } from "@/lib/api";

type StatusCobranca = "PENDENTE" | "PAGO" | "ATRASADO" | "CANCELADO";
type Gateway = "MERCADO_PAGO" | "PAYPAL" | "OUTRO";
type SchoolPlan = "TESTE_15_DIAS" | "BASICO" | "PRO" | "PREMIUM";

type AssinaturaConfig = {
  beneficiario?: string | null;
  documento?: string | null;
  banco?: string | null;
  agencia?: string | null;
  conta?: string | null;
  pixKey?: string | null;
  gateway?: Gateway | null;
  pixDisponivel?: boolean;
  mercadoPagoDisponivel?: boolean;
  valorTeste15Dias?: string | number;
  valorBasico?: string | number;
  valorPro: string | number;
  valorPremium?: string | number;
  vencimentoDia?: number;
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

type AssinaturaResponse = {
  modo: "ASSINATURA_ADMIN";
  school: {
    id: string;
    name: string;
    plan: SchoolPlan;
    status: string;
  };
  assinaturaConfig: AssinaturaConfig | null;
  resumo: {
    total: number;
    recebido: number;
    emAberto: number;
    atrasado: number;
    quantidade: number;
    pagos: number;
    atrasados: number;
  };
  cobrancasAssinatura: AssinaturaCobranca[];
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

function statusClass(status: StatusCobranca) {
  const map: Record<StatusCobranca, string> = {
    PAGO: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    PENDENTE: "bg-blue-50 text-blue-700 ring-blue-200",
    ATRASADO: "bg-red-50 text-red-700 ring-red-200",
    CANCELADO: "bg-slate-100 text-slate-600 ring-slate-200",
  };

  return map[status];
}

export default function AssinaturaPage() {
  const { token, user } = useAuth();
  const searchParams = useSearchParams();
  const [data, setData] = useState<AssinaturaResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [syncingId, setSyncingId] = useState("");

  const mpStatus = searchParams.get("mp_status");
  const isAdmin = user?.role === "ADMIN_ESCOLA";

  useEffect(() => {
    if (!mpStatus) return;

    if (mpStatus === "success") {
      setMessage("Pagamento iniciado com sucesso. Atualize o status para confirmar o retorno do gateway.");
      return;
    }

    if (mpStatus === "pending") {
      setMessage("Pagamento pendente no gateway. Atualize o status em alguns instantes.");
      return;
    }

    if (mpStatus === "failure") {
      setError("O gateway informou falha no pagamento. Tente novamente ou use outra forma.");
    }
  }, [mpStatus]);

  async function loadAssinatura() {
    if (!token || !isAdmin) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError("");
      const response = await fetch(apiUrl("/financeiro/assinatura"), {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(payload?.message || "Não foi possível carregar a assinatura.");
      }

      setData(payload);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Não foi possível carregar a assinatura.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAssinatura();
  }, [token, user?.role]);

  const cobrancas = useMemo(() => data?.cobrancasAssinatura || [], [data]);
  const gateway = data?.assinaturaConfig?.gateway || null;
  const pixKey = data?.assinaturaConfig?.pixKey || "";
  const hasPix = Boolean(data?.assinaturaConfig?.pixDisponivel || pixKey);
  const hasMercadoPago = Boolean(
    data?.assinaturaConfig?.mercadoPagoDisponivel || gateway === "MERCADO_PAGO",
  );
  const hasPaymentMethod = hasPix || hasMercadoPago;

  async function copyPixKey() {
    if (!pixKey) return;

    try {
      await navigator.clipboard.writeText(String(pixKey));
      setMessage("Chave PIX copiada.");
      setError("");
    } catch {
      setError("Não foi possível copiar a chave PIX.");
    }
  }

  async function openMercadoPago(cobrancaId: string) {
    if (!token) return;

    const checkoutWindow = window.open("about:blank", "_blank");

    if (!checkoutWindow) {
      setError("O navegador bloqueou a aba do Mercado Pago. Libere pop-ups para este site.");
      return;
    }

    checkoutWindow.opener = null;

    setError("");
    setMessage("");
    const response = await fetch(
      apiUrl(`/financeiro/assinatura/cobrancas/${cobrancaId}/mercado-pago/preferencia`),
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    );
    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      checkoutWindow.close();
      setError(payload?.message || "Não foi possível abrir o Mercado Pago.");
      return;
    }

    const checkoutUrl = payload?.sandbox_init_point || payload?.init_point;

    if (!checkoutUrl) {
      checkoutWindow.close();
      setError("O gateway não retornou um link de pagamento.");
      return;
    }

    checkoutWindow.location.href = checkoutUrl;
    setMessage("Checkout do Mercado Pago aberto em nova aba.");
    await loadAssinatura();
  }

  async function syncMercadoPago(cobrancaId: string) {
    if (!token) return;

    try {
      setSyncingId(cobrancaId);
      setError("");
      setMessage("");
      const response = await fetch(
        apiUrl(`/financeiro/assinatura/cobrancas/${cobrancaId}/mercado-pago/sincronizar`),
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(payload?.message || "Não foi possível atualizar a cobranca.");
      }

      setMessage(
        payload?.status === "PAGO"
          ? "Pagamento confirmado pelo Mercado Pago."
          : "Status consultado no Mercado Pago.",
      );
      await loadAssinatura();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Não foi possível atualizar a cobranca.",
      );
    } finally {
      setSyncingId("");
    }
  }

  if (!isAdmin) {
    return (
      <section className="space-y-6">
        <PageHeader
          title="Assinatura"
          description="Acesso restrito ao administrador da escola."
        />
        <div className="card-base p-6 text-sm text-slate-600">
          Seu perfil não tem acesso a esta guia.
        </div>
      </section>
    );
  }

  return (
    <ProtectedRoute allowedRoles={["ADMIN_ESCOLA"]}>
      <section className="space-y-6">
      <PageHeader
        title="Assinatura"
        description="Área do administrador para receber e pagar os débitos de assinatura enviados pelo superusuário."
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
          Carregando assinatura...
        </div>
      ) : null}

      {!loading && data ? (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <MetricCard icon={Wallet} label="Total" value={money(data.resumo.total)} />
            <MetricCard
              icon={CheckCircle2}
              label="Recebido"
              value={money(data.resumo.recebido)}
            />
            <MetricCard
              icon={CreditCard}
              label="Em aberto"
              value={money(data.resumo.emAberto)}
            />
            <MetricCard
              icon={RefreshCw}
              label="Atrasado"
              value={money(data.resumo.atrasado)}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
            <div className="card-base p-5">
              <h2 className="text-base font-bold text-slate-900">Resumo da escola</h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <InfoItem label="Escola" value={data.school.name} />
                <InfoItem label="Plano" value={data.school.plan} />
                <InfoItem label="Status" value={data.school.status} />
                <InfoItem
                  label="Cobranças"
                  value={`${data.resumo.quantidade} registro(s)`}
                />
              </div>
            </div>

            <div className="card-base p-5">
              <h2 className="text-base font-bold text-slate-900">
                Pagamento da assinatura da plataforma
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                As opções abaixo são definidas pelo superusuário no financeiro global.
              </p>
              <div className="mt-4 space-y-3 text-sm text-slate-600">
                <InfoItem
                  label="Beneficiário"
                  value={data.assinaturaConfig?.beneficiario || "Não configurado"}
                />
                <InfoItem
                  label="Gateway"
                  value={data.assinaturaConfig?.gateway || "Não configurado"}
                />
                <InfoItem
                  label="PIX"
                  value={data.assinaturaConfig?.pixKey || "Não configurado"}
                />
              </div>

              {!hasPaymentMethod ? (
                <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                  Nenhuma forma de pagamento foi configurada pelo superusuário.
                </div>
              ) : null}

              {pixKey ? (
                <button
                  type="button"
                  onClick={copyPixKey}
                  className="mt-4 inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
                >
                  <Copy size={16} />
                  Copiar chave PIX
                </button>
              ) : null}
            </div>
          </div>

          <div className="card-base space-y-4 p-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Débitos de assinatura
                </h2>
                <p className="text-sm text-slate-500">
                  Aqui chegam os valores enviados pelo superusuário para o admin desta escola.
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[920px] text-left text-sm">
                <thead className="text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-3 py-3">Descrição</th>
                    <th className="px-3 py-3">Competência</th>
                    <th className="px-3 py-3">Valor</th>
                    <th className="px-3 py-3">Vencimento</th>
                    <th className="px-3 py-3">Status</th>
                    <th className="px-3 py-3 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {cobrancas.map((cobranca) => (
                    <tr key={cobranca.id}>
                      <td className="px-3 py-4">
                        <p className="font-semibold text-slate-900">
                          {cobranca.descricao}
                        </p>
                        <p className="text-xs text-slate-500">
                          Enviado pelo superusuário · Plano {cobranca.school.plan}
                        </p>
                      </td>
                      <td className="px-3 py-4">
                        {String(cobranca.mes).padStart(2, "0")}/{cobranca.ano}
                      </td>
                      <td className="px-3 py-4 font-semibold">
                        {money(cobranca.valor)}
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
                        <div className="flex justify-end gap-2">
                          {hasMercadoPago && cobranca.status !== "PAGO" ? (
                            <>
                              <button
                                type="button"
                                onClick={() => openMercadoPago(cobranca.id)}
                                className="inline-flex items-center gap-1 rounded-xl bg-blue-600 px-3 py-2 text-xs font-bold text-white hover:bg-blue-700"
                              >
                                <CreditCard size={14} />
                                Mercado Pago
                              </button>
                              <button
                                type="button"
                                onClick={() => syncMercadoPago(cobranca.id)}
                                disabled={syncingId === cobranca.id}
                                className="inline-flex items-center gap-1 rounded-xl border border-blue-200 px-3 py-2 text-xs font-bold text-blue-700 hover:bg-blue-50 disabled:opacity-60"
                              >
                                <RefreshCw size={14} />
                                {syncingId === cobranca.id ? "Atualizando..." : "Atualizar"}
                              </button>
                            </>
                          ) : null}

                          {hasPix && cobranca.status !== "PAGO" ? (
                            <button
                              type="button"
                              onClick={copyPixKey}
                              className="inline-flex items-center gap-1 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700"
                            >
                              <QrCode size={14} />
                              PIX
                            </button>
                          ) : null}

                          {!hasPaymentMethod && cobranca.status !== "PAGO" ? (
                            <span className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-500">
                              Sem forma de pagamento
                            </span>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {cobrancas.length === 0 ? (
              <div className="rounded-xl bg-slate-50 p-6 text-center text-sm text-slate-500">
                Nenhum debito de assinatura foi gerado para esta escola ate agora.
              </div>
            ) : null}
          </div>
        </>
      ) : null}
      </section>
    </ProtectedRoute>
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

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <p className="mt-1 text-sm font-medium text-slate-700">{value}</p>
    </div>
  );
}
