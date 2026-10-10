import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { AuthService } from '../../auth/auth.service';
import { CLOCK } from '../../common/clock';
import { plusDays, utcNow } from '../../common/time';
import { tenantDatabaseName } from '../database/database-name';
import { TenantLogins } from '../database/tenant-logins';
import {
  PERMISSIONS,
  allows,
  isPermissionKey,
  permissionKeys,
} from '../../tenant/roles/permission';
import {
  ROLE_STORE,
  roleKey,
  type RoleStore,
} from '../../tenant/roles/role.store';
import type { DatabaseProvisioner } from './provisioner';
import { PROVISIONER, TENANT_STORE } from './tenancy.tokens';
import type {
  CreateRoleInput,
  CreateTenantInput,
  GrantAccessInput,
  RevokeAccessInput,
  UpdateAccessInput,
} from './tenant.schema';
import type { TenantStore } from './tenant.store';
import type {
  AdminTenant,
  BusinessUser,
  PermissionSettings,
  RolePermissions,
  TenantAccess,
  TenantRecord,
  TenantRole,
  TenantStatus,
  UserTenantLink,
  UserTenantView,
} from './tenant.types';

@Injectable()
export class TenantService {
  private readonly logger = new Logger(TenantService.name);
  private readonly now: () => Date;

  constructor(
    @Inject(TENANT_STORE) private readonly store: TenantStore,
    @Inject(PROVISIONER) private readonly provisioner: DatabaseProvisioner,
    private readonly logins: TenantLogins,
    @Inject(ROLE_STORE) private readonly roles: RoleStore,
    private readonly auth: AuthService,
    @Optional() @Inject(CLOCK) now?: () => Date,
  ) {
    this.now = now ?? utcNow;
  }

  async list(userId: string): Promise<UserTenantView[]> {
    const links = (await this.store.listForUser(userId)).filter(
      (link) => link.status === 'ACTIVE',
    );
    const views = await Promise.all(
      links.map(async (link) => {
        const role = await this.roleFor(userId, link);
        return role ? { ...link, role } : null;
      }),
    );
    return views.filter((view): view is UserTenantView => view !== null);
  }

  async create(
    userId: string,
    input: CreateTenantInput,
  ): Promise<TenantRecord> {
    if (!(await this.store.isEmailVerified(userId))) {
      throw new ForbiddenException(
        'Verify your email before creating a business',
      );
    }
    const existing = await this.store.findBySlug(input.slug);
    if (existing) {
      if (
        existing.ownerUserId === userId &&
        existing.status === 'PROVISIONING'
      ) {
        return this.provision(existing);
      }
      throw new ConflictException('That address is already taken');
    }

    const plan = await this.store.findPlan('trial');
    if (!plan) {
      throw new ServiceUnavailableException('Plans are not configured');
    }
    const id = randomUUID();
    const tenant = await this.store.createBusiness({
      id,
      slug: input.slug,
      legalName: input.legalName,
      databaseName: tenantDatabaseName(id),
      timezone: input.timezone,
      currency: input.currency,
      email: input.email,
      phone: input.phone,
      addressLine1: input.addressLine1,
      city: input.city,
      postcode: input.postcode,
      country: input.country,
      ownerUserId: userId,
      planId: plan.id,
      trialEndsAt: plusDays(this.now(), plan.trialDays),
    });
    return this.provision(tenant);
  }

  async retry(userId: string, slug: string): Promise<TenantRecord> {
    const link = await this.requireUserTenant(userId, slug);
    if ((await this.roleFor(userId, link)) !== 'OWNER') {
      throw new ForbiddenException('You do not have access to do that');
    }
    if (link.tenant.status === 'ACTIVE') {
      return link.tenant;
    }
    if (link.tenant.status !== 'PROVISIONING') {
      throw new ConflictException('This business is not ready');
    }
    return this.provision(link.tenant);
  }

  async open(slug: string): Promise<TenantRecord> {
    const tenant = await this.store.findBySlug(slug);
    if (!tenant || tenant.status !== 'ACTIVE') {
      throw new NotFoundException('Business not found');
    }
    return tenant;
  }

  async access(input: {
    userId: string;
    slug: string;
    permission?: string;
    roles?: TenantRole[];
    statuses?: TenantStatus[];
  }): Promise<TenantAccess> {
    const link = await this.requireUserTenant(input.userId, input.slug);
    const role = await this.roleFor(input.userId, link);
    if (!role) {
      throw new NotFoundException('Business not found');
    }
    const permissions = await this.permissionsFor(role, link);
    const statuses = input.statuses ?? ['ACTIVE'];
    if (!statuses.includes(link.tenant.status)) {
      throw new ConflictException('This business is not ready');
    }
    if (
      input.permission &&
      isPermissionKey(input.permission) &&
      !allows({ role, permissions }, input.permission)
    ) {
      throw new ForbiddenException('You do not have access to do that');
    }
    if (input.roles && !input.roles.includes(role)) {
      throw new ForbiddenException('You do not have access to do that');
    }
    return {
      userId: input.userId,
      role,
      permissions,
      tenant: link.tenant,
    };
  }

