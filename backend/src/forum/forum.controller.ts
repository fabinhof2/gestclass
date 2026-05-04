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
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ForumAtividadeTipo,
  ForumEnqueteModoEscolha,
  ForumEnqueteVisibilidadeResultado,
  ForumEntregaStatus,
  UserRole,
} from '@prisma/client';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ForumService } from './forum.service';
import { createUploadOptions } from '../security/upload-config';

const FORUM_ROLES = [
  'SUPERUSUARIO',
  'ADMIN_ESCOLA',
  'GESTOR',
  'COORDENADOR',
  'SECRETARIA',
  'PROFESSOR',
  'RESPONSAVEL',
  'ALUNO',
] as const;

function userFromRequest(user: any) {
  return {
    userId: user?.id || user?.userId || user?.sub,
    userRole: user?.role as UserRole,
    userSchoolId: user?.schoolId,
  };
}

function forumFile(file?: Express.Multer.File) {
  return file
    ? {
        url: `/uploads/forum/${file.filename}`,
        name: file.originalname,
        mime: file.mimetype,
      }
    : undefined;
}

const forumUpload = FileInterceptor(
  'file',
  createUploadOptions({
    destination: './uploads/forum',
    filePrefix: 'forum',
    profile: 'mixed',
  }),
);

@Controller('forum')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ForumController {
  constructor(private readonly forumService: ForumService) {}

  @Roles(...FORUM_ROLES)
  @Get('resumo')
  obterResumo(@CurrentUser() user: any) {
    return this.forumService.obterResumo(userFromRequest(user));
  }

  @Roles(...FORUM_ROLES)
  @Get('turmas')
  listarTurmas(@CurrentUser() user: any) {
    return this.forumService.listarTurmas(userFromRequest(user));
  }

  @Roles(...FORUM_ROLES)
  @Get('topicos')
  listarTopicos(
    @Query('turmaId') turmaId: string,
    @Query('disciplina') disciplina: string,
    @CurrentUser() user: any,
  ) {
    return this.forumService.listarTopicos(userFromRequest(user), {
      turmaId: turmaId?.trim() || undefined,
      disciplina: disciplina?.trim() || undefined,
    });
  }

  @Roles(...FORUM_ROLES)
  @Post('topicos')
  criarTopico(
    @Body()
    body: {
      turmaId?: string;
      disciplina?: string;
      titulo?: string;
      conteudo?: string;
    },
    @CurrentUser() user: any,
  ) {
    return this.forumService.criarTopico(userFromRequest(user), body);
  }

  @Roles(...FORUM_ROLES)
  @Post('topicos/:topicoId/comentarios')
  comentarTopico(
    @Param('topicoId') topicoId: string,
    @Body() body: { texto?: string },
    @CurrentUser() user: any,
  ) {
    return this.forumService.comentarTopico(
      userFromRequest(user),
      topicoId,
      body?.texto,
    );
  }

  @Roles(...FORUM_ROLES)
  @Get('atividades')
  listarAtividades(
    @Query('turmaId') turmaId: string,
    @Query('disciplina') disciplina: string,
    @CurrentUser() user: any,
  ) {
    return this.forumService.listarAtividades(userFromRequest(user), {
      turmaId: turmaId?.trim() || undefined,
      disciplina: disciplina?.trim() || undefined,
    });
  }

  @Roles('SUPERUSUARIO', 'ADMIN_ESCOLA', 'GESTOR', 'COORDENADOR', 'SECRETARIA', 'PROFESSOR')
  @Post('atividades')
  @UseInterceptors(forumUpload)
  criarAtividade(
    @Body()
    body: {
      turmaId?: string;
      disciplina?: string;
      titulo?: string;
      descricao?: string;
      tipo?: ForumAtividadeTipo;
      prazo?: string;
    },
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: any,
  ) {
    return this.forumService.criarAtividade(
      userFromRequest(user),
      body,
      forumFile(file),
    );
  }

  @Roles(...FORUM_ROLES)
  @Get('entregas')
  listarEntregas(
    @Query('atividadeId') atividadeId: string,
    @CurrentUser() user: any,
  ) {
    return this.forumService.listarEntregas(
      userFromRequest(user),
      atividadeId?.trim() || undefined,
    );
  }

  @Roles(...FORUM_ROLES)
  @Post('atividades/:atividadeId/entregas')
  @UseInterceptors(forumUpload)
  enviarEntrega(
    @Param('atividadeId') atividadeId: string,
    @Body() body: { texto?: string },
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: any,
  ) {
    if (!atividadeId?.trim()) {
      throw new BadRequestException('Informe a atividade.');
    }

    return this.forumService.enviarEntrega(
      userFromRequest(user),
      atividadeId.trim(),
      body,
      forumFile(file),
    );
  }

  @Roles('SUPERUSUARIO', 'ADMIN_ESCOLA', 'GESTOR', 'COORDENADOR', 'SECRETARIA', 'PROFESSOR')
  @Patch('entregas/:entregaId')
  corrigirEntrega(
    @Param('entregaId') entregaId: string,
    @Body() body: { status?: ForumEntregaStatus; feedback?: string },
    @CurrentUser() user: any,
  ) {
    return this.forumService.corrigirEntrega(
      userFromRequest(user),
      entregaId,
      body,
    );
  }

  @Roles(...FORUM_ROLES)
  @Delete('entregas/:entregaId')
  excluirEntrega(
    @Param('entregaId') entregaId: string,
    @CurrentUser() user: any,
  ) {
    return this.forumService.excluirEntrega(userFromRequest(user), entregaId);
  }

  @Roles(...FORUM_ROLES)
  @Get('enquetes')
  listarEnquetes(@Query('turmaId') turmaId: string, @CurrentUser() user: any) {
    return this.forumService.listarEnquetes(
      userFromRequest(user),
      turmaId?.trim() || undefined,
    );
  }

  @Roles('SUPERUSUARIO', 'ADMIN_ESCOLA', 'GESTOR', 'COORDENADOR', 'SECRETARIA', 'PROFESSOR')
  @Post('enquetes')
  criarEnquete(
    @Body()
    body: {
      turmaId?: string;
      pergunta?: string;
      opcoes?: string[];
      modoEscolha?: ForumEnqueteModoEscolha;
      visibilidadeResultado?: ForumEnqueteVisibilidadeResultado;
      encerramentoEm?: string;
    },
    @CurrentUser() user: any,
  ) {
    return this.forumService.criarEnquete(userFromRequest(user), body);
  }

  @Roles(...FORUM_ROLES)
  @Post('enquetes/:enqueteId/votos')
  votarEnquete(
    @Param('enqueteId') enqueteId: string,
    @Body() body: { opcaoId?: string; opcaoIds?: string[] },
    @CurrentUser() user: any,
  ) {
    return this.forumService.votarEnquete(
      userFromRequest(user),
      enqueteId,
      body?.opcaoIds || (body?.opcaoId ? [body.opcaoId] : []),
    );
  }

  @Roles('SUPERUSUARIO', 'ADMIN_ESCOLA', 'GESTOR', 'COORDENADOR', 'SECRETARIA', 'PROFESSOR')
  @Post('enquetes/:enqueteId/concluir')
  concluirEnquete(
    @Param('enqueteId') enqueteId: string,
    @CurrentUser() user: any,
  ) {
    return this.forumService.concluirEnquete(userFromRequest(user), enqueteId);
  }

  @Roles('SUPERUSUARIO', 'ADMIN_ESCOLA', 'GESTOR', 'COORDENADOR', 'SECRETARIA', 'PROFESSOR')
  @Delete('enquetes/:enqueteId')
  excluirEnquete(
    @Param('enqueteId') enqueteId: string,
    @CurrentUser() user: any,
  ) {
    return this.forumService.excluirEnquete(userFromRequest(user), enqueteId);
  }
}
