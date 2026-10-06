"use client";

import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { pipelineStagesService } from "@/services/pipelineStages.service";
import { findDealStage, stageLabel } from "@/lib/pipelineStages";

// ─────────────────────────────────────────
// QUERY KEYS — source of truth for cache
// ─────────────────────────────────────────
export const pipelineStageKeys = {
  all: ["pipeline-stages"] as const,
  list: () => [...pipelineStageKeys.all, "list"] as const,
};

// ─────────────────────────────────────────
// GET STAGES — the tenant's pipeline stages by order
// ─────────────────────────────────────────
// While the stages load `stages` is empty and lookups return undefined, so
// callers render a neutral fallback instead of crashing.
export const usePipelineStages = () => {
  const query = useQuery({
    queryKey: pipelineStageKeys.list(),
    queryFn: pipelineStagesService.getAll,
    staleTime: 5 * 60_000,
  });

  const stages = useMemo(
    () => [...(query.data ?? [])].sort((a, b) => a.order - b.order),
    [query.data],
  );

  const stagesById = useMemo(
    () => new Map(stages.map((stage) => [stage.id, stage])),
    [stages],
  );

  const getStage = useCallback(
    (id?: string | null) => (id ? stagesById.get(id) : undefined),
    [stagesById],
  );

  // Stage of a deal by stageId, legacy `stage` only when stageId is null.
  const getDealStage = useCallback(
    (deal: { stageId?: string | null; stage?: string | null }) =>
      findDealStage(stages, deal),
    [stages],
  );

  return {
    stages,
    getStage,
    getDealStage,
    isLoading: query.isLoading,
    isError: query.isError,
  };
};

// ─────────────────────────────────────────
// STAGE LABEL — localized name of a default stage, own name otherwise
// ─────────────────────────────────────────
// legacyKey is looked up by id when the caller does not have it (board columns
// and API payloads carry only id and name).
export const useStageLabel = () => {
  const t = useTranslations("dealStages");
  const { getStage } = usePipelineStages();

  return useCallback(
    (stage: { id?: string | null; name: string; legacyKey?: string | null }) =>
      stageLabel(
        {
          name: stage.name,
          legacyKey:
            stage.legacyKey !== undefined
              ? stage.legacyKey
              : getStage(stage.id)?.legacyKey,
        },
        (legacyKey) => t(legacyKey),
      ),
    [t, getStage],
  );
};
