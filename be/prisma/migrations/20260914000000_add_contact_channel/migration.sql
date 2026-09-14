-- AlterTable
-- Single-select channel classification for a Contact (e.g. HORECA, RETAIL),
-- independent from the existing `tags` multi-select. NULL means "not set".
ALTER TABLE "Contact" ADD COLUMN "channel" TEXT;
