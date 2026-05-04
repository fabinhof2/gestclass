import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

type RateLimitEntry = {
  attempts: number;
  resetAt: number;
  blockedUntil?: number;
};

@Injectable()
export class RateLimitService {
  private readonly entries = new Map<string, RateLimitEntry>();

  private createRateLimitException() {
    return new HttpException(
      'Muitas tentativas. Aguarde alguns minutos antes de tentar novamente.',
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  checkOrThrow(
    key: string,
    options?: { maxAttempts?: number; windowMs?: number; blockMs?: number },
  ) {
    const maxAttempts = options?.maxAttempts ?? 10;
    const windowMs = options?.windowMs ?? 15 * 60 * 1000;
    const blockMs = options?.blockMs ?? 15 * 60 * 1000;
    const now = Date.now();
    const current = this.entries.get(key);

    if (current?.blockedUntil && current.blockedUntil > now) {
      throw this.createRateLimitException();
    }

    if (!current || current.resetAt <= now) {
      this.entries.set(key, {
        attempts: 0,
        resetAt: now + windowMs,
      });
      return;
    }

    if (current.attempts >= maxAttempts) {
      current.blockedUntil = now + blockMs;
      this.entries.set(key, current);
      throw this.createRateLimitException();
    }
  }

  recordFailure(
    key: string,
    options?: { maxAttempts?: number; windowMs?: number; blockMs?: number },
  ) {
    const maxAttempts = options?.maxAttempts ?? 10;
    const windowMs = options?.windowMs ?? 15 * 60 * 1000;
    const blockMs = options?.blockMs ?? 15 * 60 * 1000;
    const now = Date.now();
    const current = this.entries.get(key);

    if (!current || current.resetAt <= now) {
      this.entries.set(key, {
        attempts: 1,
        resetAt: now + windowMs,
      });
      return;
    }

    current.attempts += 1;

    if (current.attempts >= maxAttempts) {
      current.blockedUntil = now + blockMs;
    }

    this.entries.set(key, current);
  }

  recordSuccess(key: string) {
    this.entries.delete(key);
  }
}
