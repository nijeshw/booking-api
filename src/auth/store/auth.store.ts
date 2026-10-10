export type UserRecord = {
  id: string;
  email: string;
  passwordHash: string | null;
  name: string | null;
  emailVerifiedAt: Date | null;
  platformRole: 'NONE' | 'ADMIN';
};

export type EmailTokenPurpose = 'VERIFY_EMAIL' | 'RESET_PASSWORD';

export type EmailTokenRecord = {
  id: string;
  userId: string;
  purpose: EmailTokenPurpose;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
};

export type SessionRecord = {
  id: string;
  userId: string;
  refreshTokenHash: string;
  familyId: string;
  expiresAt: Date;
  revokedAt: Date | null;
};

export type NewSession = {
  userId: string;
  refreshTokenHash: string;
  familyId: string;
  expiresAt: Date;
  userAgent: string | null;
  ip: string | null;
};

export interface AuthStore {
  findUserByEmail(email: string): Promise<UserRecord | null>;
  findUserById(id: string): Promise<UserRecord | null>;
  createUser(input: {
    email: string;
    passwordHash: string | null;
    name: string | null;
  }): Promise<UserRecord | 'exists'>;
  markEmailVerified(userId: string, at: Date): Promise<void>;
  updatePassword(userId: string, passwordHash: string): Promise<void>;
  updateUser(
    userId: string,
    input: { name: string; email: string },
  ): Promise<UserRecord | 'taken'>;
  revokeUserSessions(userId: string, at: Date): Promise<void>;
  createEmailToken(input: {
    userId: string;
    purpose: EmailTokenPurpose;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<void>;
  findEmailToken(tokenHash: string): Promise<EmailTokenRecord | null>;
  consumeEmailToken(id: string, at: Date): Promise<boolean>;
  createSession(input: NewSession): Promise<SessionRecord>;
  findSessionByHash(refreshTokenHash: string): Promise<SessionRecord | null>;
  revokeSession(id: string, at: Date): Promise<void>;
  revokeFamily(familyId: string, at: Date): Promise<void>;
  replaceSession(
    currentId: string,
    next: NewSession,
    at: Date,
  ): Promise<SessionRecord | null>;
}

export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(hash: string, password: string): Promise<boolean>;
}

export interface Mailer {
  send(message: { to: string; subject: string; text: string }): Promise<void>;
}

export type RequestMeta = {
  userAgent: string | null;
  ip: string | null;
};
