import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

import { readAccessToken } from '../auth/token/token';
import { unixSecondsNow } from '../common/time';
import type { Env } from '../config/env';

export type AuthRequest = Request & { user?: { id: string } };

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly config: ConfigService<Env, true>) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthRequest>();
    const header = request.header('authorization');
    const token = header?.startsWith('Bearer ') ? header.slice(7) : '';
    const user = readAccessToken(
      token,
      this.config.getOrThrow('AUTH_SECRET'),
      unixSecondsNow(),
    );
    if (!user) {
      throw new UnauthorizedException('Sign in again');
    }
    request.user = { id: user.userId };
    return true;
  }
}
