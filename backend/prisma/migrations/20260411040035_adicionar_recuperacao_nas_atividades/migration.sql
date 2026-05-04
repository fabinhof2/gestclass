/*
  Warnings:

  - Added the required column `notaConsiderada` to the `avaliacao_itens` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "atividade_avaliacao_modelos" ADD COLUMN     "permiteRecuperacao" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "avaliacao_itens" ADD COLUMN     "notaConsiderada" DECIMAL(5,2) NOT NULL,
ADD COLUMN     "notaRecuperacao" DECIMAL(5,2);
