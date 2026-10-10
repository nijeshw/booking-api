import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { parseBody } from '../../common/parse-body';
import { CurrentPublicTenant } from '../../decorator/public-tenant.decorator';
import { PublicTenantGuard } from '../../guard/public-tenant.guard';
import type { TenantRecord } from '../../master/tenancy/tenant.types';
import {
  bookSchema,
  rescheduleSchema,
  slotQuerySchema,
} from './booking.schema';
import { BookingService } from './booking.service';

export const BOOKING_TOKEN_HEADER = 'x-booking-token';

@Controller('book')
@UseGuards(PublicTenantGuard)
export class PublicBookingController {
  constructor(private readonly booking: BookingService) {}

  @Get('profile')
  profile(@CurrentPublicTenant() tenant: TenantRecord) {
    return this.booking.profile(tenant);
  }

  @Get('slots')
  slots(
    @CurrentPublicTenant() tenant: TenantRecord,
    @Query() query: Record<string, unknown>,
  ) {
    return this.booking.slots(tenant, parseBody(slotQuerySchema, query));
  }

  @Post('appointments')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  book(@CurrentPublicTenant() tenant: TenantRecord, @Body() body: unknown) {
    return this.booking.book(tenant, parseBody(bookSchema, body));
  }

  @Get('manage')
  managed(
    @CurrentPublicTenant() tenant: TenantRecord,
    @Req() request: Request,
  ) {
    return this.booking.managed(tenant, bookingToken(request));
  }

  @Post('manage/cancel')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  cancel(@CurrentPublicTenant() tenant: TenantRecord, @Req() request: Request) {
    return this.booking.cancelByCustomer(tenant, bookingToken(request));
  }

  @Post('manage/reschedule')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  reschedule(
    @CurrentPublicTenant() tenant: TenantRecord,
    @Req() request: Request,
    @Body() body: unknown,
  ) {
    return this.booking.rescheduleByCustomer(
      tenant,
      bookingToken(request),
      parseBody(rescheduleSchema, body),
    );
  }
}

function bookingToken(request: Request): string {
  const header = request.headers[BOOKING_TOKEN_HEADER];
  if (typeof header !== 'string' || header.trim() === '') {
    throw new NotFoundException('Booking not found');
  }
  return header.trim();
}
