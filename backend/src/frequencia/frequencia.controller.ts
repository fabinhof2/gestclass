import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  CalendarioLetivoAbrangencia,
  CalendarioLetivoTipo,
  FrequenciaStatus,
  UserRole,
} from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { FrequenciaService } from './frequencia.service';

@Controller('frequencia')
export class FrequenciaController {
  constructor(private readonly frequenciaService: FrequenciaService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPERUSUARIO', 'ADMIN_ESCOLA', 'GESTOR', 'SECRETARIA')
  @Get('turmas-escola')
  async listarTurmasDaEscola(@CurrentUser() user: any) {
    const schoolId = user?.schoolId;

    if (user?.role !== 'SUPERUSUARIO' && !schoolId) {
      throw new ForbiddenException('Usuário sem escola vinculada.');
    }

    return this.frequenciaService.listarTurmasDaEscola({
      userRole: user?.role as UserRole,
      userSchoolId: schoolId,
    });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPERUSUARIO', 'ADMIN_ESCOLA', 'GESTOR', 'SECRETARIA')
  @Get('calendario-letivo')
  async listarCalendarioLetivo(
    @Query('mesReferencia') mesReferencia: string,
    @Query('turmaId') turmaId: string,
    @CurrentUser() user: any,
  ) {
    if (!mesReferencia?.trim()) {
      throw new BadRequestException('Informe o mês de referência.');
    }

    return this.frequenciaService.listarCalendarioLetivo({
      userId: user?.id || user?.userId || user?.sub,
      userRole: user?.role as UserRole,
      userSchoolId: user?.schoolId,
      mesReferencia: mesReferencia.trim(),
      turmaId: turmaId?.trim() || undefined,
    });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPERUSUARIO', 'ADMIN_ESCOLA', 'GESTOR', 'SECRETARIA')
  @Post('calendario-letivo')
  async criarCalendarioLetivo(
    @Body()
body: {
  tipo: CalendarioLetivoTipo;
  abrangencia: CalendarioLetivoAbrangencia;
  motivo: string;
  dataInicio: string;
  dataFim: string;
  turmaId?: string;
  turmasExcecaoIds?: string[];
},
    @CurrentUser() user: any,
  ) {
    if (!body?.tipo) {
      throw new BadRequestException('Informe o tipo do calendário letivo.');
    }

    if (!body?.abrangencia) {
      throw new BadRequestException('Informe a abrangência.');
    }

    if (!body?.motivo?.trim()) {
      throw new BadRequestException('Informe o motivo.');
    }

    if (!body?.dataInicio?.trim()) {
      throw new BadRequestException('Informe a data inicial.');
    }

    if (!body?.dataFim?.trim()) {
      throw new BadRequestException('Informe a data final.');
    }

return this.frequenciaService.criarCalendarioLetivo({
  userId: user?.id || user?.userId || user?.sub,
  userRole: user?.role as UserRole,
  userSchoolId: user?.schoolId,
  tipo: body.tipo,
  abrangencia: body.abrangencia,
  motivo: body.motivo.trim(),
  dataInicio: body.dataInicio.trim(),
  dataFim: body.dataFim.trim(),
  turmaId: body.turmaId?.trim() || undefined,
  turmasExcecaoIds: Array.isArray(body.turmasExcecaoIds)
    ? body.turmasExcecaoIds.map((item) => String(item).trim()).filter(Boolean)
    : [],
});
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPERUSUARIO', 'ADMIN_ESCOLA', 'GESTOR', 'SECRETARIA')
  @Delete('calendario-letivo/:id')
  async excluirCalendarioLetivo(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ) {
    if (!id?.trim()) {
      throw new BadRequestException('Informe o evento do calendário.');
    }

    return this.frequenciaService.excluirCalendarioLetivo({
      id: id.trim(),
      userRole: user?.role as UserRole,
      userSchoolId: user?.schoolId,
    });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('PROFESSOR', 'SUPERUSUARIO', 'ADMIN_ESCOLA', 'GESTOR', 'SECRETARIA')
  @Get('minhas-disciplinas')
  async listarMinhasDisciplinas(@CurrentUser() user: any) {
    return this.frequenciaService.listarMinhasDisciplinas({
      userId: user?.id || user?.userId || user?.sub,
      userRole: user?.role as UserRole,
      userSchoolId: user?.schoolId,
    });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ALUNO', 'RESPONSAVEL')
  @Get('minha-visao')
  async visualizarMinhaFrequencia(
    @Query('mesReferencia') mesReferencia: string,
    @Query('alunoId') alunoIdSelecionado: string,
    @CurrentUser() user: any,
  ) {
    if (!mesReferencia?.trim()) {
      throw new BadRequestException('Informe o mês de referência.');
    }

    return this.frequenciaService.visualizarMinhaFrequencia({
      userId: user?.id || user?.userId || user?.sub,
      userRole: user?.role as UserRole,
      userSchoolId: user?.schoolId,
      mesReferencia: mesReferencia.trim(),
      alunoIdSelecionado: alunoIdSelecionado?.trim() || undefined,
    });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ALUNO', 'RESPONSAVEL')
  @Get('frequencia-do-dia')
  async frequenciaDoDia(
    @Query('alunoId') alunoIdSelecionado: string,
    @CurrentUser() user: any,
  ) {
    return this.frequenciaService.frequenciaDoDia({
      userId: user?.id || user?.userId || user?.sub,
      userRole: user?.role as UserRole,
      userSchoolId: user?.schoolId,
      alunoIdSelecionado: alunoIdSelecionado?.trim() || undefined,
    });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('PROFESSOR', 'SUPERUSUARIO', 'ADMIN_ESCOLA', 'GESTOR', 'SECRETARIA')
  @Get('turma-professor/:turmaProfessorId/alunos')
  async listarAlunosDaDisciplinaPorData(
    @Param('turmaProfessorId') turmaProfessorId: string,
    @Query('dataLancamento') dataLancamento: string,
    @CurrentUser() user: any,
  ) {
    if (!dataLancamento?.trim()) {
      throw new BadRequestException('Informe a data da frequência.');
    }

    return this.frequenciaService.listarAlunosDaDisciplinaPorData({
      userId: user?.id || user?.userId || user?.sub,
      userRole: user?.role as UserRole,
      userSchoolId: user?.schoolId,
      turmaProfessorId,
      dataLancamento: dataLancamento.trim(),
    });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('PROFESSOR', 'SUPERUSUARIO', 'ADMIN_ESCOLA', 'GESTOR', 'SECRETARIA')
  @Get('turma-professor/:turmaProfessorId/resumo-mensal')
  async listarResumoMensalTurma(
    @Param('turmaProfessorId') turmaProfessorId: string,
    @Query('mesReferencia') mesReferencia: string,
    @CurrentUser() user: any,
  ) {
    if (!mesReferencia?.trim()) {
      throw new BadRequestException('Informe o mês de referência.');
    }

    return this.frequenciaService.listarResumoMensalTurma({
      userId: user?.id || user?.userId || user?.sub,
      userRole: user?.role as UserRole,
      userSchoolId: user?.schoolId,
      turmaProfessorId,
      mesReferencia: mesReferencia.trim(),
    });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('PROFESSOR')
  @Post()
  async lancarFrequencia(
    @Body()
    body: {
      alunoId: string;
      turmaProfessorId: string;
      dataLancamento: string;
      status: FrequenciaStatus;
      observacao?: string;
      faltaJustificada?: boolean;
    },
    @CurrentUser() user: any,
  ) {
    if (!body?.alunoId?.trim()) {
      throw new BadRequestException('Informe o aluno.');
    }

    if (!body?.turmaProfessorId?.trim()) {
      throw new BadRequestException('Informe o vínculo da disciplina.');
    }

    if (!body?.dataLancamento?.trim()) {
      throw new BadRequestException('Informe a data da frequência.');
    }

    if (!body?.status) {
      throw new BadRequestException('Informe o status da frequência.');
    }

    return this.frequenciaService.lancarFrequencia({
      userId: user?.id || user?.userId || user?.sub,
      userRole: user?.role as UserRole,
      userSchoolId: user?.schoolId,
      alunoId: body.alunoId.trim(),
      turmaProfessorId: body.turmaProfessorId.trim(),
      dataLancamento: body.dataLancamento.trim(),
      status: body.status,
      observacao: body.observacao,
      faltaJustificada: Boolean(body.faltaJustificada),
    });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('PROFESSOR', 'SUPERUSUARIO', 'ADMIN_ESCOLA', 'GESTOR', 'SECRETARIA')
  @Post('em-massa')
  async lancarFrequenciaEmMassa(
    @Body()
    body: {
      turmaProfessorId: string;
      dataLancamento: string;
      lancamentos: Array<{
        alunoId: string;
        status: FrequenciaStatus;
        observacao?: string;
        faltaJustificada?: boolean;
      }>;
    },
    @CurrentUser() user: any,
  ) {
    if (!body?.turmaProfessorId?.trim()) {
      throw new BadRequestException('Informe o vínculo da disciplina.');
    }

    if (!body?.dataLancamento?.trim()) {
      throw new BadRequestException('Informe a data da frequência.');
    }

    if (!Array.isArray(body?.lancamentos) || !body.lancamentos.length) {
      throw new BadRequestException(
        'Informe pelo menos um lançamento de frequência.',
      );
    }

    return this.frequenciaService.lancarFrequenciaEmMassa({
      userId: user?.id || user?.userId || user?.sub,
      userRole: user?.role as UserRole,
      userSchoolId: user?.schoolId,
      turmaProfessorId: body.turmaProfessorId.trim(),
      dataLancamento: body.dataLancamento.trim(),
      lancamentos: body.lancamentos.map((item) => ({
        alunoId: String(item.alunoId || '').trim(),
        status: item.status,
        observacao: item.observacao,
        faltaJustificada: Boolean(item.faltaJustificada),
      })),
    });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPERUSUARIO', 'ADMIN_ESCOLA', 'GESTOR', 'SECRETARIA')
  @Patch(':frequenciaId/falta-justificada')
  async atualizarFaltaJustificada(
    @Param('frequenciaId') frequenciaId: string,
    @Body()
    body: {
      faltaJustificada: boolean;
    },
    @CurrentUser() user: any,
  ) {
    if (!frequenciaId?.trim()) {
      throw new BadRequestException('Informe o registro de frequência.');
    }

    return this.frequenciaService.atualizarFaltaJustificada({
      userId: user?.id || user?.userId || user?.sub,
      userRole: user?.role as UserRole,
      userSchoolId: user?.schoolId,
      frequenciaId: frequenciaId.trim(),
      faltaJustificada: Boolean(body?.faltaJustificada),
    });
  }
}