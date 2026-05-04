-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'FINANCEIRO';

-- CreateEnum
CREATE TYPE "FinanceiroCobrancaStatus" AS ENUM ('PENDENTE', 'PAGO', 'ATRASADO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "FinanceiroGateway" AS ENUM ('MERCADO_PAGO', 'PAYPAL', 'OUTRO');

-- CreateTable
CREATE TABLE "financeiro_configuracoes" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "beneficiario" TEXT,
    "documento" TEXT,
    "banco" TEXT,
    "agencia" TEXT,
    "conta" TEXT,
    "pixKey" TEXT,
    "mensalidadePadrao" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "vencimentoDia" INTEGER NOT NULL DEFAULT 10,
    "gateway" "FinanceiroGateway",
    "gatewayPublicKey" TEXT,
    "gatewayAccessToken" TEXT,
    "webhookUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "financeiro_configuracoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financeiro_cobrancas" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "alunoId" TEXT NOT NULL,
    "responsavelId" TEXT,
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

    CONSTRAINT "financeiro_cobrancas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "financeiro_configuracoes_schoolId_key" ON "financeiro_configuracoes"("schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "financeiro_cobrancas_alunoId_mes_ano_key" ON "financeiro_cobrancas"("alunoId", "mes", "ano");

-- CreateIndex
CREATE INDEX "financeiro_cobrancas_schoolId_ano_mes_idx" ON "financeiro_cobrancas"("schoolId", "ano", "mes");

-- CreateIndex
CREATE INDEX "financeiro_cobrancas_responsavelId_idx" ON "financeiro_cobrancas"("responsavelId");

-- AddForeignKey
ALTER TABLE "financeiro_configuracoes" ADD CONSTRAINT "financeiro_configuracoes_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financeiro_cobrancas" ADD CONSTRAINT "financeiro_cobrancas_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financeiro_cobrancas" ADD CONSTRAINT "financeiro_cobrancas_alunoId_fkey" FOREIGN KEY ("alunoId") REFERENCES "Aluno"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financeiro_cobrancas" ADD CONSTRAINT "financeiro_cobrancas_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
