"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

// ── Canonical stage type ────────────────────────────────────────────────────
import { DealStage } from "@/lib/validations/deals.schema";
import { DEAL_STAGE_META } from "@/lib/dealStageMeta";

// ── The reusable badge ──────────────────────────────────────────────────────
interface StageBadgeProps {
  /** Accepts a DealStage key ("prospect") or a loose display string ("Closed Won") */
  stage: DealStage;
  className?: string;
}

export function StageBadge({ stage, className }: StageBadgeProps) {
  const t = useTranslations("dealStages");
  const meta = DEAL_STAGE_META[stage];

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 whitespace-nowrap font-medium",
        meta.badgeClass,
        className
      )}
      style={{ fontSize: 12 }}
    >
      {t(stage)}
    </span>
  );
}
