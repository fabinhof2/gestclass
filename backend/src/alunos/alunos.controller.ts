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
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import type { Response } from "express";
import { FileInterceptor } from "@nestjs/platform-express";
import { PeriodoAvaliacao, SchoolPlan, UserRole } from "@prisma/client";
import { join } from "path";
import { createReadStream, existsSync } from "fs";
import { AlunosService } from "./alunos.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { PrismaService } from "../prisma/prisma.service";
import { createUploadOptions } from "../security/upload-config";

@Controller("alunos")
export class AlunosController {
  constructor(
    private readonly alunosService: AlunosService,
    private readonly prisma: PrismaService
  ) {}

  private async resolveSchoolContext(
    user: any,
    selectedSchoolId?: string
  ): Promise<{ schoolId: string; isSuperuser: boolean }> {
    const isSuperuser = user?.role === UserRole.SUPERUSUARIO;
    const schoolId = isSuperuser ? selectedSchoolId : user?.schoolId;

    if (!schoolId) {
      throw new ForbiddenException("Nenhuma escola selecionada.");
    }

    return {
      schoolId,
      isSuperuser,
    };
  }

  private async ensureDocumentosLiberados(schoolId: string) {
    const school = await this.prisma.school.findUnique({
      where: { id: schoolId },
      select: {
        id: true,
        plan: true,
      },
    });

    if (!school) {
      throw new ForbiddenException("Escola não encontrada.");
    }

    if (
      school.plan !== SchoolPlan.PRO &&
      school.plan !== SchoolPlan.PREMIUM
    ) {
      throw new ForbiddenException(
        "Documentação do aluno disponível apenas para escolas nos planos Pró ou Premium."
      );
    }

    return school;
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  async create(
    @Body()
    body: {
      name: string;
      matricula?: string;
      responsavel?: string;
      turmaId: string;
      responsavelNome?: string;
      responsavelEmail?: string;
      responsavelTelefone?: string;
      responsavelEndereco?: string;
      parentesco?: string;
      responsavelFinanceiro?: boolean;
      alunoEmail?: string;
      alunoPassword?: string;
      alunoAtivo?: boolean;
    },
    @Headers("x-school-id") selectedSchoolId: string,
    @CurrentUser() user: any
  ) {
    const { schoolId } = await this.resolveSchoolContext(
      user,
      selectedSchoolId
    );

    if (!body?.name?.trim()) {
      throw new BadRequestException("Informe o nome do aluno.");
    }

    if (!body?.turmaId?.trim()) {
      throw new BadRequestException("Selecione uma turma.");
    }

    return this.alunosService.create({
      name: body.name.trim(),
      matricula: body.matricula?.trim(),
      responsavel: body.responsavel?.trim(),
      turmaId: body.turmaId.trim(),
      schoolId,
      responsavelNome: body.responsavelNome?.trim(),
      responsavelEmail: body.responsavelEmail?.trim(),
      responsavelTelefone: body.responsavelTelefone?.trim(),
      responsavelEndereco: body.responsavelEndereco?.trim(),
      parentesco: body.parentesco?.trim(),
      responsavelFinanceiro: !!body.responsavelFinanceiro,
      alunoEmail: body.alunoEmail?.trim(),
      alunoPassword: body.alunoPassword?.trim(),
      alunoAtivo: typeof body.alunoAtivo === "boolean" ? body.alunoAtivo : true,
    });
  }

  @UseGuards(JwtAuthGuard)
  @Get("responsaveis/search")
  async searchResponsaveis(
    @Headers("x-school-id") selectedSchoolId: string,
    @CurrentUser() user: any,
    @Headers("x-responsavel-term") responsavelTerm: string
  ) {
    const { schoolId } = await this.resolveSchoolContext(
      user,
      selectedSchoolId
    );

    const termo = String(responsavelTerm || "").trim();

    if (!termo) {
      return [];
    }

    return this.alunosService.searchResponsaveis({
      schoolId,
      term: termo,
    });
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  async findAll(
    @Headers("x-school-id") selectedSchoolId: string,
    @CurrentUser() user: any
  ) {
    const { schoolId, isSuperuser } = await this.resolveSchoolContext(
      user,
      selectedSchoolId
    );

    return this.alunosService.findAll({
      schoolId,
      isSuperuser,
      userId: user?.id || user?.userId || user?.sub,
      userRole: user?.role as UserRole,
    });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(
    UserRole.PROFESSOR,
    UserRole.SUPERUSUARIO,
    UserRole.ADMIN_ESCOLA,
    UserRole.GESTOR,
    UserRole.SECRETARIA,
  )
  @Get(":id/professor-visao")
  async professorAlunoVisao(
    @Param("id") id: string,
    @Query("periodo") periodo: PeriodoAvaliacao | undefined,
    @Query("ano") ano: string | undefined,
    @CurrentUser() user: any
  ) {
    if (!user?.schoolId) {
      throw new ForbiddenException("Usuário sem escola vinculada.");
    }

    return this.alunosService.getProfessorAlunoVisao({
      alunoId: id,
      schoolId: user.schoolId,
      professorId:
        user?.role === UserRole.PROFESSOR
          ? user?.id || user?.userId || user?.sub
          : undefined,
      periodo: periodo || PeriodoAvaliacao.PRIMEIRO,
      ano: ano ? Number(ano) : undefined,
    });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPERUSUARIO, UserRole.ADMIN_ESCOLA, UserRole.GESTOR, UserRole.SECRETARIA)
  @Patch(":id")
  async update(
    @Param("id") id: string,
    @Body()
    body: {
      name?: string;
      matricula?: string;
      responsavel?: string;
      turmaId?: string;
      responsavelNome?: string;
      responsavelEmail?: string;
      responsavelTelefone?: string;
      responsavelEndereco?: string;
      parentesco?: string;
      responsavelFinanceiro?: boolean;
      alunoEmail?: string;
      alunoPassword?: string;
      alunoAtivo?: boolean;
    },
    @Headers("x-school-id") selectedSchoolId: string,
    @CurrentUser() user: any
  ) {
    const { schoolId, isSuperuser } = await this.resolveSchoolContext(
      user,
      selectedSchoolId
    );

    if (!body?.name?.trim()) {
      throw new BadRequestException("Informe o nome do aluno.");
    }

    if (!body?.turmaId?.trim()) {
      throw new BadRequestException("Selecione uma turma.");
    }

    return this.alunosService.update({
      id,
      schoolId,
      isSuperuser,
      name: body.name.trim(),
      matricula: body.matricula?.trim(),
      responsavel: body.responsavel?.trim(),
      turmaId: body.turmaId.trim(),
      responsavelNome: body.responsavelNome?.trim(),
      responsavelEmail: body.responsavelEmail?.trim(),
      responsavelTelefone: body.responsavelTelefone?.trim(),
      responsavelEndereco: body.responsavelEndereco?.trim(),
      parentesco: body.parentesco?.trim(),
      responsavelFinanceiro: !!body.responsavelFinanceiro,
      alunoEmail: body.alunoEmail?.trim(),
      alunoPassword: body.alunoPassword?.trim(),
      alunoAtivo:
        typeof body.alunoAtivo === "boolean" ? body.alunoAtivo : undefined,
    });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPERUSUARIO, UserRole.ADMIN_ESCOLA, UserRole.GESTOR, UserRole.SECRETARIA)
  @Delete(":id")
  async delete(
    @Param("id") id: string,
    @Headers("x-school-id") selectedSchoolId: string,
    @CurrentUser() user: any
  ) {
    const { schoolId, isSuperuser } = await this.resolveSchoolContext(
      user,
      selectedSchoolId
    );

    return this.alunosService.deleteAluno({
      id,
      schoolId,
      isSuperuser,
    });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPERUSUARIO, UserRole.ADMIN_ESCOLA, UserRole.GESTOR, UserRole.SECRETARIA)
  @Patch(":id/status")
  async updateStatus(
    @Param("id") id: string,
    @Body()
    body: {
      status: string;
    },
    @CurrentUser() user: any
  ) {
    if (!body?.status) {
      throw new BadRequestException("Informe o status do aluno.");
    }

    const statusNormalizado = String(body.status).trim().toUpperCase();

    if (!["ATIVO", "INATIVO"].includes(statusNormalizado)) {
      throw new BadRequestException("Status inválido. Use ATIVO ou INATIVO.");
    }

    const isSuperuser = user?.role === UserRole.SUPERUSUARIO;

    if (!isSuperuser && !user?.schoolId) {
      throw new ForbiddenException("Usuário sem escola vinculada");
    }

    return this.alunosService.updateStatus({
      id,
      schoolId: user?.schoolId,
      isSuperuser,
      status: statusNormalizado,
    });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPERUSUARIO, UserRole.ADMIN_ESCOLA, UserRole.GESTOR, UserRole.SECRETARIA)
  @Post(":id/foto")
  @UseInterceptors(
    FileInterceptor(
      "file",
      createUploadOptions({
        destination: "./uploads/alunos",
        filePrefix: "aluno",
        profile: "image",
      }),
    )
  )
  async uploadFoto(
    @Param("id") id: string,
    @UploadedFile() file: Express.Multer.File,
    @Headers("x-school-id") selectedSchoolId: string,
    @CurrentUser() user: any
  ) {
    if (!file) {
      throw new BadRequestException("Arquivo não enviado.");
    }

    const { schoolId, isSuperuser } = await this.resolveSchoolContext(
      user,
      selectedSchoolId
    );

    const fotoUrl = `/uploads/alunos/${file.filename}`;

    return this.alunosService.updateFoto({
      id,
      schoolId,
      isSuperuser,
      fotoUrl,
    });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPERUSUARIO, UserRole.ADMIN_ESCOLA, UserRole.GESTOR, UserRole.SECRETARIA)
  @Get(":id/documentos")
  async listDocumentos(
    @Param("id") id: string,
    @Headers("x-school-id") selectedSchoolId: string,
    @CurrentUser() user: any
  ) {
    const { schoolId, isSuperuser } = await this.resolveSchoolContext(
      user,
      selectedSchoolId
    );

    await this.ensureDocumentosLiberados(schoolId);

    return this.alunosService.listDocumentos({
      id,
      schoolId,
      isSuperuser,
    });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPERUSUARIO, UserRole.ADMIN_ESCOLA, UserRole.GESTOR, UserRole.SECRETARIA)
  @Post(":id/documentos")
  @UseInterceptors(
    FileInterceptor(
      "file",
      createUploadOptions({
        destination: "./uploads/alunos/documentos",
        filePrefix: "documento-aluno",
        profile: "document",
      }),
    )
  )
  async uploadDocumento(
    @Param("id") id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body()
    body: {
      tipo: string;
      observacao?: string;
    },
    @Headers("x-school-id") selectedSchoolId: string,
    @CurrentUser() user: any
  ) {
    if (!file) {
      throw new BadRequestException("Arquivo não enviado.");
    }

    if (!body?.tipo?.trim()) {
      throw new BadRequestException("Informe o tipo do documento.");
    }

    const tiposPermitidos = [
      "IDENTIDADE",
      "CERTIDAO_NASCIMENTO",
      "COMPROVANTE_RESIDENCIA",
      "DECLARACAO",
      "HISTORICO_ESCOLAR",
    ];

    const tipoNormalizado = String(body.tipo).trim().toUpperCase();

    if (!tiposPermitidos.includes(tipoNormalizado)) {
      throw new BadRequestException("Tipo de documento inválido.");
    }

    const { schoolId, isSuperuser } = await this.resolveSchoolContext(
      user,
      selectedSchoolId
    );

    await this.ensureDocumentosLiberados(schoolId);

    const arquivoUrl = `/uploads/alunos/documentos/${file.filename}`;

    return this.alunosService.createDocumento({
      alunoId: id,
      schoolId,
      isSuperuser,
      tipo: tipoNormalizado as any,
      nomeOriginal: file.originalname,
      arquivoUrl,
      mimeType: file.mimetype,
      observacao: body.observacao?.trim(),
    });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPERUSUARIO, UserRole.ADMIN_ESCOLA, UserRole.GESTOR, UserRole.SECRETARIA)
  @Get("documentos/download/:docId")
  async downloadDocumento(
    @Param("docId") docId: string,
    @Headers("x-school-id") selectedSchoolId: string,
    @CurrentUser() user: any,
    @Res() res: Response
  ) {
    const { schoolId } = await this.resolveSchoolContext(
      user,
      selectedSchoolId
    );

    await this.ensureDocumentosLiberados(schoolId);

    const documento = await this.alunosService.findDocumentoById({
      docId,
      schoolId,
    });

    const caminhoRelativo = String(documento.arquivoUrl || "").replace(
      /^\/+/,
      ""
    );
    const caminhoAbsoluto = join(process.cwd(), caminhoRelativo);

    if (!existsSync(caminhoAbsoluto)) {
      throw new BadRequestException("Arquivo físico do documento não encontrado.");
    }

    res.setHeader(
      "Content-Type",
      documento.mimeType || "application/octet-stream"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${encodeURIComponent(documento.nomeOriginal)}"`
    );

    const fileStream = createReadStream(caminhoAbsoluto);
    fileStream.pipe(res);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPERUSUARIO, UserRole.ADMIN_ESCOLA, UserRole.GESTOR, UserRole.SECRETARIA)
  @Delete("documentos/:docId")
  async deleteDocumento(
    @Param("docId") docId: string,
    @Headers("x-school-id") selectedSchoolId: string,
    @CurrentUser() user: any
  ) {
    const { schoolId } = await this.resolveSchoolContext(
      user,
      selectedSchoolId
    );

    await this.ensureDocumentosLiberados(schoolId);

    return this.alunosService.deleteDocumento({
      docId,
      schoolId,
    });
  }
}
