CREATE TYPE "ComunicacaoReacaoTipo" AS ENUM ('LIKE', 'DISLIKE');

CREATE TABLE "comunicacao_reacoes" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tipo" "ComunicacaoReacaoTipo" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "comunicacao_reacoes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "comunicacao_reacoes_postId_userId_key" ON "comunicacao_reacoes"("postId", "userId");
CREATE INDEX "comunicacao_reacoes_postId_tipo_idx" ON "comunicacao_reacoes"("postId", "tipo");
CREATE INDEX "comunicacao_reacoes_schoolId_idx" ON "comunicacao_reacoes"("schoolId");

ALTER TABLE "comunicacao_reacoes"
ADD CONSTRAINT "comunicacao_reacoes_postId_fkey"
FOREIGN KEY ("postId") REFERENCES "comunicacao_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "comunicacao_reacoes"
ADD CONSTRAINT "comunicacao_reacoes_schoolId_fkey"
FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "comunicacao_reacoes"
ADD CONSTRAINT "comunicacao_reacoes_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
