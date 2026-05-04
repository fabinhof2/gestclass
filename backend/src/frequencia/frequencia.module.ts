import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { FrequenciaController } from './frequencia.controller';
import { FrequenciaService } from './frequencia.service';

@Module({
  imports: [PrismaModule],
  controllers: [FrequenciaController],
  providers: [FrequenciaService],
  exports: [FrequenciaService],
})
export class FrequenciaModule {}