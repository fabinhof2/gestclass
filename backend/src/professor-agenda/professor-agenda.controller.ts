import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ProfessorAgendaService } from './professor-agenda.service';

const AGENDA_ROLES = [
  'ADMIN_ESCOLA',
  'GESTOR',
  'SECRETARIA',
  'PROFESSOR',
  'RESPONSAVEL',
  'ALUNO',
] as const;

function authUser(user: any) {
  return {
    userId: user?.id || user?.userId || user?.sub,
    userRole: user?.role as UserRole,
    schoolId: user?.schoolId,
  };
}

@Controller('professor-agenda')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProfessorAgendaController {
  constructor(private readonly service: ProfessorAgendaService) {}

  @Roles(...AGENDA_ROLES)
  @Get('turmas')
  listarTurmas(@CurrentUser() user: any) {
    return this.service.listarTurmas(authUser(user));
  }

  @Roles(...AGENDA_ROLES)
  @Get()
  listar(
    @Query('turmaId') turmaId: string,
    @Query('ano') ano: string,
    @CurrentUser() user: any,
  ) {
    if (!turmaId?.trim()) {
      throw new BadRequestException('Selecione a turma.');
    }

    return this.service.listar(authUser(user), {
      turmaId: turmaId.trim(),
      ano: ano?.trim(),
    });
  }

  @Roles('ADMIN_ESCOLA', 'GESTOR', 'SECRETARIA', 'PROFESSOR')
  @Post()
  criar(
    @Body() body: { turmaId?: string; data?: string; titulo?: string; descricao?: string },
    @CurrentUser() user: any,
  ) {
    return this.service.criar(authUser(user), body);
  }

  @Roles('ADMIN_ESCOLA', 'GESTOR', 'SECRETARIA', 'PROFESSOR')
  @Patch(':id')
  editar(
    @Param('id') id: string,
    @Body() body: { data?: string; titulo?: string; descricao?: string },
    @CurrentUser() user: any,
  ) {
    return this.service.editar(authUser(user), id, body);
  }

  @Roles('ADMIN_ESCOLA', 'GESTOR', 'SECRETARIA', 'PROFESSOR')
  @Delete(':id')
  excluir(@Param('id') id: string, @CurrentUser() user: any) {
    return this.service.excluir(authUser(user), id);
  }
}
