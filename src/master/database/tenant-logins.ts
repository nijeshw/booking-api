import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env';
import { TenantConnections } from '../../tenant/database/tenant-connections';
import { databaseUrlForLogin, sealSecret } from './credential';

@Injectable()
export class TenantLogins {
  constructor(
    private readonly config: ConfigService<Env, true>,
    private readonly connections: TenantConnections,
  ) {}

  remember(databaseName: string, user: string, password: string): string {
    const masterUrl = this.config.getOrThrow('MASTER_DATABASE_URL', {
      infer: true,
    });
    const secret = this.config.getOrThrow('AUTH_SECRET', { infer: true });
    this.connections.register(
      databaseName,
      databaseUrlForLogin(masterUrl, databaseName, user, password),
    );
    return sealSecret(password, secret);
  }
}
