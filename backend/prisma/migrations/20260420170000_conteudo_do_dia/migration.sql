CREATE TABLE "planos_anuais_conteudo" (
    "id" TEXT NOT NULL,
    "turmaProfessorId" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "professorId" TEXT NOT NULL,
    "ano" INTEGER NOT NULL,
    "objetivoGeral" TEXT,
    "metodologiaGeral" TEXT,
    "observacoes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "planos_anuais_conteudo_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "planejamentos_diarios_conteudo" (
    "id" TEXT NOT NULL,
    "planoAnualId" TEXT NOT NULL,
    "turmaProfessorId" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "professorId" TEXT NOT NULL,
    "aulaId" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "conteudo" TEXT,
    "objetivo" TEXT,
    "metodologia" TEXT,
    "atividades" TEXT,
    "anexoUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "planejamentos_diarios_conteudo_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "planos_anuais_conteudo_turmaProfessorId_ano_key" ON "planos_anuais_conteudo"("turmaProfessorId", "ano");
CREATE INDEX "planos_anuais_conteudo_schoolId_ano_idx" ON "planos_anuais_conteudo"("schoolId", "ano");
CREATE INDEX "planos_anuais_conteudo_professorId_ano_idx" ON "planos_anuais_conteudo"("professorId", "ano");

CREATE UNIQUE INDEX "planejamentos_diarios_conteudo_turmaProfessorId_aulaId_data_key" ON "planejamentos_diarios_conteudo"("turmaProfessorId", "aulaId", "data");
CREATE INDEX "planejamentos_diarios_conteudo_schoolId_data_idx" ON "planejamentos_diarios_conteudo"("schoolId", "data");
CREATE INDEX "planejamentos_diarios_conteudo_professorId_data_idx" ON "planejamentos_diarios_conteudo"("professorId", "data");

ALTER TABLE "planos_anuais_conteudo" ADD CONSTRAINT "planos_anuais_conteudo_turmaProfessorId_fkey" FOREIGN KEY ("turmaProfessorId") REFERENCES "TurmaProfessor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "planos_anuais_conteudo" ADD CONSTRAINT "planos_anuais_conteudo_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "planos_anuais_conteudo" ADD CONSTRAINT "planos_anuais_conteudo_professorId_fkey" FOREIGN KEY ("professorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "planejamentos_diarios_conteudo" ADD CONSTRAINT "planejamentos_diarios_conteudo_planoAnualId_fkey" FOREIGN KEY ("planoAnualId") REFERENCES "planos_anuais_conteudo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "planejamentos_diarios_conteudo" ADD CONSTRAINT "planejamentos_diarios_conteudo_turmaProfessorId_fkey" FOREIGN KEY ("turmaProfessorId") REFERENCES "TurmaProfessor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "planejamentos_diarios_conteudo" ADD CONSTRAINT "planejamentos_diarios_conteudo_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "planejamentos_diarios_conteudo" ADD CONSTRAINT "planejamentos_diarios_conteudo_professorId_fkey" FOREIGN KEY ("professorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "planejamentos_diarios_conteudo" ADD CONSTRAINT "planejamentos_diarios_conteudo_aulaId_fkey" FOREIGN KEY ("aulaId") REFERENCES "Aula"("id") ON DELETE CASCADE ON UPDATE CASCADE;
