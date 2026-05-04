import { Module } from "@nestjs/common";
import { DisciplinasController } from "./disciplinas.controller";
import { DisciplinasService } from "./disciplinas.service";

@Module({
  controllers: [DisciplinasController],
  providers: [DisciplinasService],
})
export class DisciplinasModule {}
