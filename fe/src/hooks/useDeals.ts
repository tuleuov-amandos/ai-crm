"use client";

import { useEffect } from "react";
import { dealsService } from "@/services/deals.service";
import { useDealPipelineStore } from "@/stores/dealCards-store";
import { useShallow } from 'zustand/react/shallow'
import { ApiError } from "@/lib/types/error";
import { useApiError } from "@/hooks/useApiError";
import { contactKeys } from "@/hooks/useContacts";
import {
  CreateDealBodyType,
  UpdateDealBodyType,
  UpdateDealStageBodyType,
  UpdateDealPaymentStatusBodyType,
} from "@/lib/validations/deals.schema";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

// ─────────────────────────────────────────
// QUERY KEYS — source of truth for cache
// ─────────────────────────────────────────
export const dealKeys = {
  all: ["deals"] as const,
  pipeline: (ownerId?: string, dateFrom?: string, dateTo?: string, search?: string, isPaid?: boolean, includeArchived?: boolean) =>
    [...dealKeys.all, "pipeline", ownerId, dateFrom, dateTo, search, isPaid, includeArchived] as const,
  details: () => [...dealKeys.all, "detail"] as const,
  detail: (id: string) => [...dealKeys.details(), id] as const,
};

// ─────────────────────────────────────────
// GET PIPELINE — fetch board columns (GET /deals/board) and sync to Zustand
// ─────────────────────────────────────────
export const useGetPipeline = (params?: { ownerId?: string; dateFrom?: string; dateTo?: string; search?: string; isPaid?: boolean; includeArchived?: boolean }) => {
  const t = useTranslations("pipeline");

  const { setBoard, setLoading, setError } = useDealPipelineStore(
    useShallow((state) => ({
      setBoard: state.setBoard,
      setLoading: state.setLoading,
      setError: state.setError })
    )
  )

  const query = useQuery({
    queryKey: dealKeys.pipeline(params?.ownerId, params?.dateFrom, params?.dateTo, params?.search, params?.isPaid, params?.includeArchived),
    queryFn: () => dealsService.getBoard(params),
    staleTime: 30_000,
  });

  useEffect(() => {
    if (query.data) {
      setBoard(query.data);
      setError(null);
    }
  }, [query.data]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setLoading(query.isLoading);
  }, [query.isLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (query.error) {
      setError((query.error as Error).message ?? t("loadError"));
    }
  }, [query.error]); // eslint-disable-line react-hooks/exhaustive-deps

  return query;
};

// ─────────────────────────────────────────
// GET DEAL DETAIL — used on /pipeline/[id] page
// ─────────────────────────────────────────
export const useGetDealDetail = (id: string) => {
  return useQuery({
    queryKey: dealKeys.detail(id),
    queryFn: () => dealsService.getById(id),
    enabled: !!id,
    staleTime: 30_000,
  });
};

// ─────────────────────────────────────────
// CREATE DEAL
// ─────────────────────────────────────────
export const useCreateDeal = () => {
  const queryClient = useQueryClient();
  const t = useTranslations("pipeline.toasts");
  const getApiError = useApiError();

  return useMutation({
    mutationFn: (data: CreateDealBodyType) => dealsService.create(data),
    onSuccess: () => {
      // invalidate pipeline to refetch and sync back to store
      queryClient.invalidateQueries({ queryKey: [...dealKeys.all, "pipeline"] });
      toast.success(t("createSuccess"));
    },
    onError: (error: ApiError) => {
      toast.error(getApiError(error, t("createError")));
    },
  });
};

// ─────────────────────────────────────────
// UPDATE DEAL STAGE — optimistic via Zustand
// ─────────────────────────────────────────
export const useUpdateDealStage = () => {
  const queryClient = useQueryClient();
  const t = useTranslations("pipeline.toasts");
  const getApiError = useApiError();
  const { rollbackMoveDeal } = useDealPipelineStore();

  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      // PipelineStage ids of the optimistic move, used for the rollback
      from: string;
      to: string;
      data: UpdateDealStageBodyType;
    }) => dealsService.updateStage(id, data),

    // optimistic update was already called in KanbanBoard (moveDeal)
    // if API fails -> rollback
    onError: (error: ApiError, { id, from, to }) => {
      rollbackMoveDeal(id, from, to);
      toast.error(getApiError(error, t("stageError")));
    },

    onSuccess: () => {
      // invalidate to ensure server state is synchronized
      queryClient.invalidateQueries({ queryKey: [...dealKeys.all, "pipeline"] });
    },
  });
};

