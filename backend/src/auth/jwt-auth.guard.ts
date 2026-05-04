import {
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FinanceiroCobrancaStatus, SchoolStatus, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const BLOQUEIO_ASSINATURA_DIAS = 60;

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  private async atualizarPresencaUsuario(userId?: string) {
    if (!userId) return;

    const limiteRecente = new Date(Date.now() - 2 * 60 * 1000);

    await this.prisma.user.updateMany({
      where: {
        id: userId,
        OR: [{ lastActiveAt: null }, { lastActiveAt: { lt: limiteRecente } }],
      },
      data: {
        lastActiveAt: new Date(),
      },
    });
  }

  private getDataLimiteBloqueioAssinatura() {
    const data = new Date();
    data.setDate(data.getDate() - BLOQUEIO_ASSINATURA_DIAS);
    return data;
  }

  private async atualizarBloqueioPorAtraso(schoolIds: string[]) {
    const ids = Array.from(new Set(schoolIds.filter(Boolean)));

    if (ids.length === 0) return;

    await this.prisma.financeiroAssinaturaCobranca.updateMany({
      where: {
        schoolId: {
          in: ids,
        },
        status: FinanceiroCobrancaStatus.PENDENTE,
        vencimento: {
          lt: new Date(),
        },
      },
      data: {
        status: FinanceiroCobrancaStatus.ATRASADO,
      },
    });

    const escolasComBloqueio =
      await this.prisma.financeiroAssinaturaCobranca.findMany({
        where: {
          schoolId: {
            in: ids,
          },
          status: {
            in: [
              FinanceiroCobrancaStatus.PENDENTE,
              FinanceiroCobrancaStatus.ATRASADO,
            ],
          },
          vencimento: {
            lt: this.getDataLimiteBloqueioAssinatura(),
          },
          school: {
            status: {
              not: SchoolStatus.CANCELADA,
            },
          },
        },
        select: {
          schoolId: true,
        },
        distinct: ['schoolId'],
      });

    const blockedSchoolIds = escolasComBloqueio.map((item) => item.schoolId);

    if (blockedSchoolIds.length === 0) return;

    await this.prisma.school.updateMany({
      where: {
        id: {
          in: blockedSchoolIds,
        },
        status: {
          not: SchoolStatus.CANCELADA,
        },
      },
      data: {
        status: SchoolStatus.SUSPENSA,
      },
    });
  }

  async canActivate(context: ExecutionContext) {
    const canActivate = await super.canActivate(context);

    if (!canActivate) {
      return false;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user || user.role === UserRole.SUPERUSUARIO) {
      return true;
    }

    if (user.isSuperuserMaintenance) {
      return true;
    }

    await this.atualizarPresencaUsuario(user.userId || user.id || user.sub);

    const schoolIds = user.schoolId ? [user.schoolId] : [];
    const vinculosResponsavel = await this.prisma.alunoResponsavel.findMany({
      where: {
        responsavelId: user.userId,
      },
      select: {
        aluno: {
          select: {
            schoolId: true,
          },
        },
      },
    });

    schoolIds.push(...vinculosResponsavel.map((item) => item.aluno.schoolId));
    await this.atualizarBloqueioPorAtraso(schoolIds);

    if (user.schoolId) {
      const school = await this.prisma.school.findUnique({
        where: { id: user.schoolId },
        select: { status: true },
      });

      if (school?.status === SchoolStatus.SUSPENSA) {
        throw new ForbiddenException(
          'A escola esta bloqueada. Entre em contato com o suporte da plataforma.',
        );
      }
    }

    const escolaSuspensaPorVinculo =
      await this.prisma.alunoResponsavel.findFirst({
        where: {
          responsavelId: user.userId,
          aluno: {
            school: {
              status: SchoolStatus.SUSPENSA,
            },
          },
        },
        select: {
          id: true,
        },
      });

    if (escolaSuspensaPorVinculo) {
      throw new ForbiddenException(
        'A escola esta bloqueada. Entre em contato com o suporte da plataforma.',
      );
    }

    return true;
  }
}
