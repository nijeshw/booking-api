ALTER TABLE "Plan"
ADD CONSTRAINT "Plan_amount" CHECK ("monthlyAmountMinor" >= 0);

ALTER TABLE "Plan"
ADD CONSTRAINT "Plan_trial_days" CHECK ("trialDays" >= 0);
