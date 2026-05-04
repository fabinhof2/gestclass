import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ComunicacaoController } from './comunicacao.controller';
import { ComunicacaoService } from './comunicacao.service';

@Module({
  imports: [PrismaModule],
  controllers: [ComunicacaoController],
  providers: [ComunicacaoService],
  exports: [ComunicacaoService],
})
export class ComunicacaoModule {}
