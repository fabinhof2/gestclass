import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Param,
  Get,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import {
  PeriodoAvaliacao,
  TipoComposicaoNota,
  TipoQuestaoOnline,
  UserRole,
} from "@prisma/client";
import { FileInterceptor } from "@nestjs/platform-express";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { AvaliacoesOnlineService } from "./avaliacoes-online.service";
import { createUploadOptions } from "../security/upload-config";

@Controller("avaliacoes-online")
export class AvaliacoesOnlineController {
  constructor(
    private readonly avaliacoesOnlineService: AvaliacoesOnlineService
  ) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("PROFESSOR")
  @Post()
  async criar(
    @Body()
    body: {
      turmaProfessorId: string;
      periodo: PeriodoAvaliacao;
      tipoComposicao: TipoComposicaoNota;
      titulo: string;
      descricao?: string;
      instrucoes?: string;
      valor: number;
      corrigeAutomaticamente?: boolean;
      publicada?: boolean;
    },
    @CurrentUser() user: any
  ) {
    if (!body?.turmaProfessorId?.trim()) {
      throw new BadRequestException("Informe o vínculo da disciplina.");
    }

    if (!body?.periodo) {
      throw new BadRequestException("Informe o período.");
    }

    if (!body?.tipoComposicao) {
      throw new BadRequestException("Informe o tipo de composição.");
    }

    if (!body?.titulo?.trim()) {
      throw new BadRequestException("Informe o título da avaliação.");
    }

    return this.avaliacoesOnlineService.criarAvaliacaoOnline({
      userId: user?.id || user?.userId || user?.sub,
      userRole: user?.role as UserRole,
      userSchoolId: user?.schoolId,
      turmaProfessorId: body.turmaProfessorId.trim(),
      periodo: body.periodo,
      tipoComposicao: body.tipoComposicao,
      titulo: body.titulo.trim(),
      descricao: body.descricao,
      instrucoes: body.instrucoes,
      valor: Number(body.valor),
      corrigeAutomaticamente:
        body.corrigeAutomaticamente === false ? false : true,
      publicada: Boolean(body.publicada),
    });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("PROFESSOR")
  @Get("minhas")
  async listarMinhas(@CurrentUser() user: any) {
    return this.avaliacoesOnlineService.listarMinhasAvaliacoesOnline({
      userId: user?.id || user?.userId || user?.sub,
      userRole: user?.role as UserRole,
      userSchoolId: user?.schoolId,
    });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ALUNO")
  @Get("disponiveis-aluno")
  async listarDisponiveisAluno(@CurrentUser() user: any) {
    return this.avaliacoesOnlineService.listarAvaliacoesDisponiveisParaAluno({
      userId: user?.id || user?.userId || user?.sub,
      userName: user?.name,
      userRole: user?.role as UserRole,
      userSchoolId: user?.schoolId,
    });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("SUPERUSUARIO", "ADMIN_ESCOLA", "GESTOR", "SECRETARIA")
  @Get("gestao")
  async listarGestao(@CurrentUser() user: any) {
    return this.avaliacoesOnlineService.listarAvaliacoesOnlineGestao({
      userId: user?.id || user?.userId || user?.sub,
      userRole: user?.role as UserRole,
      userSchoolId: user?.schoolId,
    });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("SUPERUSUARIO", "ADMIN_ESCOLA", "GESTOR", "SECRETARIA")
  @Get("gestao/:id")
  async detalharGestao(@Param("id") id: string, @CurrentUser() user: any) {
    return this.avaliacoesOnlineService.detalharAvaliacaoOnlineGestao({
      userId: user?.id || user?.userId || user?.sub,
      userRole: user?.role as UserRole,
      userSchoolId: user?.schoolId,
      avaliacaoId: id,
    });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("SUPERUSUARIO", "ADMIN_ESCOLA", "GESTOR", "SECRETARIA")
  @Get("gestao/:id/alunos")
  async listarAlunosDaAvaliacaoGestao(
    @Param("id") id: string,
    @CurrentUser() user: any
  ) {
    return this.avaliacoesOnlineService.listarAlunosDaAvaliacaoGestao({
      avaliacaoId: id,
      userId: user?.id || user?.userId || user?.sub,
      userRole: user?.role as UserRole,
      userSchoolId: user?.schoolId,
    });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("RESPONSAVEL")
  @Get("responsavel/alunos")
  async listarAlunosResponsavel(@CurrentUser() user: any) {
    return this.avaliacoesOnlineService.listarAlunosResponsavel({
      userId: user?.id || user?.userId || user?.sub,
      userRole: user?.role as UserRole,
      userSchoolId: user?.schoolId,
    });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("RESPONSAVEL")
  @Get("responsavel/alunos/:alunoId")
  async listarAvaliacoesResponsavel(
    @Param("alunoId") alunoId: string,
    @CurrentUser() user: any
  ) {
    return this.avaliacoesOnlineService.listarAvaliacoesResponsavel({
      alunoId,
      userId: user?.id || user?.userId || user?.sub,
      userRole: user?.role as UserRole,
      userSchoolId: user?.schoolId,
    });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ALUNO")
  @Get("disponiveis-aluno/:id")
  async detalharDisponivelAluno(
    @Param("id") id: string,
    @CurrentUser() user: any
  ) {
    return this.avaliacoesOnlineService.detalharAvaliacaoDisponivelParaAluno({
      avaliacaoId: id,
      userId: user?.id || user?.userId || user?.sub,
      userName: user?.name,
      userRole: user?.role as UserRole,
      userSchoolId: user?.schoolId,
    });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ALUNO")
  @Post("disponiveis-aluno/:id/iniciar")
  async iniciarTentativa(
    @Param("id") id: string,
    @CurrentUser() user: any
  ) {
    return this.avaliacoesOnlineService.iniciarTentativaAluno({
      avaliacaoId: id,
      userId: user?.id || user?.userId || user?.sub,
      userName: user?.name,
      userRole: user?.role as UserRole,
      userSchoolId: user?.schoolId,
    });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ALUNO")
  @Patch("tentativas/:tentativaId/respostas")
  async salvarRespostasAluno(
    @Param("tentativaId") tentativaId: string,
    @Body()
    body: {
      respostas: Array<{
        perguntaId: string;
        alternativaId?: string | null;
        respostaTexto?: string | null;
      }>;
    },
    @CurrentUser() user: any
  ) {
    return this.avaliacoesOnlineService.salvarRespostasAluno({
      tentativaId,
      respostas: Array.isArray(body?.respostas) ? body.respostas : [],
      userId: user?.id || user?.userId || user?.sub,
      userName: user?.name,
      userRole: user?.role as UserRole,
      userSchoolId: user?.schoolId,
    });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ALUNO")
  @Post("tentativas/:tentativaId/concluir")
  async concluirTentativaAluno(
    @Param("tentativaId") tentativaId: string,
    @CurrentUser() user: any
  ) {
    return this.avaliacoesOnlineService.concluirTentativaAluno({
      tentativaId,
      userId: user?.id || user?.userId || user?.sub,
      userName: user?.name,
      userRole: user?.role as UserRole,
      userSchoolId: user?.schoolId,
    });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("PROFESSOR")
  @Get(":id/alunos")
  async listarAlunosDaAvaliacao(
    @Param("id") id: string,
    @CurrentUser() user: any
  ) {
    return this.avaliacoesOnlineService.listarAlunosDaAvaliacao({
      avaliacaoId: id,
      userId: user?.id || user?.userId || user?.sub,
      userRole: user?.role as UserRole,
      userSchoolId: user?.schoolId,
    });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("PROFESSOR")
  @Patch("respostas/:respostaId/correcao-descritiva")
  async corrigirRespostaDescritiva(
    @Param("respostaId") respostaId: string,
    @Body()
    body: {
      notaManual: number;
      feedbackProfessor?: string;
    },
    @CurrentUser() user: any
  ) {
    return this.avaliacoesOnlineService.corrigirRespostaDescritiva({
      respostaId,
      notaManual: Number(body?.notaManual),
      feedbackProfessor: body?.feedbackProfessor,
      userId: user?.id || user?.userId || user?.sub,
      userRole: user?.role as UserRole,
      userSchoolId: user?.schoolId,
    });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("PROFESSOR")
  @Post(":id/autorizar-refazer")
  async autorizarRefazer(
    @Param("id") id: string,
    @Body() body: { alunoIds: string[] },
    @CurrentUser() user: any
  ) {
    return this.avaliacoesOnlineService.autorizarRefazerParaAlunos({
      avaliacaoId: id,
      alunoIds: Array.isArray(body?.alunoIds) ? body.alunoIds : [],
      userId: user?.id || user?.userId || user?.sub,
      userRole: user?.role as UserRole,
      userSchoolId: user?.schoolId,
    });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("PROFESSOR")
  @Get(":id")
  async detalhar(@Param("id") id: string, @CurrentUser() user: any) {
    return this.avaliacoesOnlineService.detalharMinhaAvaliacaoOnline({
      userId: user?.id || user?.userId || user?.sub,
      userRole: user?.role as UserRole,
      userSchoolId: user?.schoolId,
      avaliacaoId: id,
    });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("PROFESSOR")
  @Post(":id/perguntas")
  async adicionarPergunta(
    @Param("id") id: string,
    @Body()
    body: {
      tipoQuestao: TipoQuestaoOnline;
      enunciado: string;
      imagemUrl?: string;
      peso: number;
      alternativas: Array<{
        texto: string;
        correta: boolean;
      }>;
    },
    @CurrentUser() user: any
  ) {
    if (!body?.tipoQuestao) {
      throw new BadRequestException("Informe o tipo da questão.");
    }

    if (!body?.enunciado?.trim()) {
      throw new BadRequestException("Informe o enunciado da pergunta.");
    }

    return this.avaliacoesOnlineService.adicionarPerguntaComAlternativas({
      userId: user?.id || user?.userId || user?.sub,
      userRole: user?.role as UserRole,
      userSchoolId: user?.schoolId,
      avaliacaoId: id,
      tipoQuestao: body.tipoQuestao,
      enunciado: body.enunciado.trim(),
      imagemUrl: body.imagemUrl,
      peso: Number(body.peso),
      alternativas: Array.isArray(body.alternativas)
        ? body.alternativas.map((alternativa) => ({
            texto: String(alternativa.texto || "").trim(),
            correta: Boolean(alternativa.correta),
          }))
        : [],
    });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("PROFESSOR")
  @Patch("perguntas/:perguntaId")
  async atualizarPergunta(
    @Param("perguntaId") perguntaId: string,
    @Body()
    body: {
      tipoQuestao: TipoQuestaoOnline;
      enunciado: string;
      imagemUrl?: string;
      peso: number;
      alternativas: Array<{
        texto: string;
        correta: boolean;
      }>;
    },
    @CurrentUser() user: any
  ) {
    if (!body?.tipoQuestao) {
      throw new BadRequestException("Informe o tipo da questão.");
    }

    if (!body?.enunciado?.trim()) {
      throw new BadRequestException("Informe o enunciado da pergunta.");
    }

    return this.avaliacoesOnlineService.atualizarPergunta({
      userId: user?.id || user?.userId || user?.sub,
      userRole: user?.role as UserRole,
      userSchoolId: user?.schoolId,
      perguntaId,
      tipoQuestao: body.tipoQuestao,
      enunciado: body.enunciado.trim(),
      imagemUrl: body.imagemUrl,
      peso: Number(body.peso),
      alternativas: Array.isArray(body.alternativas)
        ? body.alternativas.map((alternativa) => ({
            texto: String(alternativa.texto || "").trim(),
            correta: Boolean(alternativa.correta),
          }))
        : [],
    });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("PROFESSOR")
  @Delete("perguntas/:perguntaId")
  async excluirPergunta(
    @Param("perguntaId") perguntaId: string,
    @CurrentUser() user: any
  ) {
    return this.avaliacoesOnlineService.excluirPergunta({
      userId: user?.id || user?.userId || user?.sub,
      userRole: user?.role as UserRole,
      userSchoolId: user?.schoolId,
      perguntaId,
    });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("PROFESSOR")
  @Post("perguntas/imagens/upload")
  @UseInterceptors(
    FileInterceptor(
      "file",
      createUploadOptions({
        destination: "./uploads/avaliacoes-online",
        filePrefix: "pergunta",
        profile: "image",
      }),
    )
  )
  async uploadImagemGenerica(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException("Arquivo não enviado.");
    }

    return {
      imagemUrl: `/uploads/avaliacoes-online/${file.filename}`,
    };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("PROFESSOR")
  @Post("perguntas/:perguntaId/imagem")
  @UseInterceptors(
    FileInterceptor(
      "file",
      createUploadOptions({
        destination: "./uploads/avaliacoes-online",
        filePrefix: "pergunta",
        profile: "image",
      }),
    )
  )
  async uploadImagemPergunta(
    @Param("perguntaId") perguntaId: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: any
  ) {
    if (!file) {
      throw new BadRequestException("Arquivo não enviado.");
    }

    const imagemUrl = `/uploads/avaliacoes-online/${file.filename}`;

    return this.avaliacoesOnlineService.atualizarImagemPergunta({
      userId: user?.id || user?.userId || user?.sub,
      userRole: user?.role as UserRole,
      userSchoolId: user?.schoolId,
      perguntaId,
      imagemUrl,
    });
  }
}
