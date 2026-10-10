INSERT INTO "Permission" ("id", "key", "label") VALUES
    ('22222222-2222-4222-8222-222222222211', 'services.manage', 'Add, edit, and delete services'),
    ('22222222-2222-4222-8222-222222222212', 'staff.manage', 'Add, edit, and delete staff');

UPDATE "Permission"
SET "label" = 'Change branding, hours, and time off'
WHERE "key" = 'setup.manage';

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT '11111111-1111-4111-8111-111111111102', "id" FROM "Permission"
WHERE "key" IN ('services.manage', 'staff.manage');
