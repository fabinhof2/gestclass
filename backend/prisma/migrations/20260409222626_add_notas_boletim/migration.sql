-- CreateEnum
CREATE TYPE "PeriodoAvaliacao" AS ENUM ('PRIMEIRO', 'SEGUNDO', 'TERCEIRO', 'QUARTO');

-- CreateTable
CREATE TABLE "notas" (
    "id" TEXT NOT NULL,
    "alunoId" TEXT NOT NULL,
    "turmaProfessorId" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "professorId" TEXT NOT NULL,
    "periodo" "PeriodoAvaliacao" NOT NULL,
    "nota" DECIMAL(5,2) NOT NULL,
    "observacao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notas_schoolId_periodo_idx" ON "notas"("schoolId", "periodo");

-- CreateIndex
CREATE INDEX "notas_professorId_idx" ON "notas"("professorId");

-- CreateIndex
CREATE UNIQUE INDEX "notas_alunoId_turmaProfessorId_periodo_key" ON "notas"("alunoId", "turmaProfessorId", "periodo");

-- AddForeignKey
ALTER TABLE "notas" ADD CONSTRAINT "notas_alunoId_fkey" FOREIGN KEY ("alunoId") REFERENCES "Aluno"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notas" ADD CONSTRAINT "notas_turmaProfessorId_fkey" FOREIGN KEY ("turmaProfessorId") REFERENCES "TurmaProfessor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notas" ADD CONSTRAINT "notas_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notas" ADD CONSTRAINT "notas_professorId_fkey" FOREIGN KEY ("professorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
