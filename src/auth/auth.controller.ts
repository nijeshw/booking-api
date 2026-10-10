import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { parseBody } from '../common/parse-body';
import type { Env } from '../config/env';
import { REFRESH_COOKIE, refreshCookieOptions } from './auth.cookies';
import {
  emailOnlySchema,
  loginSchema,
  profileSchema,
  registerSchema,
  resetPasswordSchema,
  tokenSchema,
} from './auth.schema';
import { AuthGuard } from '../guard/auth.guard';
import { AuthService, type PublicUser } from './auth.service';
import { CurrentUser } from '../decorator/current-user.decorator';

const authThrottle = { default: { limit: 10, ttl: 60_000 } };

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Post('register')
  @Throttle(authThrottle)
  register(@Body() body: unknown) {
    return this.auth.register(parseBody(registerSchema, body));
  }

  @Post('resend-verification')
  @Throttle(authThrottle)
  resend(@Body() body: unknown) {
    return this.auth.resendVerification(parseBody(emailOnlySchema, body).email);
  }

  @Post('verify-email')
  @Throttle(authThrottle)
  verify(@Body() body: unknown) {
    return this.auth.verifyEmail(parseBody(tokenSchema, body).token);
  }

  @Post('login')
  @Throttle(authThrottle)
  async login(
    @Body() body: unknown,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const session = await this.auth.login(
      parseBody(loginSchema, body),
      meta(request),
    );
    this.setRefreshCookie(response, session.refreshToken);
    return { accessToken: session.accessToken, user: session.user };
  }

  @Post('refresh')
  @Throttle(authThrottle)
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const current = cookieValue(request, REFRESH_COOKIE);
    if (!current) {
      throw new UnauthorizedException('Sign in again');
    }
    const session = await this.auth.refresh(current, meta(request));
    this.setRefreshCookie(response, session.refreshToken);
    return { accessToken: session.accessToken, user: session.user };
  }

  @Post('logout')
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const current = cookieValue(request, REFRESH_COOKIE);
    await this.auth.logout(current);
    response.clearCookie(REFRESH_COOKIE, refreshCookieOptions(this.nodeEnv()));
    return { status: 'signed-out' };
  }

  @Post('forgot-password')
  @Throttle(authThrottle)
  forgot(@Body() body: unknown) {
    return this.auth.forgotPassword(parseBody(emailOnlySchema, body).email);
  }

  @Post('reset-password')
  @Throttle(authThrottle)
  reset(@Body() body: unknown) {
    const input = parseBody(resetPasswordSchema, body);
    return this.auth.resetPassword(input.token, input.password);
  }

  @Get('me')
  @UseGuards(AuthGuard)
  me(@CurrentUser() user: { id: string }) {
    return this.auth.me(user.id);
  }

  @Patch('me')
  @UseGuards(AuthGuard)
  updateMe(
    @CurrentUser() user: { id: string },
    @Body() body: unknown,
  ): Promise<PublicUser> {
    return this.auth.updateName(user.id, parseBody(profileSchema, body).name);
  }

  private setRefreshCookie(response: Response, token: string): void {
    response.cookie(
      REFRESH_COOKIE,
      token,
      refreshCookieOptions(this.nodeEnv()),
    );
  }

  private nodeEnv(): string {
    return this.config.get('NODE_ENV', { infer: true });
  }
}

function cookieValue(request: Request, name: string): string | undefined {
  const jar = request as { cookies?: unknown };
  if (typeof jar.cookies !== 'object' || jar.cookies === null) {
    return undefined;
  }
  const value = (jar.cookies as Record<string, unknown>)[name];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function meta(request: Request) {
  const userAgent = request.header('user-agent');
  return {
    userAgent: userAgent ? userAgent.slice(0, 200) : null,
    ip: request.ip ?? null,
  };
}
