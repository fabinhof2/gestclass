-- CreateTable
CREATE TABLE "avaliacoes_online" (
    "id" TEXT NOT NULL,
    "turmaProfessorId" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "professorId" TEXT NOT NULL,
    "atividadeModeloOrigemId" TEXT,
    "periodo" "PeriodoAvaliacao" NOT NULL,
    "tipoComposicao" "TipoComposicaoNota" NOT NULL DEFAULT 'MEDIA_ARITMETICA',
    "titulo" TEXT NOT NULL,
    "descricao" TEXT,
    "instrucoes" TEXT,
    "valor" DECIMAL(5,2) NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "publicada" BOOLEAN NOT NULL DEFAULT false,
    "corrigeAutomaticamente" BOOLEAN NOT NULL DEFAULT true,
    "lancadaNoSistemaNotas" BOOLEAN NOT NULL DEFAULT false,
    "publicadaEm" TIMESTAMP(3),
    "encerradaEm" TIMESTAMP(3),
    "lancadaEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "avaliacoes_online_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "avaliacoes_online_perguntas" (
    "id" TEXT NOT NULL,
    "avaliacaoOnlineId" TEXT NOT NULL,
    "enunciado" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 1,
    "peso" DECIMAL(5,2) NOT NULL,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "avaliacoes_online_perguntas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "avaliacoes_online_alternativas" (
    "id" TEXT NOT NULL,
    "perguntaId" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 1,
    "correta" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "avaliacoes_online_alternativas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "avaliacoes_online_tentativas" (
    "id" TEXT NOT NULL,
    "avaliacaoOnlineId" TEXT NOT NULL,
    "alunoId" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "userAlunoId" TEXT NOT NULL,
    "iniciadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finalizadaEm" TIMESTAMP(3),
    "notaObjetiva" DECIMAL(5,2),
    "totalAcertos" INTEGER NOT NULL DEFAULT 0,
    "totalQuestoes" INTEGER NOT NULL DEFAULT 0,
    "finalizada" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "avaliacoes_online_tentativas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "avaliacoes_online_respostas" (
    "id" TEXT NOT NULL,
    "tentativaId" TEXT NOT NULL,
    "perguntaId" TEXT NOT NULL,
    "alternativaId" TEXT,
    "schoolId" TEXT NOT NULL,
    "respondidoPorUserId" TEXT NOT NULL,
    "correta" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "avaliacoes_online_respostas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "avaliacoes_online_schoolId_periodo_idx" ON "avaliacoes_online"("schoolId", "periodo");

-- CreateIndex
CREATE INDEX "avaliacoes_online_professorId_idx" ON "avaliacoes_online"("professorId");

-- CreateIndex
CREATE INDEX "avaliacoes_online_turmaProfessorId_periodo_idx" ON "avaliacoes_online"("turmaProfessorId", "periodo");

-- CreateIndex
CREATE INDEX "avaliacoes_online_perguntas_avaliacaoOnlineId_idx" ON "avaliacoes_online_perguntas"("avaliacaoOnlineId");

-- CreateIndex
CREATE UNIQUE INDEX "avaliacoes_online_perguntas_avaliacaoOnlineId_ordem_key" ON "avaliacoes_online_perguntas"("avaliacaoOnlineId", "ordem");

-- CreateIndex
CREATE INDEX "avaliacoes_online_alternativas_perguntaId_idx" ON "avaliacoes_online_alternativas"("perguntaId");

-- CreateIndex
CREATE UNIQUE INDEX "avaliacoes_online_alternativas_perguntaId_ordem_key" ON "avaliacoes_online_alternativas"("perguntaId", "ordem");

-- CreateIndex
CREATE INDEX "avaliacoes_online_tentativas_schoolId_idx" ON "avaliacoes_online_tentativas"("schoolId");

-- CreateIndex
CREATE INDEX "avaliacoes_online_tentativas_userAlunoId_idx" ON "avaliacoes_online_tentativas"("userAlunoId");

-- CreateIndex
CREATE INDEX "avaliacoes_online_tentativas_avaliacaoOnlineId_idx" ON "avaliacoes_online_tentativas"("avaliacaoOnlineId");

-- CreateIndex
CREATE UNIQUE INDEX "avaliacoes_online_tentativas_avaliacaoOnlineId_alunoId_key" ON "avaliacoes_online_tentativas"("avaliacaoOnlineId", "alunoId");

-- CreateIndex
CREATE INDEX "avaliacoes_online_respostas_schoolId_idx" ON "avaliacoes_online_respostas"("schoolId");

-- CreateIndex
CREATE INDEX "avaliacoes_online_respostas_respondidoPorUserId_idx" ON "avaliacoes_online_respostas"("respondidoPorUserId");

-- CreateIndex
CREATE INDEX "avaliacoes_online_respostas_perguntaId_idx" ON "avaliacoes_online_respostas"("perguntaId");

-- CreateIndex
CREATE UNIQUE INDEX "avaliacoes_online_respostas_tentativaId_perguntaId_key" ON "avaliacoes_online_respostas"("tentativaId", "perguntaId");

-- AddForeignKey
ALTER TABLE "avaliacoes_online" ADD CONSTRAINT "avaliacoes_online_turmaProfessorId_fkey" FOREIGN KEY ("turmaProfessorId") REFERENCES "TurmaProfessor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "avaliacoes_online" ADD CONSTRAINT "avaliacoes_online_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "avaliacoes_online" ADD CONSTRAINT "avaliacoes_online_professorId_fkey" FOREIGN KEY ("professorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "avaliacoes_online" ADD CONSTRAINT "avaliacoes_online_atividadeModeloOrigemId_fkey" FOREIGN KEY ("atividadeModeloOrigemId") REFERENCES "atividade_avaliacao_modelos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "avaliacoes_online_perguntas" ADD CONSTRAINT "avaliacoes_online_perguntas_avaliacaoOnlineId_fkey" FOREIGN KEY ("avaliacaoOnlineId") REFERENCES "avaliacoes_online"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "avaliacoes_online_alternativas" ADD CONSTRAINT "avaliacoes_online_alternativas_perguntaId_fkey" FOREIGN KEY ("perguntaId") REFERENCES "avaliacoes_online_perguntas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "avaliacoes_online_tentativas" ADD CONSTRAINT "avaliacoes_online_tentativas_avaliacaoOnlineId_fkey" FOREIGN KEY ("avaliacaoOnlineId") REFERENCES "avaliacoes_online"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "avaliacoes_online_tentativas" ADD CONSTRAINT "avaliacoes_online_tentativas_alunoId_fkey" FOREIGN KEY ("alunoId") REFERENCES "Aluno"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "avaliacoes_online_tentativas" ADD CONSTRAINT "avaliacoes_online_tentativas_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "avaliacoes_online_tentativas" ADD CONSTRAINT "avaliacoes_online_tentativas_userAlunoId_fkey" FOREIGN KEY ("userAlunoId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "avaliacoes_online_respostas" ADD CONSTRAINT "avaliacoes_online_respostas_tentativaId_fkey" FOREIGN KEY ("tentativaId") REFERENCES "avaliacoes_online_tentativas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "avaliacoes_online_respostas" ADD CONSTRAINT "avaliacoes_online_respostas_perguntaId_fkey" FOREIGN KEY ("perguntaId") REFERENCES "avaliacoes_online_perguntas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "avaliacoes_online_respostas" ADD CONSTRAINT "avaliacoes_online_respostas_alternativaId_fkey" FOREIGN KEY ("alternativaId") REFERENCES "avaliacoes_online_alternativas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "avaliacoes_online_respostas" ADD CONSTRAINT "avaliacoes_online_respostas_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "avaliacoes_online_respostas" ADD CONSTRAINT "avaliacoes_online_respostas_respondidoPorUserId_fkey" FOREIGN KEY ("respondidoPorUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
