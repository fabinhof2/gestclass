-- CreateTable
CREATE TABLE "calendario_letivo_turma_excecoes" (
    "id" TEXT NOT NULL,
    "calendarioLetivoId" TEXT NOT NULL,
    "turmaId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "calendario_letivo_turma_excecoes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "calendario_letivo_turma_excecoes_turmaId_idx" ON "calendario_letivo_turma_excecoes"("turmaId");

-- CreateIndex
CREATE UNIQUE INDEX "calendario_letivo_turma_excecoes_calendarioLetivoId_turmaId_key" ON "calendario_letivo_turma_excecoes"("calendarioLetivoId", "turmaId");

-- AddForeignKey
ALTER TABLE "calendario_letivo_turma_excecoes" ADD CONSTRAINT "calendario_letivo_turma_excecoes_calendarioLetivoId_fkey" FOREIGN KEY ("calendarioLetivoId") REFERENCES "calendarios_letivos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendario_letivo_turma_excecoes" ADD CONSTRAINT "calendario_letivo_turma_excecoes_turmaId_fkey" FOREIGN KEY ("turmaId") REFERENCES "Turma"("id") ON DELETE CASCADE ON UPDATE CASCADE;
