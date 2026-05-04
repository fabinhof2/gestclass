-- CreateEnum
CREATE TYPE "ComunicacaoGrupoTipo" AS ENUM ('TURMA', 'PERSONALIZADO');

-- CreateEnum
CREATE TYPE "ComunicacaoPostTipo" AS ENUM ('POST', 'AVISO');

-- CreateTable
CREATE TABLE "comunicacao_grupos" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" "ComunicacaoGrupoTipo" NOT NULL DEFAULT 'TURMA',
    "schoolId" TEXT NOT NULL,
    "turmaId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "comunicacao_grupos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comunicacao_grupo_membros" (
    "id" TEXT NOT NULL,
    "grupoId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "addedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comunicacao_grupo_membros_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comunicacao_posts" (
    "id" TEXT NOT NULL,
    "grupoId" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "tipo" "ComunicacaoPostTipo" NOT NULL DEFAULT 'POST',
    "texto" TEXT,
    "mediaUrl" TEXT,
    "mediaMime" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "comunicacao_posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comunicacao_comentarios" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comunicacao_comentarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comunicacao_mensagens" (
    "id" TEXT NOT NULL,
    "grupoId" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comunicacao_mensagens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "comunicacao_grupos_schoolId_idx" ON "comunicacao_grupos"("schoolId");

-- CreateIndex
CREATE INDEX "comunicacao_grupos_turmaId_idx" ON "comunicacao_grupos"("turmaId");

-- CreateIndex
CREATE UNIQUE INDEX "comunicacao_grupo_membros_grupoId_userId_key" ON "comunicacao_grupo_membros"("grupoId", "userId");

-- CreateIndex
CREATE INDEX "comunicacao_grupo_membros_userId_idx" ON "comunicacao_grupo_membros"("userId");

-- CreateIndex
CREATE INDEX "comunicacao_posts_grupoId_createdAt_idx" ON "comunicacao_posts"("grupoId", "createdAt");

-- CreateIndex
CREATE INDEX "comunicacao_posts_schoolId_idx" ON "comunicacao_posts"("schoolId");

-- CreateIndex
CREATE INDEX "comunicacao_comentarios_postId_createdAt_idx" ON "comunicacao_comentarios"("postId", "createdAt");

-- CreateIndex
CREATE INDEX "comunicacao_comentarios_schoolId_idx" ON "comunicacao_comentarios"("schoolId");

-- CreateIndex
CREATE INDEX "comunicacao_mensagens_grupoId_createdAt_idx" ON "comunicacao_mensagens"("grupoId", "createdAt");

-- CreateIndex
CREATE INDEX "comunicacao_mensagens_schoolId_idx" ON "comunicacao_mensagens"("schoolId");

-- AddForeignKey
ALTER TABLE "comunicacao_grupos" ADD CONSTRAINT "comunicacao_grupos_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comunicacao_grupos" ADD CONSTRAINT "comunicacao_grupos_turmaId_fkey" FOREIGN KEY ("turmaId") REFERENCES "Turma"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comunicacao_grupos" ADD CONSTRAINT "comunicacao_grupos_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comunicacao_grupo_membros" ADD CONSTRAINT "comunicacao_grupo_membros_grupoId_fkey" FOREIGN KEY ("grupoId") REFERENCES "comunicacao_grupos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comunicacao_grupo_membros" ADD CONSTRAINT "comunicacao_grupo_membros_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comunicacao_grupo_membros" ADD CONSTRAINT "comunicacao_grupo_membros_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comunicacao_posts" ADD CONSTRAINT "comunicacao_posts_grupoId_fkey" FOREIGN KEY ("grupoId") REFERENCES "comunicacao_grupos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comunicacao_posts" ADD CONSTRAINT "comunicacao_posts_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comunicacao_posts" ADD CONSTRAINT "comunicacao_posts_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comunicacao_comentarios" ADD CONSTRAINT "comunicacao_comentarios_postId_fkey" FOREIGN KEY ("postId") REFERENCES "comunicacao_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comunicacao_comentarios" ADD CONSTRAINT "comunicacao_comentarios_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comunicacao_comentarios" ADD CONSTRAINT "comunicacao_comentarios_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comunicacao_mensagens" ADD CONSTRAINT "comunicacao_mensagens_grupoId_fkey" FOREIGN KEY ("grupoId") REFERENCES "comunicacao_grupos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comunicacao_mensagens" ADD CONSTRAINT "comunicacao_mensagens_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comunicacao_mensagens" ADD CONSTRAINT "comunicacao_mensagens_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
