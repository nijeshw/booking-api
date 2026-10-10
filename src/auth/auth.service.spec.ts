import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DateTime } from 'luxon';
import type { Env } from '../config/env';
import { AuthService } from './auth.service';
import type {
  AuthStore,
  EmailTokenRecord,
  Mailer,
  NewSession,
  PasswordHasher,
  SessionRecord,
  UserRecord,
} from './store/auth.store';
import { hashToken, readAccessToken } from './token/token';

const SECRET = 'test-only-auth-secret-32chars-min';
const NOW = DateTime.fromISO('2026-09-28T12:00:00.000Z', {
  zone: 'utc',
}).toJSDate();

class MemoryAuthStore implements AuthStore {
  users: UserRecord[] = [];
  tokens: EmailTokenRecord[] = [];
  sessions: SessionRecord[] = [];

  findUserByEmail(email: string) {
    return Promise.resolve(
      this.users.find((user) => user.email === email) ?? null,
    );
  }

  findUserById(id: string) {
    return Promise.resolve(this.users.find((user) => user.id === id) ?? null);
  }

  createUser(input: {
    email: string;
    passwordHash: string | null;
    name: string | null;
  }) {
    if (this.users.some((user) => user.email === input.email)) {
      return Promise.resolve('exists' as const);
    }
    const user: UserRecord = {
      id: `user-${this.users.length + 1}`,
      email: input.email,
      passwordHash: input.passwordHash,
      name: input.name,
      emailVerifiedAt: null,
      platformRole: 'NONE',
    };
    this.users.push(user);
    return Promise.resolve(user);
  }

  markEmailVerified(userId: string, at: Date) {
    const user = this.users.find((item) => item.id === userId);
    if (user) {
      user.emailVerifiedAt = at;
    }
    return Promise.resolve();
  }

  updatePassword(userId: string, passwordHash: string) {
    const user = this.users.find((item) => item.id === userId);
    if (user) {
      user.passwordHash = passwordHash;
    }
    return Promise.resolve();
  }

  updateUser(userId: string, input: { name: string; email: string }) {
    const user = this.users.find((item) => item.id === userId);
    if (!user) {
      return Promise.resolve('taken' as const);
    }
    if (
      this.users.some(
        (item) => item.email === input.email && item.id !== userId,
      )
    ) {
      return Promise.resolve('taken' as const);
    }
    user.name = input.name;
    user.email = input.email;
    return Promise.resolve(user);
  }

  revokeUserSessions(userId: string, at: Date) {
    for (const session of this.sessions) {
      if (session.userId === userId && session.revokedAt === null) {
        session.revokedAt = at;
      }
    }
    return Promise.resolve();
  }

  createEmailToken(input: {
    userId: string;
    purpose: EmailTokenRecord['purpose'];
    tokenHash: string;
    expiresAt: Date;
  }) {
    this.tokens.push({
      id: `token-${this.tokens.length + 1}`,
      usedAt: null,
      ...input,
    });
    return Promise.resolve();
  }

  findEmailToken(tokenHash: string) {
    return Promise.resolve(
      this.tokens.find((token) => token.tokenHash === tokenHash) ?? null,
    );
  }

  consumeEmailToken(id: string, at: Date) {
    const token = this.tokens.find(
      (item) => item.id === id && item.usedAt === null,
    );
    if (!token) {
      return Promise.resolve(false);
    }
    token.usedAt = at;
    return Promise.resolve(true);
  }

  createSession(input: NewSession) {
    const session: SessionRecord = {
      id: `session-${this.sessions.length + 1}`,
      revokedAt: null,
      ...input,
    };
    this.sessions.push(session);
    return Promise.resolve(session);
  }

  findSessionByHash(refreshTokenHash: string) {
    return Promise.resolve(
      this.sessions.find(
        (session) => session.refreshTokenHash === refreshTokenHash,
      ) ?? null,
    );
  }

  revokeSession(id: string, at: Date) {
    const session = this.sessions.find((item) => item.id === id);
    if (session) {
      session.revokedAt = at;
    }
    return Promise.resolve();
  }

  revokeFamily(familyId: string, at: Date) {
    for (const session of this.sessions) {
      if (session.familyId === familyId && session.revokedAt === null) {
        session.revokedAt = at;
      }
    }
    return Promise.resolve();
  }

  replaceSession(currentId: string, next: NewSession, at: Date) {
    const current = this.sessions.find((session) => session.id === currentId);
    if (!current || current.revokedAt) {
      return Promise.resolve(null);
    }
    current.revokedAt = at;
    return this.createSession(next);
  }
}

const hasher: PasswordHasher = {
  hash: (password) => Promise.resolve(`hash:${password}`),
  verify: (hash, password) => Promise.resolve(hash === `hash:${password}`),
};

function service() {
  const store = new MemoryAuthStore();
  const sent: { to: string; subject: string; text: string }[] = [];
  const mailer: Mailer = {
    send: (message) => {
      sent.push(message);
      return Promise.resolve();
    },
  };
  const config = {
    getOrThrow: (key: keyof Env) => {
      if (key === 'AUTH_SECRET') {
        return SECRET;
      }
      if (key === 'WEB_ORIGIN') {
        return 'http://localhost:5173';
      }
      throw new Error(`unexpected ${key}`);
    },
  } as ConfigService<Env, true>;
  return {
    store,
    sent,
    auth: new AuthService(store, hasher, mailer, config, () => NOW),
  };
}

