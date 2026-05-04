import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type AuthUser = {
  userId: string;
  userRole: UserRole;
  schoolId?: string | null;
};

type AgendaBody = {
  turmaId?: string;
  data?: string;
  titulo?: string;
  descricao?: string;
};

@Injectable()
export class ProfessorAgendaService {
  constructor(private readonly prisma: PrismaService) {}

  private async findTurmasDoProfessor(user: AuthUser, schoolId: string) {
    if (user.userRole !== UserRole.PROFESSOR) {
      return [];
    }

    return this.prisma.turma.findMany({
      where: {
        schoolId,
        OR: [
          {
            professores: {
              some: {
                professorId: user.userId,
              },
            },
          },
          {
            aulas: {
              some: {
                turmaProfessor: {
                  professorId: user.userId,
                },
              },
            },
          },
          {
            professorAgendas: {
              some: {
                professorId: user.userId,
              },
            },
          },
        ],
      },
      select: {
        id: true,
        name: true,
        turno: true,
        schoolId: true,
      },
      orderBy: { name: 'asc' },
    });
  }

  private assertSchool(user: AuthUser) {
    if (!user.schoolId) {
      throw new ForbiddenException('Usuário sem escola vinculada.');
    }

    return user.schoolId;
  }

  private parseAno(ano?: string) {
    const valor = Number(ano || new Date().getFullYear());

    if (!Number.isInteger(valor) || valor < 2000 || valor > 2100) {
      throw new BadRequestException('Ano inválido.');
    }

    return valor;
  }

  private parseData(data?: string) {
    if (!data?.trim()) {
      throw new BadRequestException('Selecione o dia do agendamento.');
    }

    const parsed = new Date(`${data.trim()}T12:00:00.000Z`);

    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException('Data inválida.');
    }

