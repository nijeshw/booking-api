ALTER TYPE "MembershipStatus" RENAME TO "UserTenantStatus";
ALTER TABLE "Membership" RENAME TO "UserTenant";
ALTER TABLE "UserTenant" RENAME CONSTRAINT "Membership_pkey" TO "UserTenant_pkey";
ALTER INDEX "Membership_tenantId_role_idx" RENAME TO "UserTenant_tenantId_role_idx";
ALTER INDEX "Membership_userId_tenantId_key" RENAME TO "UserTenant_userId_tenantId_key";
ALTER TABLE "UserTenant" RENAME CONSTRAINT "Membership_userId_fkey" TO "UserTenant_userId_fkey";
ALTER TABLE "UserTenant" RENAME CONSTRAINT "Membership_tenantId_fkey" TO "UserTenant_tenantId_fkey";
