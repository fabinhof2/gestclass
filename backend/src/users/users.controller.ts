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
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { ResponsavelDocumentoTipo, UserRole } from '@prisma/client';
import { createReadStream, existsSync } from 'fs';
import { join } from 'path';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { createUploadOptions } from '../security/upload-config';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  private ensureSameSchoolOrPrivileged(user: any, targetUser: any) {
    if (!user) {
      throw new ForbiddenException('Usuário não autenticado');
    }

    if (user.role === UserRole.SUPERUSUARIO) {
      return;
    }

    if (
      user.role === UserRole.ADMIN_ESCOLA ||
      user.role === UserRole.GESTOR ||
      user.role === UserRole.SECRETARIA
    ) {
      if (!user.schoolId) {
        throw new ForbiddenException('Usuário sem escola vinculada');
      }

      if (targetUser.schoolId !== user.schoolId) {
        throw new ForbiddenException('Sem permissão para acessar este usuário');
      }

      return;
    }

    throw new ForbiddenException('Sem permissão');
  }

  @UseGuards(JwtAuthGuard)
  @Patch('change-password')
  async changePassword(
    @CurrentUser() user: any,
    @Body()
    body: {
      senhaAtual: string;
      novaSenha: string;
    },
  ) {
    const currentUserId = user?.id || user?.userId || user?.sub;

    if (!currentUserId) {
      throw new ForbiddenException('Usuário não autenticado');
    }

    if (!body?.senhaAtual?.trim()) {
      throw new BadRequestException('Informe a senha atual.');
    }

    if (!body?.novaSenha?.trim()) {
      throw new BadRequestException('Informe a nova senha.');
    }

    return this.usersService.changePassword(
      currentUserId,
      body.senhaAtual.trim(),
      body.novaSenha.trim(),
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get('me/access')
  async getOwnAccess(@CurrentUser() user: any) {
    const currentUserId = user?.id || user?.userId || user?.sub;

    if (!currentUserId) {
      throw new ForbiddenException('Usuário não autenticado');
    }

    return this.usersService.getOwnAccess(currentUserId);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('me/access')
  async updateOwnAccess(
    @CurrentUser() user: any,
    @Body()
    body: {
      username?: string | null;
      cpf?: string | null;
    },
  ) {
    const currentUserId = user?.id || user?.userId || user?.sub;

    if (!currentUserId) {
      throw new ForbiddenException('Usuário não autenticado');
    }

    return this.usersService.updateOwnAccess(currentUserId, {
      username: body?.username,
      cpf: body?.cpf,
    });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPERUSUARIO', 'ADMIN_ESCOLA', 'GESTOR', 'SECRETARIA')
  @Get('documentos/view/:docId')
  async viewResponsavelDocumento(
    @Param('docId') docId: string,
    @CurrentUser() user: any,
    @Res() res: Response,
  ) {
    const documento = await this.usersService.findResponsavelDocumentoById(docId);

    if (
      user.role === UserRole.ADMIN_ESCOLA ||
      user.role === UserRole.GESTOR ||
      user.role === UserRole.SECRETARIA
    ) {
      if (!user.schoolId || documento.responsavel.schoolId !== user.schoolId) {
        throw new ForbiddenException(
          'Sem permissão para visualizar este documento',
        );
      }
    }

    const caminhoRelativo = String(documento.arquivoUrl || '').replace(
      /^\/+/,
      '',
    );
    const caminhoAbsoluto = join(process.cwd(), caminhoRelativo);

    if (!existsSync(caminhoAbsoluto)) {
      throw new BadRequestException('Arquivo físico do documento não encontrado.');
    }

    res.setHeader(
      'Content-Type',
      documento.mimeType || 'application/octet-stream',
    );
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${encodeURIComponent(documento.nomeOriginal)}"`,
    );

    const fileStream = createReadStream(caminhoAbsoluto);
    fileStream.pipe(res);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPERUSUARIO', 'ADMIN_ESCOLA', 'GESTOR', 'SECRETARIA')
  @Get('documentos/download/:docId')
  async downloadResponsavelDocumento(
    @Param('docId') docId: string,
    @CurrentUser() user: any,
    @Res() res: Response,
  ) {
    const documento = await this.usersService.findResponsavelDocumentoById(docId);

    if (
      user.role === UserRole.ADMIN_ESCOLA ||
      user.role === UserRole.GESTOR ||
      user.role === UserRole.SECRETARIA
    ) {
      if (!user.schoolId || documento.responsavel.schoolId !== user.schoolId) {
        throw new ForbiddenException(
          'Sem permissão para baixar este documento',
        );
      }
    }

    const caminhoRelativo = String(documento.arquivoUrl || '').replace(
      /^\/+/,
      '',
    );
    const caminhoAbsoluto = join(process.cwd(), caminhoRelativo);

    if (!existsSync(caminhoAbsoluto)) {
      throw new BadRequestException('Arquivo físico do documento não encontrado.');
    }

    res.setHeader(
      'Content-Type',
      documento.mimeType || 'application/octet-stream',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(documento.nomeOriginal)}"`,
    );

    const fileStream = createReadStream(caminhoAbsoluto);
    fileStream.pipe(res);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPERUSUARIO', 'ADMIN_ESCOLA', 'GESTOR', 'SECRETARIA')
  @Delete('documentos/:docId')
  async deleteResponsavelDocumento(
    @Param('docId') docId: string,
    @CurrentUser() user: any,
  ) {
    const documento = await this.usersService.findResponsavelDocumentoById(docId);

    if (
      user.role === UserRole.ADMIN_ESCOLA ||
      user.role === UserRole.GESTOR ||
      user.role === UserRole.SECRETARIA
    ) {
      if (!user.schoolId || documento.responsavel.schoolId !== user.schoolId) {
        throw new ForbiddenException(
          'Sem permissão para excluir este documento',
        );
      }
    }

    return this.usersService.deleteResponsavelDocumento(docId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPERUSUARIO', 'ADMIN_ESCOLA', 'GESTOR', 'SECRETARIA')
  @Get()
  async findAll(
    @Query('schoolId') schoolId?: string,
    @CurrentUser() user?: any,
  ) {
    if (!user) {
      throw new ForbiddenException('Usuário não autenticado');
    }

    if (user.role === 'SUPERUSUARIO') {
      if (schoolId && schoolId.trim()) {
        return this.usersService.findBySchoolId(schoolId);
      }
      return this.usersService.findAll();
    }

    if (
      user.role === 'ADMIN_ESCOLA' ||
      user.role === 'GESTOR' ||
      user.role === 'SECRETARIA'
    ) {
      if (!user.schoolId) {
        throw new ForbiddenException('Usuário sem escola vinculada');
      }

      return this.usersService.findBySchoolId(user.schoolId);
    }

    throw new ForbiddenException('Sem permissão para listar usuários');
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPERUSUARIO')
  @Get('resolve-login-identifier')
  async resolveLoginIdentifier(@Query('identifier') identifier?: string) {
    const normalizedIdentifier = String(identifier || '').trim();

    if (!normalizedIdentifier) {
      throw new BadRequestException('Informe o identificador do admin.');
    }

    return this.usersService.findByLoginIdentifier(normalizedIdentifier);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN_ESCOLA')
  @Get('my-school-users')
  async findMySchoolUsers(@CurrentUser() user: any) {
    if (!user || !user.schoolId) {
      throw new ForbiddenException('Admin sem escola vinculada');
    }

    return this.usersService.findBySchoolId(user.schoolId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPERUSUARIO', 'ADMIN_ESCOLA', 'GESTOR', 'SECRETARIA')
  @Get(':id/documentos')
  async listResponsavelDocumentos(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ) {
    const targetUser = await this.usersService.findById(id);

    if (!targetUser) {
      throw new BadRequestException('Usuário não encontrado');
    }

    if (targetUser.role !== UserRole.RESPONSAVEL) {
      throw new BadRequestException(
        'Esta rota só pode ser usada para usuários do tipo RESPONSAVEL',
      );
    }

    this.ensureSameSchoolOrPrivileged(user, targetUser);

    return this.usersService.listResponsavelDocumentos(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPERUSUARIO', 'ADMIN_ESCOLA', 'GESTOR', 'SECRETARIA')
  @Post(':id/documentos')
  @UseInterceptors(
    FileInterceptor(
      'file',
      createUploadOptions({
        destination: './uploads/responsaveis/documentos',
        filePrefix: 'documento-responsavel',
        profile: 'document',
      }),
    ),
  )
  async uploadResponsavelDocumento(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body()
    body: {
      tipo: string;
      observacao?: string;
    },
    @CurrentUser() user: any,
  ) {
    if (!file) {
      throw new BadRequestException('Arquivo não enviado.');
    }

    if (!body?.tipo?.trim()) {
      throw new BadRequestException('Informe o tipo do documento.');
    }

    const targetUser = await this.usersService.findById(id);

    if (!targetUser) {
      throw new BadRequestException('Usuário não encontrado');
    }

    if (targetUser.role !== UserRole.RESPONSAVEL) {
      throw new BadRequestException(
        'Documento só pode ser enviado para usuário do tipo RESPONSAVEL',
      );
    }

    this.ensureSameSchoolOrPrivileged(user, targetUser);

    const tiposPermitidos = [
      ResponsavelDocumentoTipo.IDENTIDADE,
      ResponsavelDocumentoTipo.CPF,
      ResponsavelDocumentoTipo.COMPROVANTE_RESIDENCIA,
      ResponsavelDocumentoTipo.CONTRATO_PRESTACAO_SERVICO,
    ];

    const tipoNormalizado = String(body.tipo).trim().toUpperCase();

    if (!tiposPermitidos.includes(tipoNormalizado as ResponsavelDocumentoTipo)) {
      throw new BadRequestException('Tipo de documento inválido.');
    }

    const arquivoUrl = `/uploads/responsaveis/documentos/${file.filename}`;

    return this.usersService.createResponsavelDocumento({
      responsavelId: id,
      tipo: tipoNormalizado as ResponsavelDocumentoTipo,
      nomeOriginal: file.originalname,
      arquivoUrl,
      mimeType: file.mimetype,
      observacao: body.observacao?.trim(),
    });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPERUSUARIO', 'ADMIN_ESCOLA', 'GESTOR', 'SECRETARIA')
  @Post(':id/foto')
  @UseInterceptors(
    FileInterceptor(
      'file',
      createUploadOptions({
        destination: './uploads/responsaveis/fotos',
        filePrefix: 'foto-responsavel',
        profile: 'image',
      }),
    ),
  )
  async uploadResponsavelFoto(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: any,
  ) {
    if (!file) {
      throw new BadRequestException('Arquivo não enviado.');
    }

    const targetUser = await this.usersService.findById(id);

    if (!targetUser) {
      throw new BadRequestException('Usuário não encontrado');
    }

    if (targetUser.role !== UserRole.RESPONSAVEL) {
      throw new BadRequestException(
        'A foto só pode ser enviada para usuário do tipo RESPONSAVEL',
      );
    }

    this.ensureSameSchoolOrPrivileged(user, targetUser);

    const fotoUrl = `/uploads/responsaveis/fotos/${file.filename}`;

    return this.usersService.updateResponsavelFoto(id, fotoUrl);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPERUSUARIO', 'ADMIN_ESCOLA', 'GESTOR', 'SECRETARIA')
  @Get(':id')
  async findById(@Param('id') id: string, @CurrentUser() user: any) {
    if (!user) {
      throw new ForbiddenException('Usuário não autenticado');
    }

    const targetUser = await this.usersService.findById(id);

    if (!targetUser) {
      throw new BadRequestException('Usuário não encontrado');
    }

    if (user.role === 'SUPERUSUARIO') {
      return targetUser;
    }

    if (
      user.role === 'ADMIN_ESCOLA' ||
      user.role === 'GESTOR' ||
      user.role === 'SECRETARIA'
    ) {
      if (!user.schoolId) {
        throw new ForbiddenException('Usuário sem escola vinculada');
      }

      if (targetUser.schoolId !== user.schoolId) {
        throw new ForbiddenException('Sem permissão para acessar este usuário');
      }

      return targetUser;
    }

    throw new ForbiddenException('Sem permissão para acessar usuário');
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPERUSUARIO', 'ADMIN_ESCOLA', 'GESTOR', 'SECRETARIA')
  @Patch(':id/responsavel')
  async updateResponsavel(
    @Param('id') id: string,
    @Body()
    body: {
      name?: string;
      phone?: string;
      address?: string;
      cpf?: string;
      identidade?: string;
    },
    @CurrentUser() user: any,
  ) {
    if (!user) {
      throw new ForbiddenException('Usuário não autenticado');
    }

    const targetUser = await this.usersService.findById(id);

    if (!targetUser) {
      throw new BadRequestException('Usuário não encontrado');
    }

    if (targetUser.role !== UserRole.RESPONSAVEL) {
      throw new BadRequestException(
        'Esta rota só pode ser usada para usuários do tipo RESPONSAVEL',
      );
    }

    this.ensureSameSchoolOrPrivileged(user, targetUser);

    return this.usersService.updateResponsavel(id, body);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPERUSUARIO', 'ADMIN_ESCOLA', 'GESTOR', 'SECRETARIA')
  @Patch(':id/responsavel-acesso')
  async configureResponsavelAccess(
    @Param('id') id: string,
    @Body()
    body: {
      email: string;
      username?: string | null;
      password?: string;
      isActive: boolean;
    },
    @CurrentUser() user: any,
  ) {
    if (!user) {
      throw new ForbiddenException('Usuário não autenticado');
    }

    const targetUser = await this.usersService.findById(id);

    if (!targetUser) {
      throw new BadRequestException('Usuário não encontrado');
    }

    if (targetUser.role !== UserRole.RESPONSAVEL) {
      throw new BadRequestException(
        'Esta rota só pode ser usada para usuários do tipo RESPONSAVEL',
      );
    }

    this.ensureSameSchoolOrPrivileged(user, targetUser);

    if (!body?.email?.trim()) {
      throw new BadRequestException('Informe o e-mail do responsável.');
    }

    return this.usersService.configureResponsavelAccess(id, {
      email: body.email.trim(),
      username: body.username?.trim(),
      password: body.password?.trim(),
      isActive: Boolean(body.isActive),
    });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPERUSUARIO')
  @Post()
  async create(
    @Body()
    body: {
      name: string;
      email: string;
      passwordHash: string;
      role: UserRole;
      schoolId?: string;
    },
  ) {
    return this.usersService.create(body);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPERUSUARIO')
  @Patch(':id/superuser-update')
  async updateUserAsSuperuser(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body()
    body: {
      name?: string;
      email?: string;
      username?: string | null;
      password?: string;
      role?: UserRole;
      schoolId?: string | null;
      isActive?: boolean;
      phone?: string | null;
      address?: string | null;
      cpf?: string | null;
      identidade?: string | null;
    },
  ) {
    const currentUserId = user?.id || user?.userId || user?.sub;

    if (currentUserId === id) {
      if (body.role && body.role !== UserRole.SUPERUSUARIO) {
        throw new ForbiddenException(
          'Você não pode remover o próprio perfil de superusuário',
        );
      }

      if (body.isActive === false) {
        throw new ForbiddenException('Você não pode desativar o próprio usuário');
      }
    }

    return this.usersService.updateBySuperuser(id, body);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN_ESCOLA')
  @Patch(':id/admin-update')
  async updateUserAsAdmin(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body()
    body: {
      name?: string;
      email?: string;
      username?: string | null;
      password?: string;
      role?: UserRole;
      isActive?: boolean;
      phone?: string | null;
      address?: string | null;
      cpf?: string | null;
      identidade?: string | null;
    },
  ) {
    const currentUserId = user?.id || user?.userId || user?.sub;

    if (!currentUserId) {
      throw new ForbiddenException('Usuário não autenticado');
    }

    if (!user?.schoolId) {
      throw new ForbiddenException('Usuário sem escola vinculada');
    }

    const targetUser = await this.usersService.findById(id);

    if (!targetUser) {
      throw new BadRequestException('Usuário não encontrado');
    }

    if (targetUser.schoolId !== user.schoolId) {
      throw new ForbiddenException(
        'Você só pode editar usuários da sua escola',
      );
    }

    return this.usersService.updateBySchoolAdmin(
      id,
      currentUserId,
      user.schoolId,
      body,
    );
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPERUSUARIO')
  @Patch(':id/attach-school')
  async attachUserToSchool(
    @Param('id') id: string,
    @Body()
    body: {
      schoolId: string;
    },
  ) {
    return this.usersService.attachUserToSchool(id, body.schoolId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPERUSUARIO', 'ADMIN_ESCOLA')
  @Patch(':id/block-secure')
  async blockUserSecure(@Param('id') id: string, @CurrentUser() user: any) {
    const currentUserId = user?.id || user?.userId || user?.sub;

    if (currentUserId === id) {
      throw new ForbiddenException('Você não pode bloquear o próprio usuário');
    }

    const targetUser = await this.usersService.findById(id);

    if (!targetUser) {
      throw new BadRequestException('Usuário não encontrado');
    }

    if (user.role === 'SUPERUSUARIO') {
      return this.usersService.blockUser(id);
    }

    if (user.role === 'ADMIN_ESCOLA') {
      if (!user.schoolId || targetUser.schoolId !== user.schoolId) {
        throw new ForbiddenException(
          'Você só pode bloquear usuários da sua escola',
        );
      }

      return this.usersService.blockUser(id);
    }

    throw new ForbiddenException('Sem permissão para bloquear usuário');
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPERUSUARIO', 'ADMIN_ESCOLA')
  @Patch(':id/unblock-secure')
  async unblockUserSecure(@Param('id') id: string, @CurrentUser() user: any) {
    const targetUser = await this.usersService.findById(id);

    if (!targetUser) {
      throw new BadRequestException('Usuário não encontrado');
    }

    if (user.role === 'SUPERUSUARIO') {
      return this.usersService.unblockUser(id);
    }

    if (user.role === 'ADMIN_ESCOLA') {
      if (!user.schoolId || targetUser.schoolId !== user.schoolId) {
        throw new ForbiddenException(
          'Você só pode desbloquear usuários da sua escola',
        );
      }

      return this.usersService.unblockUser(id);
    }

    throw new ForbiddenException('Sem permissão para desbloquear usuário');
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPERUSUARIO', 'ADMIN_ESCOLA')
  @Delete(':id/delete-secure')
  async deleteUserSecure(@Param('id') id: string, @CurrentUser() user: any) {
    const currentUserId = user?.id || user?.userId || user?.sub;

    if (currentUserId === id) {
      throw new ForbiddenException('Você não pode excluir o próprio usuário');
    }

    const targetUser = await this.usersService.findById(id);

    if (!targetUser) {
      throw new BadRequestException('Usuário não encontrado');
    }

    if (user.role === 'SUPERUSUARIO') {
      return this.usersService.deleteUser(id);
    }

    if (user.role === 'ADMIN_ESCOLA') {
      if (!user.schoolId || targetUser.schoolId !== user.schoolId) {
        throw new ForbiddenException(
          'Você só pode excluir usuários da sua escola',
        );
      }

      return this.usersService.deleteUser(id);
    }

    throw new ForbiddenException('Sem permissão para excluir usuário');
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPERUSUARIO')
  @Patch(':id/block')
  async blockUser(@Param('id') id: string) {
    return this.usersService.blockUser(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPERUSUARIO')
  @Patch(':id/unblock')
  async unblockUser(@Param('id') id: string) {
    return this.usersService.unblockUser(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPERUSUARIO')
  @Delete(':id')
  async deleteUser(@Param('id') id: string) {
    return this.usersService.deleteUser(id);
  }
}
