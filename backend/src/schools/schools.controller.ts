import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  SchoolPlan,
  SchoolStatus,
  TipoAvaliacao,
  UserRole,
} from '@prisma/client';
import { SchoolsService } from './schools.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { createUploadOptions } from '../security/upload-config';

@Controller('schools')
export class SchoolsController {
  constructor(private readonly schoolsService: SchoolsService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(
    'SUPERUSUARIO',
    'ADMIN_ESCOLA',
    'GESTOR',
    'COORDENADOR',
    'SECRETARIA',
    'AUXILIAR',
    'PROFESSOR',
    'RESPONSAVEL',
    'ALUNO',
  )
  @Get()
  async findAll(@CurrentUser() user: any) {
    if (!user) {
      throw new ForbiddenException('Usuário não autenticado');
    }

    return this.schoolsService.findAccessibleByUser({
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
    'COORDENADOR',
    'SECRETARIA',
    'AUXILIAR',
    'FINANCEIRO',
    'PROFESSOR',
  )
  @Get('dashboard-summary')
  async dashboardSummary(
    @CurrentUser() user: any,
    @Headers('x-school-id') selectedSchoolId: string,
  ) {
    if (!user) {
      throw new ForbiddenException('Usuário não autenticado');
    }

    return this.schoolsService.getDashboardSummary({
      userRole: user?.role as UserRole,
      userSchoolId: selectedSchoolId || user?.schoolId,
    });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(
    'SUPERUSUARIO',
    'ADMIN_ESCOLA',
    'GESTOR',
    'COORDENADOR',
    'SECRETARIA',
    'AUXILIAR',
    'PROFESSOR',
    'RESPONSAVEL',
    'ALUNO',
  )
  @Get(':id')
  async findById(@Param('id') id: string, @CurrentUser() user: any) {
    if (!user) {
      throw new ForbiddenException('Usuário não autenticado');
    }

    const school = await this.schoolsService.findById(id);

    if (!school) {
      throw new BadRequestException('Escola não encontrada');
    }

    const podeAcessar = await this.schoolsService.userCanAccessSchool({
      userId: user?.id || user?.userId || user?.sub,
      userRole: user?.role as UserRole,
      userSchoolId: user?.schoolId,
      targetSchoolId: id,
    });

    if (!podeAcessar) {
      throw new ForbiddenException('Sem permissão para acessar esta escola');
    }

    return school;
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPERUSUARIO', 'ADMIN_ESCOLA')
  @Get(':id/users')
  async findUsersBySchoolId(@Param('id') id: string, @CurrentUser() user: any) {
    if (!user) {
      throw new ForbiddenException('Usuário não autenticado');
    }

    const school = await this.schoolsService.findById(id);

    if (!school) {
      throw new BadRequestException('Escola não encontrada');
    }

    const podeAcessar = await this.schoolsService.userCanAccessSchool({
      userId: user?.id || user?.userId || user?.sub,
      userRole: user?.role as UserRole,
      userSchoolId: user?.schoolId,
      targetSchoolId: id,
    });

    if (!podeAcessar) {
      throw new ForbiddenException(
        'Sem permissão para acessar usuários da escola',
      );
    }

    return this.schoolsService.findUsersBySchoolId(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPERUSUARIO', 'ADMIN_ESCOLA')
  @Get(':id/backup-json')
  async exportBackupJson(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Res() res: Response,
  ) {
    if (!user) {
      throw new ForbiddenException('Usuário não autenticado');
    }

    const school = await this.schoolsService.findById(id);

    if (!school) {
      throw new BadRequestException('Escola não encontrada');
    }

    const podeAcessar = await this.schoolsService.userCanAccessSchool({
      userId: user?.id || user?.userId || user?.sub,
      userRole: user?.role as UserRole,
      userSchoolId: user?.schoolId,
      targetSchoolId: id,
    });

    if (!podeAcessar) {
      throw new ForbiddenException(
        'Sem permissão para exportar backup desta escola',
      );
    }

    const backup = await this.schoolsService.exportSchoolBackup({
      schoolId: id,
      requesterRole: user?.role as UserRole,
    });

    const nomeSeguro = String(backup.school.name || 'escola')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase();

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="backup-${nomeSeguro || 'escola'}-${timestamp}.json"`,
    );

    return res.send(JSON.stringify(backup, null, 2));
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPERUSUARIO', 'ADMIN_ESCOLA')
  @Get(':id/import-template-json')
  async exportImportTemplateJson(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Res() res: Response,
  ) {
    if (!user) {
      throw new ForbiddenException('Usuário não autenticado');
    }

    const school = await this.schoolsService.findById(id);

    if (!school) {
      throw new BadRequestException('Escola não encontrada');
    }

    const podeAcessar = await this.schoolsService.userCanAccessSchool({
      userId: user?.id || user?.userId || user?.sub,
      userRole: user?.role as UserRole,
      userSchoolId: user?.schoolId,
      targetSchoolId: id,
    });

    if (!podeAcessar) {
      throw new ForbiddenException(
        'Sem permissÃ£o para baixar o modelo de importaÃ§Ã£o desta escola',
      );
    }

    const template = await this.schoolsService.exportImportTemplate({
      schoolId: id,
      requesterRole: user?.role as UserRole,
    });

    const nomeSeguro = String(template.meta.schoolName || 'escola')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase();

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="modelo-importacao-${nomeSeguro || 'escola'}-${timestamp}.json"`,
    );

    return res.send(JSON.stringify(template, null, 2));
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPERUSUARIO', 'ADMIN_ESCOLA')
  @Post(':id/validate-import-json')
  async validateImportJson(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body() body: any,
  ) {
    if (!user) {
      throw new ForbiddenException('Usuário não autenticado');
    }

    const school = await this.schoolsService.findById(id);

    if (!school) {
      throw new BadRequestException('Escola não encontrada');
    }

    const podeAcessar = await this.schoolsService.userCanAccessSchool({
      userId: user?.id || user?.userId || user?.sub,
      userRole: user?.role as UserRole,
      userSchoolId: user?.schoolId,
      targetSchoolId: id,
    });

    if (!podeAcessar) {
      throw new ForbiddenException(
        'Sem permissÃ£o para validar importaÃ§Ã£o desta escola',
      );
    }

    return this.schoolsService.validateImportTemplate({
      schoolId: id,
      payload: body,
    });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPERUSUARIO', 'ADMIN_ESCOLA')
  @Post(':id/import-turmas-json')
  async importTurmasJson(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body() body: any,
  ) {
    if (!user) {
      throw new ForbiddenException('Usuário não autenticado');
    }

    const school = await this.schoolsService.findById(id);

    if (!school) {
      throw new BadRequestException('Escola não encontrada');
    }

    const podeAcessar = await this.schoolsService.userCanAccessSchool({
      userId: user?.id || user?.userId || user?.sub,
      userRole: user?.role as UserRole,
      userSchoolId: user?.schoolId,
      targetSchoolId: id,
    });

    if (!podeAcessar) {
      throw new ForbiddenException(
        'Sem permissÃ£o para importar turmas nesta escola',
      );
    }

    return this.schoolsService.importTurmasFromTemplate({
      schoolId: id,
      payload: body,
    });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPERUSUARIO', 'ADMIN_ESCOLA')
  @Post(':id/import-all-json')
  async importAllJson(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body() body: any,
  ) {
    if (!user) {
      throw new ForbiddenException('Usuário não autenticado');
    }

    const school = await this.schoolsService.findById(id);

    if (!school) {
      throw new BadRequestException('Escola não encontrada');
    }

    const podeAcessar = await this.schoolsService.userCanAccessSchool({
      userId: user?.id || user?.userId || user?.sub,
      userRole: user?.role as UserRole,
      userSchoolId: user?.schoolId,
      targetSchoolId: id,
    });

    if (!podeAcessar) {
      throw new ForbiddenException(
        'Sem permissÃ£o para importar dados nesta escola',
      );
    }

    return this.schoolsService.importAllFromTemplate({
      schoolId: id,
      payload: body,
    });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPERUSUARIO')
  @Post('restore-backup-json')
  async restoreBackupJson(@Body() body: any, @CurrentUser() user: any) {
    if (!user) {
      throw new ForbiddenException('Usuário não autenticado');
    }

    return this.schoolsService.restoreSchoolFromBackup(body);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPERUSUARIO')
  @Post()
  async create(
    @Body()
    body: {
      name: string;
      email?: string;
      phone?: string;
      status?: SchoolStatus;
      plan?: SchoolPlan;
      tipoAvaliacao?: TipoAvaliacao;
      mediaAprovacao?: number;
      adminName?: string;
      adminIdentifier?: string;
      adminEmail?: string;
      adminPassword?: string;
    },
  ) {
    return this.schoolsService.create(body);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPERUSUARIO', 'ADMIN_ESCOLA', 'GESTOR', 'SECRETARIA')
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body()
    body: {
      name?: string;
      email?: string;
      phone?: string;
      status?: SchoolStatus;
      plan?: SchoolPlan;
      logoUrl?: string;
      tipoAvaliacao?: TipoAvaliacao;
      mediaAprovacao?: number;
    },
    @CurrentUser() user: any,
  ) {
    if (!user) {
      throw new ForbiddenException('Usuário não autenticado');
    }

    const school = await this.schoolsService.findById(id);

    if (!school) {
      throw new BadRequestException('Escola não encontrada');
    }

    const podeAcessar = await this.schoolsService.userCanAccessSchool({
      userId: user?.id || user?.userId || user?.sub,
      userRole: user?.role as UserRole,
      userSchoolId: user?.schoolId,
      targetSchoolId: id,
    });

    if (!podeAcessar) {
      throw new ForbiddenException('Sem permissão para editar esta escola');
    }

    if (
      user.role === 'ADMIN_ESCOLA' ||
      user.role === 'GESTOR' ||
      user.role === 'SECRETARIA'
    ) {
      if (body.plan || body.status) {
        throw new ForbiddenException(
          'Usuário da escola não pode alterar plano ou status.',
        );
      }
    }

    if (body.name !== undefined && !body.name.trim()) {
      throw new BadRequestException('Nome da escola não pode ficar vazio.');
    }

    return this.schoolsService.update(id, {
      name: body.name?.trim(),
      email: body.email?.trim() || undefined,
      phone: body.phone?.trim() || undefined,
      status: body.status,
      plan: body.plan,
      logoUrl: body.logoUrl,
      tipoAvaliacao: body.tipoAvaliacao,
      mediaAprovacao:
        body.mediaAprovacao === undefined
          ? undefined
          : Number(body.mediaAprovacao),
    });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPERUSUARIO', 'ADMIN_ESCOLA')
  @Post(':id/logo')
  @UseInterceptors(
    FileInterceptor(
      'file',
      createUploadOptions({
        destination: './uploads',
        filePrefix: 'logo',
        profile: 'image',
      }),
    ),
  )
  async uploadLogo(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: any,
  ) {
    if (!user) {
      throw new ForbiddenException('Usuário não autenticado');
    }

    const school = await this.schoolsService.findById(id);

    if (!school) {
      throw new BadRequestException('Escola não encontrada');
    }

    const podeAcessar = await this.schoolsService.userCanAccessSchool({
      userId: user?.id || user?.userId || user?.sub,
      userRole: user?.role as UserRole,
      userSchoolId: user?.schoolId,
      targetSchoolId: id,
    });

    if (!podeAcessar) {
      throw new ForbiddenException(
        'Sem permissão para alterar a logo desta escola',
      );
    }

    if (!file) {
      throw new BadRequestException('Arquivo não enviado');
    }

    const logoUrl = `/uploads/${file.filename}`;

    return this.schoolsService.update(id, {
      logoUrl,
    });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPERUSUARIO')
  @Delete(':id/delete-secure')
  async deleteSchoolSecure(@Param('id') id: string, @CurrentUser() user: any) {
    if (!user) {
      throw new ForbiddenException('Usuário não autenticado');
    }

    const school = await this.schoolsService.findById(id);

    if (!school) {
      throw new BadRequestException('Escola não encontrada');
    }

    return this.schoolsService.deleteSchool(id);
  }
}

