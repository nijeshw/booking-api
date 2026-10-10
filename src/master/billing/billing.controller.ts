import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Req,
  UseGuards,
  type RawBodyRequest,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { parseBody } from '../../common/parse-body';
import {
  AllowUnpaidSubscription,
  CurrentTenant,
  TenantAccess,
} from '../../decorator/tenant.decorator';
import { AuthGuard } from '../../guard/auth.guard';
import { TenantGuard } from '../../guard/tenant.guard';
import type { TenantAccess as Access } from '../tenancy/tenant.types';
import { checkoutSchema } from './billing.schema';
import { BillingService } from './billing.service';

@Controller('billing')
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Get('plans')
  @UseGuards(AuthGuard)
  plans() {
    return this.billing.plans();
  }

  @Get('subscription')
  @UseGuards(AuthGuard, TenantGuard)
  @AllowUnpaidSubscription()
  @TenantAccess({ permission: 'billing.view' })
  subscription(@CurrentTenant() access: Access) {
    return this.billing.view(access);
  }

  @Post('checkout')
  @UseGuards(AuthGuard, TenantGuard)
  @AllowUnpaidSubscription()
  @TenantAccess({ permission: 'billing.manage' })
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  checkout(@CurrentTenant() access: Access, @Body() body: unknown) {
    return this.billing.checkout(
      access,
      parseBody(checkoutSchema, body).planId,
    );
  }

  @Post('portal')
  @UseGuards(AuthGuard, TenantGuard)
  @AllowUnpaidSubscription()
  @TenantAccess({ permission: 'billing.manage' })
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  portal(@CurrentTenant() access: Access) {
    return this.billing.portal(access);
  }

  @Post('webhook')
  webhook(@Req() request: RawBodyRequest<Request>) {
    const payload = request.rawBody;
    const signature = request.header('stripe-signature') ?? '';
    if (!payload || signature.length === 0) {
      throw new BadRequestException('Invalid Stripe signature');
    }
    return this.billing.handleWebhook(payload, signature);
  }
}
