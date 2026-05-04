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
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { TurmaProfessorService } from "./turma-professor.service";

@Controller("turma-professor")
export class TurmaProfessorController {
  constructor(private readonly service: TurmaProfessorService) {}

  private resolveSchoolId(selectedSchoolId: string, user: any) {
    const isSuperuser = user?.role === UserRole.SUPERUSUARIO;
    const schoolId = isSuperuser ? selectedSchoolId : user?.schoolId;

    if (!schoolId) {
      throw new ForbiddenException("Nenhuma escola selecionada.");
    }

    return schoolId;
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(
    UserRole.SUPERUSUARIO,
    UserRole.ADMIN_ESCOLA,
    UserRole.GESTOR,
    UserRole.SECRETARIA,
  )
  @Get()
  findAll(
    @Headers("x-school-id") selectedSchoolId: string,
    @CurrentUser() user: any,
  ) {
    return this.service.findAll({
      schoolId: this.resolveSchoolId(selectedSchoolId, user),
    });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(
    UserRole.SUPERUSUARIO,
    UserRole.ADMIN_ESCOLA,
    UserRole.GESTOR,
    UserRole.SECRETARIA,
  )
  @Post()
  create(
    @Body() body: any,
    @Headers("x-school-id") selectedSchoolId: string,
    @CurrentUser() user: any,
  ) {
    return this.service.create({
      ...body,
      schoolId: this.resolveSchoolId(selectedSchoolId, user),
    });
  }

  @UseGuards(JwtAuthGuard)
  @Get(":turmaId")
  findByTurma(
    @Param("turmaId") turmaId: string,
    @Headers("x-school-id") selectedSchoolId: string,
    @CurrentUser() user: any,
  ) {
    return this.service.findByTurma(turmaId, {
      schoolId: this.resolveSchoolId(selectedSchoolId, user),
      userId: user?.id || user?.userId || user?.sub,
      userRole: user?.role as UserRole,
    });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(
    UserRole.SUPERUSUARIO,
    UserRole.ADMIN_ESCOLA,
    UserRole.GESTOR,
    UserRole.SECRETARIA,
  )
  @Post("sync")
  syncByProfessorDisciplina(
    @Body() body: any,
    @Headers("x-school-id") selectedSchoolId: string,
    @CurrentUser() user: any,
  ) {
    return this.service.syncByProfessorDisciplina({
      ...body,
      schoolId: this.resolveSchoolId(selectedSchoolId, user),
    });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(
    UserRole.SUPERUSUARIO,
    UserRole.ADMIN_ESCOLA,
    UserRole.GESTOR,
    UserRole.SECRETARIA,
  )
  @Patch(":id")
  update(
    @Param("id") id: string,
    @Body() body: any,
    @Headers("x-school-id") selectedSchoolId: string,
    @CurrentUser() user: any,
  ) {
    return this.service.update(id, {
      ...body,
      schoolId: this.resolveSchoolId(selectedSchoolId, user),
    });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(
    UserRole.SUPERUSUARIO,
    UserRole.ADMIN_ESCOLA,
    UserRole.GESTOR,
    UserRole.SECRETARIA,
  )
  @Delete(":id")
  remove(
    @Param("id") id: string,
    @Headers("x-school-id") selectedSchoolId: string,
    @CurrentUser() user: any,
  ) {
    return this.service.remove(id, {
      schoolId: this.resolveSchoolId(selectedSchoolId, user),
    });
  }
}
