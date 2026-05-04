import { Module } from "@nestjs/common";
import { TurmaProfessorController } from "./turma-professor.controller";
import { TurmaProfessorService } from "./turma-professor.service";

@Module({
  controllers: [TurmaProfessorController],
  providers: [TurmaProfessorService],
})
export class TurmaProfessorModule {}