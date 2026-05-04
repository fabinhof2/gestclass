/*
  Warnings:

  - A unique constraint covering the columns `[matricula,schoolId]` on the table `Aluno` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "Aluno_matricula_schoolId_key" ON "Aluno"("matricula", "schoolId");
