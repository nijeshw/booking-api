import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { Client } from 'pg';
import type { Env } from '../../config/env';
import { createDatabaseLogin } from '../database/credential';
import { databaseUrlFor } from '../database/database-url';
import { quotedDatabaseName } from '../database/database-name';

export type DatabaseLogin = {
  user: string;
  password: string;
};

export interface DatabaseProvisioner {
  createDatabase(databaseName: string): Promise<void>;
  migrate(databaseName: string): Promise<void>;
  issueLogin(databaseName: string): Promise<DatabaseLogin>;
}

@Injectable()
export class PostgresProvisioner implements DatabaseProvisioner {
  private readonly logger = new Logger(PostgresProvisioner.name);

  constructor(private readonly config: ConfigService<Env, true>) {}

  async createDatabase(databaseName: string): Promise<void> {
    const client = new Client({
      connectionString: this.config.getOrThrow('MASTER_DATABASE_URL'),
    });
    const identifier = quotedDatabaseName(databaseName);
    await client.connect();
    try {
      const existing = await client.query<{ one: number }>(
        'SELECT 1 AS one FROM pg_database WHERE datname = $1',
        [databaseName],
      );
      if (existing.rowCount === 0) {
        await client.query(`CREATE DATABASE ${identifier}`);
      }
    } finally {
      await client.end();
    }
  }

  async issueLogin(databaseName: string): Promise<DatabaseLogin> {
    const login = createDatabaseLogin();
    const masterUrl = this.config.getOrThrow('MASTER_DATABASE_URL', {
      infer: true,
    });
    const admin = new Client({ connectionString: masterUrl });
    await admin.connect();
    try {
      await runFormat(admin, 'CREATE ROLE %I LOGIN PASSWORD %L', [
        login.user,
        login.password,
      ]);
      await runFormat(admin, 'REVOKE CONNECT ON DATABASE %I FROM PUBLIC', [
        databaseName,
      ]);
      await runFormat(admin, 'GRANT CONNECT ON DATABASE %I TO %I', [
        databaseName,
        login.user,
      ]);
    } finally {
      await admin.end();
    }
    const tenant = new Client({
      connectionString: databaseUrlFor(masterUrl, databaseName),
    });
    await tenant.connect();
    try {
      await runFormat(tenant, 'GRANT USAGE ON SCHEMA public TO %I', [
        login.user,
      ]);
      await runFormat(
        tenant,
        'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO %I',
        [login.user],
      );
      await runFormat(
        tenant,
        'GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO %I',
        [login.user],
      );
      await runFormat(
        tenant,
        'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO %I',
        [login.user],
      );
      await runFormat(
        tenant,
        'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO %I',
        [login.user],
      );
    } finally {
      await tenant.end();
    }
    return login;
  }

  migrate(databaseName: string): Promise<void> {
    const url = databaseUrlFor(
      this.config.getOrThrow('MASTER_DATABASE_URL'),
      databaseName,
    );
    const prisma = join(process.cwd(), 'node_modules', '.bin', 'prisma');
    const schema = join(process.cwd(), 'prisma', 'tenant', 'schema.prisma');
    return new Promise((resolve, reject) => {
      const child = spawn(prisma, ['migrate', 'deploy', '--schema', schema], {
        env: { ...process.env, TENANT_DATABASE_URL: url },
        stdio: 'ignore',
      });
      child.on('error', () => {
        this.logger.error('Tenant migration failed');
        reject(new Error('Migration failed'));
      });
      child.on('exit', (code) => {
        if (code === 0) {
          resolve();
          return;
        }
        this.logger.error('Tenant migration failed');
        reject(new Error('Migration failed'));
      });
    });
  }
}

async function runFormat(
  client: Client,
  template: string,
  values: string[],
): Promise<void> {
  const args = values.map((_, index) => `$${index + 2}::text`).join(', ');
  const built = await client.query<{ stmt: string }>(
    `SELECT format($1::text, ${args}) AS stmt`,
    [template, ...values],
  );
  const statement = built.rows[0]?.stmt;
  if (!statement) {
    throw new Error('Could not build database statement');
  }
  await client.query(statement);
}
