import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/tenant';
import type { TenantRole } from '../../master/tenancy/tenant.types';
import { TenantConnections } from '../database/tenant-connections';
import { permissionKeys } from './permission';
import type { AssignedRole, RolePermissionSet, RoleStore } from './role.store';

const ROLE_ORDER = ['OWNER', 'MANAGER', 'STAFF'];

@Injectable()
export class PrismaRoleStore implements RoleStore {
  constructor(private readonly connections: TenantConnections) {}

  async findRole(
    databaseName: string,
    userId: string,
  ): Promise<TenantRole | null> {
    try {
      const row = await this.connections.get(databaseName).roleUser.findUnique({
        where: { userId },
        select: { role: { select: { name: true } } },
      });
      return row?.role.name ?? null;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2021'
      ) {
        return null;
      }
      throw error;
    }
  }

  async listRoles(databaseName: string): Promise<AssignedRole[]> {
    const rows = await this.connections.get(databaseName).roleUser.findMany({
      select: { userId: true, role: { select: { name: true } } },
    });
    return rows.map((row) => ({ userId: row.userId, role: row.role.name }));
  }

  async assign(
    databaseName: string,
    userId: string,
    role: TenantRole,
  ): Promise<void> {
    const client = this.connections.get(databaseName);
    const record = await client.role.findUnique({ where: { name: role } });
    if (!record) {
      throw new Error('That role does not exist');
    }
    await client.roleUser.upsert({
      where: { userId },
      create: { userId, roleId: record.id },
      update: { roleId: record.id },
    });
  }

  async removeUser(databaseName: string, userId: string): Promise<void> {
    await this.connections.get(databaseName).roleUser.deleteMany({
      where: { userId },
    });
  }

  async permissionsFor(
    databaseName: string,
    role: TenantRole,
  ): Promise<string[]> {
    try {
      if (role === 'OWNER') {
        return permissionKeys();
      }
      const rows = await this.connections
        .get(databaseName)
        .rolePermission.findMany({
          where: { role: { name: role } },
          select: { permission: { select: { key: true } } },
        });
      return rows.map((row) => row.permission.key);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2021'
      ) {
        return [];
      }
      throw error;
    }
  }

  async permissionMatrix(databaseName: string): Promise<RolePermissionSet[]> {
    const roles = await this.connections.get(databaseName).role.findMany({
      select: {
        name: true,
        label: true,
        system: true,
        permissions: { select: { permission: { select: { key: true } } } },
      },
    });
    return roles
      .slice()
      .sort((left, right) => compareRoles(left.name, right.name))
      .map((role) => ({
        role: role.name,
        label: role.label,
        system: role.system,
        locked: role.name === 'OWNER',
        permissions:
          role.name === 'OWNER'
            ? permissionKeys()
            : role.permissions.map((row) => row.permission.key),
      }));
  }

  async replacePermissions(
    databaseName: string,
    role: string,
    keys: string[],
  ): Promise<void> {
    const client = this.connections.get(databaseName);
    const record = await client.role.findUnique({
      where: { name: role },
      select: { id: true, name: true },
    });
    if (!record || record.name === 'OWNER') {
      throw new Error('That role does not exist');
    }
    const permissions = await client.permission.findMany({
      where: { key: { in: keys } },
      select: { id: true },
    });
    if (permissions.length !== keys.length) {
      throw new Error('Unknown permission');
    }
    await client.$transaction([
      client.rolePermission.deleteMany({ where: { roleId: record.id } }),
      client.rolePermission.createMany({
        data: permissions.map((permission) => ({
          roleId: record.id,
          permissionId: permission.id,
        })),
      }),
    ]);
  }

  async createRole(
    databaseName: string,
    name: string,
    label: string,
  ): Promise<RolePermissionSet> {
    const client = this.connections.get(databaseName);
    const existing = await client.role.findUnique({
      where: { name },
      select: { id: true },
    });
    if (existing) {
      throw new Error('That role already exists');
    }
    const created = await client.role.create({
      data: { name, label, system: false },
      select: { name: true, label: true, system: true },
    });
    return {
      role: created.name,
      label: created.label,
      system: created.system,
      locked: false,
      permissions: [],
    };
  }

  async deleteRole(databaseName: string, role: string): Promise<void> {
    const client = this.connections.get(databaseName);
    const record = await client.role.findUnique({
      where: { name: role },
      select: { id: true, system: true, name: true },
    });
    if (!record || record.system || record.name === 'OWNER') {
      throw new Error('This role stays with the business');
    }
    const assigned = await client.roleUser.count({
      where: { roleId: record.id },
    });
    if (assigned > 0) {
      throw new Error('Move people off this role first');
    }
    await client.role.delete({ where: { id: record.id } });
  }
}

function compareRoles(left: string, right: string): number {
  const leftIndex = ROLE_ORDER.indexOf(left);
  const rightIndex = ROLE_ORDER.indexOf(right);
  if (leftIndex === -1 && rightIndex === -1) {
    return left.localeCompare(right);
  }
  if (leftIndex === -1) {
    return 1;
  }
  if (rightIndex === -1) {
    return -1;
  }
  return leftIndex - rightIndex;
}
