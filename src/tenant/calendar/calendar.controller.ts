import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';

import { parseBody } from '../../common/parse-body';
import { parseUtc } from '../../common/time';
import { CurrentTenant, TenantAccess } from '../../decorator/tenant.decorator';
import { AuthGuard } from '../../guard/auth.guard';
import { TenantGuard } from '../../guard/tenant.guard';
import type { TenantAccess as Access } from '../../master/tenancy/tenant.types';
import {
  appointmentIdSchema,
  calendarQuerySchema,
} from '../booking/booking.schema';
import { BookingService } from '../booking/booking.service';

@Controller('tenants')
@UseGuards(AuthGuard, TenantGuard)
export class CalendarController {
  constructor(private readonly booking: BookingService) {}

  @Get('calendar')
  @TenantAccess({ permission: 'calendar.view' })
  calendar(
    @CurrentTenant() access: Access,
    @Query() query: Record<string, unknown>,
  ) {
    const range = parseBody(calendarQuerySchema, query);
    return this.booking.calendar(
      access,
      parseUtc(range.from),
      parseUtc(range.to),
    );
  }

  @Post('appointments/:id/cancel')
  @TenantAccess({ permission: 'calendar.manage' })
  cancel(@CurrentTenant() access: Access, @Param('id') id: string) {
    return this.booking.cancelByBusiness(
      access,
      parseBody(appointmentIdSchema, id),
    );
  }
}
