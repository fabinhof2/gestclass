import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from './jwt-auth.guard';
import { CurrentUser } from './current-user.decorator';
import { InviteService } from './invite.service';
import { RateLimitService } from '../security/rate-limit.service';

function getRequestIp(request: Request) {
  const forwarded = request.headers['x-forwarded-for'];

  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }

  return request.ip || request.socket?.remoteAddress || 'unknown';
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly inviteService: InviteService,
    private readonly rateLimitService: RateLimitService,
  ) {}

  @Post('login')
  async login(
    @Req() request: Request,
    @Body()
    body: {
      email?: string;
      identifier?: string;
      password: string;
    },
  ) {
    const identifier = body.identifier || body.email || '';
    const windowMinutes = Number(
      process.env.AUTH_RATE_LIMIT_WINDOW_MINUTES || 15,
    );
    const blockMinutes = Number(
      process.env.AUTH_RATE_LIMIT_BLOCK_MINUTES || 15,
    );
    const maxAttempts = Number(process.env.AUTH_RATE_LIMIT_MAX_ATTEMPTS || 10);
    const key = `login:${getRequestIp(request)}:${String(identifier).trim().toLowerCase()}`;

    this.rateLimitService.checkOrThrow(key, {
      maxAttempts,
      windowMs: windowMinutes * 60 * 1000,
      blockMs: blockMinutes * 60 * 1000,
    });

    try {
      const response = await this.authService.login(identifier, body.password);
      this.rateLimitService.recordSuccess(key);
      return response;
    } catch (error) {
      this.rateLimitService.recordFailure(key, {
        maxAttempts,
        windowMs: windowMinutes * 60 * 1000,
        blockMs: blockMinutes * 60 * 1000,
      });
      throw error;
    }
  }

  @Post('register')
  async register(
    @Body()
    body: {
      name: string;
      email: string;
      username?: string;
      password: string;
      role: UserRole;
      schoolId?: string;
    },
  ) {
    return this.authService.register(body);
  }

  @UseGuards(JwtAuthGuard)
  @Post('register-by-admin')
  async registerByAdmin(
    @CurrentUser() user: any,
    @Body()
    body: {
      name: string;
      email: string;
      username?: string;
      password: string;
      role: UserRole;
      schoolId?: string;
    },
  ) {
    return this.authService.registerByAdmin(user, body);
  }

  @UseGuards(JwtAuthGuard)
  @Post('invite-user')
  async inviteUser(
    @CurrentUser() user: any,
    @Body()
    body: {
      name: string;
      email: string;
      username?: string;
      role: UserRole;
    },
  ) {
    return this.inviteService.inviteUser(user, body);
  }

  @Post('activate-account')
  async activateAccount(
    @Req() request: Request,
    @Body()
    body: {
      token: string;
      newPassword: string;
    },
  ) {
    this.rateLimitService.checkOrThrow(`activate:${getRequestIp(request)}`, {
      maxAttempts: 20,
      windowMs: 15 * 60 * 1000,
      blockMs: 15 * 60 * 1000,
    });

    return this.authService.activateAccount(body.token, body.newPassword);
  }

  @Patch('reset-password')
  async resetPassword(
    @Body()
    body: {
      userId: string;
      newPassword: string;
    },
  ) {
    return this.authService.resetPassword(body.userId, body.newPassword);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('reset-password-secure')
  async resetPasswordSecure(
    @CurrentUser() user: any,
    @Body()
    body: {
      userId: string;
      newPassword: string;
    },
  ) {
    return this.authService.resetPasswordSecure(
      user,
      body.userId,
      body.newPassword,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Patch('switch-school')
  async switchSchool(
    @CurrentUser() user: any,
    @Body()
    body: {
      schoolId: string;
    },
  ) {
    return this.authService.switchActiveSchool(
      {
        userId: user?.userId || user?.id || user?.sub,
        email: user?.email,
        role: user?.role,
        schoolId: user?.schoolId,
      },
      body.schoolId,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Post('superuser/enter-school')
  async enterSchoolAsAdmin(
    @CurrentUser() user: any,
    @Body()
    body: {
      schoolId: string;
    },
  ) {
    return this.authService.enterSchoolAsAdmin(
      {
        userId: user?.userId || user?.id || user?.sub,
        email: user?.email,
        role: user?.role,
      },
      body.schoolId,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async me(@CurrentUser() user: any) {
    return user;
  }
}
