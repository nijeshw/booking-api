-- Customer cancel and reschedule links store a hash, not the token from the email.
ALTER TABLE "Appointment" ADD COLUMN "manageTokenHash" TEXT;

CREATE UNIQUE INDEX "Appointment_manageTokenHash_key" ON "Appointment"("manageTokenHash");
