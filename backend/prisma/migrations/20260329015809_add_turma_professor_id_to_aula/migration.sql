-- AlterTable
ALTER TABLE "Aula" ADD COLUMN     "turmaProfessorId" TEXT;

-- AddForeignKey
ALTER TABLE "Aula" ADD CONSTRAINT "Aula_turmaProfessorId_fkey" FOREIGN KEY ("turmaProfessorId") REFERENCES "TurmaProfessor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
