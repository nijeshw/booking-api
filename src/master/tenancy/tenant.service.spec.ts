import {
  ConflictException,
  ForbiddenException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { AuthService } from '../../auth/auth.service';
import { DateTime } from 'luxon';
import { sealSecret } from '../database/credential';
import { TenantService } from './tenant.service';
import type { RoleStore } from '../../tenant/roles/role.store';
import type { NewBusiness, TenantStore } from './tenant.store';
import type {
  BusinessAccount,
  TenantRecord,
  TenantRole,
  UserTenantLink,
} from './tenant.types';
import type { TenantLogins } from '../database/tenant-logins';

const SECRET = 'test-only-auth-secret-32chars-min';

const USER = '018f3c2a-6c1e-7b2a-8d4e-9a0b1c2d3e4f';
const NOW = DateTime.fromISO('2026-09-28T12:00:00.000Z', {
  zone: 'utc',
}).toJSDate();

class MemoryTenantStore implements TenantStore {
  verified = true;
  plan: { id: string; trialDays: number } | null = {
    id: 'trial',
    trialDays: 14,
  };
  tenants: TenantRecord[] = [];
  userTenants: (UserTenantLink & { userId: string })[] = [];
  users: { id: string; email: string; name: string | null }[] = [];
  trials: { tenantId: string; trialEndsAt: Date }[] = [];
  logins: { id: string; user: string; secret: string }[] = [];

  isEmailVerified() {
    return Promise.resolve(this.verified);
  }

  findBySlug(slug: string) {
    return Promise.resolve(
      this.tenants.find((tenant) => tenant.slug === slug) ?? null,
    );
  }

  listActive() {
    return Promise.resolve(
      this.tenants.filter((tenant) => tenant.status === 'ACTIVE'),
    );
  }

  listForUser(userId: string) {
    return Promise.resolve(
      this.userTenants.filter((link) => link.userId === userId),
    );
  }

  findUserTenant(userId: string, slug: string) {
    return Promise.resolve(
      this.userTenants.find(
        (link) => link.userId === userId && link.tenant.slug === slug,
      ) ?? null,
    );
  }

  findUserByEmail(email: string) {
    return Promise.resolve(
      this.users.find((user) => user.email === email) ?? null,
    );
  }

  listBusinessAccounts(tenantId: string): Promise<BusinessAccount[]> {
    return Promise.resolve(
      this.userTenants
        .filter(
          (link) => link.tenant.id === tenantId && link.status === 'ACTIVE',
        )
        .map((link) => {
          const user = this.users.find((item) => item.id === link.userId);
          return {
            userId: link.userId,
            email: user?.email ?? '',
            name: user?.name ?? null,
            status: link.status,
          };
        }),
    );
  }

  saveUserTenant(input: { tenantId: string; userId: string }) {
    const tenant = this.tenants.find((item) => item.id === input.tenantId);
    if (!tenant) {
      return Promise.resolve('created' as const);
    }
    const existing = this.userTenants.find(
      (link) =>
        link.userId === input.userId && link.tenant.id === input.tenantId,
    );
    if (existing) {
      existing.status = 'ACTIVE';
      return Promise.resolve('updated' as const);
    }
    this.userTenants.push({
      status: 'ACTIVE',
      tenant,
      userId: input.userId,
    });
    return Promise.resolve('created' as const);
  }

  revokeUserTenant(tenantId: string, userId: string) {
    const link = this.userTenants.find(
      (item) => item.tenant.id === tenantId && item.userId === userId,
    );
    if (!link || link.status !== 'ACTIVE') {
      return Promise.resolve('missing' as const);
    }
    link.status = 'REVOKED';
    return Promise.resolve('ok' as const);
  }

  findPlan(id: string) {
    return Promise.resolve(this.plan?.id === id ? this.plan : null);
  }

  findEntitlements() {
    return Promise.resolve(null);
  }

  createBusiness(input: NewBusiness) {
    const tenant: TenantRecord = {
      id: input.id,
      slug: input.slug,
      legalName: input.legalName,
      status: 'PROVISIONING',
      databaseName: input.databaseName,
      timezone: input.timezone,
      currency: input.currency,
      email: input.email,
      phone: input.phone,
      addressLine1: input.addressLine1,
      city: input.city,
      postcode: input.postcode,
      country: input.country,
      ownerUserId: input.ownerUserId,
      schemaVersion: 0,
    };
    this.tenants.push(tenant);
    this.userTenants.push({
      status: 'ACTIVE',
      tenant,
      userId: input.ownerUserId,
    });
    this.trials.push({ tenantId: input.id, trialEndsAt: input.trialEndsAt });
    return Promise.resolve(tenant);
  }

  markActive(id: string, schemaVersion: number) {
    const tenant = this.tenants.find((item) => item.id === id);
    if (tenant) {
      tenant.status = 'ACTIVE';
      tenant.schemaVersion = schemaVersion;
    }
    return Promise.resolve();
  }

  updateLocale(id: string, timezone: string, currency: string) {
    const tenant = this.tenants.find((item) => item.id === id);
    if (tenant) {
      tenant.timezone = timezone;
      tenant.currency = currency;
    }
    return Promise.resolve();
  }

  findById(id: string) {
    return Promise.resolve(
      this.tenants.find((tenant) => tenant.id === id) ?? null,
    );
  }

  hasDatabaseLogin(id: string) {
    return Promise.resolve(this.logins.some((login) => login.id === id));
  }

  saveDatabaseLogin(id: string, databaseUser: string, databaseSecret: string) {
    this.logins.push({ id, user: databaseUser, secret: databaseSecret });
    return Promise.resolve();
  }

  listForAdmin() {
    return Promise.resolve([]);
  }

  setStatus(id: string, status: 'ACTIVE' | 'SUSPENDED') {
    const tenant = this.tenants.find((item) => item.id === id);
    if (!tenant) {
      return Promise.resolve('missing' as const);
    }
    if (tenant.status !== 'ACTIVE' && tenant.status !== 'SUSPENDED') {
      return Promise.resolve('blocked' as const);
    }
    tenant.status = status;
    return Promise.resolve('ok' as const);
  }
}

class MemoryRoles implements RoleStore {
  rows: { databaseName: string; userId: string; role: TenantRole }[] = [];
  defined: {
    databaseName: string;
    name: string;
    label: string;
    system: boolean;
  }[] = [];

  findRole(databaseName: string, userId: string) {
    return Promise.resolve(
      this.rows.find(
        (row) => row.databaseName === databaseName && row.userId === userId,
      )?.role ?? null,
    );
  }

  listRoles(databaseName: string) {
    return Promise.resolve(
      this.rows
        .filter((row) => row.databaseName === databaseName)
        .map((row) => ({ userId: row.userId, role: row.role })),
    );
  }

  assign(databaseName: string, userId: string, role: TenantRole) {
    const known =
      role === 'OWNER' ||
      role === 'MANAGER' ||
      role === 'STAFF' ||
      this.defined.some(
        (item) => item.databaseName === databaseName && item.name === role,
      );
    if (!known) {
      return Promise.reject(new Error('That role does not exist'));
    }
    const existing = this.rows.find(
      (row) => row.databaseName === databaseName && row.userId === userId,
    );
    if (existing) {
      existing.role = role;
      return Promise.resolve();
    }
    this.rows.push({ databaseName, userId, role });
    return Promise.resolve();
  }

  removeUser(databaseName: string, userId: string) {
    this.rows = this.rows.filter(
      (row) => row.databaseName !== databaseName || row.userId !== userId,
    );
    return Promise.resolve();
  }

  permissionsFor(_databaseName: string, role: TenantRole) {
    if (role === 'OWNER') {
      return Promise.resolve(['people.manage', 'setup.manage']);
    }
    return Promise.resolve([]);
  }

  permissionMatrix() {
    return Promise.resolve([
      {
        role: 'OWNER',
        label: 'Owner',
        system: true,
        locked: true,
        permissions: ['setup.view'],
      },
      {
        role: 'MANAGER',
        label: 'Manager',
        system: true,
        locked: false,
        permissions: ['setup.view'],
      },
      {
        role: 'STAFF',
        label: 'Staff',
        system: true,
        locked: false,
        permissions: [],
      },
    ]);
  }

  replacePermissions() {
    return Promise.resolve();
  }

  createRole(databaseName: string, name: string, label: string) {
    if (
      this.defined.some(
        (item) => item.databaseName === databaseName && item.name === name,
      ) ||
      name === 'MANAGER' ||
      name === 'STAFF'
    ) {
      return Promise.reject(new Error('That role already exists'));
    }
    this.defined.push({ databaseName, name, label, system: false });
    return Promise.resolve({
      role: name,
      label,
      system: false,
      locked: false,
      permissions: [],
    });
  }

  deleteRole(databaseName: string, role: string) {
    const record = this.defined.find(
      (item) => item.databaseName === databaseName && item.name === role,
    );
    if (!record || record.system) {
      return Promise.reject(new Error('This role stays with the business'));
    }
    if (
      this.rows.some(
        (row) => row.databaseName === databaseName && row.role === role,
      )
    ) {
      return Promise.reject(new Error('Move people off this role first'));
    }
    this.defined = this.defined.filter((item) => item !== record);
    return Promise.resolve();
  }
}

function setup() {
  const store = new MemoryTenantStore();
  const roles = new MemoryRoles();
  const calls: string[] = [];
  let failures = 0;
  const auth = {
    inviteToBusiness: (
      email: string,
      _business: string,
      name?: string | null,
    ) => {
      const existing = store.users.find((user) => user.email === email);
      if (existing) {
        if (name) {
          existing.name = name;
        }
        return Promise.resolve(existing);
      }
      const created = {
        id: `11111111-1111-4111-8111-1111111111${store.users.length}1`,
        email,
        name: name ?? null,
      };
      store.users.push(created);
      return Promise.resolve(created);
    },
    updateProfile: (
      userId: string,
      profile: { name: string; email: string },
    ) => {
      const user = store.users.find((item) => item.id === userId);
      if (!user) {
        return Promise.reject(new Error('missing'));
      }
      if (
        store.users.some(
          (item) => item.email === profile.email && item.id !== userId,
        )
      ) {
        return Promise.reject(
          new ConflictException('That email is already in use'),
        );
      }
      user.name = profile.name;
      user.email = profile.email;
      return Promise.resolve(user);
    },
  } as unknown as AuthService;
  const logins = {
    remember: (databaseName: string, user: string, password: string) => {
      calls.push(`remember:${databaseName}:${user}`);
      return sealSecret(password, SECRET);
    },
  } as unknown as TenantLogins;
  const service = new TenantService(
    store,
    {
      createDatabase: (name) => {
        calls.push(`create:${name}`);
        if (failures > 0) {
          failures -= 1;
          return Promise.reject(new Error('db down'));
        }
        return Promise.resolve();
      },
      migrate: (name) => {
        calls.push(`migrate:${name}`);
        return Promise.resolve();
      },
      issueLogin: (name) => {
        calls.push(`login:${name}`);
        return Promise.resolve({
          user: 'nexora_u_0123456789abcdef',
          password: 'role-password-value',
        });
      },
    },
    logins,
    roles,
    auth,
    () => NOW,
  );
  return {
    store,
    roles,
    calls,
    service,
    failNext: () => {
      failures += 1;
    },
  };
}

const input = {
  legalName: 'Ada Studio',
  slug: 'ada-studio',
  timezone: 'Europe/London',
  currency: 'GBP',
};

describe('TenantService', () => {
  it('refuses to provision a business before the email is verified', async () => {
    const { service, store } = setup();
    store.verified = false;
    await expect(service.create(USER, input)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(store.tenants).toHaveLength(0);
  });

  it('creates a trial business database and marks it active', async () => {
    const { service, store, calls } = setup();
    const tenant = await service.create(USER, input);
    expect(tenant.status).toBe('ACTIVE');
    expect(tenant.databaseName).toMatch(/^nexora_t_[a-f0-9]{32}$/);
    expect(calls).toEqual([
      `create:${tenant.databaseName}`,
      `migrate:${tenant.databaseName}`,
      `login:${tenant.databaseName}`,
      `remember:${tenant.databaseName}:nexora_u_0123456789abcdef`,
    ]);
    expect(store.logins[0]?.secret).not.toContain('role-password-value');
    expect(store.trials[0]?.trialEndsAt.toISOString()).toBe(
      '2026-10-12T12:00:00.000Z',
    );
    expect(store.userTenants[0]?.userId).toBe(USER);
  });

  it('stores the owner role in the business database', async () => {
    const { service, roles } = setup();
    const tenant = await service.create(USER, input);
    expect(roles.rows).toEqual([
      {
        databaseName: tenant.databaseName,
        userId: USER,
        role: 'OWNER',
      },
    ]);
  });

  it('keeps the business in provisioning when the database step fails', async () => {
    const errors = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    try {
      const { service, store, failNext } = setup();
      failNext();
      await expect(service.create(USER, input)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
      expect(store.tenants[0]?.status).toBe('PROVISIONING');
    } finally {
      errors.mockRestore();
    }
  });

  it('retries provisioning for the same owner and rejects a taken slug', async () => {
    const errors = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    const { service, failNext } = setup();
    failNext();
    try {
      await expect(service.create(USER, input)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    } finally {
      errors.mockRestore();
    }
    const retried = await service.retry(USER, 'ada-studio');
    expect(retried.status).toBe('ACTIVE');
    await expect(service.create(USER, input)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('opens an active business and hides one that is not ready', async () => {
    const { service, store } = setup();
    await service.create(USER, input);
    await expect(service.open('ada-studio')).resolves.toMatchObject({
      slug: 'ada-studio',
      status: 'ACTIVE',
    });
    const tenant = store.tenants[0];
    if (!tenant) {
      throw new Error('missing tenant');
    }
    tenant.status = 'PROVISIONING';
    await expect(service.open('ada-studio')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(service.open('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('lets an owner give a manager access to a second business', async () => {
    const { service, store } = setup();
    await service.create(USER, input);
    const manager = '11111111-1111-4111-8111-111111111111';
    store.users.push({
      id: manager,
      email: 'bea@example.com',
      name: 'Bea',
    });
    const tenant = store.tenants[0];
    if (!tenant) {
      throw new Error('missing tenant');
    }
    const granted = await service.grantAccess(
      { userId: USER, role: 'OWNER', tenant },
      { name: 'Bea', email: 'bea@example.com', role: 'MANAGER' },
    );
    expect(granted).toMatchObject({
      email: 'bea@example.com',
      role: 'MANAGER',
    });
    await expect(service.list(manager)).resolves.toEqual([
      expect.objectContaining({ role: 'MANAGER' }),
    ]);
    await expect(
      service.grantAccess(
        { userId: manager, role: 'MANAGER', tenant },
        { name: 'Bea', email: 'bea@example.com', role: 'STAFF' },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.grantAccess(
        { userId: USER, role: 'OWNER', tenant },
        { name: 'Guest', email: 'missing@example.com', role: 'STAFF' },
      ),
    ).resolves.toMatchObject({
      email: 'missing@example.com',
      role: 'STAFF',
    });
    store.users.push({ id: USER, email: 'ada@example.com', name: 'Ada' });
    await expect(
      service.grantAccess(
        { userId: USER, role: 'OWNER', tenant },
        { name: 'Ada', email: 'ada@example.com', role: 'STAFF' },
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('adds a role and refuses to remove the owner', async () => {
    const { service, roles, store } = setup();
    await service.create(USER, input);
    const tenant = store.tenants[0];
    if (!tenant) {
      throw new Error('missing tenant');
    }
    const access = { userId: USER, role: 'OWNER', tenant };
    const created = await service.createRole(access, { label: 'Front desk' });
    expect(created).toMatchObject({ role: 'FRONT_DESK', locked: false });
    await expect(
      service.createRole(access, { label: 'Owner' }),
    ).rejects.toBeInstanceOf(ConflictException);
    store.users.push({ id: USER, email: 'ada@example.com', name: 'Ada' });
    await expect(
      service.revokeAccess(access, { email: 'ada@example.com' }),
    ).rejects.toBeInstanceOf(ConflictException);
    const manager = '11111111-1111-4111-8111-111111111111';
    store.users.push({ id: manager, email: 'bea@example.com', name: 'Bea' });
    await service.grantAccess(access, {
      name: 'Bea',
      email: 'bea@example.com',
      role: 'FRONT_DESK',
    });
    await service.revokeAccess(access, { email: 'bea@example.com' });
    expect(roles.rows.some((row) => row.userId === manager)).toBe(false);
    await expect(
      service.deleteRole(access, 'FRONT_DESK'),
    ).resolves.toBeUndefined();
  });

  it('hides a business from someone who is not linked', async () => {
    const { service } = setup();
    await service.create(USER, input);
    await expect(
      service.access({
        userId: '11111111-1111-4111-8111-111111111111',
        slug: 'ada-studio',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
