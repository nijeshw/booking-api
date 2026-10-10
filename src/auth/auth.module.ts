import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MasterDatabaseModule } from '../master/database/database.module';
import type { Env } from '../config/env';
import { AuthGuard } from '../guard/auth.guard';
import { ApiMailer } from './mailer/api-mailer';
import { LogMailer } from './mailer/log-mailer';
import { ArgonHasher } from './password/argon-hasher';
import { PrismaAuthStore } from './store/prisma-auth.store';
import type { Mailer } from './store/auth.store';
import { AUTH_STORE, MAILER, PASSWORD_HASHER } from './auth.tokens';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

@Module({
  imports: [MasterDatabaseModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthGuard,
    { provide: AUTH_STORE, useExisting: PrismaAuthStore },
    PrismaAuthStore,
    { provide: PASSWORD_HASHER, useExisting: ArgonHasher },
    ArgonHasher,
    {
      provide: MAILER,
      useFactory: (config: ConfigService<Env, true>): Mailer => {
        const apiKey = config.get('EMAIL_API_KEY', { infer: true });
        const apiUrl = config.get('EMAIL_API_URL', { infer: true });
        const from = config.get('EMAIL_FROM', { infer: true });
        if (apiKey && apiUrl && from) {
          return new ApiMailer({ apiUrl, apiKey, from });
        }
        return new LogMailer(config);
      },
      inject: [ConfigService],
    },
  ],
  exports: [AuthGuard, AuthService, MAILER],
})
export class AuthModule {}
