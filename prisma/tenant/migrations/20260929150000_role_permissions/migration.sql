CREATE TABLE "Permission" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Permission_key_key" ON "Permission"("key");

CREATE TABLE "RolePermission" (
    "roleId" UUID NOT NULL,
    "permissionId" UUID NOT NULL,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("roleId","permissionId")
);

ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "Permission" ("id", "key", "label") VALUES
    ('22222222-2222-4222-8222-222222222201', 'setup.view', 'View setup'),
    ('22222222-2222-4222-8222-222222222202', 'setup.manage', 'Change setup, services, staff, and hours'),
    ('22222222-2222-4222-8222-222222222203', 'calendar.view', 'View the calendar'),
    ('22222222-2222-4222-8222-222222222204', 'calendar.manage', 'Cancel bookings'),
    ('22222222-2222-4222-8222-222222222205', 'customers.view', 'View customers'),
    ('22222222-2222-4222-8222-222222222206', 'customers.manage', 'Add, export, and erase customers'),
    ('22222222-2222-4222-8222-222222222207', 'reports.view', 'View reports'),
    ('22222222-2222-4222-8222-222222222208', 'billing.view', 'View billing'),
    ('22222222-2222-4222-8222-222222222209', 'billing.manage', 'Change the subscription'),
    ('22222222-2222-4222-8222-222222222210', 'people.manage', 'Choose who can open the business');

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT '11111111-1111-4111-8111-111111111102', "id" FROM "Permission"
WHERE "key" NOT IN ('billing.manage', 'people.manage');

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT '11111111-1111-4111-8111-111111111103', "id" FROM "Permission"
WHERE "key" IN ('setup.view', 'calendar.view', 'customers.view', 'reports.view', 'billing.view');
