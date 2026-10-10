import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { parseBody } from '../../common/parse-body';
import { CurrentTenant, TenantAccess } from '../../decorator/tenant.decorator';
import { AuthGuard } from '../../guard/auth.guard';
import { TenantGuard } from '../../guard/tenant.guard';
import type { TenantAccess as Access } from '../../master/tenancy/tenant.types';
import {
  appointmentIdSchema,
  customerQuerySchema,
  customerSchema,
} from '../booking/booking.schema';
import { BookingService } from '../booking/booking.service';
import type { CustomerView } from '../booking/booking.store';

@Controller('tenants')
@UseGuards(AuthGuard, TenantGuard)
export class CustomersController {
  constructor(private readonly booking: BookingService) {}

  @Get('customers')
  @TenantAccess({ permission: 'customers.view' })
  list(
    @CurrentTenant() access: Access,
    @Query() query: Record<string, unknown>,
  ) {
    return this.booking.customers(
      access,
      parseBody(customerQuerySchema, query).query,
    );
  }

  @Post('customers')
  @TenantAccess({ permission: 'customers.manage' })
  create(@CurrentTenant() access: Access, @Body() body: unknown) {
    return this.booking.createCustomer(access, parseBody(customerSchema, body));
  }

  @Patch('customers/:id')
  @TenantAccess({ permission: 'customers.manage' })
  update(
    @CurrentTenant() access: Access,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<CustomerView> {
    return this.booking.updateCustomer(
      access,
      parseBody(appointmentIdSchema, id),
      parseBody(customerSchema, body),
    );
  }

  @Get('customers/:id/export')
  @TenantAccess({ permission: 'customers.manage' })
  exportCustomer(@CurrentTenant() access: Access, @Param('id') id: string) {
    return this.booking.exportCustomer(
      access,
      parseBody(appointmentIdSchema, id),
    );
  }

  @Post('customers/:id/erase')
  @TenantAccess({ permission: 'customers.manage' })
  async eraseCustomer(
    @CurrentTenant() access: Access,
    @Param('id') id: string,
  ): Promise<{ status: 'erased' }> {
    await this.booking.eraseCustomer(
      access,
      parseBody(appointmentIdSchema, id),
    );
    return { status: 'erased' };
  }
}
