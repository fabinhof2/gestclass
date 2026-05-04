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
import { ComunicacaoPostTipo, UserRole } from '@prisma/client';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ComunicacaoService } from './comunicacao.service';
import { createUploadOptions } from '../security/upload-config';

const COMUNICACAO_ROLES = [
  'SUPERUSUARIO',
  'ADMIN_ESCOLA',
  'GESTOR',
  'COORDENADOR',
  'SECRETARIA',
  'PROFESSOR',
  'RESPONSAVEL',
  'ALUNO',
] as const;

@Controller('comunicacao')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ComunicacaoController {
  constructor(private readonly comunicacaoService: ComunicacaoService) {}

  @Roles(...COMUNICACAO_ROLES)
  @Get('resumo')
  async obterResumo(@CurrentUser() user: any) {
    return this.comunicacaoService.obterResumo({
      userId: user?.id || user?.userId || user?.sub,
      userRole: user?.role as UserRole,
      userSchoolId: user?.schoolId,
    });
  }

  @Roles(...COMUNICACAO_ROLES)
  @Get('grupos')
  async listarGrupos(@CurrentUser() user: any) {
    return this.comunicacaoService.listarGrupos({
      userId: user?.id || user?.userId || user?.sub,
      userRole: user?.role as UserRole,
      userSchoolId: user?.schoolId,
    });
  }

  @Roles('SUPERUSUARIO', 'ADMIN_ESCOLA', 'GESTOR', 'COORDENADOR', 'SECRETARIA', 'PROFESSOR')
  @Get('candidatos')
  async listarCandidatos(@Query('q') q: string, @CurrentUser() user: any) {
    return this.comunicacaoService.listarCandidatos({
      userId: user?.id || user?.userId || user?.sub,
      userRole: user?.role as UserRole,
      userSchoolId: user?.schoolId,
      termo: q,
    });
  }

  @Roles('SUPERUSUARIO', 'ADMIN_ESCOLA', 'GESTOR', 'COORDENADOR', 'SECRETARIA', 'PROFESSOR')
  @Post('grupos/:grupoId/membros')
  async adicionarMembros(
    @Param('grupoId') grupoId: string,
    @Body() body: { userIds: string[] },
    @CurrentUser() user: any,
  ) {
    return this.comunicacaoService.adicionarMembros({
      userId: user?.id || user?.userId || user?.sub,
      userRole: user?.role as UserRole,
      userSchoolId: user?.schoolId,
      grupoId,
      userIds: Array.isArray(body?.userIds) ? body.userIds : [],
    });
  }

  @Roles(...COMUNICACAO_ROLES)
  @Get('posts')
  async listarPosts(@Query('grupoId') grupoId: string, @CurrentUser() user: any) {
    if (!grupoId?.trim()) {
      throw new BadRequestException('Informe o grupo.');
    }

    return this.comunicacaoService.listarPosts({
      userId: user?.id || user?.userId || user?.sub,
      userRole: user?.role as UserRole,
      userSchoolId: user?.schoolId,
      grupoId: grupoId.trim(),
    });
  }

  @Roles(...COMUNICACAO_ROLES)
  @Post('posts/limpeza')
  async limparPosts(
    @Body() body: { grupoIds?: string[]; reset?: boolean | string },
    @CurrentUser() user: any,
  ) {
    const reset = body?.reset === true || body?.reset === 'true';

    return this.comunicacaoService.limparPosts({
      userId: user?.id || user?.userId || user?.sub,
      userRole: user?.role as UserRole,
      userSchoolId: user?.schoolId,
      grupoIds: Array.isArray(body?.grupoIds) ? body.grupoIds : [],
      reset,
    });
  }

  @Roles(...COMUNICACAO_ROLES)
  @Post('posts')
  @UseInterceptors(
    FileInterceptor(
      'file',
      createUploadOptions({
        destination: './uploads/comunicacao',
        filePrefix: 'midia',
        profile: 'media',
      }),
    ),
  )
  async criarPost(
    @Body()
    body: {
      grupoId: string;
      texto?: string;
      tipo?: ComunicacaoPostTipo;
      paraTodosEscola?: boolean | string;
    },
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: any,
  ) {
    const paraTodosEscola =
      body?.paraTodosEscola === true || body?.paraTodosEscola === 'true';

    if (!paraTodosEscola && !body?.grupoId?.trim()) {
      throw new BadRequestException('Informe o grupo.');
    }

    return this.comunicacaoService.criarPost({
      userId: user?.id || user?.userId || user?.sub,
      userRole: user?.role as UserRole,
      userSchoolId: user?.schoolId,
      grupoId: body.grupoId?.trim() || '',
      texto: body.texto,
      tipo: body.tipo,
      mediaUrl: file ? `/uploads/comunicacao/${file.filename}` : undefined,
      mediaMime: file?.mimetype,
      paraTodosEscola,
    });
  }

  @Roles(...COMUNICACAO_ROLES)
  @Patch('posts/:postId')
  async editarPost(
    @Param('postId') postId: string,
    @Body() body: { texto?: string; tipo?: ComunicacaoPostTipo },
    @CurrentUser() user: any,
  ) {
    return this.comunicacaoService.editarPost({
      userId: user?.id || user?.userId || user?.sub,
      userRole: user?.role as UserRole,
      userSchoolId: user?.schoolId,
      postId,
      texto: body?.texto,
      tipo: body?.tipo,
    });
  }

  @Roles(...COMUNICACAO_ROLES)
  @Delete('posts/:postId')
  async excluirPost(@Param('postId') postId: string, @CurrentUser() user: any) {
    return this.comunicacaoService.excluirPost({
      userId: user?.id || user?.userId || user?.sub,
      userRole: user?.role as UserRole,
      userSchoolId: user?.schoolId,
      postId,
    });
  }

  @Roles(...COMUNICACAO_ROLES)
  @Post('posts/:postId/comentarios')
  async comentar(
    @Param('postId') postId: string,
    @Body() body: { texto: string },
    @CurrentUser() user: any,
  ) {
    return this.comunicacaoService.comentar({
      userId: user?.id || user?.userId || user?.sub,
      userRole: user?.role as UserRole,
      userSchoolId: user?.schoolId,
      postId,
      texto: body?.texto,
    });
  }

  @Roles(...COMUNICACAO_ROLES)
  @Post('posts/:postId/reacoes')
  async reagirPost(
    @Param('postId') postId: string,
    @Body() body: { tipo: 'LIKE' | 'DISLIKE' },
    @CurrentUser() user: any,
  ) {
    return this.comunicacaoService.reagirPost({
      userId: user?.id || user?.userId || user?.sub,
      userRole: user?.role as UserRole,
      userSchoolId: user?.schoolId,
      postId,
      tipo: body?.tipo === 'DISLIKE' ? 'DISLIKE' : 'LIKE',
    });
  }

  @Roles(...COMUNICACAO_ROLES)
  @Post('posts/:postId/moderar')
  async moderarPost(
    @Param('postId') postId: string,
    @CurrentUser() user: any,
  ) {
    return this.comunicacaoService.moderarPost({
      userId: user?.id || user?.userId || user?.sub,
      userRole: user?.role as UserRole,
      userSchoolId: user?.schoolId,
      postId,
    });
  }

  @Roles(...COMUNICACAO_ROLES)
  @Post('autores/:authorId/liberar-postagem')
  async liberarAutorModerado(
    @Param('authorId') authorId: string,
    @CurrentUser() user: any,
  ) {
    return this.comunicacaoService.liberarAutorModerado({
      userId: user?.id || user?.userId || user?.sub,
      userRole: user?.role as UserRole,
      userSchoolId: user?.schoolId,
      authorId,
    });
  }

  @Roles(...COMUNICACAO_ROLES)
  @Get('chat')
  async listarMensagens(
    @Query('grupoId') grupoId: string,
    @CurrentUser() user: any,
  ) {
    if (!grupoId?.trim()) {
      throw new BadRequestException('Informe o grupo.');
    }

    return this.comunicacaoService.listarMensagens({
      userId: user?.id || user?.userId || user?.sub,
      userRole: user?.role as UserRole,
      userSchoolId: user?.schoolId,
      grupoId: grupoId.trim(),
    });
  }

  @Roles(...COMUNICACAO_ROLES)
  @Post('chat/privado')
  async criarOuObterChatPrivado(
    @Body() body: { targetUserId: string },
    @CurrentUser() user: any,
  ) {
    return this.comunicacaoService.criarOuObterChatPrivado({
      userId: user?.id || user?.userId || user?.sub,
      userRole: user?.role as UserRole,
      userSchoolId: user?.schoolId,
      targetUserId: body?.targetUserId,
    });
  }

  @Roles(...COMUNICACAO_ROLES)
  @Post('chat')
  @UseInterceptors(
    FileInterceptor(
      'file',
      createUploadOptions({
        destination: './uploads/comunicacao',
        filePrefix: 'chat',
        profile: 'media',
      }),
    ),
  )
  async enviarMensagem(
    @Body()
    body: {
      grupoId: string;
      texto: string;
      paraTodosEscola?: boolean | string;
    },
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: any,
  ) {
    const paraTodosEscola =
      body?.paraTodosEscola === true || body?.paraTodosEscola === 'true';

    if (!paraTodosEscola && !body?.grupoId?.trim()) {
      throw new BadRequestException('Informe o grupo.');
    }

    return this.comunicacaoService.enviarMensagem({
      userId: user?.id || user?.userId || user?.sub,
      userRole: user?.role as UserRole,
      userSchoolId: user?.schoolId,
      grupoId: body.grupoId?.trim() || '',
      texto: body.texto,
      mediaUrl: file ? `/uploads/comunicacao/${file.filename}` : undefined,
      mediaMime: file?.mimetype,
      paraTodosEscola,
    });
  }
}
