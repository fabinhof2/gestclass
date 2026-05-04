-- CreateEnum
CREATE TYPE "TipoAvaliacao" AS ENUM ('BIMESTRAL', 'TRIMESTRAL');

-- AlterTable
ALTER TABLE "schools" ADD COLUMN     "tipoAvaliacao" "TipoAvaliacao" NOT NULL DEFAULT 'BIMESTRAL';
