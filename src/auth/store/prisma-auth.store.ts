import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/master';
import { MasterPrismaService } from '../../master/database/master-prisma.service';
import type {
  AuthStore,
  EmailTokenRecord,
  NewSession,
  SessionRecord,
  UserRecord,
} from './auth.store';

const userSelect = {
  id: true,
  email: true,
  passwordHash: true,
  name: true,
  emailVerifiedAt: true,
  platformRole: true,
} as const;

@Injectable()
export class PrismaAuthStore implements AuthStore {
  constructor(private readonly prisma: MasterPrismaService) {}

  findUserByEmail(email: string): Promise<UserRecord | null> {
    return this.prisma.user.findUnique({
      where: { email },
      select: userSelect,
    });
  }

  findUserById(id: string): Promise<UserRecord | null> {
    return this.prisma.user.findUnique({ where: { id }, select: userSelect });
  }

  async createUser(input: {
    email: string;
    passwordHash: string | null;
    name: string | null;
  }): Promise<UserRecord | 'exists'> {
    try {
      return await this.prisma.user.create({ data: input, select: userSelect });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return 'exists';
      }
      throw error;
    }
  }

  async markEmailVerified(userId: string, at: Date): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { emailVerifiedAt: at },
    });
  }

  async updatePassword(userId: string, passwordHash: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });
  }

  async updateUser(
    userId: string,
    input: { name: string; email: string },
  ): Promise<UserRecord | 'taken'> {
    try {
      return await this.prisma.user.update({
        where: { id: userId },
        data: { name: input.name, email: input.email },
        select: userSelect,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return 'taken';
      }
      throw error;
    }
  }

  async revokeUserSessions(userId: string, at: Date): Promise<void> {
    await this.prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: at },
    });
  }

  async createEmailToken(input: {
    userId: string;
    purpose: EmailTokenRecord['purpose'];
    tokenHash: string;
    expiresAt: Date;
  }): Promise<void> {
    await this.prisma.emailToken.create({ data: input });
  }

  findEmailToken(tokenHash: string): Promise<EmailTokenRecord | null> {
    return this.prisma.emailToken.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        userId: true,
        purpose: true,
        tokenHash: true,
        expiresAt: true,
        usedAt: true,
      },
    });
  }

  async consumeEmailToken(id: string, at: Date): Promise<boolean> {
    const result = await this.prisma.emailToken.updateMany({
      where: { id, usedAt: null },
      data: { usedAt: at },
    });
    return result.count === 1;
  }

  createSession(input: NewSession): Promise<SessionRecord> {
    return this.prisma.session.create({
      data: input,
      select: sessionSelect,
    });
  }

  findSessionByHash(refreshTokenHash: string): Promise<SessionRecord | null> {
    return this.prisma.session.findUnique({
      where: { refreshTokenHash },
      select: sessionSelect,
    });
  }

  async revokeSession(id: string, at: Date): Promise<void> {
    await this.prisma.session.update({
      where: { id },
      data: { revokedAt: at },
    });
  }

  async revokeFamily(familyId: string, at: Date): Promise<void> {
    await this.prisma.session.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: at },
    });
  }

  async replaceSession(
    currentId: string,
    next: NewSession,
    at: Date,
  ): Promise<SessionRecord | null> {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.session.updateMany({
        where: { id: currentId, revokedAt: null },
        data: { revokedAt: at },
      });
      if (current.count !== 1) {
        return null;
      }
      return tx.session.create({ data: next, select: sessionSelect });
    });
  }
}

const sessionSelect = {
  id: true,
  userId: true,
  refreshTokenHash: true,
  familyId: true,
  expiresAt: true,
  revokedAt: true,
} as const;
