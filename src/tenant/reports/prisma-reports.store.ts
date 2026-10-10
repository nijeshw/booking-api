import { Injectable } from '@nestjs/common';
import { TenantConnections } from '../database/tenant-connections';
import type { ReportAppointment, ReportsStore } from './reports.store';

@Injectable()
export class PrismaReportsStore implements ReportsStore {
  constructor(private readonly connections: TenantConnections) {}

  async appointments(
    databaseName: string,
    from: Date,
    to: Date,
  ): Promise<ReportAppointment[]> {
    const rows = await this.connections.get(databaseName).appointment.findMany({
      where: {
        startAt: { gte: from, lt: to },
      },
      select: {
        status: true,
        priceAmountMinor: true,
        service: { select: { id: true, name: true } },
        staff: { select: { id: true, name: true } },
      },
    });
    return rows.map((row) => ({
      status: row.status,
      priceAmountMinor: row.priceAmountMinor,
      service: row.service,
      staff: row.staff,
    }));
  }
}
