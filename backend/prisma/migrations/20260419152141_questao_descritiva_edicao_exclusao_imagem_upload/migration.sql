-- AlterEnum
ALTER TYPE "TipoQuestaoOnline" ADD VALUE 'DESCRITIVA';

-- AlterTable
ALTER TABLE "avaliacoes_online_perguntas" ADD COLUMN     "respostaEsperada" TEXT;
