import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  FinanceiroGateway,
  FinanceiroNotaFiscalAmbiente,
  FinanceiroNotaFiscalProvedor,
  UserRole,
} from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { FinanceiroService } from './financeiro.service';

@Controller('financeiro')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(
  UserRole.SUPERUSUARIO,
  UserRole.ADMIN_ESCOLA,
  UserRole.FINANCEIRO,
  UserRole.SECRETARIA,
  UserRole.GESTOR,
  UserRole.RESPONSAVEL,
)
export class FinanceiroController {
  constructor(private readonly financeiroService: FinanceiroService) {}

  @Get('acesso')
  acesso(@CurrentUser() user: any) {
    return this.financeiroService.obterAcesso(user);
  }

  @Get()
  listar(@CurrentUser() user: any) {
    return this.financeiroService.listar(user);
  }

  @Get('assinatura')
  @Roles(UserRole.ADMIN_ESCOLA)
  listarAssinatura(@CurrentUser() user: any) {
    return this.financeiroService.listarAssinaturaAdmin(user);
  }

  @Get('resumo-responsavel')
  @Roles(UserRole.RESPONSAVEL)
  resumoResponsavel(@CurrentUser() user: any) {
    return this.financeiroService.resumoResponsavel(user);
  }

  @Patch('configuracao')
  @Roles(
    UserRole.SUPERUSUARIO,
    UserRole.ADMIN_ESCOLA,
    UserRole.FINANCEIRO,
    UserRole.SECRETARIA,
    UserRole.GESTOR,
  )
  salvarConfiguracao(
    @CurrentUser() user: any,
    @Body()
    body: {
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
    return this.financeiroService.salvarConfiguracao(user, body);
  }

  @Post('gerar-mes-atual')
  @Roles(
    UserRole.SUPERUSUARIO,
    UserRole.ADMIN_ESCOLA,
    UserRole.FINANCEIRO,
    UserRole.SECRETARIA,
    UserRole.GESTOR,
  )
  async gerarMesAtual(@CurrentUser() user: any) {
    await this.financeiroService.gerarCobrancasMesAtualUsuario(user);
    return this.financeiroService.listar(user);
  }

  @Post('adiantar')
  @Roles(
    UserRole.ADMIN_ESCOLA,
    UserRole.FINANCEIRO,
    UserRole.SECRETARIA,
    UserRole.GESTOR,
  )
  gerarAdiantadas(
    @CurrentUser() user: any,
    @Body()
    body: {
      alunoId: string;
      quantidadeMeses: number;
    },
  ) {
    return this.financeiroService.gerarAdiantadas(user, body);
  }

  @Patch('cobrancas/:id/pagar')
  @Roles(
    UserRole.SUPERUSUARIO,
    UserRole.ADMIN_ESCOLA,
    UserRole.FINANCEIRO,
    UserRole.SECRETARIA,
    UserRole.GESTOR,
  )
  marcarPago(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body()
    body: {
      formaPagamento?: string;
      gatewayPaymentId?: string;
    },
  ) {
    return this.financeiroService.marcarPago(user, id, body);
  }

  @Patch('cobrancas/:id/valor')
  @Roles(
    UserRole.SUPERUSUARIO,
    UserRole.ADMIN_ESCOLA,
    UserRole.FINANCEIRO,
    UserRole.SECRETARIA,
    UserRole.GESTOR,
  )
  atualizarValor(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() body: { valor?: number | string },
  ) {
    return this.financeiroService.atualizarValor(user, id, body);
  }

  @Patch('cobrancas/valor-por-turma')
  @Roles(
    UserRole.ADMIN_ESCOLA,
    UserRole.FINANCEIRO,
    UserRole.SECRETARIA,
    UserRole.GESTOR,
  )
  atualizarValorPorTurma(
    @CurrentUser() user: any,
    @Body()
    body: {
      turmaId?: string;
      valor?: number | string;
      mes?: number;
      ano?: number;
    },
  ) {
    return this.financeiroService.atualizarValorPorTurma(user, body);
  }

  @Patch('cobrancas/valor-por-plano')
  @Roles(UserRole.SUPERUSUARIO)
  atualizarValorPorPlano(
    @CurrentUser() user: any,
    @Body()
    body: {
      plan?: string;
      valor?: number | string;
      mes?: number;
      ano?: number;
    },
  ) {
    return this.financeiroService.atualizarValorPorPlanoAssinatura(user, body);
  }

  @Post('cobrancas/:id/mercado-pago/preferencia')
  criarPreferenciaMercadoPago(
    @CurrentUser() user: any,
    @Param('id') id: string,
  ) {
    return this.financeiroService.criarPreferenciaMercadoPago(user, id);
  }

  @Post('assinatura/cobrancas/:id/mercado-pago/preferencia')
  @Roles(UserRole.ADMIN_ESCOLA)
  criarPreferenciaMercadoPagoAssinatura(
    @CurrentUser() user: any,
    @Param('id') id: string,
  ) {
    return this.financeiroService.criarPreferenciaMercadoPagoAssinaturaAdmin(
      user,
      id,
    );
  }

  @Post('cobrancas/:id/mercado-pago/sincronizar')
  sincronizarMercadoPago(@CurrentUser() user: any, @Param('id') id: string) {
    return this.financeiroService.sincronizarMercadoPago(user, id);
  }

  @Post('cobrancas/:id/nota-fiscal/emitir')
  @Roles(
    UserRole.SUPERUSUARIO,
    UserRole.ADMIN_ESCOLA,
    UserRole.FINANCEIRO,
    UserRole.SECRETARIA,
    UserRole.GESTOR,
  )
  emitirNotaFiscal(@CurrentUser() user: any, @Param('id') id: string) {
    return this.financeiroService.emitirNotaFiscal(user, id);
  }

  @Post('cobrancas/:id/nota-fiscal/sincronizar')
  @Roles(
    UserRole.SUPERUSUARIO,
    UserRole.ADMIN_ESCOLA,
    UserRole.FINANCEIRO,
    UserRole.SECRETARIA,
    UserRole.GESTOR,
  )
  sincronizarNotaFiscal(@CurrentUser() user: any, @Param('id') id: string) {
    return this.financeiroService.sincronizarNotaFiscal(user, id);
  }

  @Post('cobrancas/:id/nota-fiscal/cancelar')
  @Roles(
    UserRole.SUPERUSUARIO,
    UserRole.ADMIN_ESCOLA,
    UserRole.FINANCEIRO,
    UserRole.SECRETARIA,
    UserRole.GESTOR,
  )
  cancelarNotaFiscal(@CurrentUser() user: any, @Param('id') id: string) {
    return this.financeiroService.cancelarNotaFiscal(user, id);
  }

  @Post('assinatura/cobrancas/:id/mercado-pago/sincronizar')
  @Roles(UserRole.ADMIN_ESCOLA)
  sincronizarMercadoPagoAssinatura(
    @CurrentUser() user: any,
    @Param('id') id: string,
  ) {
    return this.financeiroService.sincronizarMercadoPagoAssinaturaAdmin(
      user,
      id,
    );
  }

  @Patch('cobrancas/:id/cancelar-pagamento')
  @Roles(
    UserRole.SUPERUSUARIO,
    UserRole.ADMIN_ESCOLA,
    UserRole.FINANCEIRO,
    UserRole.SECRETARIA,
    UserRole.GESTOR,
  )
  cancelarPagamento(@CurrentUser() user: any, @Param('id') id: string) {
    return this.financeiroService.cancelarPagamento(user, id);
  }

  @Patch('cobrancas/:id/cancelar')
  @Roles(
    UserRole.SUPERUSUARIO,
    UserRole.ADMIN_ESCOLA,
    UserRole.FINANCEIRO,
    UserRole.SECRETARIA,
    UserRole.GESTOR,
  )
  cancelar(@CurrentUser() user: any, @Param('id') id: string) {
    return this.financeiroService.cancelar(user, id);
  }

  @Get('cobrancas/:id/boleto.pdf')
  async boletoPdf(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const pdf = await this.financeiroService.getBoletoPdf(user, id);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="boleto-${id}.pdf"`);
    res.send(pdf);
  }

  @Get('assinatura/cobrancas/:id/boleto.pdf')
  @Roles(UserRole.ADMIN_ESCOLA)
  async boletoPdfAssinatura(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const pdf = await this.financeiroService.getBoletoPdfAssinaturaAdmin(
      user,
      id,
    );

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="boleto-${id}.pdf"`);
    res.send(pdf);
  }
}

@Controller('financeiro/mercado-pago')
export class MercadoPagoWebhookController {
  constructor(private readonly financeiroService: FinanceiroService) {}

  @Get('retorno')
  retorno(
    @Query('status') status: string | undefined,
    @Query('context') context: string | undefined,
    @Res() res: Response,
  ) {
    const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:3000')
      .replace(/\/$/, '');
    const params = new URLSearchParams();
    const targetPath = context === 'assinatura' ? '/assinatura' : '/financeiro';

    if (status) {
      params.set('mp_status', status);
    }

    res.redirect(`${frontendUrl}${targetPath}?${params.toString()}`);
  }

  @Post('webhook')
  async webhook(
    @Body() body: any,
    @Query('id') id?: string,
    @Query('data.id') dataId?: string,
    @Query('type') type?: string,
  ) {
    await this.financeiroService.processarWebhookMercadoPago({
      paymentId: body?.data?.id || body?.id || dataId || id,
      type: body?.type || type,
    });

    return { received: true };
  }
}
