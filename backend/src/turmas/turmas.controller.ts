import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { TurmasService } from "./turmas.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";

@Controller("turmas")
export class TurmasController {
  constructor(private readonly turmasService: TurmasService) {}

  private resolveSchoolId(selectedSchoolId: string, user: any) {
    const isSuperuser = user?.role === UserRole.SUPERUSUARIO;
    const schoolId = isSuperuser ? selectedSchoolId : user?.schoolId;

    if (!schoolId) {
      throw new ForbiddenException("Nenhuma escola selecionada.");
    }

    return { schoolId, isSuperuser };
  }

  private ensureCanManageTurma(user: any) {
    const canManage =
      user?.role === UserRole.SUPERUSUARIO ||
      user?.role === UserRole.ADMIN_ESCOLA ||
      user?.role === UserRole.GESTOR;

    if (!canManage) {
      throw new ForbiddenException(
        "Voce nao tem permissao para gerenciar turmas.",
      );
    }
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  async create(
    @Body()
    body: {
      name: string;
      turno?: string;
    },
    @Headers("x-school-id") selectedSchoolId: string,
    @CurrentUser() user: any
  ) {
    this.ensureCanManageTurma(user);
    const { schoolId } = this.resolveSchoolId(selectedSchoolId, user);

    return this.turmasService.create({
      name: body.name,
      turno: body.turno,
      schoolId,
    });
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  async findAll(
    @Headers("x-school-id") selectedSchoolId: string,
    @CurrentUser() user: any
  ) {
    const { schoolId, isSuperuser } = this.resolveSchoolId(
      selectedSchoolId,
      user,
    );

    return this.turmasService.findAll({
      schoolId,
      isSuperuser,
      userId: user?.id || user?.userId || user?.sub,
      userRole: user?.role as UserRole,
    });
  }

  @UseGuards(JwtAuthGuard)
  @Patch(":id")
  async update(
    @Param("id") id: string,
    @Body()
    body: {
      name?: string;
      turno?: string;
    },
    @Headers("x-school-id") selectedSchoolId: string,
    @CurrentUser() user: any
  ) {
    this.ensureCanManageTurma(user);
    const { schoolId } = this.resolveSchoolId(selectedSchoolId, user);

    return this.turmasService.update(id, {
      schoolId,
      name: body.name,
      turno: body.turno,
    });
  }

  @UseGuards(JwtAuthGuard)
  @Delete(":id")
  async remove(
    @Param("id") id: string,
    @Headers("x-school-id") selectedSchoolId: string,
    @CurrentUser() user: any
  ) {
    this.ensureCanManageTurma(user);
    const { schoolId } = this.resolveSchoolId(selectedSchoolId, user);

    return this.turmasService.remove(id, { schoolId });
  }

  @UseGuards(JwtAuthGuard)
  @Post("promover-alunos")
  async promoverAlunos(
    @Body()
    body: {
      turmaOrigemId: string;
      turmaDestinoId: string;
      alunoIds: string[];
    },
    @Headers("x-school-id") selectedSchoolId: string,
    @CurrentUser() user: any
  ) {
    const isSuperuser = user?.role === UserRole.SUPERUSUARIO;
    const schoolId = isSuperuser ? selectedSchoolId : user?.schoolId;

    if (!schoolId) {
      throw new ForbiddenException("Nenhuma escola selecionada.");
    }

    const podePromover =
      user?.role === UserRole.SUPERUSUARIO ||
      user?.role === UserRole.ADMIN_ESCOLA ||
      user?.role === UserRole.GESTOR ||
      user?.role === UserRole.SECRETARIA;

    if (!podePromover) {
      throw new ForbiddenException(
        "Você não tem permissão para promover alunos em massa."
      );
    }

    return this.turmasService.promoverAlunosEmMassa({
      schoolId,
      turmaOrigemId: body.turmaOrigemId,
      turmaDestinoId: body.turmaDestinoId,
      alunoIds: Array.isArray(body.alunoIds) ? body.alunoIds : [],
    });
  }
}
