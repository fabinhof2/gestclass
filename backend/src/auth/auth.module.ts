import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { UsersModule } from '../users/users.module';
import { InviteService } from './invite.service';
import { PrismaModule } from '../prisma/prisma.module';
import { SchoolsModule } from '../schools/schools.module';
import { MailModule } from '../mail/mail.module';
import { RateLimitService } from '../security/rate-limit.service';

const JWT_SECRET =
  process.env.JWT_SECRET || 'gestclass_jwt_secret_2026_dev_only';

@Module({
  imports: [
    UsersModule,
    PrismaModule,
    SchoolsModule,
    MailModule,
    PassportModule,
    JwtModule.register({
      secret: JWT_SECRET,
      signOptions: { expiresIn: '1d' },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, InviteService, RateLimitService],
  exports: [AuthService],
})
export class AuthModule {}
