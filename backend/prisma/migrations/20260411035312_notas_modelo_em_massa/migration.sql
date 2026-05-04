/*
  Warnings:

  - You are about to drop the column `tipoAtividade` on the `avaliacao_itens` table. All the data in the column will be lost.
  - You are about to drop the column `tipoComposicao` on the `avaliacao_itens` table. All the data in the column will be lost.
  - You are about to drop the column `titulo` on the `avaliacao_itens` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[atividadeModeloId,alunoId]` on the table `avaliacao_itens` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `atividadeModeloId` to the `avaliacao_itens` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "avaliacao_itens" DROP COLUMN "tipoAtividade",
DROP COLUMN "tipoComposicao",
DROP COLUMN "titulo",
ADD COLUMN     "atividadeModeloId" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "atividade_avaliacao_modelos" (
    "id" TEXT NOT NULL,
    "turmaProfessorId" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "professorId" TEXT NOT NULL,
    "periodo" "PeriodoAvaliacao" NOT NULL,
    "tipoComposicao" "TipoComposicaoNota" NOT NULL,
    "tipoAtividade" "TipoAtividadeNota" NOT NULL,
    "titulo" TEXT NOT NULL,
    "valorMaximo" DECIMAL(5,2) NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 1,
    "enviadoBoletim" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "atividade_avaliacao_modelos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "atividade_avaliacao_modelos_schoolId_periodo_idx" ON "atividade_avaliacao_modelos"("schoolId", "periodo");

-- CreateIndex
CREATE INDEX "atividade_avaliacao_modelos_professorId_idx" ON "atividade_avaliacao_modelos"("professorId");

-- CreateIndex
CREATE INDEX "atividade_avaliacao_modelos_turmaProfessorId_periodo_idx" ON "atividade_avaliacao_modelos"("turmaProfessorId", "periodo");

-- CreateIndex
CREATE INDEX "avaliacao_itens_atividadeModeloId_idx" ON "avaliacao_itens"("atividadeModeloId");

-- CreateIndex
CREATE UNIQUE INDEX "avaliacao_itens_atividadeModeloId_alunoId_key" ON "avaliacao_itens"("atividadeModeloId", "alunoId");

-- AddForeignKey
ALTER TABLE "atividade_avaliacao_modelos" ADD CONSTRAINT "atividade_avaliacao_modelos_turmaProfessorId_fkey" FOREIGN KEY ("turmaProfessorId") REFERENCES "TurmaProfessor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "atividade_avaliacao_modelos" ADD CONSTRAINT "atividade_avaliacao_modelos_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "atividade_avaliacao_modelos" ADD CONSTRAINT "atividade_avaliacao_modelos_professorId_fkey" FOREIGN KEY ("professorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "avaliacao_itens" ADD CONSTRAINT "avaliacao_itens_atividadeModeloId_fkey" FOREIGN KEY ("atividadeModeloId") REFERENCES "atividade_avaliacao_modelos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
