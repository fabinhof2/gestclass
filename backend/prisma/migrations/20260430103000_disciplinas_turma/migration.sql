-- CreateTable
CREATE TABLE "disciplinas_turma" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "turmaId" TEXT NOT NULL,
    "serie" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "cargaHoraria" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "disciplinas_turma_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "TurmaProfessor"
ADD COLUMN "disciplinaId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "disciplinas_turma_turmaId_nome_key" ON "disciplinas_turma"("turmaId", "nome");

-- CreateIndex
CREATE INDEX "disciplinas_turma_schoolId_serie_idx" ON "disciplinas_turma"("schoolId", "serie");

-- CreateIndex
CREATE INDEX "disciplinas_turma_turmaId_idx" ON "disciplinas_turma"("turmaId");

-- AddForeignKey
ALTER TABLE "disciplinas_turma"
ADD CONSTRAINT "disciplinas_turma_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disciplinas_turma"
ADD CONSTRAINT "disciplinas_turma_turmaId_fkey" FOREIGN KEY ("turmaId") REFERENCES "Turma"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TurmaProfessor"
ADD CONSTRAINT "TurmaProfessor_disciplinaId_fkey" FOREIGN KEY ("disciplinaId") REFERENCES "disciplinas_turma"("id") ON DELETE SET NULL ON UPDATE CASCADE;
