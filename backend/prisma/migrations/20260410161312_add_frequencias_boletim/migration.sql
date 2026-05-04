-- CreateEnum
CREATE TYPE "FrequenciaStatus" AS ENUM ('PRESENTE', 'FALTA');

-- CreateTable
CREATE TABLE "frequencias" (
    "id" TEXT NOT NULL,
    "alunoId" TEXT NOT NULL,
    "turmaProfessorId" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "professorId" TEXT NOT NULL,
    "dataLancamento" TIMESTAMP(3) NOT NULL,
    "status" "FrequenciaStatus" NOT NULL,
    "observacao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "frequencias_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "frequencias_schoolId_dataLancamento_idx" ON "frequencias"("schoolId", "dataLancamento");

-- CreateIndex
CREATE INDEX "frequencias_professorId_idx" ON "frequencias"("professorId");

-- CreateIndex
CREATE UNIQUE INDEX "frequencias_alunoId_turmaProfessorId_dataLancamento_key" ON "frequencias"("alunoId", "turmaProfessorId", "dataLancamento");

-- AddForeignKey
ALTER TABLE "frequencias" ADD CONSTRAINT "frequencias_alunoId_fkey" FOREIGN KEY ("alunoId") REFERENCES "Aluno"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "frequencias" ADD CONSTRAINT "frequencias_turmaProfessorId_fkey" FOREIGN KEY ("turmaProfessorId") REFERENCES "TurmaProfessor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "frequencias" ADD CONSTRAINT "frequencias_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "frequencias" ADD CONSTRAINT "frequencias_professorId_fkey" FOREIGN KEY ("professorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
