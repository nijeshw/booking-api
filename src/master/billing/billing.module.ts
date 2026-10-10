import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env';
import { AuthModule } from '../../auth/auth.module';
import { MasterDatabaseModule } from '../database/database.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { BILLING_STORE, STRIPE_GATEWAY } from './billing.tokens';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { PrismaBillingStore } from './prisma-billing.store';
import {
  StripeSdkGateway,
  UnconfiguredStripeGateway,
  type StripeGateway,
} from './stripe.gateway';

@Module({
  imports: [MasterDatabaseModule, AuthModule, TenancyModule],
  controllers: [BillingController],
  providers: [
    BillingService,
    PrismaBillingStore,
    { provide: BILLING_STORE, useExisting: PrismaBillingStore },
    {
      provide: STRIPE_GATEWAY,
      useFactory: (config: ConfigService<Env, true>): StripeGateway => {
        const secretKey = config.get('STRIPE_SECRET_KEY', { infer: true });
        const webhookSecret = config.get('STRIPE_WEBHOOK_SECRET', {
          infer: true,
        });
        if (!secretKey || !webhookSecret) {
          return new UnconfiguredStripeGateway();
        }
        return new StripeSdkGateway(secretKey, webhookSecret);
      },
      inject: [ConfigService],
    },
  ],
})
export class BillingModule {}
