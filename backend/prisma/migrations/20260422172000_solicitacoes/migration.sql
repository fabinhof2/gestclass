CREATE TYPE "SolicitacaoTipo" AS ENUM (
  'DECLARACAO',
  'TRANSFERENCIA',
  'HISTORICO_ESCOLAR',
  'COMPROVANTE',
  'INFORMACOES',
  'GUIA_PAGAMENTO',
  'OUTROS'
);

CREATE TYPE "SolicitacaoStatus" AS ENUM (
  'ENVIADA',
  'RECEBIDA',
  'RESPONDIDA'
);

CREATE TABLE "solicitacoes" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "alunoId" TEXT NOT NULL,
  "solicitanteId" TEXT NOT NULL,
  "recebidoPorId" TEXT,
  "respondidoPorId" TEXT,
  "tipo" "SolicitacaoTipo" NOT NULL,
  "especificacao" TEXT,
  "descricao" TEXT NOT NULL,
  "status" "SolicitacaoStatus" NOT NULL DEFAULT 'ENVIADA',
  "resposta" TEXT,
  "anexoUrl" TEXT,
  "anexoNome" TEXT,
  "anexoMime" TEXT,
  "receivedAt" TIMESTAMP(3),
  "respondedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "solicitacoes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "solicitacoes_schoolId_status_createdAt_idx" ON "solicitacoes"("schoolId", "status", "createdAt");
CREATE INDEX "solicitacoes_alunoId_idx" ON "solicitacoes"("alunoId");
CREATE INDEX "solicitacoes_solicitanteId_idx" ON "solicitacoes"("solicitanteId");

ALTER TABLE "solicitacoes" ADD CONSTRAINT "solicitacoes_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "solicitacoes" ADD CONSTRAINT "solicitacoes_alunoId_fkey" FOREIGN KEY ("alunoId") REFERENCES "Aluno"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "solicitacoes" ADD CONSTRAINT "solicitacoes_solicitanteId_fkey" FOREIGN KEY ("solicitanteId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "solicitacoes" ADD CONSTRAINT "solicitacoes_recebidoPorId_fkey" FOREIGN KEY ("recebidoPorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "solicitacoes" ADD CONSTRAINT "solicitacoes_respondidoPorId_fkey" FOREIGN KEY ("respondidoPorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
