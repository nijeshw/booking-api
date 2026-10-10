import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { parseBody } from '../../common/parse-body';
import { parseUtc } from '../../common/time';
import { CurrentTenant, TenantAccess } from '../../decorator/tenant.decorator';
import { AuthGuard } from '../../guard/auth.guard';
import { TenantGuard } from '../../guard/tenant.guard';
import type { TenantAccess as Access } from '../../master/tenancy/tenant.types';
import { calendarQuerySchema } from '../booking/booking.schema';
import type { ReportSummary } from './reports.store';
import { ReportsService } from './reports.service';

@Controller('tenants')
@UseGuards(AuthGuard, TenantGuard)
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('reports')
  @TenantAccess({ permission: 'reports.view' })
  summary(
    @CurrentTenant() access: Access,
    @Query() query: Record<string, unknown>,
  ): Promise<ReportSummary> {
    const range = parseBody(calendarQuerySchema, query);
    return this.reports.summary(
      access,
      parseUtc(range.from),
      parseUtc(range.to),
    );
  }
}
