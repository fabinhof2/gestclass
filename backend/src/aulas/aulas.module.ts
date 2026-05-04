import { Module } from "@nestjs/common";
import { AulasController } from "./aulas.controller";
import { AulasService } from "./aulas.service";

@Module({
  controllers: [AulasController],
  providers: [AulasService],
})
export class AulasModule {}