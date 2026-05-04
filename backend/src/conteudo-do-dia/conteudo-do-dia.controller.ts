import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ConteudoDoDiaService } from './conteudo-do-dia.service';
import { createUploadOptions } from '../security/upload-config';

@Controller('conteudo-do-dia')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ConteudoDoDiaController {
  constructor(private readonly service: ConteudoDoDiaService) {}

  @Roles('PROFESSOR', 'ADMIN_ESCOLA', 'GESTOR', 'SECRETARIA', 'SUPERUSUARIO')
  @Get('disciplinas')
  listarDisciplinas(@CurrentUser() user: any) {
    return this.service.listarDisciplinas({
      userId: user?.id || user?.userId || user?.sub,
      userRole: user?.role as UserRole,
      userSchoolId: user?.schoolId,
    });
  }

  @Roles('PROFESSOR', 'ADMIN_ESCOLA', 'GESTOR', 'SECRETARIA', 'SUPERUSUARIO')
  @Get('plano')
  obterPlano(
    @Query('turmaProfessorId') turmaProfessorId: string,
    @Query('ano') ano: string,
    @CurrentUser() user: any,
  ) {
    return this.service.obterPlano({
      userId: user?.id || user?.userId || user?.sub,
      userRole: user?.role as UserRole,
      userSchoolId: user?.schoolId,
      turmaProfessorId,
      ano: Number(ano),
    });
  }

  @Roles('PROFESSOR')
  @Post('plano')
  salvarPlano(@Body() body: any, @CurrentUser() user: any) {
    return this.service.salvarPlano({
      userId: user?.id || user?.userId || user?.sub,
      userRole: user?.role as UserRole,
      userSchoolId: user?.schoolId,
      turmaProfessorId: body?.turmaProfessorId,
      ano: Number(body?.ano),
      conteudoGeral: body?.conteudoGeral,
      objetivoGeral: body?.objetivoGeral,
      metodologiaGeral: body?.metodologiaGeral,
      observacoes: body?.observacoes,
      planejamentos: Array.isArray(body?.planejamentos) ? body.planejamentos : [],
    });
  }

  @Roles('PROFESSOR')
  @Post('planejamento-diario')
  salvarPlanejamentoDiario(@Body() body: any, @CurrentUser() user: any) {
    return this.service.salvarPlanejamentoDiario({
      userId: user?.id || user?.userId || user?.sub,
      userRole: user?.role as UserRole,
      userSchoolId: user?.schoolId,
      turmaProfessorId: body?.turmaProfessorId,
      data: body?.data,
      conteudo: body?.conteudo,
      objetivo: body?.objetivo,
      metodologia: body?.metodologia,
      atividades: body?.atividades,
    });
  }

  @Roles('PROFESSOR')
  @Post('anexos/upload')
  @UseInterceptors(
    FileInterceptor(
      'file',
      createUploadOptions({
        destination: './uploads/conteudo-do-dia',
        filePrefix: 'conteudo',
        profile: 'mixed',
      }),
    ),
  )
  uploadAnexo(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Arquivo não enviado.');
    }

    return {
      anexoUrl: `/uploads/conteudo-do-dia/${file.filename}`,
      nomeOriginal: file.originalname,
    };
  }

  @Roles('ALUNO', 'RESPONSAVEL')
  @Get('meus-conteudos')
  listarMeusConteudos(
    @Query('mes') mes: string | undefined,
    @Query('data') data: string | undefined,
    @Query('alunoId') alunoId: string | undefined,
    @CurrentUser() user: any,
  ) {
    return this.service.listarMeusConteudos({
      userId: user?.id || user?.userId || user?.sub,
      userRole: user?.role as UserRole,
      userSchoolId: user?.schoolId,
      mes,
      data,
      alunoId,
    });
  }

  @Roles('ALUNO', 'RESPONSAVEL')
  @Get('meu-calendario')
  listarMeuCalendario(
    @Query('mes') mes: string | undefined,
    @Query('alunoId') alunoId: string | undefined,
    @CurrentUser() user: any,
  ) {
    return this.service.listarMeuCalendario({
      userId: user?.id || user?.userId || user?.sub,
      userRole: user?.role as UserRole,
      userSchoolId: user?.schoolId,
      mes,
      alunoId,
    });
  }

  @Roles('PROFESSOR', 'ADMIN_ESCOLA', 'GESTOR', 'SECRETARIA', 'SUPERUSUARIO')
  @Get('impressao')
  obterImpressao(
    @Query('turmaProfessorId') turmaProfessorId: string,
    @Query('ano') ano: string,
    @CurrentUser() user: any,
  ) {
    return this.service.obterImpressao({
      userId: user?.id || user?.userId || user?.sub,
      userRole: user?.role as UserRole,
      userSchoolId: user?.schoolId,
      turmaProfessorId,
      ano: Number(ano),
    });
  }
}

