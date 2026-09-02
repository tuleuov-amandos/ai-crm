-- CreateEnum
CREATE TYPE "TenantStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED');

-- AlterTable
-- New workspaces created after this migration default to PENDING and must be
-- approved manually (see PATCH /internal/tenants/:id/status) before they get
-- full CRM access.
ALTER TABLE "Tenant" ADD COLUMN "status" "TenantStatus" NOT NULL DEFAULT 'PENDING';

-- Grandfather every workspace that already exists at deploy time: they predate
-- the manual-approval flow, so they stay fully active. Only sign-ups from now
-- on land in PENDING (via the column default above).
UPDATE "Tenant" SET "status" = 'ACTIVE';
