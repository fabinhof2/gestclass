-- CreateEnum
CREATE TYPE "ForumEnqueteModoEscolha" AS ENUM ('UNICA', 'MULTIPLA');

-- CreateEnum
CREATE TYPE "ForumEnqueteVisibilidadeResultado" AS ENUM ('IMEDIATO', 'APOS_VOTO', 'APOS_CONCLUIR');

-- AlterTable
ALTER TABLE "forum_enquetes"
ADD COLUMN "modoEscolha" "ForumEnqueteModoEscolha" NOT NULL DEFAULT 'UNICA',
ADD COLUMN "visibilidadeResultado" "ForumEnqueteVisibilidadeResultado" NOT NULL DEFAULT 'IMEDIATO',
ADD COLUMN "concluidaEm" TIMESTAMP(3);

-- DropIndex
DROP INDEX "forum_enquete_votos_enqueteId_userId_key";

-- CreateIndex
CREATE UNIQUE INDEX "forum_enquete_votos_enqueteId_userId_opcaoId_key" ON "forum_enquete_votos"("enqueteId", "userId", "opcaoId");

-- CreateIndex
CREATE INDEX "forum_enquete_votos_enqueteId_userId_idx" ON "forum_enquete_votos"("enqueteId", "userId");
