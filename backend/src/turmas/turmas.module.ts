import { Module } from "@nestjs/common";
import { TurmasController } from "./turmas.controller";
import { TurmasService } from "./turmas.service";
import { ComunicacaoModule } from "../comunicacao/comunicacao.module";

@Module({
  imports: [ComunicacaoModule],
  controllers: [TurmasController],
  providers: [TurmasService],
})
export class TurmasModule {}
