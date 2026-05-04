import { Module } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AvaliacoesOnlineController } from "./avaliacoes-online.controller";
import { AvaliacoesOnlineService } from "./avaliacoes-online.service";

@Module({
  controllers: [AvaliacoesOnlineController],
  providers: [AvaliacoesOnlineService, PrismaService],
  exports: [AvaliacoesOnlineService],
})
export class AvaliacoesOnlineModule {}