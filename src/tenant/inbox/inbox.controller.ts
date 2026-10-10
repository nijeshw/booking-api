import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { parseBody } from '../../common/parse-body';
import { CurrentTenant, TenantAccess } from '../../decorator/tenant.decorator';
import { AuthGuard } from '../../guard/auth.guard';
import { TenantGuard } from '../../guard/tenant.guard';
import type { TenantAccess as Access } from '../../master/tenancy/tenant.types';
import { noticeIdSchema, noticeQuerySchema } from './inbox.schema';
import { InboxService, type InboxResponse } from './inbox.service';

@Controller('tenants')
@UseGuards(AuthGuard, TenantGuard)
export class InboxController {
  constructor(private readonly inbox: InboxService) {}

  @Get('notices')
  @TenantAccess({})
  list(
    @CurrentTenant() access: Access,
    @Query() query: Record<string, unknown>,
  ): Promise<InboxResponse> {
    return this.inbox.list(access, parseBody(noticeQuerySchema, query).limit);
  }

  @Post('notices/read-all')
  @TenantAccess({})
  readAll(@CurrentTenant() access: Access): Promise<InboxResponse> {
    return this.inbox.markAllRead(access);
  }

  @Post('notices/:id/read')
  @TenantAccess({})
  read(
    @CurrentTenant() access: Access,
    @Param('id') id: string,
  ): Promise<InboxResponse> {
    return this.inbox.markRead(access, parseBody(noticeIdSchema, id));
  }
}