  async permissionSettings(access: TenantAccess): Promise<PermissionSettings> {
    const roles = allows(access, 'people.manage')
      ? await this.roles.permissionMatrix(access.tenant.databaseName)
      : [];
    return {
      mine: access.permissions ?? [],
      catalog: PERMISSIONS.map((item) => ({
        key: item.key,
        label: item.label,
      })),
      roles,
    };
  }

  async savePermissions(
    access: TenantAccess,
    role: string,
    keys: string[],
  ): Promise<void> {
    this.requirePeopleManager(access);
    if (role === 'OWNER') {
      throw new ConflictException('The owner always has every permission');
    }
    if (keys.some((key) => !isPermissionKey(key))) {
      throw new ConflictException('Unknown permission');
    }
    try {
      await this.roles.replacePermissions(access.tenant.databaseName, role, [
        ...new Set(keys),
      ]);
    } catch (error) {
      throw this.roleError(error);
    }
  }

  async createRole(
    access: TenantAccess,
    input: CreateRoleInput,
  ): Promise<RolePermissions> {
    this.requirePeopleManager(access);
    const name = roleKey(input.label);
    if (!/^[A-Z][A-Z0-9_]{1,39}$/.test(name) || name === 'OWNER') {
      throw new ConflictException('Choose a clearer role name');
    }
    try {
      return await this.roles.createRole(
        access.tenant.databaseName,
        name,
        input.label,
      );
    } catch (error) {
      throw this.roleError(error);
    }
  }

  async deleteRole(access: TenantAccess, role: string): Promise<void> {
    this.requirePeopleManager(access);
    if (role === 'OWNER') {
      throw new ConflictException('This role stays with the business');
    }
    try {
      await this.roles.deleteRole(access.tenant.databaseName, role);
    } catch (error) {
      throw this.roleError(error);
    }
  }

  async listBusinessUsers(access: TenantAccess): Promise<BusinessUser[]> {
    const [accounts, roles] = await Promise.all([
      this.store.listBusinessAccounts(access.tenant.id),
      this.roles.listRoles(access.tenant.databaseName),
    ]);
    return accounts.flatMap((account) => {
      const match = roles.find((row) => row.userId === account.userId);
      if (!match) {
        return [];
      }
      return [
        {
          email: account.email,
          name: account.name,
          role: match.role,
          status: account.status,
        },
      ];
    });
  }

  async grantAccess(
    access: TenantAccess,
    input: GrantAccessInput,
  ): Promise<BusinessUser> {
    this.requirePeopleManager(access);
    if (input.role === 'OWNER') {
      throw new ConflictException('The owner role cannot be assigned');
    }
    const user = await this.auth.inviteToBusiness(
      input.email,
      access.tenant.legalName,
      input.name,
    );
    const current = await this.roles.findRole(
      access.tenant.databaseName,
      user.id,
    );
    if (current === 'OWNER') {
      throw new ConflictException('The owner already has access');
    }
    await this.store.saveUserTenant({
      tenantId: access.tenant.id,
      userId: user.id,
    });
    try {
      await this.roles.assign(access.tenant.databaseName, user.id, input.role);
    } catch (error) {
      throw this.roleError(error);
    }
    return {
      email: user.email,
      name: user.name,
      role: input.role,
      status: 'ACTIVE',
    };
  }

  async updateAccess(
    access: TenantAccess,
    input: UpdateAccessInput,
  ): Promise<BusinessUser> {
    this.requirePeopleManager(access);
    if (input.role === 'OWNER') {
      throw new ConflictException('The owner role cannot be assigned');
    }
    const account = await this.requireBusinessUser(access, input.email);
    if (account.role === 'OWNER') {
      throw new ConflictException('The owner role cannot be changed');
    }
    const profile = await this.auth.updateProfile(account.userId, {
      name: input.name,
      email: input.nextEmail,
    });
    try {
      await this.roles.assign(
        access.tenant.databaseName,
        account.userId,
        input.role,
      );
    } catch (error) {
      throw this.roleError(error);
    }
    return {
      email: profile.email,
      name: profile.name,
      role: input.role,
      status: account.status,
    };
  }

