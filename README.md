# booking-api

NestJS API for Nexora. PostgreSQL is AWS RDS. This service does not run a database.

## RDS setup

1. Use an RDS for PostgreSQL instance. Keep it private to the API security group.
2. Connect with the RDS master user and create the two setup databases:

```sql
CREATE DATABASE nexora_master;
CREATE DATABASE nexora_tenant_dev;
```

3. Copy `.env.example` to `.env` and set the host, user, and password.
4. Install dependencies, then apply migrations:

```
yarn
yarn db:migrate:master
yarn db:migrate:tenant
yarn db:seed:plans
```

`nexora_master` holds users, memberships, the tenant registry, plans, and SaaS billing.

`nexora_tenant_dev` is the schema target for the per-business database. Each business will get its own database on the same instance, named `nexora_t_` plus the tenant id. The API builds that URL on the server. Clients never send a database name.

Put `sslmode=require` on both database URLs. For certificate verification, use `sslmode=verify-full` and add the RDS global bundle as `sslrootcert` in those same URLs.

`btree_gist` must be available on the instance. It is on the RDS PostgreSQL extension allow list. The migration creates it in each tenant database.

Apply schema changes with `prisma migrate deploy`. Do not point `migrate dev` at RDS: it tries to create a shadow database.

## Scripts

```
yarn start:dev
yarn test
yarn test:e2e
yarn lint
yarn build
```

`GET /health` is the process check. `GET /health/ready` runs `SELECT 1` on the master database and returns 503 when RDS cannot be reached, without the database error text.


Listen webhook on localhost cli 
stripe listen --forward-to localhost:3200/billing/webhook --events checkout.session.completed,checkout.session.async_payment_succeeded,checkout.session.async_payment_failed,customer.subscription.updated,customer.subscription.deleted,invoice.paid,invoice.payment_failed,charge.dispute.created,charge.refunded,radar.early_fraud_warning.created