-- RDS allows btree_gist. The exclusion constraint stops two active
-- appointments for the same staff member from occupying overlapping time,
-- including buffers stored on blockStart and blockEnd.
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "BusinessProfile"
ADD CONSTRAINT "BusinessProfile_singleton" CHECK ("singletonKey" = 1);

ALTER TABLE "BookingPolicy"
ADD CONSTRAINT "BookingPolicy_singleton" CHECK ("singletonKey" = 1);

ALTER TABLE "BookingPolicy"
ADD CONSTRAINT "BookingPolicy_windows" CHECK (
  "minNoticeMinutes" >= 0
  AND "maxAdvanceDays" > 0
  AND "cancellationWindowMinutes" >= 0
  AND "slotIntervalMinutes" > 0
  AND "reminderLeadMinutes" >= 0
);

ALTER TABLE "WeeklyHours"
ADD CONSTRAINT "WeeklyHours_weekday" CHECK ("weekday" BETWEEN 1 AND 7);

ALTER TABLE "WeeklyHours"
ADD CONSTRAINT "WeeklyHours_minutes" CHECK (
  "startMinute" >= 0
  AND "endMinute" <= 1440
  AND "startMinute" < "endMinute"
);

ALTER TABLE "Service"
ADD CONSTRAINT "Service_duration" CHECK ("durationMinutes" > 0);

ALTER TABLE "Service"
ADD CONSTRAINT "Service_price" CHECK ("priceAmountMinor" >= 0);

ALTER TABLE "Service"
ADD CONSTRAINT "Service_buffers" CHECK (
  "bufferBeforeMinutes" >= 0
  AND "bufferAfterMinutes" >= 0
);

ALTER TABLE "Service"
ADD CONSTRAINT "Service_deposit_percent" CHECK (
  "depositPercent" IS NULL
  OR ("depositPercent" >= 0 AND "depositPercent" <= 100)
);

ALTER TABLE "Service"
ADD CONSTRAINT "Service_deposit_amount" CHECK (
  "depositAmountMinor" IS NULL
  OR "depositAmountMinor" >= 0
);

ALTER TABLE "TimeOff"
ADD CONSTRAINT "TimeOff_range" CHECK ("endsAt" > "startsAt");

ALTER TABLE "Appointment"
ADD CONSTRAINT "Appointment_range" CHECK (
  "endAt" > "startAt"
  AND "blockEnd" > "blockStart"
);

ALTER TABLE "Appointment"
ADD CONSTRAINT "Appointment_price" CHECK (
  "priceAmountMinor" >= 0
  AND "depositAmountMinor" >= 0
);

ALTER TABLE "Appointment"
ADD CONSTRAINT "Appointment_buffers" CHECK (
  "bufferBeforeMinutes" >= 0
  AND "bufferAfterMinutes" >= 0
);

ALTER TABLE "Payment"
ADD CONSTRAINT "Payment_amount" CHECK ("amountMinor" >= 0);

ALTER TABLE "Appointment"
ADD CONSTRAINT "Appointment_staff_block_no_overlap"
EXCLUDE USING gist (
  "staffId" WITH =,
  tstzrange("blockStart", "blockEnd", '[)') WITH &&
)
WHERE ("status" <> 'CANCELLED');
