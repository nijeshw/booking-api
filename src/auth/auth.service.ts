import {
  ConflictException,
  Inject,
  Injectable,
  Optional,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import type { Env } from '../config/env';
import type {
  AuthStore,
  Mailer,
  PasswordHasher,
  RequestMeta,
  UserRecord,
} from './store/auth.store';
import { CLOCK } from '../common/clock';
import { plusMs, unixSeconds, utcNow } from '../common/time';
import { AUTH_STORE, MAILER, PASSWORD_HASHER } from './auth.tokens';
import type { LoginInput, RegisterInput } from './auth.schema';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  REFRESH_TOKEN_TTL_MS,
  RESET_PASSWORD_TTL_MS,
  VERIFY_EMAIL_TTL_MS,
  hashToken,
  randomToken,
  signAccessToken,
} from './token/token';

export type PublicUser = {
  id: string;
  email: string;
  name: string | null;
  emailVerified: boolean;
  platformRole: 'NONE' | 'ADMIN';
};

export type AuthSession = {
  accessToken: string;
  refreshToken: string;
  user: PublicUser;
};

@Injectable()
export class AuthService {
  private dummyHash: Promise<string> | null = null;
  private readonly now: () => Date;

  constructor(
    @Inject(AUTH_STORE) private readonly store: AuthStore,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    @Inject(MAILER) private readonly mailer: Mailer,
    private readonly config: ConfigService<Env, true>,
    @Optional() @Inject(CLOCK) now?: () => Date,
  ) {
    this.now = now ?? utcNow;
  }

  async register(input: RegisterInput): Promise<{ status: 'check-email' }> {
    const email = input.email.toLowerCase();
    const passwordHash = await this.hasher.hash(input.password);
    const created = await this.store.createUser({
      email,
      passwordHash,
      name: input.name ?? null,
    });
    if (created !== 'exists') {
      await this.sendVerification(created);
    }
    return { status: 'check-email' };
  }

  async resendVerification(email: string): Promise<{ status: 'check-email' }> {
    const user = await this.store.findUserByEmail(email.toLowerCase());
    if (user && user.emailVerifiedAt === null) {
      await this.sendVerification(user);
    }
    return { status: 'check-email' };
  }

  async verifyEmail(token: string): Promise<{ status: 'verified' }> {
    const record = await this.usableToken(token, 'VERIFY_EMAIL');
    const consumed = await this.store.consumeEmailToken(record.id, this.now());
    if (!consumed) {
      throw new UnauthorizedException('This link is invalid or has expired');
    }
    await this.store.markEmailVerified(record.userId, this.now());
    return { status: 'verified' };
  }

  async login(input: LoginInput, meta: RequestMeta): Promise<AuthSession> {
    const user = await this.store.findUserByEmail(input.email.toLowerCase());
    const hash = user?.passwordHash ?? (await this.placeholderHash());
    const matches = await this.hasher.verify(hash, input.password);
    if (!user || !user.passwordHash || !matches) {
      throw new UnauthorizedException('Invalid email or password');
    }
    return this.startSession(user, meta);
  }

  async refresh(refreshToken: string, meta: RequestMeta): Promise<AuthSession> {
    const current = await this.store.findSessionByHash(hashToken(refreshToken));
    if (!current) {
      throw new UnauthorizedException('Sign in again');
    }
    const at = this.now();
    if (current.revokedAt) {
      await this.store.revokeFamily(current.familyId, at);
      throw new UnauthorizedException('Sign in again');
    }
    if (current.expiresAt <= at) {
      throw new UnauthorizedException('Sign in again');
    }
    const user = await this.store.findUserById(current.userId);
    if (!user) {
      throw new UnauthorizedException('Sign in again');
    }
    const next = this.newSession(user.id, current.familyId, meta);
    const replaced = await this.store.replaceSession(
      current.id,
      next.record,
      at,
    );
    if (!replaced) {
      await this.store.revokeFamily(current.familyId, at);
      throw new UnauthorizedException('Sign in again');
    }
    return {
      accessToken: this.accessToken(user.id),
      refreshToken: next.raw,
      user: this.publicUser(user),
    };
  }

