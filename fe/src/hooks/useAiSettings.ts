"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { aiSettingsService } from "@/services/aiSettings.service";
import { useApiError } from "@/hooks/useApiError";
import type { UpdateAiSettingsBodyType } from "@/lib/validations/aiSettings.schema";
import type { ApiError } from "@/types/error.type";

// ─────────────────────────────────────────
// QUERY KEYS — source of truth for cache
// ─────────────────────────────────────────
export const aiSettingsKeys = {
  all: ["ai", "settings"] as const,
};

// ─────────────────────────────────────────
// GET SETTINGS — whether the company has an AI key, and whose
// ─────────────────────────────────────────
// The response never carries the key, only the provider and its last 4
// characters (ADMIN only).
export const useAiSettings = () =>
  useQuery({
    queryKey: aiSettingsKeys.all,
    queryFn: aiSettingsService.get,
  });

// ─────────────────────────────────────────
// SAVE KEY — the backend checks it with the provider first (up to ~10 s)
// ─────────────────────────────────────────
// react-query keeps the variables of the last mutation, i.e. the key. The
// caller clears the field and calls `reset()` on success and on closing the
// form. A throttler 429 has no `code`, so it gets its own message.
export const useUpdateAiSettings = () => {
  const queryClient = useQueryClient();
  const t = useTranslations("settings.integrations.toasts");
  const getApiError = useApiError();

  return useMutation({
    mutationFn: (data: UpdateAiSettingsBodyType) => aiSettingsService.update(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: aiSettingsKeys.all });
      toast.success(t("saveSuccess"));
    },
    onError: (error) => {
      const tooManyAttempts = (error as ApiError)?.response?.status === 429;
      toast.error(getApiError(error, t(tooManyAttempts ? "tooManyAttempts" : "saveError")));
    },
  });
};

// ─────────────────────────────────────────
// DELETE KEY
// ─────────────────────────────────────────
export const useRemoveAiSettings = () => {
  const queryClient = useQueryClient();
  const t = useTranslations("settings.integrations.toasts");
  const getApiError = useApiError();

  return useMutation({
    mutationFn: () => aiSettingsService.remove(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: aiSettingsKeys.all });
      toast.success(t("deleteSuccess"));
    },
    onError: (error) => {
      toast.error(getApiError(error, t("deleteError")));
    },
  });
};
