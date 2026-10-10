DROP INDEX "UserTenant_tenantId_role_idx";
ALTER TABLE "UserTenant" DROP COLUMN "role";
DROP TYPE "TenantRole";
CREATE INDEX "UserTenant_tenantId_idx" ON "UserTenant"("tenantId");