  async logout(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) {
      return;
    }
    const current = await this.store.findSessionByHash(hashToken(refreshToken));
    if (current && current.revokedAt === null) {
      await this.store.revokeSession(current.id, this.now());
    }
  }

  async forgotPassword(email: string): Promise<{ status: 'check-email' }> {
    const user = await this.store.findUserByEmail(email.toLowerCase());
    if (user) {
      await this.sendPasswordLink(user, 'Reset your Appointiva password');
    }
    return { status: 'check-email' };
  }

  async inviteToBusiness(
    email: string,
    businessName: string,
    name?: string | null,
  ): Promise<UserRecord> {
    const normalized = email.toLowerCase();
    const displayName = name?.trim() ? name.trim() : null;
    let user = await this.store.findUserByEmail(normalized);
    if (!user) {
      const created = await this.store.createUser({
        email: normalized,
        passwordHash: null,
        name: displayName,
      });
      user =
        created === 'exists'
          ? await this.store.findUserByEmail(normalized)
          : created;
    }
    if (!user) {
      throw new ServiceUnavailableException('Could not create the account');
    }
    if (displayName && user.name !== displayName) {
      const renamed = await this.store.updateUser(user.id, {
        name: displayName,
        email: user.email,
      });
      if (renamed !== 'taken') {
        user = renamed;
      }
    }
    if (!user.passwordHash) {
      await this.sendPasswordLink(
        user,
        `Set your Appointiva password for ${businessName}`,
      );
    }
    return user;
  }

  async updateProfile(
    userId: string,
    input: { name: string; email: string },
  ): Promise<UserRecord> {
    const updated = await this.store.updateUser(userId, {
      name: input.name,
      email: input.email.toLowerCase(),
    });
    if (updated === 'taken') {
      throw new ConflictException('That email is already in use');
    }
    return updated;
  }

  async resetPassword(
    token: string,
    password: string,
  ): Promise<{ status: 'reset' }> {
    const record = await this.usableToken(token, 'RESET_PASSWORD');
    const consumed = await this.store.consumeEmailToken(record.id, this.now());
    if (!consumed) {
      throw new UnauthorizedException('This link is invalid or has expired');
    }
    await this.store.updatePassword(
      record.userId,
      await this.hasher.hash(password),
    );
    await this.store.revokeUserSessions(record.userId, this.now());
    return { status: 'reset' };
  }

  async updateName(userId: string, name: string): Promise<PublicUser> {
    const current = await this.store.findUserById(userId);
    if (!current) {
      throw new UnauthorizedException('Sign in again');
    }
    const updated = await this.store.updateUser(userId, {
      name,
      email: current.email,
    });
    if (updated === 'taken') {
      throw new ConflictException('That email is already in use');
    }
    return this.publicUser(updated);
  }

  async me(userId: string): Promise<PublicUser> {
    const user = await this.store.findUserById(userId);
    if (!user) {
      throw new UnauthorizedException('Sign in again');
    }
    return this.publicUser(user);
  }

  private async startSession(
    user: UserRecord,
    meta: RequestMeta,
  ): Promise<AuthSession> {
    const next = this.newSession(user.id, randomUUID(), meta);
    await this.store.createSession(next.record);
    return {
      accessToken: this.accessToken(user.id),
      refreshToken: next.raw,
      user: this.publicUser(user),
    };
  }

  private newSession(userId: string, familyId: string, meta: RequestMeta) {
    const raw = randomToken();
    return {
      raw,
      record: {
        userId,
        refreshTokenHash: hashToken(raw),
        familyId,
        expiresAt: plusMs(this.now(), REFRESH_TOKEN_TTL_MS),
        userAgent: meta.userAgent,
        ip: meta.ip,
      },
    };
  }

  private accessToken(userId: string): string {
    const issuedAt = unixSeconds(this.now());
    return signAccessToken({
      userId,
      secret: this.config.getOrThrow('AUTH_SECRET'),
      issuedAt,
      ttlSeconds: ACCESS_TOKEN_TTL_SECONDS,
    });
  }

  private async usableToken(
    token: string,
    purpose: 'VERIFY_EMAIL' | 'RESET_PASSWORD',
  ) {
    const record = await this.store.findEmailToken(hashToken(token));
    if (
      !record ||
      record.purpose !== purpose ||
      record.usedAt ||
      record.expiresAt <= this.now()
    ) {
      throw new UnauthorizedException('This link is invalid or has expired');
    }
    return record;
  }

  private async sendPasswordLink(
    user: UserRecord,
    subject: string,
  ): Promise<void> {
    const token = randomToken();
    await this.store.createEmailToken({
      userId: user.id,
      purpose: 'RESET_PASSWORD',
      tokenHash: hashToken(token),
      expiresAt: plusMs(this.now(), RESET_PASSWORD_TTL_MS),
    });
    await this.send(user.email, subject, token, 'reset-password');
  }

  private async sendVerification(user: UserRecord): Promise<void> {
    const token = randomToken();
    await this.store.createEmailToken({
      userId: user.id,
      purpose: 'VERIFY_EMAIL',
      tokenHash: hashToken(token),
      expiresAt: plusMs(this.now(), VERIFY_EMAIL_TTL_MS),
    });
    await this.send(
      user.email,
      'Verify your Appointiva email',
      token,
      'verify-email',
    );
  }

  private async send(
    to: string,
    subject: string,
    token: string,
    path: 'verify-email' | 'reset-password',
  ): Promise<void> {
    const origin = this.config.getOrThrow('WEB_ORIGIN', { infer: true });
    try {
      await this.mailer.send({
        to,
        subject,
        text: `${origin}/${path}?token=${token}`,
      });
    } catch {
      throw new ServiceUnavailableException('Could not send email');
    }
  }

  private placeholderHash(): Promise<string> {
    this.dummyHash ??= this.hasher.hash('not-a-real-password');
    return this.dummyHash;
  }

  async isAdmin(userId: string): Promise<boolean> {
    const user = await this.store.findUserById(userId);
    return user?.platformRole === 'ADMIN';
  }

  private publicUser(user: UserRecord): PublicUser {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      emailVerified: user.emailVerifiedAt !== null,
      platformRole: user.platformRole,
    };
  }
}
