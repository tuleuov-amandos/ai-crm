import { z } from "zod";

export const MetricTrendSchema = z.object({
  value: z.number(),
  positive: z.boolean(),
});

export const MetricCardSchema = z.object({
  label: z.string(),
  value: z.number(),
  trend: MetricTrendSchema.optional(),
  subtext: z.string().optional(),
  progress: z.object({
    current: z.number(),
    target: z.number(),
  }).optional(),
});

// key is the stage legacyKey, null for a custom stage. stageId/legacyKey (and
// stageId/stageName of recent deals) are optional: the backend caches the
// dashboard for 5 minutes, so a response cached before they existed lacks them.
export const PipelineStageSchema = z.object({
  name: z.string(),
  key: z.string().nullable(),
  stageId: z.string().optional(),
  legacyKey: z.string().nullish(),
  count: z.number(),
  value: z.number(),
});

export const LeaderboardRepSchema = z.object({
  rank: z.number(),
  userId: z.string(),
  name: z.string(),
  deals: z.number(),
  revenue: z.number(),
});

export const RecentDealSchema = z.object({
  id: z.string(),
  title: z.string(),
  company: z.string(),
  // Legacy DealStage value; null stageId means an old deal without a stage link.
  stage: z.string(),
  stageId: z.string().nullish(),
  stageName: z.string().nullish(),
  value: z.number(),
  owner: z.object({
    id: z.string(),
    name: z.string(),
  }),
  daysAgo: z.number(),
});

export const UpcomingActivitySchema = z.object({
  id: z.string(),
  type: z.string(),
  title: z.string(),
  contact: z.string(),
  company: z.string(),
  time: z.string(),
});

export const DashboardResSchema = z.object({
  metrics: z.object({
    totalDealValue: MetricCardSchema,
    openDeals: MetricCardSchema,
    winRate: MetricCardSchema,
    monthlyRevenue: MetricCardSchema,
  }),
  pipelineFunnel: z.object({
    stages: z.array(PipelineStageSchema),
    totalCount: z.number(),
    totalValue: z.number(),
  }),
  leaderboard: z.array(LeaderboardRepSchema),
  recentDeals: z.array(RecentDealSchema),
  upcomingActivities: z.array(UpcomingActivitySchema),
});

export type DashboardRes = z.infer<typeof DashboardResSchema>;
export type MetricCardType = z.infer<typeof MetricCardSchema>;
export type PipelineStageType = z.infer<typeof PipelineStageSchema>;
export type LeaderboardRepType = z.infer<typeof LeaderboardRepSchema>;
export type RecentDealType = z.infer<typeof RecentDealSchema>;
export type UpcomingActivityType = z.infer<typeof UpcomingActivitySchema>;
export type DashboardPeriod = "week" | "month" | "quarter";
