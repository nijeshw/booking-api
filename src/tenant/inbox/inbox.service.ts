import { Inject, Injectable } from '@nestjs/common';
import { utcNow } from '../../common/time';
import type { TenantAccess } from '../../master/tenancy/tenant.types';
import type { InboxNoticeView, InboxStore } from './inbox.store';
import { INBOX_STORE } from './inbox.store';

export type InboxItem = {
  id: string;
  kind: InboxNoticeView['kind'];
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
};

export type InboxResponse = {
  unread: number;
  items: InboxItem[];
};

@Injectable()
export class InboxService {
  constructor(@Inject(INBOX_STORE) private readonly inbox: InboxStore) {}

  async list(access: TenantAccess, limit = 30): Promise<InboxResponse> {
    const databaseName = access.tenant.databaseName;
    const [rows, unread] = await Promise.all([
      this.inbox.list(databaseName, access.userId, limit),
      this.inbox.unreadCount(databaseName, access.userId),
    ]);
    return { unread, items: rows.map((row) => this.toItem(row)) };
  }

  async markRead(access: TenantAccess, id: string): Promise<InboxResponse> {
    await this.inbox.markRead(
      access.tenant.databaseName,
      access.userId,
      id,
      utcNow(),
    );
    return this.list(access);
  }

  async markAllRead(access: TenantAccess): Promise<InboxResponse> {
    await this.inbox.markAllRead(
      access.tenant.databaseName,
      access.userId,
      utcNow(),
    );
    return this.list(access);
  }

  private toItem(row: InboxNoticeView): InboxItem {
    return {
      id: row.id,
      kind: row.kind,
      title: row.title,
      body: row.body,
      read: row.readAt !== null,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
