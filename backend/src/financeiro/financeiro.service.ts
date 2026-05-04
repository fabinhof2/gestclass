import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  FinanceiroCobrancaStatus,
  FinanceiroGateway,
  FinanceiroNotaFiscalAmbiente,
  FinanceiroNotaFiscalProvedor,
  FinanceiroNotaFiscalStatus,
  FinanceiroNotaFiscalTipo,
  Prisma,
  SchoolPlan,
  SchoolStatus,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type FinanceiroUser = {
  id?: string;
  userId?: string;
  role: UserRole;
  schoolId?: string | null;
};

const FINANCEIRO_PLANOS: SchoolPlan[] = [SchoolPlan.PRO, SchoolPlan.PREMIUM];
const INADIMPLENCIA_ASSINATURA_DIAS = 45;
const BLOQUEIO_ASSINATURA_DIAS = 60;

const cobrancaInclude = {
  aluno: {
    select: {
      id: true,
      name: true,
      matricula: true,
      turma: {
        select: {
          id: true,
          name: true,
          turno: true,
        },
      },
      responsaveis: {
        select: {
          isFinanceiro: true,
          responsavel: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
              cpf: true,
            },
          },
        },
      },
    },
  },
  responsavel: {
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      cpf: true,
    },
  },
  notaFiscal: true,
} satisfies Prisma.FinanceiroCobrancaInclude;

const assinaturaCobrancaInclude = {
  school: {
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      plan: true,
      status: true,
      users: {
        where: {
          role: UserRole.ADMIN_ESCOLA,
        },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
        },
        orderBy: {
          createdAt: 'asc',
        },
        take: 1,
      },
    },
  },
  notaFiscal: true,
} satisfies Prisma.FinanceiroAssinaturaCobrancaInclude;

@Injectable()
export class FinanceiroService {
  constructor(private readonly prisma: PrismaService) {}

  private ensureSuperuser(user: FinanceiroUser) {
    if (user.role !== UserRole.SUPERUSUARIO) {
      throw new ForbiddenException('Sem permissao para gerir assinaturas.');
    }
  }

  private getRoleAccessFromConfig(
    role: UserRole,
    config: {
      gestorAccessEnabled?: boolean | null;
      secretariaAccessEnabled?: boolean | null;
    } | null,
  ) {
    if (role === UserRole.GESTOR) {
      return Boolean(config?.gestorAccessEnabled ?? true);
    }

    if (role === UserRole.SECRETARIA) {
      return Boolean(config?.secretariaAccessEnabled ?? true);
    }

    return true;
  }

  private async ensureFinanceiroEscola(user: FinanceiroUser) {
    if (
      user.role !== UserRole.ADMIN_ESCOLA &&
      user.role !== UserRole.FINANCEIRO &&
      user.role !== UserRole.SECRETARIA &&
      user.role !== UserRole.GESTOR
    ) {
      throw new ForbiddenException('Sem permissao para gerir financeiro.');
    }

    if (!user.schoolId) {
      throw new ForbiddenException('Usuario sem escola vinculada.');
    }

    if (user.role === UserRole.GESTOR || user.role === UserRole.SECRETARIA) {
      const config = await this.getConfiguracao(user.schoolId);

      if (!this.getRoleAccessFromConfig(user.role, config)) {
        throw new ForbiddenException(
          'O acesso ao financeiro esta bloqueado para este perfil.',
        );
      }
    }

    return user.schoolId;
  }

  private ensureAdminEscola(user: FinanceiroUser) {
    if (user.role !== UserRole.ADMIN_ESCOLA) {
      throw new ForbiddenException('Sem permissao para acessar assinaturas.');
    }

    if (!user.schoolId) {
      throw new ForbiddenException('Usuario sem escola vinculada.');
    }

    return user.schoolId;
  }

  private getAssinaturaConfigWhere() {
    return { slug: 'default' } as const;
  }

  private getDataLimiteInadimplenciaAssinatura() {
    const data = new Date();
    data.setDate(data.getDate() - INADIMPLENCIA_ASSINATURA_DIAS);
    return data;
  }

  private getDataLimiteBloqueioAssinatura() {
    const data = new Date();
    data.setDate(data.getDate() - BLOQUEIO_ASSINATURA_DIAS);
    return data;
  }

