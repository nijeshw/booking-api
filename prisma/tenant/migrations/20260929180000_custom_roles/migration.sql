ALTER TABLE "Role" ADD COLUMN "label" TEXT;
ALTER TABLE "Role" ADD COLUMN "system" BOOLEAN NOT NULL DEFAULT false;

UPDATE "Role"
SET
  "label" = CASE "name"::text
    WHEN 'OWNER' THEN 'Owner'
    WHEN 'MANAGER' THEN 'Manager'
    WHEN 'STAFF' THEN 'Staff'
    ELSE initcap("name"::text)
  END,
  "system" = true;

ALTER TABLE "Role" ALTER COLUMN "label" SET NOT NULL;
ALTER TABLE "Role" ALTER COLUMN "name" TYPE TEXT USING "name"::text;

DROP TYPE "RoleName";
