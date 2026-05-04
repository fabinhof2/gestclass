-- CreateEnum
CREATE TYPE "CalendarioLetivoTipo" AS ENUM ('DIA_SEM_AULA', 'RECESSO', 'FERIAS');

-- CreateEnum
CREATE TYPE "CalendarioLetivoAbrangencia" AS ENUM ('ESCOLA_INTEIRA', 'APENAS_TURMA', 'ESCOLA_INTEIRA_EXCETO_TURMA');

-- CreateTable
CREATE TABLE "calendarios_letivos" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "turmaId" TEXT,
    "tipo" "CalendarioLetivoTipo" NOT NULL,
    "abrangencia" "CalendarioLetivoAbrangencia" NOT NULL,
    "motivo" TEXT NOT NULL,
    "dataInicio" TIMESTAMP(3) NOT NULL,
    "dataFim" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "calendarios_letivos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "calendarios_letivos_schoolId_dataInicio_dataFim_idx" ON "calendarios_letivos"("schoolId", "dataInicio", "dataFim");

-- CreateIndex
CREATE INDEX "calendarios_letivos_turmaId_dataInicio_dataFim_idx" ON "calendarios_letivos"("turmaId", "dataInicio", "dataFim");

-- CreateIndex
CREATE INDEX "calendarios_letivos_createdById_idx" ON "calendarios_letivos"("createdById");

-- AddForeignKey
ALTER TABLE "calendarios_letivos" ADD CONSTRAINT "calendarios_letivos_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendarios_letivos" ADD CONSTRAINT "calendarios_letivos_turmaId_fkey" FOREIGN KEY ("turmaId") REFERENCES "Turma"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendarios_letivos" ADD CONSTRAINT "calendarios_letivos_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
