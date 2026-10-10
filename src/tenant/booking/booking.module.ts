import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { PublicTenantGuard } from '../../guard/public-tenant.guard';
import { TenancyModule } from '../../master/tenancy/tenancy.module';
import { TenantDatabaseModule } from '../database/tenant-database.module';
import { CalendarController } from '../calendar/calendar.controller';
import { CustomersController } from '../customers/customers.controller';
import { InboxController } from '../inbox/inbox.controller';
import { InboxService } from '../inbox/inbox.service';
import { PrismaInboxStore } from '../inbox/prisma-inbox.store';
import { INBOX_STORE } from '../inbox/inbox.store';
import { NotificationService } from '../notifications/notification.service';
import { BOOKING_NOTIFIER } from '../notifications/notification.tokens';
import { BOOKING_STORE } from './booking.tokens';
import { BookingService } from './booking.service';
import { PrismaBookingStore } from './prisma-booking.store';
import { PublicBookingController } from './public-booking.controller';

@Module({
  imports: [TenantDatabaseModule, TenancyModule, AuthModule],
  controllers: [
    PublicBookingController,
    CalendarController,
    CustomersController,
    InboxController,
  ],
  providers: [
    BookingService,
    InboxService,
    NotificationService,
    PrismaInboxStore,
    { provide: INBOX_STORE, useExisting: PrismaInboxStore },
    PublicTenantGuard,
    PrismaBookingStore,
    { provide: BOOKING_STORE, useExisting: PrismaBookingStore },
    { provide: BOOKING_NOTIFIER, useExisting: NotificationService },
  ],
})
export class BookingModule {}
