CREATE TABLE "financeiro_assinatura_configuracoes" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL DEFAULT 'default',
    "beneficiario" TEXT,
    "documento" TEXT,
    "banco" TEXT,
    "agencia" TEXT,
    "conta" TEXT,
    "pixKey" TEXT,
    "valorTeste15Dias" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "valorBasico" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "valorPro" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "valorPremium" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "vencimentoDia" INTEGER NOT NULL DEFAULT 10,
    "gateway" "FinanceiroGateway",
    "gatewayPublicKey" TEXT,
    "gatewayAccessToken" TEXT,
    "webhookUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "financeiro_assinatura_configuracoes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "financeiro_assinatura_cobrancas" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "mes" INTEGER NOT NULL,
    "ano" INTEGER NOT NULL,
    "descricao" TEXT NOT NULL,
    "valor" DECIMAL(10,2) NOT NULL,
    "vencimento" TIMESTAMP(3) NOT NULL,
    "status" "FinanceiroCobrancaStatus" NOT NULL DEFAULT 'PENDENTE',
    "pagoEm" TIMESTAMP(3),
    "formaPagamento" TEXT,
    "gateway" "FinanceiroGateway",
    "gatewayPaymentId" TEXT,
    "boletoNossoNumero" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "financeiro_assinatura_cobrancas_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "financeiro_assinatura_configuracoes_slug_key" ON "financeiro_assinatura_configuracoes"("slug");
CREATE UNIQUE INDEX "financeiro_assinatura_cobrancas_schoolId_mes_ano_key" ON "financeiro_assinatura_cobrancas"("schoolId", "mes", "ano");
CREATE INDEX "financeiro_assinatura_cobrancas_ano_mes_idx" ON "financeiro_assinatura_cobrancas"("ano", "mes");
CREATE INDEX "financeiro_assinatura_cobrancas_schoolId_ano_mes_idx" ON "financeiro_assinatura_cobrancas"("schoolId", "ano", "mes");

ALTER TABLE "financeiro_assinatura_cobrancas"
ADD CONSTRAINT "financeiro_assinatura_cobrancas_schoolId_fkey"
FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
