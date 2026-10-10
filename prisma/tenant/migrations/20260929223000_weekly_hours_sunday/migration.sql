UPDATE "WeeklyHours" SET "weekday" = 0 WHERE "weekday" = 7;

ALTER TABLE "WeeklyHours" DROP CONSTRAINT "WeeklyHours_weekday";

ALTER TABLE "WeeklyHours"
ADD CONSTRAINT "WeeklyHours_weekday" CHECK ("weekday" BETWEEN 0 AND 6);
