import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  PeriodoAvaliacao,
  TipoAtividadeNota,
  TipoComposicaoNota,
  UserRole,
} from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { NotasService } from './notas.service';

@Controller('notas')
export class NotasController {
  constructor(private readonly notasService: NotasService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('PROFESSOR')
  @Get('minhas-disciplinas')
  async listarMinhasDisciplinas(@CurrentUser() user: any) {
    return this.notasService.listarMinhasDisciplinas({
      userId: user?.id || user?.userId || user?.sub,
      userRole: user?.role as UserRole,
      userSchoolId: user?.schoolId,
    });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('PROFESSOR')
  @Get('turma-professor/:turmaProfessorId/alunos')
  async listarAlunosDaDisciplinaParaLancamento(
    @Param('turmaProfessorId') turmaProfessorId: string,
    @Query('periodo') periodo: PeriodoAvaliacao,
    @CurrentUser() user: any,
  ) {
    if (!periodo) {
      throw new BadRequestException('Informe o período.');
    }

    return this.notasService.listarAlunosDaDisciplinaParaLancamento({
      userId: user?.id || user?.userId || user?.sub,
      userRole: user?.role as UserRole,
      userSchoolId: user?.schoolId,
      turmaProfessorId,
      periodo,
    });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('PROFESSOR')
  @Post('rascunho-em-massa')
  async salvarRascunhoNotasEmMassa(
    @Body()
    body: {
      turmaProfessorId: string;
      periodo: PeriodoAvaliacao;
      tipoComposicao: TipoComposicaoNota;
      observacaoGeral?: string;
      atividades: Array<{
        ordem: number;
        tipoAtividade: TipoAtividadeNota;
        titulo: string;
        valorMaximo: number;
        permiteRecuperacao: boolean;
      }>;
      lancamentos: Array<{
        alunoId: string;
        observacao?: string;
        itens: Array<{
          ordem: number;
          nota: number;
          notaRecuperacao?: number | null;
          observacao?: string;
        }>;
      }>;
    },
    @CurrentUser() user: any,
  ) {
    if (!body?.turmaProfessorId?.trim()) {
      throw new BadRequestException('Informe o vínculo da disciplina.');
    }

    if (!body?.periodo) {
      throw new BadRequestException('Informe o período.');
    }

    if (!body?.tipoComposicao) {
      throw new BadRequestException('Informe o tipo de composição da nota.');
    }

    if (!Array.isArray(body?.atividades) || !body.atividades.length) {
      throw new BadRequestException(
        'Informe pelo menos uma atividade.',
      );
    }

    if (!Array.isArray(body?.lancamentos) || !body.lancamentos.length) {
      throw new BadRequestException(
        'Informe pelo menos um lançamento de aluno.',
      );
    }

    return this.notasService.salvarRascunhoNotasEmMassa({
      userId: user?.id || user?.userId || user?.sub,
      userRole: user?.role as UserRole,
      userSchoolId: user?.schoolId,
      turmaProfessorId: body.turmaProfessorId.trim(),
      periodo: body.periodo,
      tipoComposicao: body.tipoComposicao,
      observacaoGeral: body.observacaoGeral,
      atividades: body.atividades.map((atividade, index) => ({
        ordem: Number(atividade.ordem ?? index + 1),
        tipoAtividade: atividade.tipoAtividade,
        titulo: String(atividade.titulo || '').trim(),
        valorMaximo: Number(atividade.valorMaximo),
        permiteRecuperacao: Boolean(atividade.permiteRecuperacao),
      })),
      lancamentos: body.lancamentos.map((lancamento) => ({
        alunoId: String(lancamento.alunoId || '').trim(),
        observacao: lancamento.observacao,
        itens: Array.isArray(lancamento.itens)
          ? lancamento.itens.map((item, index) => ({
              ordem: Number(item.ordem ?? index + 1),
              nota: Number(item.nota),
              notaRecuperacao:
                item.notaRecuperacao === undefined ||
                item.notaRecuperacao === null
                  ? null
                  : Number(item.notaRecuperacao),
              observacao: item.observacao,
            }))
          : [],
      })),
    });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('PROFESSOR')
  @Post('enviar-em-massa')
  async enviarNotasParaBoletimEmMassa(
    @Body()
    body: {
      turmaProfessorId: string;
      periodo: PeriodoAvaliacao;
    },
    @CurrentUser() user: any,
  ) {
    if (!body?.turmaProfessorId?.trim()) {
      throw new BadRequestException('Informe o vínculo da disciplina.');
    }

    if (!body?.periodo) {
      throw new BadRequestException('Informe o período.');
    }

    return this.notasService.enviarNotasParaBoletimEmMassa({
      userId: user?.id || user?.userId || user?.sub,
      userRole: user?.role as UserRole,
      userSchoolId: user?.schoolId,
      turmaProfessorId: body.turmaProfessorId.trim(),
      periodo: body.periodo,
    });
  }

    @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('PROFESSOR')
  @Post('cancelar-envio-em-massa')
  async cancelarEnvioNotasParaBoletimEmMassa(
    @Body()
    body: {
      turmaProfessorId: string;
      periodo: PeriodoAvaliacao;
    },
    @CurrentUser() user: any,
  ) {
    if (!body?.turmaProfessorId?.trim()) {
      throw new BadRequestException('Informe o vínculo da disciplina.');
    }

    if (!body?.periodo) {
      throw new BadRequestException('Informe o período.');
    }

    return this.notasService.cancelarEnvioNotasParaBoletimEmMassa({
      userId: user?.id || user?.userId || user?.sub,
      userRole: user?.role as UserRole,
      userSchoolId: user?.schoolId,
      turmaProfessorId: body.turmaProfessorId.trim(),
      periodo: body.periodo,
    });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ALUNO')
  @Get('boletim/me')
  async visualizarMeuBoletimAluno(@CurrentUser() user: any) {
    return this.notasService.visualizarMeuBoletimAluno({
      userId: user?.id || user?.userId || user?.sub,
      userRole: user?.role as UserRole,
      userSchoolId: user?.schoolId,
    });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPERUSUARIO', 'ADMIN_ESCOLA', 'GESTOR', 'SECRETARIA', 'RESPONSAVEL')
  @Get('boletim/:alunoId')
  async visualizarBoletimAluno(
    @Param('alunoId') alunoId: string,
    @CurrentUser() user: any,
  ) {
    return this.notasService.visualizarBoletimAluno({
      userRole: user?.role as UserRole,
      userSchoolId: user?.schoolId,
      userId: user?.id || user?.userId || user?.sub,
      alunoId,
    });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPERUSUARIO', 'ADMIN_ESCOLA', 'GESTOR', 'SECRETARIA')
  @Get('boletim')
  async listarTurmasComAlunosParaBoletim(@CurrentUser() user: any) {
    return this.notasService.listarTurmasComAlunosParaBoletim({
      userRole: user?.role as UserRole,
      userSchoolId: user?.schoolId,
    });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ALUNO')
  @Get('minhas-notas')
  async visualizarMinhasNotasAluno(@CurrentUser() user: any) {
    return this.notasService.visualizarMinhasNotasAluno({
      userId: user?.id || user?.userId || user?.sub,
      userRole: user?.role as UserRole,
      userSchoolId: user?.schoolId,
    });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('RESPONSAVEL')
  @Get('responsavel')
  async listarAlunosResponsavel(@CurrentUser() user: any) {
    return this.notasService.listarAlunosResponsavel({
      userId: user?.id || user?.userId || user?.sub,
      userRole: user?.role as UserRole,
      userSchoolId: user?.schoolId,
    });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(
    'SUPERUSUARIO',
    'ADMIN_ESCOLA',
    'GESTOR',
    'SECRETARIA',
    'RESPONSAVEL',
    'ALUNO',
  )
  @Get('aluno/:alunoId')
  async visualizarNotasDetalhadasAluno(
    @Param('alunoId') alunoId: string,
    @CurrentUser() user: any,
  ) {
    return this.notasService.visualizarNotasDetalhadasAluno({
      userId: user?.id || user?.userId || user?.sub,
      userRole: user?.role as UserRole,
      userSchoolId: user?.schoolId,
      alunoId,
    });
  }
}
