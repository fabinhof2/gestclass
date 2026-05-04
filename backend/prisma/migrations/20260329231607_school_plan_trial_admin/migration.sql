/*
  Warnings:

  - The `plan` column on the `schools` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "SchoolPlan" AS ENUM ('TESTE_15_DIAS', 'BASICO', 'PRO', 'PREMIUM');

-- AlterTable
ALTER TABLE "schools" ADD COLUMN     "trialEndsAt" TIMESTAMP(3),
DROP COLUMN "plan",
ADD COLUMN     "plan" "SchoolPlan" NOT NULL DEFAULT 'BASICO';