    return parsed;
  }

  private async assertTurmaProfessor(user: AuthUser, turmaId: string) {
    const schoolId = this.assertSchool(user);

    if (
      user.userRole === UserRole.ADMIN_ESCOLA ||
      user.userRole === UserRole.GESTOR ||
      user.userRole === UserRole.SECRETARIA
    ) {
      const turmaGestao = await this.prisma.turma.findFirst({
        where: {
          id: turmaId,
          schoolId,
        },
        select: {
          id: true,
          name: true,
          schoolId: true,
        },
      });

      if (!turmaGestao) {
        throw new ForbiddenException('Turma não encontrada.');
      }

      return turmaGestao;
    }

    const turmasProfessor = await this.findTurmasDoProfessor(user, schoolId);
    const turma = turmasProfessor.find((item) => item.id === turmaId);

    if (!turma) {
      throw new ForbiddenException('Professor sem acesso a esta turma.');
    }

    return turma;
  }

  private async assertTurmaVisualizacao(user: AuthUser, turmaId: string) {
    const schoolId = this.assertSchool(user);

    if (
      user.userRole === UserRole.ADMIN_ESCOLA ||
      user.userRole === UserRole.GESTOR ||
      user.userRole === UserRole.SECRETARIA
    ) {
      const turma = await this.prisma.turma.findFirst({
        where: { id: turmaId, schoolId },
        select: { id: true, name: true },
      });
      if (!turma) throw new ForbiddenException('Turma não encontrada.');
      return turma;
    }

    if (user.userRole === UserRole.PROFESSOR) {
      return this.assertTurmaProfessor(user, turmaId);
    }

    if (user.userRole === UserRole.ALUNO) {
      const aluno = await this.prisma.aluno.findFirst({
        where: { userId: user.userId, turmaId, schoolId },
        select: { id: true },
      });
      if (!aluno) throw new ForbiddenException('Aluno sem acesso a esta turma.');
      return { id: turmaId };
    }

    if (user.userRole === UserRole.RESPONSAVEL) {
      const vinculo = await this.prisma.alunoResponsavel.findFirst({
        where: {
          responsavelId: user.userId,
          aluno: {
            turmaId,
            schoolId,
          },
        },
        select: { id: true },
      });
      if (!vinculo) {
        throw new ForbiddenException('Responsável sem acesso a esta turma.');
      }
      return { id: turmaId };
    }

    throw new ForbiddenException('Perfil sem acesso ao calendário.');
  }

  async listarTurmas(user: AuthUser) {
    const schoolId = this.assertSchool(user);

    if (user.userRole === UserRole.PROFESSOR) {
      return this.findTurmasDoProfessor(user, schoolId);
    }

    if (user.userRole === UserRole.ALUNO) {
      const aluno = await this.prisma.aluno.findFirst({
        where: { userId: user.userId, schoolId },
        include: { turma: { select: { id: true, name: true, turno: true } } },
      });
      return aluno?.turma ? [aluno.turma] : [];
    }

    if (user.userRole === UserRole.RESPONSAVEL) {
      const vinculos = await this.prisma.alunoResponsavel.findMany({
        where: {
          responsavelId: user.userId,
          aluno: { schoolId },
        },
        include: {
          aluno: {
            include: {
              turma: { select: { id: true, name: true, turno: true } },
            },
          },
        },
        orderBy: { aluno: { name: 'asc' } },
      });

      const turmas = new Map<string, { id: string; name: string; turno?: string | null }>();
      vinculos.forEach((vinculo) => {
        if (vinculo.aluno.turma) {
          turmas.set(vinculo.aluno.turma.id, vinculo.aluno.turma);
        }
      });
      return Array.from(turmas.values());
    }

    return this.prisma.turma.findMany({
      where: { schoolId },
      select: { id: true, name: true, turno: true },
      orderBy: { name: 'asc' },
    });
  }

  async listar(user: AuthUser, query: { turmaId: string; ano?: string }) {
    const schoolId = this.assertSchool(user);
    await this.assertTurmaVisualizacao(user, query.turmaId);

    const ano = this.parseAno(query.ano);
    const inicio = new Date(Date.UTC(ano, 0, 1, 0, 0, 0, 0));
    const fim = new Date(Date.UTC(ano, 11, 31, 23, 59, 59, 999));

    return this.prisma.professorAgenda.findMany({
      where: {
        schoolId,
        turmaId: query.turmaId,
        data: {
          gte: inicio,
          lte: fim,
        },
      },
      include: {
        professor: { select: { id: true, name: true, fotoUrl: true } },
        turma: { select: { id: true, name: true } },
      },
      orderBy: [{ data: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async criar(user: AuthUser, body: AgendaBody) {
    if (
      user.userRole !== UserRole.PROFESSOR &&
      user.userRole !== UserRole.ADMIN_ESCOLA &&
      user.userRole !== UserRole.GESTOR &&
      user.userRole !== UserRole.SECRETARIA
    ) {
      throw new ForbiddenException('Perfil sem permissão para criar agendamentos.');
    }

    if (!body.turmaId?.trim()) {
      throw new BadRequestException('Selecione a turma.');
    }

    const titulo = body.titulo?.trim();
    if (!titulo) {
      throw new BadRequestException('Digite o agendamento.');
    }

    const turma = await this.assertTurmaProfessor(user, body.turmaId.trim());

    return this.prisma.professorAgenda.create({
      data: {
        schoolId: turma.schoolId,
        turmaId: turma.id,
        professorId: user.userId,
        data: this.parseData(body.data),
        titulo,
        descricao: body.descricao?.trim() || null,
      },
      include: {
        professor: { select: { id: true, name: true, fotoUrl: true } },
        turma: { select: { id: true, name: true } },
      },
    });
  }

  async editar(user: AuthUser, id: string, body: AgendaBody) {
    if (
      user.userRole !== UserRole.PROFESSOR &&
      user.userRole !== UserRole.ADMIN_ESCOLA &&
      user.userRole !== UserRole.GESTOR &&
      user.userRole !== UserRole.SECRETARIA
    ) {
      throw new ForbiddenException('Perfil sem permissão para editar agendamentos.');
    }

    const schoolId = this.assertSchool(user);
    const agenda = await this.prisma.professorAgenda.findFirst({
      where: { id, schoolId },
    });

    if (!agenda) throw new NotFoundException('Agendamento não encontrado.');
    if (agenda.professorId !== user.userId) {
      throw new ForbiddenException('Você só pode editar seus agendamentos.');
    }

    const titulo = body.titulo?.trim();
    if (!titulo) {
      throw new BadRequestException('Digite o agendamento.');
    }

    return this.prisma.professorAgenda.update({
      where: { id },
      data: {
        data: body.data ? this.parseData(body.data) : undefined,
        titulo,
        descricao: body.descricao?.trim() || null,
      },
      include: {
        professor: { select: { id: true, name: true, fotoUrl: true } },
        turma: { select: { id: true, name: true } },
      },
    });
  }

  async excluir(user: AuthUser, id: string) {
    if (
      user.userRole !== UserRole.PROFESSOR &&
      user.userRole !== UserRole.ADMIN_ESCOLA &&
      user.userRole !== UserRole.GESTOR &&
      user.userRole !== UserRole.SECRETARIA
    ) {
      throw new ForbiddenException('Perfil sem permissão para excluir agendamentos.');
    }

    const schoolId = this.assertSchool(user);
    const agenda = await this.prisma.professorAgenda.findFirst({
      where: { id, schoolId },
    });

    if (!agenda) throw new NotFoundException('Agendamento não encontrado.');
    if (agenda.professorId !== user.userId) {
      throw new ForbiddenException('Você só pode excluir seus agendamentos.');
    }

    return this.prisma.professorAgenda.delete({ where: { id } });
  }
}
