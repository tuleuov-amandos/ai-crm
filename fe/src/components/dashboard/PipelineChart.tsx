"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  CardAction,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getFunnelColor } from "@/lib/pipelineColors";
import { useShortValue } from "@/lib/format";
import { useStageLabel } from "@/hooks/usePipelineStages";

type FunnelStage = {
  name: string;
  // legacyKey of the stage, null for a custom stage
  key: string | null;
  stageId?: string;
  legacyKey?: string | null;
  count: number;
  value: number;
};

// stageId/legacyKey are missing in a dashboard response cached before them.
const legacyKeyOf = (stage: FunnelStage) =>
  stage.legacyKey !== undefined ? stage.legacyKey : stage.key;

// Funnel colors stay on the purple gradient: by legacyKey for a default
// stage, by position for a custom one.
const colorOf = (stage: FunnelStage, index: number) =>
  getFunnelColor(legacyKeyOf(stage), index);

const keyOf = (stage: FunnelStage, index: number) =>
  stage.stageId ?? stage.key ?? String(index);

interface PipelineChartProps {
  stages?: FunnelStage[];
  totalCount?: number;
  totalValue?: number;
  isLoading?: boolean;
}

export function PipelineChart({
  stages = [],
  totalCount = 0,
  totalValue = 0,
  isLoading = false,
}: PipelineChartProps) {
  const t = useTranslations("dashboard.pipelineChart");
  const stageLabel = useStageLabel();
  const shortValue = useShortValue();
  const maxCount = stages.reduce((max, s) => Math.max(max, s.count), 0) || 1;
  const labelOf = (stage: FunnelStage) =>
    stageLabel({ id: stage.stageId, name: stage.name, legacyKey: legacyKeyOf(stage) });

  return (
    <Card className="shadow-none border-border/70 gap-0 py-0 h-full flex flex-col">
      <CardHeader className="border-b px-5 py-4 max-md:flex max-md:flex-wrap max-md:items-center max-md:justify-between max-md:gap-x-3">
        <div>
          <CardTitle className="text-sm tracking-tight">{t("title")}</CardTitle>
          <CardDescription className="text-xs mt-0.5">
            {t("subtitle")}
          </CardDescription>
        </div>
        <CardAction>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 text-primary hover:text-primary hover:bg-secondary/60 text-xs px-2 max-md:h-10 max-md:px-3"
            asChild
          >
            <Link href="/pipeline">
              {t("viewPipeline")}
              <ArrowRight className="size-3" />
            </Link>
          </Button>
        </CardAction>
      </CardHeader>

      {isLoading ? (
        <CardContent className="px-5 py-5 flex-1 space-y-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Skeleton className="size-2 rounded-sm" />
                  <Skeleton className="h-4 w-20" />
                </div>
                <div className="flex items-center gap-2">
                  <Skeleton className="h-3 w-10" />
                  <Skeleton className="h-4 w-5" />
                </div>
              </div>
              <Skeleton className="h-6 w-full" />
            </div>
          ))}
        </CardContent>
      ) : (
        <CardContent className="px-5 py-5 flex-1 space-y-4">
          {stages.map((stage, i) => {
            const widthPct = (stage.count / maxCount) * 100;
            const convRate =
              i > 0
                ? Math.round((stage.count / stages[i - 1].count) * 100)
                : null;

            return (
              <div key={keyOf(stage, i)} className="space-y-1.5">
                {/* Label row */}
                <div className="flex items-center justify-between max-md:gap-2">
                  <div className="flex items-center gap-2 max-md:flex-wrap max-md:gap-y-1">
                    <div
                      className="size-2 rounded-sm shrink-0"
                      style={{ background: colorOf(stage, i) }}
                    />
                    <span className="text-foreground" style={{ fontSize: 13 }}>
                      {labelOf(stage)}
                    </span>
                    {convRate !== null && !isNaN(convRate) && isFinite(convRate) && (
                      <span className="text-muted-foreground bg-muted border border-border/50 px-1.5 py-px rounded-full" style={{ fontSize: 10 }}>
                        {t("conversion", { rate: convRate })}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2.5 max-md:shrink-0">
                    <span className="text-xs text-muted-foreground">
                      {shortValue(stage.value)}
                    </span>
                    <span
                      className="text-foreground tabular-nums w-6 text-right"
                      style={{ fontSize: 14, fontWeight: 600 }}
                    >
                      {stage.count}
                    </span>
                  </div>
                </div>

                {/* Bar */}
                <div className="h-6 bg-muted rounded-md overflow-hidden">
                  <div
                    className="h-full rounded-md transition-all duration-700"
                    style={{ width: `${widthPct}%`, background: colorOf(stage, i) }}
                  />
                </div>
              </div>
            );
          })}
        </CardContent>
      )}

      {isLoading ? (
        <CardFooter className="border-t px-5 py-3 flex items-center justify-between max-md:flex-col max-md:items-start max-md:gap-2">
          <div className="flex gap-4 max-md:flex-wrap max-md:gap-x-3 max-md:gap-y-1">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center gap-1.5">
                <Skeleton className="size-1.5 rounded-sm" />
                <Skeleton className="h-3 w-10" />
              </div>
            ))}
          </div>
          <Skeleton className="h-3.5 w-28" />
        </CardFooter>
      ) : (
        <CardFooter className="border-t px-5 py-3 flex items-center justify-between max-md:flex-col max-md:items-start max-md:gap-2">
          <div className="flex gap-4 max-md:flex-wrap max-md:gap-x-3 max-md:gap-y-1">
            {stages.map((s, i) => (
              <div key={keyOf(s, i)} className="flex items-center gap-1.5">
                <div
                  className="size-1.5 rounded-sm shrink-0"
                  style={{ background: colorOf(s, i) }}
                />
                <span className="text-muted-foreground" style={{ fontSize: 11 }}>
                  {labelOf(s)}
                </span>
              </div>
            ))}
          </div>
          <span className="text-muted-foreground" style={{ fontSize: 11 }}>
            {t("footer", { count: totalCount, value: shortValue(totalValue) })}
          </span>
        </CardFooter>
      )}
    </Card>
  );
}
