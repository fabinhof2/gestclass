import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { AulasService } from "./aulas.service";

@Controller("aulas")
export class AulasController {
  constructor(private readonly service: AulasService) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  create(@Body() body: any) {
    return this.service.create(body);
  }

  @UseGuards(JwtAuthGuard)
  @Get("contextos")
  findContextos(
    @Headers("x-school-id") selectedSchoolId: string,
    @CurrentUser() user: any,
  ) {
    return this.service.findContextos({
      selectedSchoolId,
      user,
    });
  }

  @UseGuards(JwtAuthGuard)
  @Get("horario-rules")
  findHorarioRules(
    @Headers("x-school-id") selectedSchoolId: string,
    @CurrentUser() user: any,
  ) {
    return this.service.findHorarioRules({
      selectedSchoolId,
      user,
    });
  }

  @UseGuards(JwtAuthGuard)
  @Patch("horario-rules")
  saveHorarioRules(
    @Headers("x-school-id") selectedSchoolId: string,
    @CurrentUser() user: any,
    @Body()
    body: {
      officialConfigs?: Record<string, unknown>;
      turmaOverrides?: Record<string, unknown>;
    },
  ) {
    return this.service.saveHorarioRules({
      selectedSchoolId,
      user,
      officialConfigs: body?.officialConfigs,
      turmaOverrides: body?.turmaOverrides,
    });
  }

  @UseGuards(JwtAuthGuard)
  @Get("modulador-draft")
  findModuladorDraft(
    @Headers("x-school-id") selectedSchoolId: string,
    @CurrentUser() user: any,
  ) {
    return this.service.findModuladorDraft({
      selectedSchoolId,
      user,
    });
  }

  @UseGuards(JwtAuthGuard)
  @Patch("modulador-draft")
  saveModuladorDraft(
    @Headers("x-school-id") selectedSchoolId: string,
    @CurrentUser() user: any,
    @Body() body: { draft?: Record<string, unknown> | null },
  ) {
    return this.service.saveModuladorDraft({
      selectedSchoolId,
      user,
      draft: body?.draft ?? null,
    });
  }

  @UseGuards(JwtAuthGuard)
  @Delete("modulador-draft")
  clearModuladorDraft(
    @Headers("x-school-id") selectedSchoolId: string,
    @CurrentUser() user: any,
  ) {
    return this.service.clearModuladorDraft({
      selectedSchoolId,
      user,
    });
  }

  @UseGuards(JwtAuthGuard)
  @Get(":turmaId")
  findByTurma(
    @Param("turmaId") turmaId: string,
    @Headers("x-school-id") selectedSchoolId: string,
    @CurrentUser() user: any,
  ) {
    return this.service.findByTurma({
      turmaId,
      selectedSchoolId,
      user,
    });
  }

  @UseGuards(JwtAuthGuard)
  @Patch(":id")
  update(@Param("id") id: string, @Body() body: any) {
    return this.service.update(id, body);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.service.remove(id);
  }
}
