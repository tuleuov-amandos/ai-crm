"use client";

import { useCallback, useMemo } from "react";
import {
  QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { pipelineStagesService } from "@/services/pipelineStages.service";
import { findDealStage, stageLabel } from "@/lib/pipelineStages";
import { applyOpenStageOrder } from "@/lib/pipelineStageSettings";
import { useApiError } from "@/hooks/useApiError";
import { dealKeys } from "@/hooks/useDeals";
import { contactKeys } from "@/hooks/useContacts";
import type {
  CreatePipelineStageBodyType,
  PipelineStage,
  UpdatePipelineStageBodyType,
} from "@/lib/validations/pipelineStages.schema";

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

// ─────────────────────────────────────────
// INVALIDATION — after any stage mutation
// ─────────────────────────────────────────
// Stage names, colors and order are shown everywhere deals are, and a deleted
// stage moves its deals, so every deal-derived query is refetched: the board
// and list view and deal detail (["deals", ...]), contact cards with their
// deals (["contacts", ...]), the dashboard (["dashboard", period]) and all
// reports (["reports", ...]). The dashboard and reports keys are inline in
// their pages, hence the literals.
export const invalidatePipelineStageDependents = (queryClient: QueryClient) =>
  Promise.all([
    queryClient.invalidateQueries({ queryKey: pipelineStageKeys.all }),
    queryClient.invalidateQueries({ queryKey: dealKeys.all }),
    queryClient.invalidateQueries({ queryKey: contactKeys.all }),
    queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
    queryClient.invalidateQueries({ queryKey: ["reports"] }),
  ]);

// ─────────────────────────────────────────
// CREATE STAGE — new open stage goes before WON
// ─────────────────────────────────────────
// Errors are handled by the caller: a taken name is shown at the name field.
export const useCreatePipelineStage = () => {
  const queryClient = useQueryClient();
  const t = useTranslations("settings.pipelineStages.toasts");

  return useMutation({
    mutationFn: (data: CreatePipelineStageBodyType) =>
      pipelineStagesService.create(data),
    onSuccess: () => {
      invalidatePipelineStageDependents(queryClient);
      toast.success(t("createSuccess"));
    },
  });
};

// ─────────────────────────────────────────
// UPDATE STAGE — only changed fields, WON/LOST only name
// ─────────────────────────────────────────
export const useUpdatePipelineStage = () => {
  const queryClient = useQueryClient();
  const t = useTranslations("settings.pipelineStages.toasts");

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdatePipelineStageBodyType }) =>
      pipelineStagesService.update(id, data),
    onSuccess: () => {
      invalidatePipelineStageDependents(queryClient);
      toast.success(t("updateSuccess"));
    },
  });
};

// ─────────────────────────────────────────
// REORDER STAGES — optimistic via the stages cache
// ─────────────────────────────────────────
// The response carries no dealCount, so the cache is refetched instead of
// being replaced with it.
export const useReorderPipelineStages = () => {
  const queryClient = useQueryClient();
  const t = useTranslations("settings.pipelineStages.toasts");
  const getApiError = useApiError();

  return useMutation({
    mutationFn: (stageIds: string[]) =>
      pipelineStagesService.reorder({ stageIds }),

    onMutate: async (stageIds) => {
      await queryClient.cancelQueries({ queryKey: pipelineStageKeys.list() });
      const previous = queryClient.getQueryData<PipelineStage[]>(
        pipelineStageKeys.list(),
      );
      if (previous) {
        queryClient.setQueryData<PipelineStage[]>(
          pipelineStageKeys.list(),
          applyOpenStageOrder(previous, stageIds),
        );
      }
      return { previous };
    },

    onError: (error, _stageIds, context) => {
      if (context?.previous) {
        queryClient.setQueryData(pipelineStageKeys.list(), context.previous);
      }
      toast.error(getApiError(error, t("reorderError")));
    },

    onSuccess: () => {
      invalidatePipelineStageDependents(queryClient);
    },
  });
};

// ─────────────────────────────────────────
// DELETE STAGE — its deals move to targetStageId
// ─────────────────────────────────────────
export const useDeletePipelineStage = () => {
  const queryClient = useQueryClient();
  const t = useTranslations("settings.pipelineStages.toasts");
  const getApiError = useApiError();

  return useMutation({
    mutationFn: ({ id, targetStageId }: { id: string; targetStageId: string }) =>
      pipelineStagesService.delete(id, targetStageId),
    onSuccess: () => {
      invalidatePipelineStageDependents(queryClient);
      toast.success(t("deleteSuccess"));
    },
    onError: (error) => {
      toast.error(getApiError(error, t("deleteError")));
    },
  });
};
