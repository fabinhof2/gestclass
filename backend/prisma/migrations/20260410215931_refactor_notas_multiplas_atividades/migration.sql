/*
  Warnings:

  - You are about to drop the `notas` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "TipoComposicaoNota" AS ENUM ('MEDIA_ARITMETICA', 'SOMATORIO');

-- CreateEnum
CREATE TYPE "TipoAtividadeNota" AS ENUM ('TESTE', 'PROVA', 'TRABALHO', 'ATIVIDADE', 'PARTICIPACAO', 'OUTRO');

-- DropForeignKey
ALTER TABLE "notas" DROP CONSTRAINT "notas_alunoId_fkey";

-- DropForeignKey
ALTER TABLE "notas" DROP CONSTRAINT "notas_professorId_fkey";

-- DropForeignKey
ALTER TABLE "notas" DROP CONSTRAINT "notas_schoolId_fkey";

-- DropForeignKey
ALTER TABLE "notas" DROP CONSTRAINT "notas_turmaProfessorId_fkey";

-- DropTable
DROP TABLE "notas";

-- CreateTable
CREATE TABLE "avaliacao_itens" (
    "id" TEXT NOT NULL,
    "alunoId" TEXT NOT NULL,
    "turmaProfessorId" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "professorId" TEXT NOT NULL,
    "periodo" "PeriodoAvaliacao" NOT NULL,
    "tipoComposicao" "TipoComposicaoNota" NOT NULL,
    "tipoAtividade" "TipoAtividadeNota" NOT NULL,
    "titulo" TEXT NOT NULL,
    "nota" DECIMAL(5,2) NOT NULL,
    "observacao" TEXT,
    "enviadoBoletim" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "avaliacao_itens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notas_boletim" (
    "id" TEXT NOT NULL,
    "alunoId" TEXT NOT NULL,
    "turmaProfessorId" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "professorId" TEXT NOT NULL,
    "periodo" "PeriodoAvaliacao" NOT NULL,
    "tipoComposicao" "TipoComposicaoNota" NOT NULL,
    "notaFinal" DECIMAL(5,2) NOT NULL,
    "enviadoBoletim" BOOLEAN NOT NULL DEFAULT false,
    "observacao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notas_boletim_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "avaliacao_itens_schoolId_periodo_idx" ON "avaliacao_itens"("schoolId", "periodo");

-- CreateIndex
CREATE INDEX "avaliacao_itens_professorId_idx" ON "avaliacao_itens"("professorId");

-- CreateIndex
CREATE INDEX "avaliacao_itens_alunoId_turmaProfessorId_periodo_idx" ON "avaliacao_itens"("alunoId", "turmaProfessorId", "periodo");

-- CreateIndex
CREATE INDEX "notas_boletim_schoolId_periodo_idx" ON "notas_boletim"("schoolId", "periodo");

-- CreateIndex
CREATE INDEX "notas_boletim_professorId_idx" ON "notas_boletim"("professorId");

-- CreateIndex
CREATE UNIQUE INDEX "notas_boletim_alunoId_turmaProfessorId_periodo_key" ON "notas_boletim"("alunoId", "turmaProfessorId", "periodo");

-- AddForeignKey
ALTER TABLE "avaliacao_itens" ADD CONSTRAINT "avaliacao_itens_alunoId_fkey" FOREIGN KEY ("alunoId") REFERENCES "Aluno"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "avaliacao_itens" ADD CONSTRAINT "avaliacao_itens_turmaProfessorId_fkey" FOREIGN KEY ("turmaProfessorId") REFERENCES "TurmaProfessor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "avaliacao_itens" ADD CONSTRAINT "avaliacao_itens_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "avaliacao_itens" ADD CONSTRAINT "avaliacao_itens_professorId_fkey" FOREIGN KEY ("professorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notas_boletim" ADD CONSTRAINT "notas_boletim_alunoId_fkey" FOREIGN KEY ("alunoId") REFERENCES "Aluno"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notas_boletim" ADD CONSTRAINT "notas_boletim_turmaProfessorId_fkey" FOREIGN KEY ("turmaProfessorId") REFERENCES "TurmaProfessor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notas_boletim" ADD CONSTRAINT "notas_boletim_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notas_boletim" ADD CONSTRAINT "notas_boletim_professorId_fkey" FOREIGN KEY ("professorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
