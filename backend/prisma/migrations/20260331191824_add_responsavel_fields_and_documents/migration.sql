-- CreateEnum
CREATE TYPE "ResponsavelDocumentoTipo" AS ENUM ('IDENTIDADE', 'CPF', 'COMPROVANTE_RESIDENCIA', 'CONTRATO_PRESTACAO_SERVICO');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "cpf" TEXT,
ADD COLUMN     "identidade" TEXT;

-- CreateTable
CREATE TABLE "responsavel_documentos" (
    "id" TEXT NOT NULL,
    "responsavelId" TEXT NOT NULL,
    "tipo" "ResponsavelDocumentoTipo" NOT NULL,
    "nomeOriginal" TEXT NOT NULL,
    "arquivoUrl" TEXT NOT NULL,
    "mimeType" TEXT,
    "observacao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "responsavel_documentos_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "responsavel_documentos" ADD CONSTRAINT "responsavel_documentos_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
