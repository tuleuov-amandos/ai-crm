// ─── Stage palette ───────────────────────────────────────────────────────────
// PipelineStage.color is a palette key. Open stages use the first eight keys;
// the backend reserves green for the WON stage and red for the LOST stage.
// blue/purple/orange/green/red keep the colors of the old five DealStage
// values (Lead, Contacted, Proposal, Won, Lost).
export const PIPELINE_COLOR_KEYS = [
  "blue",
  "purple",
  "orange",
  "teal",
  "pink",
  "yellow",
  "gray",
  "indigo",
  "green",
  "red",
] as const;

export type PipelineColorKey = (typeof PIPELINE_COLOR_KEYS)[number];

export type StageColors = { dot: string; bg: string; text: string };

export const PIPELINE_COLORS: Record<PipelineColorKey, StageColors> = {
  blue: { dot: "#3b82f6", bg: "#dbeafe", text: "#1d4ed8" },
  purple: { dot: "#a855f7", bg: "#f3e8ff", text: "#7e22ce" },
  orange: { dot: "#f97316", bg: "#ffedd5", text: "#c2410c" },
  teal: { dot: "#14b8a6", bg: "#ccfbf1", text: "#0f766e" },
  pink: { dot: "#ec4899", bg: "#fce7f3", text: "#be185d" },
  yellow: { dot: "#eab308", bg: "#fef9c3", text: "#a16207" },
  gray: { dot: "#6b7280", bg: "#f3f4f6", text: "#374151" },
  indigo: { dot: "#6366f1", bg: "#e0e7ff", text: "#4338ca" },
  green: { dot: "#22c55e", bg: "#dcfce7", text: "#15803d" },
  red: { dot: "#ef4444", bg: "#fee2e2", text: "#b91c1c" },
};

function isPipelineColorKey(key: string): key is PipelineColorKey {
  return Object.hasOwn(PIPELINE_COLORS, key);
}

// Colors of a stage by its palette key; gray for an unknown or empty key.
export function getStageColors(colorKey?: string | null): StageColors {
  return colorKey && isPipelineColorKey(colorKey)
    ? PIPELINE_COLORS[colorKey]
    : PIPELINE_COLORS.gray;
}

// ─── Funnel charts ───────────────────────────────────────────────────────────
// The dashboard pipeline chart and the reports conversion funnel use their own
// purple gradient, not the stage palette. A default stage keeps its old color
// by legacyKey; a custom stage gets a gradient step by its funnel position.
const FUNNEL_COLORS: Record<string, { funnel: string; bg: string; text: string }> = {
  PROSPECT: { funnel: "#C4C0F0", bg: "#EEEDFE", text: "#534AB7" },
  QUALIFIED: { funnel: "#9B94E3", bg: "#E6F4D7", text: "#3B6D11" },
  PROPOSAL: { funnel: "#7168CC", bg: "#FEF3E2", text: "#854F0B" },
  CLOSED_WON: { funnel: "#534AB7", bg: "#DCFCE7", text: "#166534" },
  CLOSED_LOST: { funnel: "#E11D48", bg: "#FEE2E2", text: "#A32D2D" },
};

const FUNNEL_GRADIENT = ["#C4C0F0", "#9B94E3", "#7168CC", "#534AB7"];

function funnelColorsOf(legacyKey?: string | null) {
  return legacyKey && Object.hasOwn(FUNNEL_COLORS, legacyKey)
    ? FUNNEL_COLORS[legacyKey]
    : undefined;
}

// Bar color of a funnel step; index is the step's position in the funnel.
export function getFunnelColor(legacyKey: string | null | undefined, index: number): string {
  const step = Number.isInteger(index) ? Math.abs(index) : 0;
  return funnelColorsOf(legacyKey)?.funnel ?? FUNNEL_GRADIENT[step % FUNNEL_GRADIENT.length];
}

// Badge colors next to funnel charts (dashboard recent deals): a default stage
// keeps its old funnel badge colors, any other stage uses its palette color.
export function getFunnelBadgeColors(
  legacyKey: string | null | undefined,
  colorKey?: string | null,
): { bg: string; text: string } {
  const legacy = funnelColorsOf(legacyKey);
  if (legacy) return { bg: legacy.bg, text: legacy.text };
  const { bg, text } = getStageColors(colorKey);
  return { bg, text };
}