  private async atualizarInadimplenciaPorAssinaturas(schoolId?: string) {
    const agora = new Date();
    const limiteInadimplencia = this.getDataLimiteInadimplenciaAssinatura();
    const limiteBloqueio = this.getDataLimiteBloqueioAssinatura();

    await this.prisma.financeiroAssinaturaCobranca.updateMany({
      where: {
        status: FinanceiroCobrancaStatus.PENDENTE,
        vencimento: {
          lt: agora,
        },
        schoolId,
      },
      data: {
        status: FinanceiroCobrancaStatus.ATRASADO,
      },
    });

    const escolasComBloqueio =
      await this.prisma.financeiroAssinaturaCobranca.findMany({
        where: {
          status: {
            in: [
              FinanceiroCobrancaStatus.PENDENTE,
              FinanceiroCobrancaStatus.ATRASADO,
            ],
          },
          vencimento: {
            lt: limiteBloqueio,
          },
          schoolId,
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

    if (blockedSchoolIds.length > 0) {
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

    const escolasComAtrasoGrave =
      await this.prisma.financeiroAssinaturaCobranca.findMany({
        where: {
          status: {
            in: [
              FinanceiroCobrancaStatus.PENDENTE,
              FinanceiroCobrancaStatus.ATRASADO,
            ],
          },
          vencimento: {
            lt: limiteInadimplencia,
          },
          schoolId,
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

    const schoolIds = escolasComAtrasoGrave.map((item) => item.schoolId);
    const delinquentSchoolIds = schoolIds.filter(
      (item) => !blockedSchoolIds.includes(item),
    );

    if (delinquentSchoolIds.length > 0) {
      await this.prisma.school.updateMany({
        where: {
          id: {
            in: delinquentSchoolIds,
          },
          status: {
            notIn: [SchoolStatus.CANCELADA, SchoolStatus.SUSPENSA],
          },
        },
        data: {
          status: SchoolStatus.INADIMPLENTE,
        },
      });
    }

    const deveRestaurarEscola =
      schoolId &&
      !delinquentSchoolIds.includes(schoolId) &&
      !blockedSchoolIds.includes(schoolId);
    const deveRestaurarGlobal = !schoolId;

    if (deveRestaurarEscola || deveRestaurarGlobal) {
      await this.prisma.school.updateMany({
        where: {
          status: SchoolStatus.INADIMPLENTE,
          id: schoolId
            ? schoolId
            : delinquentSchoolIds.length > 0
              ? {
                  notIn: delinquentSchoolIds,
                }
              : undefined,
        },
        data: {
          status: SchoolStatus.ATIVA,
        },
      });
    }
  }

  private async ensureAssinaturaCobrancaAdmin(
    user: FinanceiroUser,
    cobrancaId: string,
  ) {
    const schoolId = this.ensureAdminEscola(user);
    const cobranca = await this.prisma.financeiroAssinaturaCobranca.findUnique({
      where: { id: cobrancaId },
      include: assinaturaCobrancaInclude,
    });

    if (!cobranca || cobranca.schoolId !== schoolId) {
      throw new NotFoundException('Cobranca de assinatura nao encontrada.');
    }

    return cobranca;
  }

  private getAuthenticatedUserId(user: FinanceiroUser) {
    const userId = user.id || user.userId;

    if (!userId) {
      throw new ForbiddenException('Usuario autenticado sem identificador.');
    }

    return userId;
  }

  private async ensureResponsavelCobranca(user: FinanceiroUser, cobrancaId: string) {
    const cobranca = await this.prisma.financeiroCobranca.findUnique({
      where: { id: cobrancaId },
      include: cobrancaInclude,
    });

    if (!cobranca) {
      throw new NotFoundException('Cobranca nao encontrada.');
    }

    if (user.role === UserRole.RESPONSAVEL) {
      const userId = this.getAuthenticatedUserId(user);
      const podeAcessar =
        cobranca.responsavelId === userId ||
        cobranca.aluno.responsaveis.some(
          (item) => item.responsavel.id === userId,
        );

      if (!podeAcessar) {
        throw new ForbiddenException('Sem permissao para esta cobranca.');
      }
    } else if (
      user.role === UserRole.ADMIN_ESCOLA ||
      user.role === UserRole.FINANCEIRO
    ) {
      if (!user.schoolId || cobranca.schoolId !== user.schoolId) {
        throw new ForbiddenException('Sem permissao para esta escola.');
      }
    } else {
      throw new ForbiddenException('Sem permissao.');
    }

    return cobranca;
  }

  private getDueDate(ano: number, mes: number, dia: number) {
    const ultimoDia = new Date(ano, mes, 0).getDate();
    return new Date(ano, mes - 1, Math.min(Math.max(dia || 10, 1), ultimoDia));
  }

  private dinheiro(valor: Prisma.Decimal | number | string) {
    return Number(valor || 0).toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    });
  }

  private async getPlanoEscola(schoolId: string) {
    const school = await this.prisma.school.findUnique({
      where: { id: schoolId },
      select: { plan: true },
    });

    if (!school) {
      throw new NotFoundException('Escola nao encontrada.');
    }

    return school.plan;
  }

  private async ensurePlanoFinanceiro(schoolId: string) {
    const plan = await this.getPlanoEscola(schoolId);

    if (!FINANCEIRO_PLANOS.includes(plan)) {
      throw new ForbiddenException(
        'Recurso financeiro disponivel apenas para os planos Pro e Premium.',
      );
    }

    return plan;
  }

  private async ensurePlanoPremium(schoolId: string) {
    const plan = await this.getPlanoEscola(schoolId);

    if (plan !== SchoolPlan.PREMIUM) {
      throw new ForbiddenException(
        'Este recurso financeiro esta disponivel apenas para o plano Premium.',
      );
    }

    return plan;
  }

  private getResponsavelCobrancasWhere(responsavelId: string) {
    return {
      OR: [
        { responsavelId },
        {
          aluno: {
            responsaveis: {
              some: {
                responsavelId,
              },
            },
          },
        },
      ],
    } satisfies Prisma.FinanceiroCobrancaWhereInput;
  }

  private async getResponsavelSchoolId(
    user: FinanceiroUser,
    cobrancas: Array<{ schoolId: string }> = [],
  ) {
    if (cobrancas[0]?.schoolId) return cobrancas[0].schoolId;
    if (user.schoolId) return user.schoolId;

    const userId = this.getAuthenticatedUserId(user);
    const vinculo = await this.prisma.alunoResponsavel.findFirst({
      where: { responsavelId: userId },
      select: {
        aluno: {
          select: {
            schoolId: true,
          },
        },
      },
    });

    return vinculo?.aluno.schoolId || null;
  }

  private toPublicConfiguracao(config: Awaited<ReturnType<FinanceiroService['getConfiguracao']>> | null) {
    return config
      ? {
          beneficiario: config.beneficiario,
          documento: config.documento,
          banco: config.banco,
          agencia: config.agencia,
          conta: config.conta,
          pixKey: config.pixKey,
          mensalidadePadrao: config.mensalidadePadrao,
          vencimentoDia: config.vencimentoDia,
          gestorAccessEnabled: config.gestorAccessEnabled,
          secretariaAccessEnabled: config.secretariaAccessEnabled,
          gateway: config.gateway,
          fiscalEnabled: config.fiscalEnabled,
          fiscalAmbiente: config.fiscalAmbiente,
          fiscalProvedor: config.fiscalProvedor,
          fiscalEndpointUrl: config.fiscalEndpointUrl,
          fiscalMunicipioIbge: config.fiscalMunicipioIbge,
          fiscalInscricaoMunicipal: config.fiscalInscricaoMunicipal,
          fiscalCnae: config.fiscalCnae,
          fiscalServicoCodigo: config.fiscalServicoCodigo,
          fiscalAliquotaIss: config.fiscalAliquotaIss,
          fiscalDescricaoPadrao: config.fiscalDescricaoPadrao,
          fiscalEmitirAutomaticamente: config.fiscalEmitirAutomaticamente,
          fiscalConfigurado:
            config.fiscalEnabled &&
            Boolean(config.fiscalEndpointUrl) &&
            Boolean(config.fiscalApiToken),
        }
      : null;
  }

  private getFrontendUrl() {
    return (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');
  }

  private getBackendUrl() {
    return (process.env.BACKEND_URL || 'http://localhost:3001').replace(/\/$/, '');
  }

  private async mercadoPagoRequest<T>(
    accessToken: string,
    path: string,
    options: RequestInit = {},
  ) {
    const response = await fetch(`https://api.mercadopago.com${path}`, {
      ...options,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        ...(options.headers || {}),
      },
    });
    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      const cause = Array.isArray(payload?.cause)
        ? payload.cause
            .map((item: any) => item?.description || item?.message)
            .filter(Boolean)
            .join(' ')
        : '';
      const message =
        cause ||
        payload?.message ||
        payload?.error ||
        'Nao foi possivel comunicar com o Mercado Pago.';
      throw new BadRequestException(message);
    }

    return payload as T;
  }

  private async aplicarPagamentoMercadoPago(payment: any) {
    const cobrancaId = payment?.external_reference;
    if (!cobrancaId) return null;

    const cobranca = await this.prisma.financeiroCobranca.findUnique({
      where: { id: cobrancaId },
      select: { id: true, vencimento: true },
    });

    if (!cobranca) return null;

    if (payment?.status === 'approved') {
      const updated = await this.prisma.financeiroCobranca.update({
        where: { id: cobrancaId },
        data: {
          status: FinanceiroCobrancaStatus.PAGO,
          pagoEm: payment.date_approved ? new Date(payment.date_approved) : new Date(),
          formaPagamento: `Mercado Pago${payment.payment_method_id ? ` - ${payment.payment_method_id}` : ''}`,
          gateway: FinanceiroGateway.MERCADO_PAGO,
          gatewayPaymentId: String(payment.id),
        },
        include: cobrancaInclude,
      });
      await this.emitirNotaFiscalAutomaticamente(
        FinanceiroNotaFiscalTipo.ESCOLAR,
        cobrancaId,
      );
      return updated;
    }

    if (payment?.status === 'pending' || payment?.status === 'in_process') {
      return this.prisma.financeiroCobranca.update({
        where: { id: cobrancaId },
        data: {
          gateway: FinanceiroGateway.MERCADO_PAGO,
          gatewayPaymentId: String(payment.id),
        },
        include: cobrancaInclude,
      });
    }

    if (
      payment?.status === 'rejected' ||
      payment?.status === 'cancelled' ||
      payment?.status === 'canceled' ||
      payment?.status === 'refunded' ||
      payment?.status === 'charged_back'
    ) {
      const status =
        cobranca.vencimento < new Date()
          ? FinanceiroCobrancaStatus.ATRASADO
          : FinanceiroCobrancaStatus.PENDENTE;

      return this.prisma.financeiroCobranca.update({
        where: { id: cobrancaId },
        data: {
          status,
          pagoEm: null,
          formaPagamento: null,
          gateway: FinanceiroGateway.MERCADO_PAGO,
          gatewayPaymentId: String(payment.id),
        },
        include: cobrancaInclude,
      });
    }

    return null;
  }

  private async aplicarPagamentoMercadoPagoAssinatura(payment: any) {
    const externalReference = String(payment?.external_reference || '');

    if (!externalReference.startsWith('assinatura:')) {
      return null;
    }

    const cobrancaId = externalReference.replace(/^assinatura:/, '');

    if (!cobrancaId) return null;

    const cobranca = await this.prisma.financeiroAssinaturaCobranca.findUnique({
      where: { id: cobrancaId },
      select: { id: true, schoolId: true, vencimento: true },
    });

    if (!cobranca) return null;

    if (payment?.status === 'approved') {
      const updated = await this.prisma.financeiroAssinaturaCobranca.update({
        where: { id: cobrancaId },
        data: {
          status: FinanceiroCobrancaStatus.PAGO,
          pagoEm: payment.date_approved ? new Date(payment.date_approved) : new Date(),
          formaPagamento: `Mercado Pago${payment.payment_method_id ? ` - ${payment.payment_method_id}` : ''}`,
          gateway: FinanceiroGateway.MERCADO_PAGO,
          gatewayPaymentId: String(payment.id),
        },
        include: assinaturaCobrancaInclude,
      });
      await this.atualizarInadimplenciaPorAssinaturas(cobranca.schoolId);
      await this.emitirNotaFiscalAutomaticamente(
        FinanceiroNotaFiscalTipo.ASSINATURA,
        cobrancaId,
      );
      return updated;
    }

    if (payment?.status === 'pending' || payment?.status === 'in_process') {
      const updated = await this.prisma.financeiroAssinaturaCobranca.update({
        where: { id: cobrancaId },
        data: {
          gateway: FinanceiroGateway.MERCADO_PAGO,
          gatewayPaymentId: String(payment.id),
        },
        include: assinaturaCobrancaInclude,
      });
      await this.atualizarInadimplenciaPorAssinaturas(cobranca.schoolId);
      await this.emitirNotaFiscalAutomaticamente(
        FinanceiroNotaFiscalTipo.ASSINATURA,
        cobrancaId,
      );
      return updated;
    }

    if (
      payment?.status === 'rejected' ||
      payment?.status === 'cancelled' ||
      payment?.status === 'canceled' ||
      payment?.status === 'refunded' ||
      payment?.status === 'charged_back'
    ) {
      const status =
        cobranca.vencimento < new Date()
          ? FinanceiroCobrancaStatus.ATRASADO
          : FinanceiroCobrancaStatus.PENDENTE;

      const updated = await this.prisma.financeiroAssinaturaCobranca.update({
        where: { id: cobrancaId },
        data: {
          status,
          pagoEm: null,
          formaPagamento: null,
          gateway: FinanceiroGateway.MERCADO_PAGO,
          gatewayPaymentId: String(payment.id),
        },
        include: assinaturaCobrancaInclude,
      });
      await this.atualizarInadimplenciaPorAssinaturas(cobranca.schoolId);
      return updated;
    }

    return null;
  }

  async getConfiguracao(schoolId: string) {
    return this.prisma.financeiroConfiguracao.upsert({
      where: { schoolId },
      update: {},
      create: { schoolId },
    });
  }

  async getAssinaturaConfiguracao() {
    return this.prisma.financeiroAssinaturaConfiguracao.upsert({
      where: this.getAssinaturaConfigWhere(),
      update: {},
      create: this.getAssinaturaConfigWhere(),
    });
  }

  private getValorAssinaturaPorPlano(
    config: Awaited<ReturnType<FinanceiroService['getAssinaturaConfiguracao']>>,
    plan: SchoolPlan,
  ) {
    switch (plan) {
      case SchoolPlan.TESTE_15_DIAS:
        return Number(config.valorTeste15Dias || 0);
      case SchoolPlan.BASICO:
        return Number(config.valorBasico || 0);
      case SchoolPlan.PRO:
        return Number(config.valorPro || 0);
      case SchoolPlan.PREMIUM:
        return Number(config.valorPremium || 0);
      default:
        return 0;
    }
  }

  private toPublicAssinaturaConfiguracao(
    config: Awaited<ReturnType<FinanceiroService['getAssinaturaConfiguracao']>> | null,
  ) {
    return config
      ? {
          beneficiario: config.beneficiario,
          documento: config.documento,
          banco: config.banco,
          agencia: config.agencia,
          conta: config.conta,
          pixKey: config.pixKey,
          gateway: config.gateway,
          mercadoPagoDisponivel:
            config.gateway === FinanceiroGateway.MERCADO_PAGO &&
            Boolean(config.gatewayAccessToken),
          pixDisponivel: Boolean(config.pixKey),
          valorTeste15Dias: config.valorTeste15Dias,
          valorBasico: config.valorBasico,
          valorPro: config.valorPro,
          valorPremium: config.valorPremium,
          vencimentoDia: config.vencimentoDia,
          fiscalEnabled: config.fiscalEnabled,
          fiscalAmbiente: config.fiscalAmbiente,
          fiscalProvedor: config.fiscalProvedor,
          fiscalEndpointUrl: config.fiscalEndpointUrl,
          fiscalMunicipioIbge: config.fiscalMunicipioIbge,
          fiscalInscricaoMunicipal: config.fiscalInscricaoMunicipal,
          fiscalCnae: config.fiscalCnae,
          fiscalServicoCodigo: config.fiscalServicoCodigo,
          fiscalAliquotaIss: config.fiscalAliquotaIss,
          fiscalDescricaoPadrao: config.fiscalDescricaoPadrao,
          fiscalEmitirAutomaticamente: config.fiscalEmitirAutomaticamente,
          fiscalConfigurado:
            config.fiscalEnabled &&
            Boolean(config.fiscalEndpointUrl) &&
            Boolean(config.fiscalApiToken),
        }
      : null;
  }

  private getFiscalConfigData(
    data: {
      fiscalEnabled?: boolean;
      fiscalAmbiente?: FinanceiroNotaFiscalAmbiente;
      fiscalProvedor?: FinanceiroNotaFiscalProvedor;
      fiscalEndpointUrl?: string;
      fiscalApiToken?: string;
      fiscalMunicipioIbge?: string;
      fiscalInscricaoMunicipal?: string;
      fiscalCnae?: string;
      fiscalServicoCodigo?: string;
      fiscalAliquotaIss?: number;
      fiscalDescricaoPadrao?: string;
      fiscalEmitirAutomaticamente?: boolean;
    },
    enabled: boolean,
  ) {
    const aliquota = Number(data.fiscalAliquotaIss || 0);

    if (aliquota < 0 || aliquota > 100) {
      throw new BadRequestException('Aliquota ISS deve ficar entre 0 e 100.');
    }

    return {
      fiscalEnabled: enabled ? Boolean(data.fiscalEnabled) : false,
      fiscalAmbiente:
        data.fiscalAmbiente || FinanceiroNotaFiscalAmbiente.HOMOLOGACAO,
      fiscalProvedor:
        data.fiscalProvedor || FinanceiroNotaFiscalProvedor.MUNICIPAL_API,
      fiscalEndpointUrl: enabled ? data.fiscalEndpointUrl?.trim() || null : null,
      fiscalApiToken: enabled ? data.fiscalApiToken?.trim() || null : null,
      fiscalMunicipioIbge: enabled
        ? data.fiscalMunicipioIbge?.trim() || null
        : null,
      fiscalInscricaoMunicipal: enabled
        ? data.fiscalInscricaoMunicipal?.trim() || null
        : null,
      fiscalCnae: enabled ? data.fiscalCnae?.trim() || null : null,
      fiscalServicoCodigo: enabled
        ? data.fiscalServicoCodigo?.trim() || null
        : null,
      fiscalAliquotaIss: enabled ? aliquota : 0,
      fiscalDescricaoPadrao: enabled
        ? data.fiscalDescricaoPadrao?.trim() || null
        : null,
      fiscalEmitirAutomaticamente: enabled
        ? Boolean(data.fiscalEmitirAutomaticamente)
        : false,
    };
  }

  async salvarConfiguracao(
    user: FinanceiroUser,
    data: {
      beneficiario?: string;
      documento?: string;
      banco?: string;
      agencia?: string;
      conta?: string;
      pixKey?: string;
      mensalidadePadrao?: number;
      vencimentoDia?: number;
      gestorAccessEnabled?: boolean;
      secretariaAccessEnabled?: boolean;
      gateway?: FinanceiroGateway | null;
      gatewayPublicKey?: string;
      gatewayAccessToken?: string;
      webhookUrl?: string;
      fiscalEnabled?: boolean;
      fiscalAmbiente?: FinanceiroNotaFiscalAmbiente;
      fiscalProvedor?: FinanceiroNotaFiscalProvedor;
      fiscalEndpointUrl?: string;
      fiscalApiToken?: string;
      fiscalMunicipioIbge?: string;
      fiscalInscricaoMunicipal?: string;
      fiscalCnae?: string;
      fiscalServicoCodigo?: string;
      fiscalAliquotaIss?: number;
      fiscalDescricaoPadrao?: string;
      fiscalEmitirAutomaticamente?: boolean;
      valorTeste15Dias?: number;
      valorBasico?: number;
      valorPro?: number;
      valorPremium?: number;
    },
  ) {
    if (user.role === UserRole.SUPERUSUARIO) {
      const vencimentoDia = Number(data.vencimentoDia || 10);
      const fiscalData = this.getFiscalConfigData(data, true);

      if (vencimentoDia < 1 || vencimentoDia > 31) {
        throw new BadRequestException(
          'Dia de vencimento deve ficar entre 1 e 31.',
        );
      }

      return this.prisma.financeiroAssinaturaConfiguracao.upsert({
        where: this.getAssinaturaConfigWhere(),
        update: {
          beneficiario: data.beneficiario?.trim() || null,
          documento: data.documento?.trim() || null,
          banco: data.banco?.trim() || null,
          agencia: data.agencia?.trim() || null,
          conta: data.conta?.trim() || null,
          pixKey: data.pixKey?.trim() || null,
          valorTeste15Dias: data.valorTeste15Dias ?? 0,
          valorBasico: data.valorBasico ?? 0,
          valorPro: data.valorPro ?? 0,
          valorPremium: data.valorPremium ?? 0,
          vencimentoDia,
          gateway: data.gateway || null,
          gatewayPublicKey: data.gatewayPublicKey?.trim() || null,
          gatewayAccessToken: data.gatewayAccessToken?.trim() || null,
          webhookUrl: data.webhookUrl?.trim() || null,
          ...fiscalData,
        },
        create: {
          ...this.getAssinaturaConfigWhere(),
          beneficiario: data.beneficiario?.trim() || null,
          documento: data.documento?.trim() || null,
          banco: data.banco?.trim() || null,
          agencia: data.agencia?.trim() || null,
          conta: data.conta?.trim() || null,
          pixKey: data.pixKey?.trim() || null,
          valorTeste15Dias: data.valorTeste15Dias ?? 0,
          valorBasico: data.valorBasico ?? 0,
          valorPro: data.valorPro ?? 0,
          valorPremium: data.valorPremium ?? 0,
          vencimentoDia,
          gateway: data.gateway || null,
          gatewayPublicKey: data.gatewayPublicKey?.trim() || null,
          gatewayAccessToken: data.gatewayAccessToken?.trim() || null,
          webhookUrl: data.webhookUrl?.trim() || null,
          ...fiscalData,
        },
      });
    }

    const schoolId = await this.ensureFinanceiroEscola(user);
    const currentConfig = await this.getConfiguracao(schoolId);
    const plan = await this.ensurePlanoFinanceiro(schoolId);
    const vencimentoDia = Number(data.vencimentoDia || 10);
    const permiteIntegracao = plan === SchoolPlan.PREMIUM;
    const fiscalData = this.getFiscalConfigData(data, permiteIntegracao);
    const gestorAccessEnabled =
      user.role === UserRole.ADMIN_ESCOLA
        ? Boolean(data.gestorAccessEnabled ?? currentConfig.gestorAccessEnabled)
        : currentConfig.gestorAccessEnabled;
    const secretariaAccessEnabled =
      user.role === UserRole.ADMIN_ESCOLA
        ? Boolean(
            data.secretariaAccessEnabled ?? currentConfig.secretariaAccessEnabled,
          )
        : currentConfig.secretariaAccessEnabled;

    if (vencimentoDia < 1 || vencimentoDia > 31) {
      throw new BadRequestException('Dia de vencimento deve ficar entre 1 e 31.');
    }

    return this.prisma.financeiroConfiguracao.upsert({
      where: { schoolId },
      update: {
        beneficiario: data.beneficiario?.trim() || null,
        documento: data.documento?.trim() || null,
        banco: data.banco?.trim() || null,
        agencia: data.agencia?.trim() || null,
        conta: data.conta?.trim() || null,
        pixKey: data.pixKey?.trim() || null,
        mensalidadePadrao: data.mensalidadePadrao ?? 0,
        vencimentoDia,
        gestorAccessEnabled,
        secretariaAccessEnabled,
        gateway: permiteIntegracao ? data.gateway || null : null,
        gatewayPublicKey: permiteIntegracao
          ? data.gatewayPublicKey?.trim() || null
          : null,
        gatewayAccessToken: permiteIntegracao
          ? data.gatewayAccessToken?.trim() || null
          : null,
        webhookUrl: permiteIntegracao ? data.webhookUrl?.trim() || null : null,
        ...fiscalData,
      },
      create: {
        schoolId,
        beneficiario: data.beneficiario?.trim() || null,
        documento: data.documento?.trim() || null,
        banco: data.banco?.trim() || null,
        agencia: data.agencia?.trim() || null,
        conta: data.conta?.trim() || null,
        pixKey: data.pixKey?.trim() || null,
        mensalidadePadrao: data.mensalidadePadrao ?? 0,
        vencimentoDia,
        gestorAccessEnabled,
        secretariaAccessEnabled,
        gateway: permiteIntegracao ? data.gateway || null : null,
        gatewayPublicKey: permiteIntegracao
          ? data.gatewayPublicKey?.trim() || null
          : null,
        gatewayAccessToken: permiteIntegracao
          ? data.gatewayAccessToken?.trim() || null
          : null,
        webhookUrl: permiteIntegracao ? data.webhookUrl?.trim() || null : null,
        ...fiscalData,
      },
    });
  }

  async gerarCobrancaAlunoMes(alunoId: string, schoolId: string, data = new Date()) {
    const [config, aluno] = await Promise.all([
      this.getConfiguracao(schoolId),
      this.prisma.aluno.findFirst({
        where: { id: alunoId, schoolId },
        include: {
          responsaveis: {
            orderBy: [{ isFinanceiro: 'desc' }, { createdAt: 'asc' }],
            include: {
              responsavel: {
                select: {
                  id: true,
                },
              },
            },
          },
        },
      }),
    ]);

    if (!aluno) {
      throw new NotFoundException('Aluno nao encontrado para esta escola.');
    }

    const mes = data.getMonth() + 1;
    const ano = data.getFullYear();
    const responsavelFinanceiro =
      aluno.responsaveis.find((item) => item.isFinanceiro) ||
      aluno.responsaveis[0];

    return this.prisma.financeiroCobranca.upsert({
      where: {
        alunoId_mes_ano: {
          alunoId,
          mes,
          ano,
        },
      },
      update: {
        responsavelId: responsavelFinanceiro?.responsavel.id || null,
      },
      create: {
        schoolId,
        alunoId,
        responsavelId: responsavelFinanceiro?.responsavel.id || null,
        mes,
        ano,
        descricao: `Mensalidade ${String(mes).padStart(2, '0')}/${ano} - ${aluno.name}`,
        valor: config.mensalidadePadrao,
        vencimento: this.getDueDate(ano, mes, config.vencimentoDia),
        boletoNossoNumero: `${ano}${String(mes).padStart(2, '0')}-${aluno.id.slice(-6).toUpperCase()}`,
      },
      include: cobrancaInclude,
    });
  }

  async gerarCobrancasMesAtual(schoolId: string) {
    const alunos = await this.prisma.aluno.findMany({
      where: {
        schoolId,
        status: 'ATIVO',
      },
      select: {
        id: true,
      },
    });

    for (const aluno of alunos) {
      await this.gerarCobrancaAlunoMes(aluno.id, schoolId);
    }
  }

  async gerarCobrancaAssinaturaEscolaMes(
    schoolId: string,
    data = new Date(),
  ) {
    const [config, school] = await Promise.all([
      this.getAssinaturaConfiguracao(),
      this.prisma.school.findUnique({
        where: { id: schoolId },
        select: {
          id: true,
          name: true,
          plan: true,
          status: true,
        },
      }),
    ]);

    if (!school) {
      throw new NotFoundException('Escola nao encontrada.');
    }

    if (school.status === SchoolStatus.CANCELADA) {
      throw new BadRequestException(
        'Nao e possivel gerar assinatura para escola cancelada.',
      );
    }

    const mes = data.getMonth() + 1;
    const ano = data.getFullYear();
    const valor = this.getValorAssinaturaPorPlano(config, school.plan);

    return this.prisma.financeiroAssinaturaCobranca.upsert({
      where: {
        schoolId_mes_ano: {
          schoolId,
          mes,
          ano,
        },
      },
      update: {
        descricao: `Assinatura GestClass ${String(mes).padStart(2, '0')}/${ano} - ${school.name}`,
      },
      create: {
        schoolId,
        mes,
        ano,
        descricao: `Assinatura GestClass ${String(mes).padStart(2, '0')}/${ano} - ${school.name}`,
        valor,
        vencimento: this.getDueDate(ano, mes, config.vencimentoDia),
        boletoNossoNumero: `ASS-${ano}${String(mes).padStart(2, '0')}-${school.id.slice(-6).toUpperCase()}`,
      },
      include: assinaturaCobrancaInclude,
    });
  }

  async gerarCobrancasAssinaturaMesAtual() {
    const escolas = await this.prisma.school.findMany({
      where: {
        status: {
          not: SchoolStatus.CANCELADA,
        },
      },
      select: {
        id: true,
      },
    });

    for (const escola of escolas) {
      await this.gerarCobrancaAssinaturaEscolaMes(escola.id);
    }
  }

  async gerarCobrancasMesAtualUsuario(user: FinanceiroUser) {
    if (user.role === UserRole.SUPERUSUARIO) {
      await this.gerarCobrancasAssinaturaMesAtual();
      return;
    }

    const schoolId = await this.ensureFinanceiroEscola(user);
    await this.ensurePlanoFinanceiro(schoolId);
    return this.gerarCobrancasMesAtual(schoolId);
  }

  async gerarAdiantadas(
    user: FinanceiroUser,
    data: { alunoId: string; quantidadeMeses: number },
  ) {
    const quantidadeMeses = Math.min(Math.max(Number(data.quantidadeMeses || 1), 1), 12);
    let aluno = await this.prisma.aluno.findUnique({
      where: { id: data.alunoId },
      select: {
        id: true,
        schoolId: true,
        responsaveis: {
          select: {
            responsavelId: true,
          },
        },
      },
    });

    if (!aluno) {
      throw new NotFoundException('Aluno nao encontrado.');
    }

    await this.ensurePlanoFinanceiro(aluno.schoolId);

    if (user.role === UserRole.RESPONSAVEL) {
      const userId = this.getAuthenticatedUserId(user);
      if (!aluno.responsaveis.some((item) => item.responsavelId === userId)) {
        throw new ForbiddenException('Sem permissao para este aluno.');
      }
    } else {
      const schoolId = await this.ensureFinanceiroEscola(user);
      if (aluno.schoolId !== schoolId) {
        throw new ForbiddenException('Sem permissao para esta escola.');
      }
    }

    const criadas: any[] = [];
    const agora = new Date();

    for (let index = 0; index < quantidadeMeses; index += 1) {
      const futura = new Date(agora.getFullYear(), agora.getMonth() + index, 1);
      criadas.push(
        await this.gerarCobrancaAlunoMes(aluno.id, aluno.schoolId, futura),
      );
    }

    return criadas;
  }

  private ensureFiscalConfigurado(
    config: {
      fiscalEnabled: boolean;
      fiscalEndpointUrl?: string | null;
      fiscalApiToken?: string | null;
    },
  ) {
    if (!config.fiscalEnabled) {
      throw new BadRequestException('Automacao fiscal nao esta habilitada.');
    }

    if (!config.fiscalEndpointUrl || !config.fiscalApiToken) {
      throw new BadRequestException(
        'Configure endpoint e token do provedor fiscal antes de emitir notas.',
      );
    }
  }

  private async fiscalRequest<T>(
    config: {
      fiscalEndpointUrl?: string | null;
      fiscalApiToken?: string | null;
    },
    path: string,
    options: RequestInit = {},
  ) {
    this.ensureFiscalConfigurado({
      fiscalEnabled: true,
      fiscalEndpointUrl: config.fiscalEndpointUrl,
      fiscalApiToken: config.fiscalApiToken,
    });

    const baseUrl = String(config.fiscalEndpointUrl).replace(/\/$/, '');
    const response = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.fiscalApiToken}`,
        ...(options.headers || {}),
      },
    });
    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      throw new BadRequestException(
        payload?.message ||
          payload?.erro ||
          payload?.error ||
          'Nao foi possivel comunicar com o provedor fiscal.',
      );
    }

    return payload as T;
  }

  private normalizeNotaFiscalResponse(payload: any) {
    const statusText = String(payload?.status || payload?.situacao || '')
      .toUpperCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
    const rejeitada = statusText.includes('REJEIT') || statusText.includes('ERRO');
    const cancelada = statusText.includes('CANCEL');
    const processando =
      statusText.includes('PROCESS') ||
      statusText.includes('PEND') ||
      statusText.includes('FILA');

    return {
      status: cancelada
        ? FinanceiroNotaFiscalStatus.CANCELADA
        : rejeitada
          ? FinanceiroNotaFiscalStatus.REJEITADA
          : processando
            ? FinanceiroNotaFiscalStatus.EM_PROCESSAMENTO
            : FinanceiroNotaFiscalStatus.EMITIDA,
      numero: payload?.numero || payload?.number || payload?.nfseNumero || null,
      codigoVerificacao:
        payload?.codigoVerificacao ||
        payload?.verificationCode ||
        payload?.codigo_verificacao ||
        null,
      chave: payload?.chave || payload?.key || payload?.chaveAcesso || null,
      linkPdf: payload?.linkPdf || payload?.pdfUrl || payload?.url_pdf || null,
      linkXml: payload?.linkXml || payload?.xmlUrl || payload?.url_xml || null,
      externalId:
        payload?.id ||
        payload?.externalId ||
        payload?.referencia ||
        payload?.protocolo ||
        null,
      protocolo: payload?.protocolo || payload?.protocol || null,
      mensagem:
        payload?.mensagem ||
        payload?.message ||
        payload?.erro ||
        payload?.error ||
        null,
    };
  }

  private buildNotaFiscalPayload(args: {
    tipo: FinanceiroNotaFiscalTipo;
    config: any;
    cobranca: any;
  }) {
    const { tipo, config, cobranca } = args;
    const isAssinatura = tipo === FinanceiroNotaFiscalTipo.ASSINATURA;
    const tomador = isAssinatura
      ? {
          nome: cobranca.school.name,
          email: cobranca.school.email,
          telefone: cobranca.school.phone,
        }
      : {
          nome: cobranca.responsavel?.name || cobranca.aluno.name,
          email: cobranca.responsavel?.email,
          telefone: cobranca.responsavel?.phone,
          documento: cobranca.responsavel?.cpf || undefined,
        };

    return {
      referencia: isAssinatura
        ? `assinatura:${cobranca.id}`
        : `cobranca:${cobranca.id}`,
      ambiente: config.fiscalAmbiente,
      provedor: config.fiscalProvedor,
      municipioIbge: config.fiscalMunicipioIbge,
      prestador: {
        razaoSocial: config.beneficiario,
        documento: config.documento,
        inscricaoMunicipal: config.fiscalInscricaoMunicipal,
      },
      tomador,
      servico: {
        codigo: config.fiscalServicoCodigo,
        cnae: config.fiscalCnae,
        descricao:
          config.fiscalDescricaoPadrao ||
          cobranca.descricao ||
          (isAssinatura ? 'Assinatura GestClass' : 'Mensalidade escolar'),
        aliquotaIss: Number(config.fiscalAliquotaIss || 0),
      },
      cobranca: {
        id: cobranca.id,
        descricao: cobranca.descricao,
        mes: cobranca.mes,
        ano: cobranca.ano,
        valor: Number(cobranca.valor || 0),
        vencimento: cobranca.vencimento,
        pagoEm: cobranca.pagoEm,
      },
    };
  }

  private async emitirNotaFiscalComProvedor(args: {
    tipo: FinanceiroNotaFiscalTipo;
    config: any;
    cobranca: any;
    notaWhere: { cobrancaId: string } | { assinaturaCobrancaId: string };
    notaData:
      | { cobrancaId: string; assinaturaCobrancaId?: null }
      | { assinaturaCobrancaId: string; cobrancaId?: null };
  }) {
    const { tipo, config, cobranca, notaWhere, notaData } = args;
    this.ensureFiscalConfigurado(config);

    if (cobranca.status !== FinanceiroCobrancaStatus.PAGO) {
      throw new BadRequestException(
        'A nota fiscal so pode ser emitida depois da confirmacao de pagamento.',
      );
    }

    const payload = this.buildNotaFiscalPayload({ tipo, config, cobranca });
    const nota = await this.prisma.financeiroNotaFiscal.upsert({
      where: notaWhere,
      update: {
        status: FinanceiroNotaFiscalStatus.EM_PROCESSAMENTO,
        ambiente: config.fiscalAmbiente,
        provedor: config.fiscalProvedor,
        mensagem: 'Enviando para o provedor fiscal.',
        payloadJson: JSON.stringify(payload),
      },
      create: {
        ...notaData,
        schoolId: cobranca.schoolId,
        tipo,
        status: FinanceiroNotaFiscalStatus.EM_PROCESSAMENTO,
        ambiente: config.fiscalAmbiente,
        provedor: config.fiscalProvedor,
        mensagem: 'Enviando para o provedor fiscal.',
        payloadJson: JSON.stringify(payload),
      },
    });

    try {
      const response = await this.fiscalRequest<any>(config, '/nfse', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      const normalized = this.normalizeNotaFiscalResponse(response);

      return this.prisma.financeiroNotaFiscal.update({
        where: { id: nota.id },
        data: {
          ...normalized,
          respostaJson: JSON.stringify(response),
          emitidaEm:
            normalized.status === FinanceiroNotaFiscalStatus.EMITIDA
              ? new Date()
              : null,
        },
      });
    } catch (error) {
      const message =
        error instanceof BadRequestException
          ? String(error.message)
          : 'Falha ao emitir nota fiscal.';

      await this.prisma.financeiroNotaFiscal.update({
        where: { id: nota.id },
        data: {
          status: FinanceiroNotaFiscalStatus.REJEITADA,
          mensagem: message,
        },
      });

      throw error;
    }
  }

  private async emitirNotaFiscalAutomaticamente(
    tipo: FinanceiroNotaFiscalTipo,
    cobrancaId: string,
  ) {
    try {
      if (tipo === FinanceiroNotaFiscalTipo.ASSINATURA) {
        const cobranca =
          await this.prisma.financeiroAssinaturaCobranca.findUnique({
            where: { id: cobrancaId },
            include: assinaturaCobrancaInclude,
          });
        const config = await this.getAssinaturaConfiguracao();
        if (!cobranca || !config.fiscalEmitirAutomaticamente) return;
        await this.emitirNotaFiscalComProvedor({
          tipo,
          config,
          cobranca,
          notaWhere: { assinaturaCobrancaId: cobranca.id },
          notaData: { assinaturaCobrancaId: cobranca.id, cobrancaId: null },
        });
        return;
      }

      const cobranca = await this.prisma.financeiroCobranca.findUnique({
        where: { id: cobrancaId },
        include: cobrancaInclude,
      });
      if (!cobranca) return;
      const config = await this.getConfiguracao(cobranca.schoolId);
      if (!config.fiscalEmitirAutomaticamente) return;
      await this.emitirNotaFiscalComProvedor({
        tipo,
        config,
        cobranca,
        notaWhere: { cobrancaId: cobranca.id },
        notaData: { cobrancaId: cobranca.id, assinaturaCobrancaId: null },
      });
    } catch {
      return;
    }
  }

  async emitirNotaFiscal(user: FinanceiroUser, cobrancaId: string) {
    if (user.role === UserRole.SUPERUSUARIO) {
      const cobranca = await this.prisma.financeiroAssinaturaCobranca.findUnique({
        where: { id: cobrancaId },
        include: assinaturaCobrancaInclude,
      });

      if (!cobranca) {
        throw new NotFoundException('Cobranca nao encontrada.');
      }

      return this.emitirNotaFiscalComProvedor({
        tipo: FinanceiroNotaFiscalTipo.ASSINATURA,
        config: await this.getAssinaturaConfiguracao(),
        cobranca,
        notaWhere: { assinaturaCobrancaId: cobranca.id },
        notaData: { assinaturaCobrancaId: cobranca.id, cobrancaId: null },
      });
    }

    const schoolId = await this.ensureFinanceiroEscola(user);
    const cobranca = await this.prisma.financeiroCobranca.findUnique({
      where: { id: cobrancaId },
      include: cobrancaInclude,
    });

    if (!cobranca || cobranca.schoolId !== schoolId) {
      throw new NotFoundException('Cobranca nao encontrada.');
    }

    await this.ensurePlanoPremium(schoolId);

    return this.emitirNotaFiscalComProvedor({
      tipo: FinanceiroNotaFiscalTipo.ESCOLAR,
      config: await this.getConfiguracao(schoolId),
      cobranca,
      notaWhere: { cobrancaId: cobranca.id },
      notaData: { cobrancaId: cobranca.id, assinaturaCobrancaId: null },
    });
  }

  async sincronizarNotaFiscal(user: FinanceiroUser, cobrancaId: string) {
    const nota =
      user.role === UserRole.SUPERUSUARIO
        ? await this.prisma.financeiroNotaFiscal.findUnique({
            where: { assinaturaCobrancaId: cobrancaId },
          })
        : await this.prisma.financeiroNotaFiscal.findUnique({
            where: { cobrancaId },
          });

    if (!nota) {
      throw new NotFoundException('Nota fiscal nao encontrada.');
    }

    const config =
      user.role === UserRole.SUPERUSUARIO
        ? await this.getAssinaturaConfiguracao()
        : await this.getConfiguracao(await this.ensureFinanceiroEscola(user));

    if (!nota.externalId) {
      return nota;
    }

    const response = await this.fiscalRequest<any>(
      config,
      `/nfse/${encodeURIComponent(nota.externalId)}`,
    );
    const normalized = this.normalizeNotaFiscalResponse(response);

    return this.prisma.financeiroNotaFiscal.update({
      where: { id: nota.id },
      data: {
        ...normalized,
        respostaJson: JSON.stringify(response),
        emitidaEm:
          normalized.status === FinanceiroNotaFiscalStatus.EMITIDA
            ? nota.emitidaEm || new Date()
            : nota.emitidaEm,
      },
    });
  }

  async cancelarNotaFiscal(user: FinanceiroUser, cobrancaId: string) {
    const nota =
      user.role === UserRole.SUPERUSUARIO
        ? await this.prisma.financeiroNotaFiscal.findUnique({
            where: { assinaturaCobrancaId: cobrancaId },
          })
        : await this.prisma.financeiroNotaFiscal.findUnique({
            where: { cobrancaId },
          });

    if (!nota) {
      throw new NotFoundException('Nota fiscal nao encontrada.');
    }

    if (nota.status !== FinanceiroNotaFiscalStatus.EMITIDA) {
      throw new BadRequestException('Apenas notas emitidas podem ser canceladas.');
    }

    const config =
      user.role === UserRole.SUPERUSUARIO
        ? await this.getAssinaturaConfiguracao()
        : await this.getConfiguracao(await this.ensureFinanceiroEscola(user));

    if (nota.externalId) {
      await this.fiscalRequest<any>(
        config,
        `/nfse/${encodeURIComponent(nota.externalId)}/cancelar`,
        {
          method: 'POST',
          body: JSON.stringify({ motivo: 'Cancelamento solicitado no GestClass' }),
        },
      );
    }

    return this.prisma.financeiroNotaFiscal.update({
      where: { id: nota.id },
      data: {
        status: FinanceiroNotaFiscalStatus.CANCELADA,
        canceladaEm: new Date(),
        mensagem: 'Nota fiscal cancelada.',
      },
    });
  }

  async listar(user: FinanceiroUser) {
    if (user.role === UserRole.SUPERUSUARIO) {
      await this.gerarCobrancasAssinaturaMesAtual();
      await this.atualizarAtrasadasAssinaturas();

      const [config, cobrancas] = await Promise.all([
        this.getAssinaturaConfiguracao(),
        this.prisma.financeiroAssinaturaCobranca.findMany({
          include: assinaturaCobrancaInclude,
          orderBy: [{ ano: 'desc' }, { mes: 'desc' }, { vencimento: 'asc' }],
        }),
      ]);

      return {
        modo: 'SUPERUSUARIO',
        assinaturaConfig: this.toPublicAssinaturaConfiguracao(config),
        resumo: this.resumo(cobrancas),
        cobrancasAssinatura: cobrancas,
        config: null,
        cobrancas: [],
        turmas: [],
      };
    }

    if (user.role === UserRole.RESPONSAVEL) {
      const userId = this.getAuthenticatedUserId(user);
      await this.atualizarAtrasadasResponsavel(userId);
      const cobrancas = await this.prisma.financeiroCobranca.findMany({
        where: this.getResponsavelCobrancasWhere(userId),
        include: cobrancaInclude,
        orderBy: [{ ano: 'desc' }, { mes: 'desc' }, { vencimento: 'asc' }],
      });
      const schoolId = await this.getResponsavelSchoolId(user, cobrancas);
      const config = schoolId ? await this.getConfiguracao(schoolId) : null;
      const plan = schoolId ? await this.getPlanoEscola(schoolId) : null;

      if (plan && !FINANCEIRO_PLANOS.includes(plan)) {
        return {
          modo: 'BLOQUEADO',
          plan,
          config: null,
          resumo: this.resumo([]),
          cobrancas: [],
          turmas: [],
        };
      }

      return {
        modo: 'RESPONSAVEL',
        plan,
        config: this.toPublicConfiguracao(config),
        resumo: this.resumo(cobrancas),
        cobrancas,
        turmas: [],
      };
    }

    const schoolId = await this.ensureFinanceiroEscola(user);
    const plan = await this.getPlanoEscola(schoolId);

    if (!FINANCEIRO_PLANOS.includes(plan)) {
      return {
        modo: 'BLOQUEADO',
        plan,
        config: null,
        resumo: this.resumo([]),
        cobrancas: [],
        turmas: [],
      };
    }

    await this.gerarCobrancasMesAtual(schoolId);
    await this.atualizarAtrasadas(schoolId);

    const [config, cobrancas, turmas] = await Promise.all([
      this.getConfiguracao(schoolId),
      this.prisma.financeiroCobranca.findMany({
        where: { schoolId },
        include: cobrancaInclude,
        orderBy: [{ ano: 'desc' }, { mes: 'desc' }, { vencimento: 'asc' }],
      }),
      this.prisma.turma.findMany({
        where: { schoolId },
        select: {
          id: true,
          name: true,
          turno: true,
        },
        orderBy: { name: 'asc' },
      }),
    ]);

    return {
      modo: 'GESTAO',
      plan,
      config,
      resumo: this.resumo(cobrancas),
      cobrancas,
      turmas,
    };
  }

  async obterAcesso(user: FinanceiroUser) {
    if (user.role === UserRole.SUPERUSUARIO) {
      return {
        visible: true,
        enabled: true,
        gestorAccessEnabled: true,
        secretariaAccessEnabled: true,
      };
    }

    if (!user.schoolId) {
      return {
        visible: false,
        enabled: false,
        gestorAccessEnabled: false,
        secretariaAccessEnabled: false,
      };
    }

    const config = await this.getConfiguracao(user.schoolId);
    const enabled = this.getRoleAccessFromConfig(user.role, config);
    const visible =
      user.role === UserRole.ADMIN_ESCOLA ||
      user.role === UserRole.FINANCEIRO ||
      user.role === UserRole.GESTOR ||
      user.role === UserRole.SECRETARIA;

    return {
      visible,
      enabled: visible ? enabled : false,
      gestorAccessEnabled: Boolean(config.gestorAccessEnabled ?? true),
      secretariaAccessEnabled: Boolean(config.secretariaAccessEnabled ?? true),
    };
  }

  async listarAssinaturaAdmin(user: FinanceiroUser) {
    const schoolId = this.ensureAdminEscola(user);
    await this.atualizarAtrasadasAssinaturas();

    const [school, config, cobrancas] = await Promise.all([
      this.prisma.school.findUnique({
        where: { id: schoolId },
        select: {
          id: true,
          name: true,
          plan: true,
          status: true,
        },
      }),
      this.getAssinaturaConfiguracao(),
      this.prisma.financeiroAssinaturaCobranca.findMany({
        where: { schoolId },
        include: assinaturaCobrancaInclude,
        orderBy: [{ ano: 'desc' }, { mes: 'desc' }, { vencimento: 'asc' }],
      }),
    ]);

    if (!school) {
      throw new NotFoundException('Escola nao encontrada.');
    }

    return {
      modo: 'ASSINATURA_ADMIN',
      school,
      assinaturaConfig: this.toPublicAssinaturaConfiguracao(config),
      resumo: this.resumo(cobrancas),
      cobrancasAssinatura: cobrancas,
    };
  }

  async resumoResponsavel(user: FinanceiroUser) {
    if (user.role !== UserRole.RESPONSAVEL) {
      throw new ForbiddenException('Resumo financeiro disponivel apenas para responsaveis.');
    }

    const userId = this.getAuthenticatedUserId(user);
    await this.atualizarAtrasadasResponsavel(userId);

    const cobrancas = await this.prisma.financeiroCobranca.findMany({
      where: {
        ...this.getResponsavelCobrancasWhere(userId),
        status: {
          in: [
            FinanceiroCobrancaStatus.PENDENTE,
            FinanceiroCobrancaStatus.ATRASADO,
          ],
        },
      },
      select: {
        id: true,
        schoolId: true,
        valor: true,
      },
      orderBy: [{ ano: 'desc' }, { mes: 'desc' }, { vencimento: 'asc' }],
    });
    const schoolId = await this.getResponsavelSchoolId(user, cobrancas);
    const plan = schoolId ? await this.getPlanoEscola(schoolId) : null;

    if (!plan || !FINANCEIRO_PLANOS.includes(plan)) {
      return {
        enabled: false,
        plan,
        totalAbertos: 0,
        valorEmAberto: 0,
        cobrancasAbertasIds: [],
      };
    }

    return {
      enabled: true,
      plan,
      totalAbertos: cobrancas.length,
      valorEmAberto: cobrancas.reduce(
        (acc, cobranca) => acc + Number(cobranca.valor || 0),
        0,
      ),
      cobrancasAbertasIds: cobrancas.map((cobranca) => cobranca.id),
    };
  }

  async marcarPago(
    user: FinanceiroUser,
    cobrancaId: string,
    data: { formaPagamento?: string; gatewayPaymentId?: string },
  ) {
    if (user.role === UserRole.SUPERUSUARIO) {
      const cobranca = await this.prisma.financeiroAssinaturaCobranca.findUnique({
        where: { id: cobrancaId },
        select: { id: true, schoolId: true },
      });

      if (!cobranca) {
        throw new NotFoundException('Cobranca nao encontrada.');
      }

      const updated = await this.prisma.financeiroAssinaturaCobranca.update({
        where: { id: cobrancaId },
        data: {
          status: FinanceiroCobrancaStatus.PAGO,
          pagoEm: new Date(),
          formaPagamento: data.formaPagamento?.trim() || 'Manual',
          gatewayPaymentId: data.gatewayPaymentId?.trim() || null,
        },
        include: assinaturaCobrancaInclude,
      });
      await this.atualizarInadimplenciaPorAssinaturas(cobranca.schoolId);
      return updated;
    }

    const schoolId = await this.ensureFinanceiroEscola(user);
    const cobranca = await this.prisma.financeiroCobranca.findUnique({
      where: { id: cobrancaId },
      select: { id: true, schoolId: true },
    });

    if (!cobranca || cobranca.schoolId !== schoolId) {
      throw new NotFoundException('Cobranca nao encontrada.');
    }

    await this.ensurePlanoFinanceiro(schoolId);

    const updated = await this.prisma.financeiroCobranca.update({
      where: { id: cobrancaId },
      data: {
        status: FinanceiroCobrancaStatus.PAGO,
        pagoEm: new Date(),
        formaPagamento: data.formaPagamento?.trim() || 'Manual',
        gatewayPaymentId: data.gatewayPaymentId?.trim() || null,
      },
      include: cobrancaInclude,
    });
    await this.emitirNotaFiscalAutomaticamente(
      FinanceiroNotaFiscalTipo.ESCOLAR,
      cobrancaId,
    );
    return updated;
  }

  async atualizarValor(
    user: FinanceiroUser,
    cobrancaId: string,
    data: { valor?: number | string },
  ) {
    if (user.role === UserRole.SUPERUSUARIO) {
      const valor = Number(String(data.valor ?? '').replace(',', '.'));

      if (!Number.isFinite(valor) || valor < 0) {
        throw new BadRequestException('Informe um valor valido para a cobranca.');
      }

      const cobranca = await this.prisma.financeiroAssinaturaCobranca.findUnique({
        where: { id: cobrancaId },
        select: { id: true, status: true },
      });

      if (!cobranca) {
        throw new NotFoundException('Cobranca nao encontrada.');
      }

      if (cobranca.status === FinanceiroCobrancaStatus.PAGO) {
        throw new BadRequestException(
          'Cancele o pagamento antes de alterar o valor desta cobranca.',
        );
      }

      if (cobranca.status === FinanceiroCobrancaStatus.CANCELADO) {
        throw new BadRequestException('Nao e possivel alterar uma cobranca cancelada.');
      }

      return this.prisma.financeiroAssinaturaCobranca.update({
        where: { id: cobrancaId },
        data: { valor },
        include: assinaturaCobrancaInclude,
      });
    }

    const schoolId = await this.ensureFinanceiroEscola(user);
    const valor = Number(String(data.valor ?? '').replace(',', '.'));

    if (!Number.isFinite(valor) || valor < 0) {
      throw new BadRequestException('Informe um valor valido para a cobranca.');
    }

    const cobranca = await this.prisma.financeiroCobranca.findUnique({
      where: { id: cobrancaId },
      select: { id: true, schoolId: true, status: true },
    });

    if (!cobranca || cobranca.schoolId !== schoolId) {
      throw new NotFoundException('Cobranca nao encontrada.');
    }

    await this.ensurePlanoFinanceiro(schoolId);

    if (cobranca.status === FinanceiroCobrancaStatus.PAGO) {
      throw new BadRequestException(
        'Cancele o pagamento antes de alterar o valor desta cobranca.',
      );
    }

    if (cobranca.status === FinanceiroCobrancaStatus.CANCELADO) {
      throw new BadRequestException('Nao e possivel alterar uma cobranca cancelada.');
    }

    return this.prisma.financeiroCobranca.update({
      where: { id: cobrancaId },
      data: { valor },
      include: cobrancaInclude,
    });
  }

  async atualizarValorPorTurma(
    user: FinanceiroUser,
    data: {
      turmaId?: string;
      valor?: number | string;
      mes?: number;
      ano?: number;
    },
  ) {
    const schoolId = await this.ensureFinanceiroEscola(user);
    await this.ensurePlanoPremium(schoolId);

    if (!data.turmaId) {
      throw new BadRequestException('Selecione uma turma.');
    }

    const valor = Number(String(data.valor ?? '').replace(',', '.'));

    if (!Number.isFinite(valor) || valor < 0) {
      throw new BadRequestException('Informe um valor valido para a turma.');
    }

    const hoje = new Date();
    const mes = Math.min(Math.max(Number(data.mes || hoje.getMonth() + 1), 1), 12);
    const ano = Number(data.ano || hoje.getFullYear());

    if (!Number.isInteger(ano) || ano < 2000 || ano > 2100) {
      throw new BadRequestException('Informe um ano valido.');
    }

    const turma = await this.prisma.turma.findFirst({
      where: {
        id: data.turmaId,
        schoolId,
      },
      select: {
        id: true,
      },
    });

    if (!turma) {
      throw new NotFoundException('Turma nao encontrada.');
    }

    const alunos = await this.prisma.aluno.findMany({
      where: {
        turmaId: turma.id,
        schoolId,
        status: 'ATIVO',
      },
      select: {
        id: true,
      },
    });

    let atualizadas = 0;
    let ignoradasPagas = 0;

    for (const aluno of alunos) {
      const cobranca = await this.gerarCobrancaAlunoMes(
        aluno.id,
        schoolId,
        new Date(ano, mes - 1, 1),
      );

      if (cobranca.status === FinanceiroCobrancaStatus.PAGO) {
        ignoradasPagas += 1;
        continue;
      }

      await this.prisma.financeiroCobranca.update({
        where: { id: cobranca.id },
        data: { valor },
      });
      atualizadas += 1;
    }

    return {
      turmaId: turma.id,
      mes,
      ano,
      valor,
      totalAlunos: alunos.length,
      atualizadas,
      ignoradasPagas,
    };
  }

  async atualizarValorPorPlanoAssinatura(
    user: FinanceiroUser,
    data: {
      plan?: string;
      valor?: number | string;
      mes?: number;
      ano?: number;
    },
  ) {
    this.ensureSuperuser(user);

    const plan = String(data.plan || '') as SchoolPlan;
    const plans = Object.values(SchoolPlan);

    if (!plans.includes(plan)) {
      throw new BadRequestException('Selecione um plano valido.');
    }

    const valor = Number(String(data.valor ?? '').replace(',', '.'));

    if (!Number.isFinite(valor) || valor < 0) {
      throw new BadRequestException('Informe um valor valido para o plano.');
    }

    const hoje = new Date();
    const mes = Math.min(Math.max(Number(data.mes || hoje.getMonth() + 1), 1), 12);
    const ano = Number(data.ano || hoje.getFullYear());

    if (!Number.isInteger(ano) || ano < 2000 || ano > 2100) {
      throw new BadRequestException('Informe um ano valido.');
    }

    const escolas = await this.prisma.school.findMany({
      where: {
        plan,
        status: {
          not: SchoolStatus.CANCELADA,
        },
      },
      select: {
        id: true,
      },
    });

    let atualizadas = 0;
    let ignoradasPagas = 0;

    for (const escola of escolas) {
      const cobranca = await this.gerarCobrancaAssinaturaEscolaMes(
        escola.id,
        new Date(ano, mes - 1, 1),
      );

      if (cobranca.status === FinanceiroCobrancaStatus.PAGO) {
        ignoradasPagas += 1;
        continue;
      }

      await this.prisma.financeiroAssinaturaCobranca.update({
        where: { id: cobranca.id },
        data: { valor },
      });
      atualizadas += 1;
    }

    return {
      plan,
      mes,
      ano,
      valor,
      totalEscolas: escolas.length,
      atualizadas,
      ignoradasPagas,
    };
  }

  async criarPreferenciaMercadoPagoAssinaturaAdmin(
    user: FinanceiroUser,
    cobrancaId: string,
  ) {
    const cobranca = await this.ensureAssinaturaCobrancaAdmin(user, cobrancaId);

    if (cobranca.status === FinanceiroCobrancaStatus.PAGO) {
      throw new BadRequestException('Esta cobranca ja esta paga.');
    }

    if (cobranca.status === FinanceiroCobrancaStatus.CANCELADO) {
      throw new BadRequestException('Esta cobranca esta cancelada.');
    }

    if (Number(cobranca.valor) <= 0) {
      throw new BadRequestException(
        'Informe um valor maior que zero antes de abrir o Mercado Pago.',
      );
    }

    const config = await this.getAssinaturaConfiguracao();

    if (
      config.gateway !== FinanceiroGateway.MERCADO_PAGO ||
      !config.gatewayAccessToken
    ) {
      throw new BadRequestException(
        'Mercado Pago nao configurado pela plataforma.',
      );
    }

    const backendUrl = this.getBackendUrl();
    const notificationUrl =
      config.webhookUrl?.trim() ||
      `${backendUrl}/financeiro/mercado-pago/webhook`;
    const admin = cobranca.school.users[0];

    const preference = await this.mercadoPagoRequest<{
      id: string;
      init_point?: string;
      sandbox_init_point?: string;
    }>(config.gatewayAccessToken, '/checkout/preferences', {
      method: 'POST',
      body: JSON.stringify({
        external_reference: `assinatura:${cobranca.id}`,
        notification_url: notificationUrl,
        back_urls: {
          success: `${backendUrl}/financeiro/mercado-pago/retorno?status=success&context=assinatura`,
          failure: `${backendUrl}/financeiro/mercado-pago/retorno?status=failure&context=assinatura`,
          pending: `${backendUrl}/financeiro/mercado-pago/retorno?status=pending&context=assinatura`,
        },
        auto_return: 'approved',
        payer: {
          name: admin?.name || cobranca.school.name,
          email: admin?.email || cobranca.school.email || undefined,
        },
        items: [
          {
            id: cobranca.id,
            title: cobranca.descricao,
            description: `Assinatura ${String(cobranca.mes).padStart(2, '0')}/${cobranca.ano}`,
            quantity: 1,
            currency_id: 'BRL',
            unit_price: Number(cobranca.valor),
          },
        ],
      }),
    });

    await this.prisma.financeiroAssinaturaCobranca.update({
      where: { id: cobranca.id },
      data: {
        gateway: FinanceiroGateway.MERCADO_PAGO,
        gatewayPaymentId: preference.id,
      },
    });

    return preference;
  }

  async sincronizarMercadoPagoAssinaturaAdmin(
    user: FinanceiroUser,
    cobrancaId: string,
  ) {
    const cobranca = await this.ensureAssinaturaCobrancaAdmin(user, cobrancaId);
    const config = await this.getAssinaturaConfiguracao();

    if (
      config.gateway !== FinanceiroGateway.MERCADO_PAGO ||
      !config.gatewayAccessToken
    ) {
      throw new BadRequestException('Mercado Pago nao configurado.');
    }

    const result = await this.mercadoPagoRequest<{ results?: any[] }>(
      config.gatewayAccessToken,
      `/v1/payments/search?external_reference=${encodeURIComponent(`assinatura:${cobranca.id}`)}`,
    );

    const payment = (result.results || []).sort(
      (a, b) =>
        new Date(b.date_created || 0).getTime() -
        new Date(a.date_created || 0).getTime(),
    )[0];

    if (!payment) {
      return cobranca;
    }

    return (await this.aplicarPagamentoMercadoPagoAssinatura(payment)) || cobranca;
  }

  async criarPreferenciaMercadoPago(user: FinanceiroUser, cobrancaId: string) {
    if (user.role === UserRole.SUPERUSUARIO) {
      const cobranca = await this.prisma.financeiroAssinaturaCobranca.findUnique({
        where: { id: cobrancaId },
        include: assinaturaCobrancaInclude,
      });

      if (!cobranca) {
        throw new NotFoundException('Cobranca nao encontrada.');
      }

      if (cobranca.status === FinanceiroCobrancaStatus.PAGO) {
        throw new BadRequestException('Esta cobranca ja esta paga.');
      }

      if (cobranca.status === FinanceiroCobrancaStatus.CANCELADO) {
        throw new BadRequestException('Esta cobranca esta cancelada.');
      }

      if (Number(cobranca.valor) <= 0) {
        throw new BadRequestException(
          'Informe um valor maior que zero antes de abrir o Mercado Pago.',
        );
      }

      const config = await this.getAssinaturaConfiguracao();

      if (
        config.gateway !== FinanceiroGateway.MERCADO_PAGO ||
        !config.gatewayAccessToken
      ) {
        throw new BadRequestException(
          'Mercado Pago nao configurado. Informe o Access token no financeiro de assinaturas.',
        );
      }

      const backendUrl = this.getBackendUrl();
      const notificationUrl =
        config.webhookUrl?.trim() ||
        `${backendUrl}/financeiro/mercado-pago/webhook`;
      const admin = cobranca.school.users[0];

      const preference = await this.mercadoPagoRequest<{
        id: string;
        init_point?: string;
        sandbox_init_point?: string;
      }>(config.gatewayAccessToken, '/checkout/preferences', {
        method: 'POST',
        body: JSON.stringify({
          external_reference: `assinatura:${cobranca.id}`,
          notification_url: notificationUrl,
          back_urls: {
            success: `${backendUrl}/financeiro/mercado-pago/retorno?status=success`,
            failure: `${backendUrl}/financeiro/mercado-pago/retorno?status=failure`,
            pending: `${backendUrl}/financeiro/mercado-pago/retorno?status=pending`,
          },
          auto_return: 'approved',
          payer: {
            name: admin?.name || cobranca.school.name,
            email: admin?.email || cobranca.school.email || undefined,
          },
          items: [
            {
              id: cobranca.id,
              title: cobranca.descricao,
              description: `Assinatura ${String(cobranca.mes).padStart(2, '0')}/${cobranca.ano}`,
              quantity: 1,
              currency_id: 'BRL',
              unit_price: Number(cobranca.valor),
            },
          ],
        }),
      });

      await this.prisma.financeiroAssinaturaCobranca.update({
        where: { id: cobranca.id },
        data: {
          gateway: FinanceiroGateway.MERCADO_PAGO,
          gatewayPaymentId: preference.id,
        },
      });

      return preference;
    }

    const cobranca = await this.ensureResponsavelCobranca(user, cobrancaId);
    await this.ensurePlanoPremium(cobranca.schoolId);

    if (cobranca.status === FinanceiroCobrancaStatus.PAGO) {
      throw new BadRequestException('Esta cobranca ja esta paga.');
    }

    if (cobranca.status === FinanceiroCobrancaStatus.CANCELADO) {
      throw new BadRequestException('Esta cobranca esta cancelada.');
    }

    if (Number(cobranca.valor) <= 0) {
      throw new BadRequestException(
        'Informe um valor maior que zero antes de abrir o Mercado Pago.',
      );
    }

    const config = await this.getConfiguracao(cobranca.schoolId);

    if (
      config.gateway !== FinanceiroGateway.MERCADO_PAGO ||
      !config.gatewayAccessToken
    ) {
      throw new BadRequestException(
        'Mercado Pago nao configurado. Informe o Access token no gestor financeiro.',
      );
    }

    const backendUrl = this.getBackendUrl();
    const notificationUrl =
      config.webhookUrl?.trim() ||
      `${backendUrl}/financeiro/mercado-pago/webhook`;

    const preference = await this.mercadoPagoRequest<{
      id: string;
      init_point?: string;
      sandbox_init_point?: string;
    }>(config.gatewayAccessToken, '/checkout/preferences', {
      method: 'POST',
      body: JSON.stringify({
        external_reference: cobranca.id,
        notification_url: notificationUrl,
        back_urls: {
          success: `${backendUrl}/financeiro/mercado-pago/retorno?status=success`,
          failure: `${backendUrl}/financeiro/mercado-pago/retorno?status=failure`,
          pending: `${backendUrl}/financeiro/mercado-pago/retorno?status=pending`,
        },
        auto_return: 'approved',
        payer: {
          name: cobranca.responsavel?.name || undefined,
          email: cobranca.responsavel?.email || undefined,
        },
        items: [
          {
            id: cobranca.id,
            title: cobranca.descricao,
            description: `Mensalidade ${String(cobranca.mes).padStart(2, '0')}/${cobranca.ano}`,
            quantity: 1,
            currency_id: 'BRL',
            unit_price: Number(cobranca.valor),
          },
        ],
      }),
    });

    await this.prisma.financeiroCobranca.update({
      where: { id: cobranca.id },
      data: {
        gateway: FinanceiroGateway.MERCADO_PAGO,
        gatewayPaymentId: preference.id,
      },
    });

    return preference;
  }

  async sincronizarMercadoPago(user: FinanceiroUser, cobrancaId: string) {
    if (user.role === UserRole.SUPERUSUARIO) {
      const cobranca = await this.prisma.financeiroAssinaturaCobranca.findUnique({
        where: { id: cobrancaId },
        include: assinaturaCobrancaInclude,
      });

      if (!cobranca) {
        throw new NotFoundException('Cobranca nao encontrada.');
      }

      const config = await this.getAssinaturaConfiguracao();

      if (
        config.gateway !== FinanceiroGateway.MERCADO_PAGO ||
        !config.gatewayAccessToken
      ) {
        throw new BadRequestException('Mercado Pago nao configurado.');
      }

      const result = await this.mercadoPagoRequest<{ results?: any[] }>(
        config.gatewayAccessToken,
        `/v1/payments/search?external_reference=${encodeURIComponent(`assinatura:${cobranca.id}`)}`,
      );

      const payment = (result.results || []).sort(
        (a, b) =>
          new Date(b.date_created || 0).getTime() -
          new Date(a.date_created || 0).getTime(),
      )[0];

      if (!payment) {
        return cobranca;
      }

      return (
        (await this.aplicarPagamentoMercadoPagoAssinatura(payment)) || cobranca
      );
    }

    const cobranca = await this.ensureResponsavelCobranca(user, cobrancaId);
    await this.ensurePlanoPremium(cobranca.schoolId);
    const config = await this.getConfiguracao(cobranca.schoolId);

    if (
      config.gateway !== FinanceiroGateway.MERCADO_PAGO ||
      !config.gatewayAccessToken
    ) {
      throw new BadRequestException('Mercado Pago nao configurado.');
    }

    const result = await this.mercadoPagoRequest<{ results?: any[] }>(
      config.gatewayAccessToken,
      `/v1/payments/search?external_reference=${encodeURIComponent(cobranca.id)}`,
    );

    const payment = (result.results || []).sort(
      (a, b) =>
        new Date(b.date_created || 0).getTime() -
        new Date(a.date_created || 0).getTime(),
    )[0];

    if (!payment) {
      return cobranca;
    }

    return (await this.aplicarPagamentoMercadoPago(payment)) || cobranca;
  }

  async processarWebhookMercadoPago(data: { paymentId?: string; type?: string }) {
    if (!data.paymentId || data.type !== 'payment') return null;

    const [configsEscolas, configAssinatura] = await Promise.all([
      this.prisma.financeiroConfiguracao.findMany({
        where: {
          gateway: FinanceiroGateway.MERCADO_PAGO,
          gatewayAccessToken: {
            not: null,
          },
        },
        select: {
          gatewayAccessToken: true,
        },
      }),
      this.prisma.financeiroAssinaturaConfiguracao.findUnique({
        where: this.getAssinaturaConfigWhere(),
        select: {
          gatewayAccessToken: true,
        },
      }),
    ]);

    const configs = [
      ...configsEscolas,
      ...(configAssinatura?.gatewayAccessToken
        ? [{ gatewayAccessToken: configAssinatura.gatewayAccessToken }]
        : []),
    ];

    for (const config of configs) {
      if (!config.gatewayAccessToken) continue;

      try {
        const payment = await this.mercadoPagoRequest<any>(
          config.gatewayAccessToken,
          `/v1/payments/${encodeURIComponent(data.paymentId)}`,
        );
        const assinaturaUpdated =
          await this.aplicarPagamentoMercadoPagoAssinatura(payment);
        if (assinaturaUpdated) return assinaturaUpdated;
        const updated = await this.aplicarPagamentoMercadoPago(payment);

        if (updated) return updated;
      } catch {
        continue;
      }
    }

    return null;
  }

  async cancelarPagamento(user: FinanceiroUser, cobrancaId: string) {
    if (user.role === UserRole.SUPERUSUARIO) {
      const cobranca = await this.prisma.financeiroAssinaturaCobranca.findUnique({
        where: { id: cobrancaId },
        select: { id: true, schoolId: true, vencimento: true },
      });

      if (!cobranca) {
        throw new NotFoundException('Cobranca nao encontrada.');
      }

      const status =
        cobranca.vencimento < new Date()
          ? FinanceiroCobrancaStatus.ATRASADO
          : FinanceiroCobrancaStatus.PENDENTE;

      const updated = await this.prisma.financeiroAssinaturaCobranca.update({
        where: { id: cobrancaId },
        data: {
          status,
          pagoEm: null,
          formaPagamento: null,
          gatewayPaymentId: null,
        },
        include: assinaturaCobrancaInclude,
      });
      await this.atualizarInadimplenciaPorAssinaturas(cobranca.schoolId);
      return updated;
    }

    const schoolId = await this.ensureFinanceiroEscola(user);
    const cobranca = await this.prisma.financeiroCobranca.findUnique({
      where: { id: cobrancaId },
      select: { id: true, schoolId: true, vencimento: true },
    });

    if (!cobranca || cobranca.schoolId !== schoolId) {
      throw new NotFoundException('Cobranca nao encontrada.');
    }

    await this.ensurePlanoFinanceiro(schoolId);

    const status =
      cobranca.vencimento < new Date()
        ? FinanceiroCobrancaStatus.ATRASADO
        : FinanceiroCobrancaStatus.PENDENTE;

    return this.prisma.financeiroCobranca.update({
      where: { id: cobrancaId },
      data: {
        status,
        pagoEm: null,
        formaPagamento: null,
        gatewayPaymentId: null,
      },
      include: cobrancaInclude,
    });
  }

  async cancelar(user: FinanceiroUser, cobrancaId: string) {
    if (user.role === UserRole.SUPERUSUARIO) {
      const cobranca = await this.prisma.financeiroAssinaturaCobranca.findUnique({
        where: { id: cobrancaId },
        select: { id: true, schoolId: true },
      });

      if (!cobranca) {
        throw new NotFoundException('Cobranca nao encontrada.');
      }

      const updated = await this.prisma.financeiroAssinaturaCobranca.update({
        where: { id: cobrancaId },
        data: {
          status: FinanceiroCobrancaStatus.CANCELADO,
        },
        include: assinaturaCobrancaInclude,
      });
      await this.atualizarInadimplenciaPorAssinaturas(cobranca.schoolId);
      return updated;
    }

    const schoolId = await this.ensureFinanceiroEscola(user);
    const cobranca = await this.prisma.financeiroCobranca.findUnique({
      where: { id: cobrancaId },
      select: { id: true, schoolId: true },
    });

    if (!cobranca || cobranca.schoolId !== schoolId) {
      throw new NotFoundException('Cobranca nao encontrada.');
    }

    await this.ensurePlanoFinanceiro(schoolId);

    return this.prisma.financeiroCobranca.update({
      where: { id: cobrancaId },
      data: {
        status: FinanceiroCobrancaStatus.CANCELADO,
      },
      include: cobrancaInclude,
    });
  }

  async getBoletoPdfAssinaturaAdmin(user: FinanceiroUser, cobrancaId: string) {
    const cobranca = await this.ensureAssinaturaCobrancaAdmin(user, cobrancaId);
    const config = await this.getAssinaturaConfiguracao();
    const admin = cobranca.school.users[0];

    return this.criarPdfBoleto([
      'GestClass - Boleto de assinatura',
      `Escola: ${cobranca.school.name}`,
      `Admin: ${admin?.name || 'Nao informado'}`,
      `Contato: ${admin?.email || cobranca.school.email || 'Nao informado'}`,
      `Plano: ${cobranca.school.plan}`,
      `Descricao: ${cobranca.descricao}`,
      `Valor: ${this.dinheiro(cobranca.valor)}`,
      `Vencimento: ${new Date(cobranca.vencimento).toLocaleDateString('pt-BR')}`,
      `Status: ${cobranca.status}`,
      `Nosso numero: ${cobranca.boletoNossoNumero || cobranca.id}`,
      '',
      'Dados bancarios da plataforma',
      `Beneficiario: ${config.beneficiario || 'Nao configurado'}`,
      `Documento: ${config.documento || 'Nao configurado'}`,
      `Banco: ${config.banco || 'Nao configurado'}`,
      `Agencia: ${config.agencia || 'Nao configurado'}`,
      `Conta: ${config.conta || 'Nao configurado'}`,
      `PIX: ${config.pixKey || 'Nao configurado'}`,
      '',
      'Integracao de pagamento',
      `Gateway: ${config.gateway || 'Nao configurado'}`,
      'Use a guia Assinatura para acompanhar os boletos da plataforma.',
    ]);
  }

  async getBoletoPdf(user: FinanceiroUser, cobrancaId: string) {
    if (user.role === UserRole.SUPERUSUARIO) {
      const cobranca = await this.prisma.financeiroAssinaturaCobranca.findUnique({
        where: { id: cobrancaId },
        include: assinaturaCobrancaInclude,
      });

      if (!cobranca) {
        throw new NotFoundException('Cobranca nao encontrada.');
      }

      const config = await this.getAssinaturaConfiguracao();
      const admin = cobranca.school.users[0];

      return this.criarPdfBoleto([
        'GestClass - Boleto de assinatura',
        `Escola: ${cobranca.school.name}`,
        `Admin: ${admin?.name || 'Nao informado'}`,
        `Contato: ${admin?.email || cobranca.school.email || 'Nao informado'}`,
        `Plano: ${cobranca.school.plan}`,
        `Descricao: ${cobranca.descricao}`,
        `Valor: ${this.dinheiro(cobranca.valor)}`,
        `Vencimento: ${new Date(cobranca.vencimento).toLocaleDateString('pt-BR')}`,
        `Status: ${cobranca.status}`,
        `Nosso numero: ${cobranca.boletoNossoNumero || cobranca.id}`,
        '',
        'Dados bancarios da plataforma',
        `Beneficiario: ${config.beneficiario || 'Nao configurado'}`,
        `Documento: ${config.documento || 'Nao configurado'}`,
        `Banco: ${config.banco || 'Nao configurado'}`,
        `Agencia: ${config.agencia || 'Nao configurado'}`,
        `Conta: ${config.conta || 'Nao configurado'}`,
        `PIX: ${config.pixKey || 'Nao configurado'}`,
        '',
        'Integracao de pagamento',
        `Gateway: ${config.gateway || 'Nao configurado'}`,
        'Use o financeiro global para controlar cobrancas de assinatura da plataforma.',
      ]);
    }

    const cobranca = await this.ensureResponsavelCobranca(user, cobrancaId);
    await this.ensurePlanoFinanceiro(cobranca.schoolId);
    const config = await this.getConfiguracao(cobranca.schoolId);

    return this.criarPdfBoleto([
      'GestClass - Boleto escolar',
      `Aluno: ${cobranca.aluno.name}`,
      `Responsavel: ${cobranca.responsavel?.name || 'Nao informado'}`,
      `Descricao: ${cobranca.descricao}`,
      `Valor: ${this.dinheiro(cobranca.valor)}`,
      `Vencimento: ${new Date(cobranca.vencimento).toLocaleDateString('pt-BR')}`,
      `Status: ${cobranca.status}`,
      `Nosso numero: ${cobranca.boletoNossoNumero || cobranca.id}`,
      '',
      'Dados bancarios da escola',
      `Beneficiario: ${config.beneficiario || 'Nao configurado'}`,
      `Documento: ${config.documento || 'Nao configurado'}`,
      `Banco: ${config.banco || 'Nao configurado'}`,
      `Agencia: ${config.agencia || 'Nao configurado'}`,
      `Conta: ${config.conta || 'Nao configurado'}`,
      `PIX: ${config.pixKey || 'Nao configurado'}`,
      '',
      'Integracao de pagamento',
      `Gateway: ${config.gateway || 'Nao configurado'}`,
      'Use os campos de gateway no painel financeiro para ligar Mercado Pago, PayPal ou outro provedor.',
    ]);
  }

  private async atualizarAtrasadas(schoolId?: string, responsavelId?: string) {
    await this.prisma.financeiroCobranca.updateMany({
      where: {
        status: FinanceiroCobrancaStatus.PENDENTE,
        vencimento: {
          lt: new Date(),
        },
        schoolId,
        responsavelId,
      },
      data: {
        status: FinanceiroCobrancaStatus.ATRASADO,
      },
    });
  }

  private async atualizarAtrasadasAssinaturas() {
    await this.atualizarInadimplenciaPorAssinaturas();
  }

  private async atualizarAtrasadasResponsavel(responsavelId: string) {
    await this.prisma.financeiroCobranca.updateMany({
      where: {
        ...this.getResponsavelCobrancasWhere(responsavelId),
        status: FinanceiroCobrancaStatus.PENDENTE,
        vencimento: {
          lt: new Date(),
        },
      },
      data: {
        status: FinanceiroCobrancaStatus.ATRASADO,
      },
    });
  }

  private resumo(cobrancas: Array<{ status: FinanceiroCobrancaStatus; valor: Prisma.Decimal }>) {
    const total = cobrancas.reduce((acc, item) => acc + Number(item.valor), 0);
    const recebido = cobrancas
      .filter((item) => item.status === FinanceiroCobrancaStatus.PAGO)
      .reduce((acc, item) => acc + Number(item.valor), 0);
    const emAberto = cobrancas
      .filter(
        (item) =>
          item.status === FinanceiroCobrancaStatus.PENDENTE ||
          item.status === FinanceiroCobrancaStatus.ATRASADO,
      )
      .reduce((acc, item) => acc + Number(item.valor), 0);
    const atrasado = cobrancas
      .filter((item) => item.status === FinanceiroCobrancaStatus.ATRASADO)
      .reduce((acc, item) => acc + Number(item.valor), 0);

    return {
      total,
      recebido,
      emAberto,
      atrasado,
      quantidade: cobrancas.length,
      pagos: cobrancas.filter((item) => item.status === FinanceiroCobrancaStatus.PAGO)
        .length,
      atrasados: cobrancas.filter(
        (item) => item.status === FinanceiroCobrancaStatus.ATRASADO,
      ).length,
    };
  }

  private criarPdfBoleto(linhas: string[]) {
    const escapePdf = (text: string) =>
      text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
    const content = [
      'BT',
      '/F1 16 Tf',
      '50 790 Td',
      ...linhas.flatMap((linha, index) => [
        index === 0 ? '' : '0 -24 Td',
        `(${escapePdf(linha)}) Tj`,
      ]),
      'ET',
    ]
      .filter(Boolean)
      .join('\n');

    const objects = [
      '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
      '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
      '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n',
      '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
      `5 0 obj\n<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream\nendobj\n`,
    ];

    let pdf = '%PDF-1.4\n';
    const offsets = [0];

    for (const object of objects) {
      offsets.push(Buffer.byteLength(pdf));
      pdf += object;
    }

    const xrefOffset = Buffer.byteLength(pdf);
    pdf += `xref\n0 ${objects.length + 1}\n`;
    pdf += '0000000000 65535 f \n';
    for (let index = 1; index < offsets.length; index += 1) {
      pdf += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`;
    }
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

    return Buffer.from(pdf);
  }
}
