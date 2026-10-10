export type InboxKind = 'booking' | 'cancel' | 'reschedule';

export type InboxDraft = {
  userId: string;
  kind: InboxKind;
  title: string;
  body: string;
};

export type InboxNoticeView = {
  id: string;
  kind: InboxKind;
  title: string;
  body: string;
  readAt: Date | null;
  createdAt: Date;
};

export interface InboxStore {
  recipientIds(databaseName: string): Promise<string[]>;
  publish(databaseName: string, drafts: InboxDraft[]): Promise<void>;
  list(
    databaseName: string,
    userId: string,
    limit: number,
  ): Promise<InboxNoticeView[]>;
  unreadCount(databaseName: string, userId: string): Promise<number>;
  markRead(
    databaseName: string,
    userId: string,
    id: string,
    at: Date,
  ): Promise<void>;
  markAllRead(databaseName: string, userId: string, at: Date): Promise<void>;
}

export const INBOX_STORE = Symbol('INBOX_STORE');
