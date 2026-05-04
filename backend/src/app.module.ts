import { Module } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { SchoolsModule } from './schools/schools.module';
import { RolesGuard } from './auth/roles.guard';
import { TurmasModule } from './turmas/turmas.module';
import { TurmaProfessorModule } from './turma-professor/turma-professor.module';
import { AulasModule } from './aulas/aulas.module';
import { AlunosModule } from './alunos/alunos.module';
import { NotasModule } from './notas/notas.module';
import { FrequenciaModule } from './frequencia/frequencia.module';
import { AvaliacoesOnlineModule } from './avaliacoes-online/avaliacoes-online.module';
import { ConteudoDoDiaModule } from './conteudo-do-dia/conteudo-do-dia.module';
import { ComunicacaoModule } from './comunicacao/comunicacao.module';
import { ForumModule } from './forum/forum.module';
import { ProfessorAgendaModule } from './professor-agenda/professor-agenda.module';
import { FinanceiroModule } from './financeiro/financeiro.module';
import { SolicitacoesModule } from './solicitacoes/solicitacoes.module';
import { DisciplinasModule } from './disciplinas/disciplinas.module';

@Module({
  imports: [
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'uploads'),
      serveRoot: '/uploads',
    }),

    PrismaModule,
    UsersModule,
    AuthModule,
    SchoolsModule,
    TurmasModule,
    TurmaProfessorModule,
    AulasModule,
    AlunosModule,
    NotasModule,
    FrequenciaModule,
    AvaliacoesOnlineModule,
    ConteudoDoDiaModule,
    ComunicacaoModule,
    ForumModule,
    ProfessorAgendaModule,
    FinanceiroModule,
    SolicitacoesModule,
    DisciplinasModule,
  ],
  controllers: [AppController],
  providers: [AppService, RolesGuard],
})
export class AppModule {}
