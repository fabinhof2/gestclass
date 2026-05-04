CREATE TABLE "professor_agendas" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "turmaId" TEXT NOT NULL,
  "professorId" TEXT NOT NULL,
  "data" TIMESTAMP(3) NOT NULL,
  "titulo" TEXT NOT NULL,
  "descricao" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "professor_agendas_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "professor_agendas_schoolId_turmaId_data_idx" ON "professor_agendas"("schoolId", "turmaId", "data");
CREATE INDEX "professor_agendas_professorId_data_idx" ON "professor_agendas"("professorId", "data");

ALTER TABLE "professor_agendas"
  ADD CONSTRAINT "professor_agendas_schoolId_fkey"
  FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "professor_agendas"
  ADD CONSTRAINT "professor_agendas_turmaId_fkey"
  FOREIGN KEY ("turmaId") REFERENCES "Turma"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "professor_agendas"
  ADD CONSTRAINT "professor_agendas_professorId_fkey"
  FOREIGN KEY ("professorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
