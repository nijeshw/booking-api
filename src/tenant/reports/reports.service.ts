import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { diffMs } from '../../common/time';
import {
  allows,
  parseEntitlements,
  type Entitlements,
} from '../../master/entitlements/entitlements';
import { TENANT_STORE } from '../../master/tenancy/tenancy.tokens';
import type { TenantStore } from '../../master/tenancy/tenant.store';
import type { TenantAccess } from '../../master/tenancy/tenant.types';
import { REPORTS_STORE } from './reports.tokens';
import type {
  ReportAppointment,
  ReportGroup,
  ReportSummary,
  ReportsStore,
} from './reports.store';

const RANGE_LIMIT_MS = 366 * 24 * 60 * 60 * 1000;

@Injectable()
export class ReportsService {
  constructor(
    @Inject(REPORTS_STORE) private readonly reports: ReportsStore,
    @Inject(TENANT_STORE) private readonly tenants: TenantStore,
  ) {}

  async summary(
    access: TenantAccess,
    from: Date,
    to: Date,
  ): Promise<ReportSummary> {
    if (diffMs(to, from) > RANGE_LIMIT_MS) {
      throw new BadRequestException('Choose a shorter date range');
    }
    let entitlements: Entitlements;
    try {
      entitlements = parseEntitlements(
        await this.tenants.findEntitlements(access.tenant.id),
      );
    } catch {
      throw new ForbiddenException('Your plan does not include that');
    }
    if (!allows(entitlements, 'reports')) {
      throw new ForbiddenException('Your plan does not include reports');
    }
    const rows = await this.reports.appointments(
      access.tenant.databaseName,
      from,
      to,
    );
    return summarize(
      rows,
      access.tenant.currency,
      allows(entitlements, 'advancedReports'),
    );
  }
}

export function summarize(
  rows: ReportAppointment[],
  currency: string,
  advanced: boolean,
): ReportSummary {
  let bookings = 0;
  let cancelled = 0;
  let noShows = 0;
  let revenueAmountMinor = 0;
  const byService = new Map<string, ReportGroup>();
  const byStaff = new Map<string, ReportGroup>();

  for (const row of rows) {
    if (row.status === 'CANCELLED') {
      cancelled += 1;
      continue;
    }
    bookings += 1;
    if (row.status === 'NO_SHOW') {
      noShows += 1;
    }
    const earns =
      row.status === 'CONFIRMED' || row.status === 'COMPLETED'
        ? row.priceAmountMinor
        : 0;
    revenueAmountMinor += earns;
    if (advanced) {
      bump(byService, row.service.id, row.service.name, earns);
      bump(byStaff, row.staff.id, row.staff.name, earns);
    }
  }

  return {
    currency,
    bookings,
    cancelled,
    noShows,
    revenueAmountMinor,
    advanced,
    byService: advanced ? sorted(byService) : [],
    byStaff: advanced ? sorted(byStaff) : [],
  };
}

function bump(
  groups: Map<string, ReportGroup>,
  id: string,
  name: string,
  revenue: number,
): void {
  const existing = groups.get(id);
  if (existing) {
    existing.bookings += 1;
    existing.revenueAmountMinor += revenue;
    return;
  }
  groups.set(id, {
    id,
    name,
    bookings: 1,
    revenueAmountMinor: revenue,
  });
}

function sorted(groups: Map<string, ReportGroup>): ReportGroup[] {
  return [...groups.values()].sort(
    (left, right) =>
      right.revenueAmountMinor - left.revenueAmountMinor ||
      left.name.localeCompare(right.name),
  );
}
