// Re-export from deals.schema for shared use in pipeline components
export { DealStage } from "@/lib/validations/deals.schema";
import type { DealCard, DealDetail, DealStage } from "@/lib/validations/deals.schema";
import { DEAL_STAGE_META } from "@/lib/dealStageMeta";

// Alias so components can use Stage instead of DealStage (backward compat)
export type Stage = DealStage;

export type Deal = DealCard;
export type { DealDetail };

export const STAGE_CONFIG: Record<DealStage, { badgeBg: string; badgeColor: string; dot: string }> =
  Object.fromEntries(
    Object.entries(DEAL_STAGE_META).map(([key, v]) => [key, { badgeBg: v.bg, badgeColor: v.text, dot: v.dot }]),
  ) as Record<DealStage, { badgeBg: string; badgeColor: string; dot: string }>;

export const STAGES: DealStage[] = [
  "PROSPECT",
  "QUALIFIED",
  "PROPOSAL",
  "CLOSED_WON",
  "CLOSED_LOST",
];

export type Task = {
  id: string;
  title: string;
  done: boolean;
  dueDate: Date | null;
  createdAt: Date;
};
