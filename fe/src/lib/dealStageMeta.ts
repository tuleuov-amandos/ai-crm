import { DealStage } from "@/lib/validations/deals.schema";

export const DEAL_STAGE_META: Record<
  DealStage,
  { dot: string; bg: string; text: string; badgeClass: string }
> = {
  PROSPECT: { dot: "#3b82f6", bg: "#dbeafe", text: "#1d4ed8", badgeClass: "bg-blue-100 text-blue-700" },
  QUALIFIED: { dot: "#a855f7", bg: "#f3e8ff", text: "#7e22ce", badgeClass: "bg-purple-100 text-purple-700" },
  PROPOSAL: { dot: "#f97316", bg: "#ffedd5", text: "#c2410c", badgeClass: "bg-orange-100 text-orange-700" },
  CLOSED_WON: { dot: "#22c55e", bg: "#dcfce7", text: "#15803d", badgeClass: "bg-green-100 text-green-700" },
  CLOSED_LOST: { dot: "#ef4444", bg: "#fee2e2", text: "#b91c1c", badgeClass: "bg-red-100 text-red-700" },
};
