CREATE TYPE "ForumAtividadeTipo" AS ENUM ('PDF', 'VIDEO', 'TEXTO', 'MISTA');
CREATE TYPE "ForumEntregaStatus" AS ENUM ('ENTREGUE', 'PENDENTE', 'CORRIGIDO');

CREATE TABLE "forum_topicos" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "turmaId" TEXT,
  "authorId" TEXT NOT NULL,
  "disciplina" TEXT,
  "titulo" TEXT NOT NULL,
  "conteudo" TEXT NOT NULL,
  "fixado" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "forum_topicos_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "forum_comentarios" (
  "id" TEXT NOT NULL,
  "topicoId" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "authorId" TEXT NOT NULL,
  "texto" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "forum_comentarios_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "forum_atividades" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "turmaId" TEXT,
  "professorId" TEXT NOT NULL,
  "disciplina" TEXT,
  "titulo" TEXT NOT NULL,
  "descricao" TEXT NOT NULL,
  "tipo" "ForumAtividadeTipo" NOT NULL DEFAULT 'MISTA',
  "prazo" TIMESTAMP(3),
  "arquivoUrl" TEXT,
  "arquivoNome" TEXT,
  "arquivoMime" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "forum_atividades_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "forum_entregas" (
  "id" TEXT NOT NULL,
  "atividadeId" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "alunoId" TEXT NOT NULL,
  "texto" TEXT,
  "arquivoUrl" TEXT,
  "arquivoNome" TEXT,
  "arquivoMime" TEXT,
  "status" "ForumEntregaStatus" NOT NULL DEFAULT 'ENTREGUE',
  "feedback" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "forum_entregas_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "forum_enquetes" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "turmaId" TEXT,
  "authorId" TEXT NOT NULL,
  "pergunta" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "forum_enquetes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "forum_enquete_opcoes" (
  "id" TEXT NOT NULL,
  "enqueteId" TEXT NOT NULL,
  "texto" TEXT NOT NULL,
  CONSTRAINT "forum_enquete_opcoes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "forum_enquete_votos" (
  "id" TEXT NOT NULL,
  "enqueteId" TEXT NOT NULL,
  "opcaoId" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "forum_enquete_votos_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "forum_topicos_schoolId_createdAt_idx" ON "forum_topicos"("schoolId", "createdAt");
CREATE INDEX "forum_topicos_turmaId_createdAt_idx" ON "forum_topicos"("turmaId", "createdAt");
CREATE INDEX "forum_comentarios_topicoId_createdAt_idx" ON "forum_comentarios"("topicoId", "createdAt");
CREATE INDEX "forum_comentarios_schoolId_idx" ON "forum_comentarios"("schoolId");
CREATE INDEX "forum_atividades_schoolId_createdAt_idx" ON "forum_atividades"("schoolId", "createdAt");
CREATE INDEX "forum_atividades_turmaId_createdAt_idx" ON "forum_atividades"("turmaId", "createdAt");
CREATE UNIQUE INDEX "forum_entregas_atividadeId_alunoId_key" ON "forum_entregas"("atividadeId", "alunoId");
CREATE INDEX "forum_entregas_schoolId_createdAt_idx" ON "forum_entregas"("schoolId", "createdAt");
CREATE INDEX "forum_enquetes_schoolId_createdAt_idx" ON "forum_enquetes"("schoolId", "createdAt");
CREATE INDEX "forum_enquetes_turmaId_createdAt_idx" ON "forum_enquetes"("turmaId", "createdAt");
CREATE INDEX "forum_enquete_opcoes_enqueteId_idx" ON "forum_enquete_opcoes"("enqueteId");
CREATE UNIQUE INDEX "forum_enquete_votos_enqueteId_userId_key" ON "forum_enquete_votos"("enqueteId", "userId");
CREATE INDEX "forum_enquete_votos_schoolId_idx" ON "forum_enquete_votos"("schoolId");

ALTER TABLE "forum_topicos" ADD CONSTRAINT "forum_topicos_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "forum_topicos" ADD CONSTRAINT "forum_topicos_turmaId_fkey" FOREIGN KEY ("turmaId") REFERENCES "Turma"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "forum_topicos" ADD CONSTRAINT "forum_topicos_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "forum_comentarios" ADD CONSTRAINT "forum_comentarios_topicoId_fkey" FOREIGN KEY ("topicoId") REFERENCES "forum_topicos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "forum_comentarios" ADD CONSTRAINT "forum_comentarios_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "forum_comentarios" ADD CONSTRAINT "forum_comentarios_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "forum_atividades" ADD CONSTRAINT "forum_atividades_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "forum_atividades" ADD CONSTRAINT "forum_atividades_turmaId_fkey" FOREIGN KEY ("turmaId") REFERENCES "Turma"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "forum_atividades" ADD CONSTRAINT "forum_atividades_professorId_fkey" FOREIGN KEY ("professorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "forum_entregas" ADD CONSTRAINT "forum_entregas_atividadeId_fkey" FOREIGN KEY ("atividadeId") REFERENCES "forum_atividades"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "forum_entregas" ADD CONSTRAINT "forum_entregas_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "forum_entregas" ADD CONSTRAINT "forum_entregas_alunoId_fkey" FOREIGN KEY ("alunoId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "forum_enquetes" ADD CONSTRAINT "forum_enquetes_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "forum_enquetes" ADD CONSTRAINT "forum_enquetes_turmaId_fkey" FOREIGN KEY ("turmaId") REFERENCES "Turma"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "forum_enquetes" ADD CONSTRAINT "forum_enquetes_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "forum_enquete_opcoes" ADD CONSTRAINT "forum_enquete_opcoes_enqueteId_fkey" FOREIGN KEY ("enqueteId") REFERENCES "forum_enquetes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "forum_enquete_votos" ADD CONSTRAINT "forum_enquete_votos_enqueteId_fkey" FOREIGN KEY ("enqueteId") REFERENCES "forum_enquetes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "forum_enquete_votos" ADD CONSTRAINT "forum_enquete_votos_opcaoId_fkey" FOREIGN KEY ("opcaoId") REFERENCES "forum_enquete_opcoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "forum_enquete_votos" ADD CONSTRAINT "forum_enquete_votos_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "forum_enquete_votos" ADD CONSTRAINT "forum_enquete_votos_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
