import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env';
import type { Mailer } from '../store/auth.store';

@Injectable()
export class LogMailer implements Mailer {
  private readonly logger = new Logger(LogMailer.name);

  constructor(private readonly config: ConfigService<Env, true>) {}

  send(message: { to: string; subject: string; text: string }): Promise<void> {
    if (this.config.get('NODE_ENV', { infer: true }) === 'production') {
      this.logger.error(`Email is not configured: ${message.subject}`);
      return Promise.reject(new Error('Email is not configured'));
    }
    this.logger.log(`${message.subject} for ${message.to}: ${message.text}`);
    return Promise.resolve();
  }
}