  async revokeAccess(
    access: TenantAccess,
    input: RevokeAccessInput,
  ): Promise<void> {
    this.requirePeopleManager(access);
    const account = await this.requireBusinessUser(access, input.email);
    if (account.role === 'OWNER') {
      throw new ConflictException('The owner cannot be removed');
    }
    const revoked = await this.store.revokeUserTenant(
      access.tenant.id,
      account.userId,
    );
    if (revoked === 'missing') {
      throw new NotFoundException('That person is not in this business');
    }
    await this.roles.removeUser(access.tenant.databaseName, account.userId);
  }

  private requirePeopleManager(access: TenantAccess): void {
    if (!allows(access, 'people.manage')) {
      throw new ForbiddenException('You do not have access to do that');
    }
  }

  private async requireBusinessUser(
    access: TenantAccess,
    email: string,
  ): Promise<BusinessUser & { userId: string }> {
    const user = await this.store.findUserByEmail(email);
    if (!user) {
      throw new NotFoundException('That person is not in this business');
    }
    const role = await this.roles.findRole(access.tenant.databaseName, user.id);
    if (!role) {
      throw new NotFoundException('That person is not in this business');
    }
    return {
      userId: user.id,
      email: user.email,
      name: user.name,
      role,
      status: 'ACTIVE',
    };
  }

  private roleError(error: unknown): ConflictException {
    const message = error instanceof Error ? error.message : '';
    if (
      message === 'That role already exists' ||
      message === 'That role does not exist' ||
      message === 'This role stays with the business' ||
      message === 'Move people off this role first' ||
      message === 'Unknown permission'
    ) {
      return new ConflictException(message);
    }
    return new ConflictException('Could not update that role');
  }

  private async roleFor(
    userId: string,
    link: UserTenantLink,
  ): Promise<TenantRole | null> {
    let role: TenantRole | null = null;
    try {
      role = await this.roles.findRole(link.tenant.databaseName, userId);
    } catch (error) {
      if (
        link.tenant.status !== 'PROVISIONING' ||
        link.tenant.ownerUserId !== userId
      ) {
        throw error;
      }
    }
    if (role) {
      return role;
    }
    if (
      link.tenant.ownerUserId === userId &&
      link.tenant.status === 'PROVISIONING'
    ) {
      return 'OWNER';
    }
    return null;
  }

  private async permissionsFor(
    role: TenantRole,
    link: UserTenantLink,
  ): Promise<string[]> {
    if (role === 'OWNER') {
      return permissionKeys();
    }
    try {
      return await this.roles.permissionsFor(link.tenant.databaseName, role);
    } catch (error) {
      if (link.tenant.status === 'PROVISIONING') {
        return [];
      }
      throw error;
    }
  }

  private async requireUserTenant(
    userId: string,
    slug: string,
  ): Promise<UserTenantLink> {
    const link = await this.store.findUserTenant(userId, slug);
    if (!link || link.status !== 'ACTIVE') {
      throw new NotFoundException('Business not found');
    }
    return link;
  }

  async listForAdmin(): Promise<AdminTenant[]> {
    return this.store.listForAdmin();
  }

  async setStatus(id: string, status: 'ACTIVE' | 'SUSPENDED'): Promise<void> {
    const result = await this.store.setStatus(id, status);
    if (result === 'missing') {
      throw new NotFoundException('Business not found');
    }
    if (result === 'blocked') {
      throw new ConflictException('This business cannot change status');
    }
  }

  async issueDatabaseLogin(id: string): Promise<void> {
    const tenant = await this.store.findById(id);
    if (!tenant || tenant.status !== 'ACTIVE') {
      throw new NotFoundException('Business not found');
    }
    if (await this.store.hasDatabaseLogin(id)) {
      throw new ConflictException(
        'This business already has its own database login',
      );
    }
    await this.attachLogin(tenant);
  }

  private async provision(tenant: TenantRecord): Promise<TenantRecord> {
    try {
      await this.provisioner.createDatabase(tenant.databaseName);
      await this.provisioner.migrate(tenant.databaseName);
      await this.roles.assign(tenant.databaseName, tenant.ownerUserId, 'OWNER');
      await this.attachLogin(tenant);
      await this.store.markActive(tenant.id, 1);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Provisioning failed';
      this.logger.error(message);
      throw new ServiceUnavailableException('Provisioning failed');
    }
    return { ...tenant, status: 'ACTIVE', schemaVersion: 1 };
  }

  private async attachLogin(tenant: TenantRecord): Promise<void> {
    const login = await this.provisioner.issueLogin(tenant.databaseName);
    const sealed = this.logins.remember(
      tenant.databaseName,
      login.user,
      login.password,
    );
    await this.store.saveDatabaseLogin(tenant.id, login.user, sealed);
  }
}
