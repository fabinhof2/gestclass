import { Module } from "@nestjs/common";
import { AlunosController } from "./alunos.controller";
import { AlunosService } from "./alunos.service";
import { FinanceiroModule } from "../financeiro/financeiro.module";
import { ComunicacaoModule } from "../comunicacao/comunicacao.module";

@Module({
  imports: [FinanceiroModule, ComunicacaoModule],
  controllers: [AlunosController],
  providers: [AlunosService],
})
export class AlunosModule {}
