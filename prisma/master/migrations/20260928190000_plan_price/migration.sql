-- Stripe Price id used to start a subscription checkout. Null until the price is created.
ALTER TABLE "Plan" ADD COLUMN "stripePriceId" TEXT;

CREATE UNIQUE INDEX "Plan_stripePriceId_key" ON "Plan"("stripePriceId");
