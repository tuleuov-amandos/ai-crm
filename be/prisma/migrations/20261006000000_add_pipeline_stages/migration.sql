-- ============================================================================
-- Custom pipeline stages, release R1 (expand).
-- Adds PipelineStage + nullable Deal.stageId next to the existing Deal.stage
-- enum column. Nothing existing is dropped or changed; reads stay on
-- Deal.stage. The backfill below is idempotent: re-running it inserts and
-- updates nothing new.
-- ============================================================================

-- CreateEnum
CREATE TYPE "PipelineStageKind" AS ENUM ('OPEN', 'WON', 'LOST');

-- AlterTable
ALTER TABLE "Deal" ADD COLUMN     "stageId" TEXT;

-- CreateTable
CREATE TABLE "PipelineStage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT 'blue',
    "order" INTEGER NOT NULL,
    "probability" INTEGER NOT NULL,
    "kind" "PipelineStageKind" NOT NULL DEFAULT 'OPEN',
    "legacyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PipelineStage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PipelineStage_tenantId_order_idx" ON "PipelineStage"("tenantId", "order");

-- CreateIndex
CREATE INDEX "Deal_tenantId_stageId_idx" ON "Deal"("tenantId", "stageId");

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "PipelineStage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PipelineStage" ADD CONSTRAINT "PipelineStage_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── Constraints Prisma cannot express (raw SQL) ────────────────────────────
-- At most one WON and one LOST stage per tenant.
CREATE UNIQUE INDEX "PipelineStage_tenantId_kind_closed_key" ON "PipelineStage"("tenantId", "kind") WHERE "kind" IN ('WON', 'LOST');

-- legacyKey is unique per tenant when set.
CREATE UNIQUE INDEX "PipelineStage_tenantId_legacyKey_key" ON "PipelineStage"("tenantId", "legacyKey") WHERE "legacyKey" IS NOT NULL;

-- Probability is fixed for closed stages and below 100 for open ones.
ALTER TABLE "PipelineStage" ADD CONSTRAINT "PipelineStage_probability_by_kind_check" CHECK (
    ("kind" = 'WON' AND "probability" = 100)
    OR ("kind" = 'LOST' AND "probability" = 0)
    OR ("kind" = 'OPEN' AND "probability" BETWEEN 0 AND 99)
);

-- ─── Backfill 1: default stages for every existing tenant ───────────────────
-- Same five stages as createDefaultStages() in
-- src/common/pipeline-stages/default-pipeline-stages.ts. Names are the current
-- Russian labels from fe/messages/ru.json `dealStages`.
-- Ids: md5(random() || clock_timestamp()) needs no extension on any Postgres
-- version (gen_random_uuid() is only built in from PG13).
INSERT INTO "PipelineStage" ("id", "tenantId", "name", "color", "order", "probability", "kind", "legacyKey", "createdAt", "updatedAt")
SELECT
  md5(random()::text || clock_timestamp()::text),
  t."id", v.name, v.color, v.sort_order, v.probability, v.kind::"PipelineStageKind", v.legacy_key,
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Tenant" t
CROSS JOIN (VALUES
  ('PROSPECT',    'Лид',                'blue',   0, 10,  'OPEN'),
  ('QUALIFIED',   'Контакт установлен', 'purple', 1, 30,  'OPEN'),
  ('PROPOSAL',    'Предложение',        'orange', 2, 60,  'OPEN'),
  ('CLOSED_WON',  'Выиграно',           'green',  3, 100, 'WON'),
  ('CLOSED_LOST', 'Проиграно',          'red',    4, 0,   'LOST')
) AS v(legacy_key, name, color, sort_order, probability, kind)
WHERE NOT EXISTS (
  SELECT 1 FROM "PipelineStage" ps
  WHERE ps."tenantId" = t."id" AND ps."legacyKey" = v.legacy_key
);

-- ─── Backfill 2: Deal.stageId from Deal.stage ───────────────────────────────
-- ALL deals, including soft-deleted ones (no "deletedAt" filter on purpose).
-- "updatedAt" is left untouched: this is not a user edit.
UPDATE "Deal" d
SET "stageId" = ps."id"
FROM "PipelineStage" ps
WHERE ps."tenantId" = d."tenantId"
  AND ps."legacyKey" = d."stage"::text
  AND d."stageId" IS NULL;

-- Fail the migration loudly rather than leave a deal without stageId.
DO $$
DECLARE
  missing integer;
BEGIN
  SELECT count(*) INTO missing FROM "Deal" WHERE "stageId" IS NULL;
  IF missing > 0 THEN
    RAISE EXCEPTION 'add_pipeline_stages backfill: % deal(s) left without stageId', missing;
  END IF;
END $$;
