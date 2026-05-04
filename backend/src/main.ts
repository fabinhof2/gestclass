import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { json, urlencoded } from 'express';
import type { NextFunction, Request, Response } from 'express';
import { AppModule } from './app.module';

const logger = new Logger('Bootstrap');
const DEFAULT_DEV_JWT_SECRET = 'gestclass_jwt_secret_2026_dev_only';
const PRIVATE_UPLOAD_PREFIXES = [
  '/uploads/alunos/documentos/',
  '/uploads/responsaveis/documentos/',
  '/uploads/solicitacoes/',
];

function getAllowedOrigins() {
  const configuredOrigins = process.env.CORS_ORIGIN
    ?.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (configuredOrigins && configuredOrigins.length > 0) {
    return configuredOrigins;
  }

  return ['http://localhost:3000'];
}

function assertProductionSecurity() {
  if (process.env.NODE_ENV !== 'production') {
    return;
  }

  if (
    !process.env.JWT_SECRET ||
    process.env.JWT_SECRET === DEFAULT_DEV_JWT_SECRET
  ) {
    throw new Error(
      'Defina JWT_SECRET com um valor forte antes de subir em producao.',
    );
  }

  if (!process.env.CORS_ORIGIN?.trim()) {
    throw new Error('Defina CORS_ORIGIN antes de subir em producao.');
  }
}

async function bootstrap() {
  assertProductionSecurity();

  const app = await NestFactory.create(AppModule);
  const port = Number(process.env.PORT || 3001);
  const allowedOrigins = getAllowedOrigins();
  const bodySizeLimit = process.env.BODY_SIZE_LIMIT || '2mb';
  const expressApp = app.getHttpAdapter().getInstance();

  expressApp.disable('x-powered-by');
  expressApp.set('trust proxy', 1);

  app.use(json({ limit: bodySizeLimit }));
  app.use(urlencoded({ extended: true, limit: bodySizeLimit }));
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-DNS-Prefetch-Control', 'off');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader(
      'Permissions-Policy',
      'camera=(), microphone=(), geolocation=(), interest-cohort=()',
    );

    if (!req.path.startsWith('/uploads/')) {
      res.setHeader(
        'Content-Security-Policy',
        "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
      );
      res.setHeader('Cache-Control', 'no-store');
    }

    next();
  });
  app.use((req: Request, res: Response, next: NextFunction) => {
    const normalizedPath = `${req.path || ''}/`;
    const isPrivateUpload = PRIVATE_UPLOAD_PREFIXES.some((prefix) =>
      normalizedPath.startsWith(prefix),
    );

    if (isPrivateUpload) {
      res.status(403).json({
        message: 'Acesso publico bloqueado para este arquivo.',
      });
      return;
    }

    next();
  });

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
  });

  try {
    await app.listen(port);
    logger.log(`Backend disponivel em http://localhost:${port}`);
    logger.log(`CORS liberado para: ${allowedOrigins.join(', ')}`);
    logger.log(`Limite de corpo configurado para: ${bodySizeLimit}`);
  } catch (error: any) {
    if (error?.code === 'EADDRINUSE') {
      logger.error(
        `A porta ${port} ja esta em uso. Provavelmente ja existe outra instancia do backend em execucao.`,
      );
      await app.close();
      return;
    }

    throw error;
  }
}

void bootstrap();
