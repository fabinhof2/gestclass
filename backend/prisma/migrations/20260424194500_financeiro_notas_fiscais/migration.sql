-- CreateEnum
CREATE TYPE "FinanceiroNotaFiscalTipo" AS ENUM ('ESCOLAR', 'ASSINATURA');

-- CreateEnum
CREATE TYPE "FinanceiroNotaFiscalStatus" AS ENUM ('NAO_EMITIDA', 'EM_PROCESSAMENTO', 'EMITIDA', 'REJEITADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "FinanceiroNotaFiscalAmbiente" AS ENUM ('HOMOLOGACAO', 'PRODUCAO');

-- CreateEnum
CREATE TYPE "FinanceiroNotaFiscalProvedor" AS ENUM ('MUNICIPAL_API', 'FOCUS_NFE', 'NFE_IO', 'WEBMANIA', 'OUTRO');

-- AlterTable
ALTER TABLE "financeiro_configuracoes"
ADD COLUMN "fiscalEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "fiscalAmbiente" "FinanceiroNotaFiscalAmbiente" NOT NULL DEFAULT 'HOMOLOGACAO',
ADD COLUMN "fiscalProvedor" "FinanceiroNotaFiscalProvedor" NOT NULL DEFAULT 'MUNICIPAL_API',
ADD COLUMN "fiscalEndpointUrl" TEXT,
ADD COLUMN "fiscalApiToken" TEXT,
ADD COLUMN "fiscalMunicipioIbge" TEXT,
ADD COLUMN "fiscalInscricaoMunicipal" TEXT,
ADD COLUMN "fiscalCnae" TEXT,
ADD COLUMN "fiscalServicoCodigo" TEXT,
ADD COLUMN "fiscalAliquotaIss" DECIMAL(5,2) NOT NULL DEFAULT 0,
ADD COLUMN "fiscalDescricaoPadrao" TEXT,
ADD COLUMN "fiscalEmitirAutomaticamente" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "financeiro_assinatura_configuracoes"
ADD COLUMN "fiscalEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "fiscalAmbiente" "FinanceiroNotaFiscalAmbiente" NOT NULL DEFAULT 'HOMOLOGACAO',
ADD COLUMN "fiscalProvedor" "FinanceiroNotaFiscalProvedor" NOT NULL DEFAULT 'MUNICIPAL_API',
ADD COLUMN "fiscalEndpointUrl" TEXT,
ADD COLUMN "fiscalApiToken" TEXT,
ADD COLUMN "fiscalMunicipioIbge" TEXT,
ADD COLUMN "fiscalInscricaoMunicipal" TEXT,
ADD COLUMN "fiscalCnae" TEXT,
ADD COLUMN "fiscalServicoCodigo" TEXT,
ADD COLUMN "fiscalAliquotaIss" DECIMAL(5,2) NOT NULL DEFAULT 0,
ADD COLUMN "fiscalDescricaoPadrao" TEXT,
ADD COLUMN "fiscalEmitirAutomaticamente" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "financeiro_notas_fiscais" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT,
  "cobrancaId" TEXT,
  "assinaturaCobrancaId" TEXT,
  "tipo" "FinanceiroNotaFiscalTipo" NOT NULL,
  "status" "FinanceiroNotaFiscalStatus" NOT NULL DEFAULT 'NAO_EMITIDA',
  "ambiente" "FinanceiroNotaFiscalAmbiente" NOT NULL DEFAULT 'HOMOLOGACAO',
  "provedor" "FinanceiroNotaFiscalProvedor" NOT NULL DEFAULT 'MUNICIPAL_API',
  "numero" TEXT,
  "codigoVerificacao" TEXT,
  "chave" TEXT,
  "linkPdf" TEXT,
  "linkXml" TEXT,
  "externalId" TEXT,
  "protocolo" TEXT,
  "mensagem" TEXT,
  "payloadJson" TEXT,
  "respostaJson" TEXT,
  "emitidaEm" TIMESTAMP(3),
  "canceladaEm" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "financeiro_notas_fiscais_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "financeiro_notas_fiscais_cobrancaId_key" ON "financeiro_notas_fiscais"("cobrancaId");

-- CreateIndex
CREATE UNIQUE INDEX "financeiro_notas_fiscais_assinaturaCobrancaId_key" ON "financeiro_notas_fiscais"("assinaturaCobrancaId");

-- CreateIndex
CREATE INDEX "financeiro_notas_fiscais_schoolId_status_createdAt_idx" ON "financeiro_notas_fiscais"("schoolId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "financeiro_notas_fiscais_tipo_status_createdAt_idx" ON "financeiro_notas_fiscais"("tipo", "status", "createdAt");

-- AddForeignKey
ALTER TABLE "financeiro_notas_fiscais" ADD CONSTRAINT "financeiro_notas_fiscais_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financeiro_notas_fiscais" ADD CONSTRAINT "financeiro_notas_fiscais_cobrancaId_fkey" FOREIGN KEY ("cobrancaId") REFERENCES "financeiro_cobrancas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financeiro_notas_fiscais" ADD CONSTRAINT "financeiro_notas_fiscais_assinaturaCobrancaId_fkey" FOREIGN KEY ("assinaturaCobrancaId") REFERENCES "financeiro_assinatura_cobrancas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