// ─────────────────────────────────────────
// UPDATE DEAL (title, value, closeDate, note)
// ─────────────────────────────────────────
export const useUpdateDeal = (dealId: string) => {
  const queryClient = useQueryClient();
  const t = useTranslations("pipeline.toasts");
  const getApiError = useApiError();

  return useMutation({
    mutationFn: (data: UpdateDealBodyType) => dealsService.update(dealId, data),
    onSuccess: () => {
      // invalidate both pipeline and detail
      queryClient.invalidateQueries({ queryKey: [...dealKeys.all, "pipeline"] });
      queryClient.invalidateQueries({ queryKey: dealKeys.detail(dealId) });
      toast.success(t("updateSuccess"));
    },
    onError: (error: ApiError) => {
      toast.error(getApiError(error, t("updateError")));
    },
  });
};

// ─────────────────────────────────────────
// UPDATE DEAL PAYMENT STATUS (isPaid)
// ─────────────────────────────────────────
export const useUpdateDealPaymentStatus = (dealId: string) => {
  const queryClient = useQueryClient();
  const t = useTranslations("pipeline.toasts");
  const getApiError = useApiError();

  return useMutation({
    mutationFn: (data: UpdateDealPaymentStatusBodyType) =>
      dealsService.updatePaymentStatus(dealId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...dealKeys.all, "pipeline"] });
      queryClient.invalidateQueries({ queryKey: dealKeys.detail(dealId) });
      toast.success(t("paymentStatusSuccess"));
    },
    onError: (error: ApiError) => {
      toast.error(getApiError(error, t("paymentStatusError")));
    },
  });
};

// ─────────────────────────────────────────
// DELETE DEAL (soft delete)
// ─────────────────────────────────────────
export const useDeleteDeal = () => {
  const queryClient = useQueryClient();
  const t = useTranslations("pipeline.toasts");
  const getApiError = useApiError();
  const { removeDeal } = useDealPipelineStore();

  return useMutation({
    // stageId narrows the store lookup; the deal is found by id without it
    mutationFn: ({ id }: { id: string; stageId?: string | null }) =>
      dealsService.delete(id),

    // optimistic: delete from store immediately
    onMutate: ({ id, stageId }) => {
      removeDeal(id, stageId);
    },

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...dealKeys.all, "pipeline"] });
      toast.success(t("deleteSuccess"));
    },

    onError: (error: ApiError) => {
      // rollback: refetch pipeline to restore accidentally deleted deal
      queryClient.invalidateQueries({ queryKey: [...dealKeys.all, "pipeline"] });
      toast.error(getApiError(error, t("deleteError")));
    },
  });
};

// ─────────────────────────────────────────
// ARCHIVE / UNARCHIVE DEALS (no optimistic update)
// ─────────────────────────────────────────
// The board, list view, deal detail and contact cards show archivedAt, so all
// deal and contact queries are refetched. Dashboard and reports ignore the
// archive, their numbers do not change. updated: 0 means nothing changed (the
// deal is already in that state or not editable by the user).
const useSetDealsArchived = (archived: boolean) => {
  const queryClient = useQueryClient();
  const t = useTranslations("pipeline.archive.toasts");
  const getApiError = useApiError();

  return useMutation({
    mutationFn: (dealIds: string[]) =>
      archived
        ? dealsService.archiveDeals(dealIds)
        : dealsService.unarchiveDeals(dealIds),
    onSuccess: ({ updated }) => {
      queryClient.invalidateQueries({ queryKey: dealKeys.all });
      queryClient.invalidateQueries({ queryKey: contactKeys.all });
      if (updated === 0) {
        toast.info(t("unchanged"));
        return;
      }
      toast.success(t(archived ? "archiveSuccess" : "unarchiveSuccess"));
    },
    onError: (error: ApiError) => {
      // 403 has no error code, so the fallback is shown
      toast.error(getApiError(error, t(archived ? "archiveError" : "unarchiveError")));
    },
  });
};

export const useArchiveDeals = () => useSetDealsArchived(true);

export const useUnarchiveDeals = () => useSetDealsArchived(false);
