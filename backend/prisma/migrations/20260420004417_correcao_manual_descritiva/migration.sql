-- AlterTable
ALTER TABLE "avaliacoes_online_respostas" ADD COLUMN     "corrigidaManual" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "corrigidoEm" TIMESTAMP(3),
ADD COLUMN     "corrigidoPorUserId" TEXT,
ADD COLUMN     "feedbackProfessor" TEXT,
ADD COLUMN     "notaManual" DECIMAL(5,2);

-- AlterTable
ALTER TABLE "avaliacoes_online_tentativas" ADD COLUMN     "notaDescritiva" DECIMAL(5,2),
ADD COLUMN     "notaFinal" DECIMAL(5,2);
