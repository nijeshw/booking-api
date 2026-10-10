import { Injectable } from '@nestjs/common';
import { TenantConnections } from '../database/tenant-connections';
import type {
  InboxDraft,
  InboxKind,
  InboxNoticeView,
  InboxStore,
} from './inbox.store';

function isKind(value: string): value is InboxKind {
  return value === 'booking' || value === 'cancel' || value === 'reschedule';
}

@Injectable()
export class PrismaInboxStore implements InboxStore {
  constructor(private readonly connections: TenantConnections) {}

  async recipientIds(databaseName: string): Promise<string[]> {
    const rows = await this.connections.get(databaseName).roleUser.findMany({
      select: { userId: true },
    });
    return rows.map((row) => row.userId);
  }

  async publish(databaseName: string, drafts: InboxDraft[]): Promise<void> {
    if (drafts.length === 0) {
      return;
    }
    await this.connections.get(databaseName).inboxNotice.createMany({
      data: drafts,
    });
  }

  async list(
    databaseName: string,
    userId: string,
    limit: number,
  ): Promise<InboxNoticeView[]> {
    const rows = await this.connections.get(databaseName).inboxNotice.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return rows.flatMap((row) => {
      if (!isKind(row.kind)) {
        return [];
      }
      return [
        {
          id: row.id,
          kind: row.kind,
          title: row.title,
          body: row.body,
          readAt: row.readAt,
          createdAt: row.createdAt,
        },
      ];
    });
  }

  async unreadCount(databaseName: string, userId: string): Promise<number> {
    return this.connections.get(databaseName).inboxNotice.count({
      where: { userId, readAt: null },
    });
  }

  async markRead(
    databaseName: string,
    userId: string,
    id: string,
    at: Date,
  ): Promise<void> {
    await this.connections.get(databaseName).inboxNotice.updateMany({
      where: { id, userId, readAt: null },
      data: { readAt: at },
    });
  }

  async markAllRead(
    databaseName: string,
    userId: string,
    at: Date,
  ): Promise<void> {
    await this.connections.get(databaseName).inboxNotice.updateMany({
      where: { userId, readAt: null },
      data: { readAt: at },
    });
  }
}
