-- CreateEnum
CREATE TYPE "TipoQuestaoOnline" AS ENUM ('MULTIPLA_ESCOLHA', 'VERDADEIRO_FALSO');

-- AlterTable
ALTER TABLE "avaliacoes_online_perguntas" ADD COLUMN     "imagemUrl" TEXT,
ADD COLUMN     "tipoQuestao" "TipoQuestaoOnline" NOT NULL DEFAULT 'MULTIPLA_ESCOLHA';
