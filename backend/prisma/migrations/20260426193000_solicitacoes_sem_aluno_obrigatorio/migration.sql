ALTER TABLE "solicitacoes" DROP CONSTRAINT "solicitacoes_alunoId_fkey";

ALTER TABLE "solicitacoes"
ALTER COLUMN "alunoId" DROP NOT NULL;

ALTER TABLE "solicitacoes"
ADD CONSTRAINT "solicitacoes_alunoId_fkey"
FOREIGN KEY ("alunoId") REFERENCES "Aluno"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;