function tokenFrom(link: string): string {
  const url = new URL(link);
  const token = url.searchParams.get('token');
  if (!token) {
    throw new Error('missing token');
  }
  return token;
}

describe('AuthService', () => {
  it('registers a user and emails a verification link without returning the token', async () => {
    const { auth, store, sent } = service();
    const result = await auth.register({
      email: 'Owner@Example.com',
      password: 'long-enough-password',
      name: 'Ada',
    });
    expect(result).toEqual({ status: 'check-email' });
    expect(store.users[0]).toMatchObject({
      email: 'owner@example.com',
      passwordHash: 'hash:long-enough-password',
      emailVerifiedAt: null,
    });
    expect(sent).toHaveLength(1);
    expect(
      sent[0]?.text.startsWith('http://localhost:5173/verify-email?token='),
    ).toBe(true);
    expect(JSON.stringify(result)).not.toContain('token=');
  });

  it('does not reveal that an email is already registered', async () => {
    const { auth, sent } = service();
    await auth.register({
      email: 'owner@example.com',
      password: 'long-enough-password',
    });
    const second = await auth.register({
      email: 'owner@example.com',
      password: 'another-long-password',
    });
    expect(second).toEqual({ status: 'check-email' });
    expect(sent).toHaveLength(1);
  });

  it('rejects login with the same error for an unknown email and a bad password', async () => {
    const { auth } = service();
    await auth.register({
      email: 'owner@example.com',
      password: 'long-enough-password',
    });
    await expect(
      auth.login(
        { email: 'owner@example.com', password: 'wrong-password-value' },
        { userAgent: null, ip: null },
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(
      auth.login(
        { email: 'missing@example.com', password: 'long-enough-password' },
        { userAgent: null, ip: null },
      ),
    ).rejects.toThrow('Invalid email or password');
  });

  it('verifies email, then signs in and rotates the refresh token', async () => {
    const { auth, sent, store } = service();
    await auth.register({
      email: 'owner@example.com',
      password: 'long-enough-password',
    });
    await auth.verifyEmail(tokenFrom(sent[0].text));
    const session = await auth.login(
      { email: 'owner@example.com', password: 'long-enough-password' },
      { userAgent: 'test', ip: '127.0.0.1' },
    );
    expect(session.user.emailVerified).toBe(true);
    expect(
      readAccessToken(
        session.accessToken,
        SECRET,
        DateTime.fromJSDate(NOW, { zone: 'utc' }).toSeconds(),
      ),
    ).toEqual({ userId: 'user-1' });

    const rotated = await auth.refresh(session.refreshToken, {
      userAgent: 'test',
      ip: '127.0.0.1',
    });
    expect(rotated.refreshToken).not.toBe(session.refreshToken);
    expect(store.sessions[0]?.revokedAt).toEqual(NOW);

    await expect(
      auth.refresh(session.refreshToken, { userAgent: null, ip: null }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(store.sessions.every((item) => item.revokedAt)).toBe(true);
  });

  it('resets a password once and revokes existing sessions', async () => {
    const { auth, sent, store } = service();
    await auth.register({
      email: 'owner@example.com',
      password: 'long-enough-password',
    });
    const session = await auth.login(
      { email: 'owner@example.com', password: 'long-enough-password' },
      { userAgent: null, ip: null },
    );
    await auth.forgotPassword('owner@example.com');
    const resetLink = sent.find((message) =>
      message.text.includes('reset-password'),
    );
    await auth.resetPassword(
      tokenFrom(resetLink!.text),
      'a-brand-new-password',
    );
    expect(store.users[0]?.passwordHash).toBe('hash:a-brand-new-password');
    expect(store.sessions[0]?.revokedAt).toEqual(NOW);
    await expect(
      auth.refresh(session.refreshToken, { userAgent: null, ip: null }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(
      auth.resetPassword(tokenFrom(resetLink!.text), 'yet-another-password'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('creates an account and emails a password link for a new person', async () => {
    const { auth, sent, store } = service();
    const user = await auth.inviteToBusiness(
      'New.Person@example.com',
      'Ada Studio',
    );
    expect(user.email).toBe('new.person@example.com');
    expect(user.passwordHash).toBeNull();
    expect(store.users).toHaveLength(1);
    expect(sent[0]?.subject).toBe('Set your Nexora password for Ada Studio');
    expect(sent[0]?.text).toContain('/reset-password?token=');
    const again = await auth.inviteToBusiness(
      'new.person@example.com',
      'Ada Studio',
    );
    expect(again.id).toBe(user.id);
    expect(sent).toHaveLength(2);
  });

  it('answers forgotten-password the same way when the email is unknown', async () => {
    const { auth, sent } = service();
    await expect(auth.forgotPassword('missing@example.com')).resolves.toEqual({
      status: 'check-email',
    });
    expect(sent).toHaveLength(0);
  });

  it('stores only a hash of the email token', async () => {
    const { auth, store, sent } = service();
    await auth.register({
      email: 'owner@example.com',
      password: 'long-enough-password',
    });
    const raw = tokenFrom(sent[0].text);
    expect(store.tokens[0]?.tokenHash).toBe(hashToken(raw));
    expect(store.tokens[0]?.tokenHash).not.toContain(raw);
  });
});
