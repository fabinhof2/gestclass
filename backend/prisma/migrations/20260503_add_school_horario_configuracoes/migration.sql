CREATE TABLE "school_horario_configuracoes" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "officialConfigsJson" TEXT,
  "turmaOverridesJson" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "school_horario_configuracoes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "school_horario_configuracoes_schoolId_key"
ON "school_horario_configuracoes"("schoolId");

ALTER TABLE "school_horario_configuracoes"
ADD CONSTRAINT "school_horario_configuracoes_schoolId_fkey"
FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
