-- CreateEnum
CREATE TYPE "AlunoDocumentoTipo" AS ENUM ('IDENTIDADE', 'CERTIDAO_NASCIMENTO', 'COMPROVANTE_RESIDENCIA', 'DECLARACAO', 'HISTORICO_ESCOLAR');

-- CreateTable
CREATE TABLE "aluno_documentos" (
    "id" TEXT NOT NULL,
    "alunoId" TEXT NOT NULL,
    "tipo" "AlunoDocumentoTipo" NOT NULL,
    "nomeOriginal" TEXT NOT NULL,
    "arquivoUrl" TEXT NOT NULL,
    "mimeType" TEXT,
    "observacao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "aluno_documentos_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "aluno_documentos" ADD CONSTRAINT "aluno_documentos_alunoId_fkey" FOREIGN KEY ("alunoId") REFERENCES "Aluno"("id") ON DELETE CASCADE ON UPDATE CASCADE;
