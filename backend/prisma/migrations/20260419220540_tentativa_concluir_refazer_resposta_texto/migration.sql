-- AlterTable
ALTER TABLE "avaliacoes_online_respostas" ADD COLUMN     "respostaTexto" TEXT;

-- AlterTable
ALTER TABLE "avaliacoes_online_tentativas" ADD COLUMN     "refazerAutorizado" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "refazerAutorizadoEm" TIMESTAMP(3);
