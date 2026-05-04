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
  Query,
  UseGuards,
} from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { DisciplinasService } from "./disciplinas.service";

@Controller("disciplinas")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(
  UserRole.SUPERUSUARIO,
  UserRole.ADMIN_ESCOLA,
  UserRole.GESTOR,
  UserRole.SECRETARIA,
)
export class DisciplinasController {
  constructor(private readonly disciplinasService: DisciplinasService) {}

  private resolveSchoolId(selectedSchoolId: string, user: any) {
    const isSuperuser = user?.role === UserRole.SUPERUSUARIO;
    const schoolId = isSuperuser ? selectedSchoolId : user?.schoolId;

    if (!schoolId) {
      throw new ForbiddenException("Nenhuma escola selecionada.");
    }

    return schoolId;
  }

  @Get()
  async findAllByTurma(
    @Query("turmaId") turmaId: string,
    @Headers("x-school-id") selectedSchoolId: string,
    @CurrentUser() user: any,
  ) {
    const schoolId = this.resolveSchoolId(selectedSchoolId, user);
    return this.disciplinasService.findAllByTurma({
      schoolId,
      turmaId,
    });
  }

  @Post()
  async create(
    @Body()
    body: {
      turmaId: string;
      serie: string;
      nome: string;
      cargaHoraria: number;
    },
    @Headers("x-school-id") selectedSchoolId: string,
    @CurrentUser() user: any,
  ) {
    const schoolId = this.resolveSchoolId(selectedSchoolId, user);

    return this.disciplinasService.create({
      schoolId,
      turmaId: body.turmaId,
      serie: body.serie,
      nome: body.nome,
      cargaHoraria: body.cargaHoraria,
    });
  }

  @Post("replicar")
  async replicate(
    @Body()
    body: {
      turmaDestinoIds: string[];
      turmaOrigemId: string;
      itens: Array<{
        id: string;
        nome: string;
        cargaHoraria: number;
      }>;
    },
    @Headers("x-school-id") selectedSchoolId: string,
    @CurrentUser() user: any,
  ) {
    const schoolId = this.resolveSchoolId(selectedSchoolId, user);

    return this.disciplinasService.replicate({
      schoolId,
      turmaDestinoIds: body.turmaDestinoIds,
      turmaOrigemId: body.turmaOrigemId,
      itens: body.itens,
    });
  }

  @Patch(":id")
  async update(
    @Param("id") id: string,
    @Body()
    body: {
      turmaId?: string;
      serie?: string;
      nome?: string;
      cargaHoraria?: number;
    },
    @Headers("x-school-id") selectedSchoolId: string,
    @CurrentUser() user: any,
  ) {
    const schoolId = this.resolveSchoolId(selectedSchoolId, user);

    return this.disciplinasService.update(id, {
      schoolId,
      turmaId: body.turmaId,
      serie: body.serie,
      nome: body.nome,
      cargaHoraria: body.cargaHoraria,
    });
  }

  @Delete("turma/:turmaId")
  async removeAllByTurma(
    @Param("turmaId") turmaId: string,
    @Headers("x-school-id") selectedSchoolId: string,
    @CurrentUser() user: any,
  ) {
    const schoolId = this.resolveSchoolId(selectedSchoolId, user);
    return this.disciplinasService.removeAllByTurma({ schoolId, turmaId });
  }

  @Delete(":id")
  async remove(
    @Param("id") id: string,
    @Headers("x-school-id") selectedSchoolId: string,
    @CurrentUser() user: any,
  ) {
    const schoolId = this.resolveSchoolId(selectedSchoolId, user);
    return this.disciplinasService.remove(id, { schoolId });
  }
}
