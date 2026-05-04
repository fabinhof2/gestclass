import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { SolicitacaoTipo, UserRole } from '@prisma/client';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { SolicitacoesService } from './solicitacoes.service';
import { createUploadOptions } from '../security/upload-config';

const SOLICITACOES_ROLES = [
  'SUPERUSUARIO',
  'ADMIN_ESCOLA',
  'FINANCEIRO',
  'GESTOR',
  'COORDENADOR',
  'SECRETARIA',
  'AUXILIAR',
  'PROFESSOR',
  'RESPONSAVEL',
  'ALUNO',
] as const;

@Controller('solicitacoes')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SolicitacoesController {
  constructor(private readonly service: SolicitacoesService) {}

  @Roles(...SOLICITACOES_ROLES)
  @Get('alunos')
  listarAlunos(@CurrentUser() user: any) {
    return this.service.listarAlunos({
      id: user?.id || user?.userId || user?.sub,
      role: user?.role as UserRole,
      schoolId: user?.schoolId,
    });
  }

  @Roles(...SOLICITACOES_ROLES)
  @Get()
  listar(@CurrentUser() user: any) {
    return this.service.listar({
      id: user?.id || user?.userId || user?.sub,
      role: user?.role as UserRole,
      schoolId: user?.schoolId,
    });
  }

  @Roles(...SOLICITACOES_ROLES)
  @Post()
  criar(
    @CurrentUser() user: any,
    @Body()
    body: {
      alunoId?: string;
      tipo?: SolicitacaoTipo;
      especificacao?: string;
      descricao?: string;
    },
  ) {
    return this.service.criar(
      {
        id: user?.id || user?.userId || user?.sub,
        role: user?.role as UserRole,
        schoolId: user?.schoolId,
      },
      body,
    );
  }

  @Roles(...SOLICITACOES_ROLES)
  @Patch(':id')
  atualizar(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body()
    body: {
      alunoId?: string;
      tipo?: SolicitacaoTipo;
      especificacao?: string;
      descricao?: string;
    },
  ) {
    return this.service.atualizar(
      {
        id: user?.id || user?.userId || user?.sub,
        role: user?.role as UserRole,
        schoolId: user?.schoolId,
      },
      id,
      body,
    );
  }

  @Roles(...SOLICITACOES_ROLES)
  @Delete(':id')
  excluir(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.excluir(
      {
        id: user?.id || user?.userId || user?.sub,
        role: user?.role as UserRole,
        schoolId: user?.schoolId,
      },
      id,
    );
  }

  @Roles('SUPERUSUARIO', 'SECRETARIA', 'GESTOR')
  @Patch(':id/recebida')
  marcarRecebida(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.marcarRecebida(
      {
        id: user?.id || user?.userId || user?.sub,
        role: user?.role as UserRole,
        schoolId: user?.schoolId,
      },
      id,
    );
  }

  @Roles('SUPERUSUARIO', 'SECRETARIA', 'GESTOR')
  @Patch(':id/resposta')
  @UseInterceptors(
    FileInterceptor(
      'file',
      createUploadOptions({
        destination: './uploads/solicitacoes',
        filePrefix: 'solicitacao',
        profile: 'document',
      }),
    ),
  )
  responder(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() body: { resposta?: string },
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.service.responder(
      {
        id: user?.id || user?.userId || user?.sub,
        role: user?.role as UserRole,
        schoolId: user?.schoolId,
      },
      id,
      {
        resposta: body?.resposta,
        anexoUrl: file ? `/uploads/solicitacoes/${file.filename}` : undefined,
        anexoNome: file?.originalname,
        anexoMime: file?.mimetype,
      },
    );
  }
}
