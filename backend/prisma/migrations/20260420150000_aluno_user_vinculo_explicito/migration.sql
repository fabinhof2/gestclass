-- Create an explicit one-to-one link between student records and login users.
ALTER TABLE "Aluno" ADD COLUMN "userId" TEXT;

CREATE UNIQUE INDEX "Aluno_userId_key" ON "Aluno"("userId");
CREATE INDEX "Aluno_userId_idx" ON "Aluno"("userId");

ALTER TABLE "Aluno"
ADD CONSTRAINT "Aluno_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill legacy records only when the match is unambiguous.
WITH candidatos AS (
  SELECT
    a."id" AS "alunoId",
    u."id" AS "userId",
    COUNT(*) OVER (PARTITION BY a."id") AS "usuariosPorAluno",
    COUNT(*) OVER (PARTITION BY u."id") AS "alunosPorUsuario"
  FROM "Aluno" a
  INNER JOIN "users" u
    ON u."schoolId" = a."schoolId"
    AND u."role" = 'ALUNO'
    AND LOWER(TRIM(u."name")) = LOWER(TRIM(a."name"))
  WHERE a."userId" IS NULL
)
UPDATE "Aluno" a
SET "userId" = candidatos."userId"
FROM candidatos
WHERE a."id" = candidatos."alunoId"
  AND candidatos."usuariosPorAluno" = 1
  AND candidatos."alunosPorUsuario" = 1;
