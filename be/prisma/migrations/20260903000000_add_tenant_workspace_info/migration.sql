-- AlterTable
-- Workspace profile fields shown on Settings → Workspace Info. All nullable:
-- workspaces that predate this migration simply have NULLs and render the
-- empty form until an ADMIN fills it in. `industry` / `companySize` store
-- stable keys ("it", "md", …) resolved to localized labels on the frontend;
-- `logoUrl` holds the Cloudinary secure URL of the workspace logo.
ALTER TABLE "Tenant"
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "website" TEXT,
  ADD COLUMN "address" TEXT,
  ADD COLUMN "companySize" TEXT,
  ADD COLUMN "industry" TEXT,
  ADD COLUMN "timezone" TEXT,
  ADD COLUMN "defaultLocale" TEXT,
  ADD COLUMN "logoUrl" TEXT;
