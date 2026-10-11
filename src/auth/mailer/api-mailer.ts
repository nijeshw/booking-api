import type { Mailer } from '../store/auth.store';

export type MailSettings = {
  apiUrl: string;
  apiKey: string;
  from: string;
};

type MailSendRequest = {
  to: string[];
  cc: null;
  bcc: null;
  from: string;
  sender: null;
  subject: string;
  tag: string;
  reply_to: string;
  plain_body: string;
  html_body: string;
  attachments: null;
};

export function mailRequest(
  settings: MailSettings,
  message: { to: string; subject: string; text: string },
): MailSendRequest {
  return {
    to: [message.to],
    cc: null,
    bcc: null,
    from: `Appointiva <${settings.from}>`,
    sender: null,
    subject: message.subject,
    tag: '{"app":"appointiva"}',
    reply_to: settings.from,
    plain_body: message.text,
    html_body: `<p>${escapeHtml(message.text).replaceAll('\n', '<br>')}</p>`,
    attachments: null,
  };
}

export async function postMailMessage(input: {
  apiUrl: string;
  apiKey: string;
  body: MailSendRequest;
}): Promise<void> {
  const url = `${input.apiUrl.replace(/\/$/, '')}/send/message`;
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'X-Server-API-Key': input.apiKey,
      },
      body: JSON.stringify(input.body),
    });
  } catch {
    throw new Error('Email could not be sent');
  }
  const payload: unknown = await response.json().catch(() => null);
  const status =
    typeof payload === 'object' && payload !== null && 'status' in payload
      ? payload.status
      : null;
  if (!response.ok || status === 'error') {
    throw new Error('Email could not be sent');
  }
}

export class ApiMailer implements Mailer {
  constructor(
    private readonly settings: MailSettings,
    private readonly post: typeof postMailMessage = postMailMessage,
  ) {}

  send(message: { to: string; subject: string; text: string }): Promise<void> {
    return this.post({
      apiUrl: this.settings.apiUrl,
      apiKey: this.settings.apiKey,
      body: mailRequest(this.settings, message),
    });
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}
