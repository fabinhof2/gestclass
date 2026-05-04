import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ProfessorAgendaController } from './professor-agenda.controller';
import { ProfessorAgendaService } from './professor-agenda.service';

@Module({
  imports: [PrismaModule],
  controllers: [ProfessorAgendaController],
  providers: [ProfessorAgendaService],
})
export class ProfessorAgendaModule {}
