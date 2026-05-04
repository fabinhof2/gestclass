import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ConteudoDoDiaController } from './conteudo-do-dia.controller';
import { ConteudoDoDiaService } from './conteudo-do-dia.service';

@Module({
  imports: [PrismaModule],
  controllers: [ConteudoDoDiaController],
  providers: [ConteudoDoDiaService],
})
export class ConteudoDoDiaModule {}
