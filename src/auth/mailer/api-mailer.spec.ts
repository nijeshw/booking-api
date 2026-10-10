import { ApiMailer, mailRequest, postMailMessage } from './api-mailer';

const settings = {
  apiUrl: 'https://mail.example.test/api/v1',
  apiKey: 'test-mail-key',
  from: 'no-reply@example.com',
};

describe('mail API', () => {
  it('builds a send request with the message text', () => {
    const body = mailRequest(settings, {
      to: 'bea@example.com',
      subject: 'Booked: Lesson',
      text: 'Change or cancel: https://example.test/manage/secret-token',
    });
    expect(body.to).toEqual(['bea@example.com']);
    expect(body.from).toBe('Nexora <no-reply@example.com>');
    expect(body.reply_to).toBe('no-reply@example.com');
    expect(body.sender).toBeNull();
    expect(body.cc).toBeNull();
    expect(body.bcc).toBeNull();
    expect(body.attachments).toBeNull();
    expect(body.plain_body).toContain('secret-token');
    expect(body.html_body).toContain('secret-token');
    expect(body.html_body.startsWith('<p>')).toBe(true);
  });

  it('posts to /send/message with the server API key', async () => {
    const calls: Array<{ url: string; apiKey: string }> = [];
    const mailer = new ApiMailer(settings, (input) => {
      calls.push({ url: input.apiUrl, apiKey: input.apiKey });
      expect(input.body.subject).toBe('Booked: Lesson');
      return Promise.resolve();
    });
    await mailer.send({
      to: 'bea@example.com',
      subject: 'Booked: Lesson',
      text: 'You are booked.',
    });
    expect(calls).toEqual([
      { url: 'https://mail.example.test/api/v1', apiKey: 'test-mail-key' },
    ]);
  });

  it('rejects an error response without copying the API body into the error', async () => {
    const original = global.fetch;
    const calls: Array<{ url: string; init: RequestInit }> = [];
    global.fetch = ((url: string, init?: RequestInit) => {
      calls.push({ url, init: init ?? {} });
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            status: 'error',
            data: { message: 'test-mail-key secret-token' },
          }),
      });
    }) as typeof fetch;
    try {
      const body = mailRequest(settings, {
        to: 'bea@example.com',
        subject: 'Booked: Lesson',
        text: 'secret-token',
      });
      await expect(
        postMailMessage({
          apiUrl: `${settings.apiUrl}/`,
          apiKey: settings.apiKey,
          body,
        }),
      ).rejects.toThrow(/^Email could not be sent$/);
      const headers = new Headers(calls[0]?.init.headers);
      expect(calls[0]?.url).toBe(
        'https://mail.example.test/api/v1/send/message',
      );
      expect(headers.get('X-Server-API-Key')).toBe('test-mail-key');
    } finally {
      global.fetch = original;
    }
  });
});
