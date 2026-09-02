"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { tenantService, type UpdateWorkspacePayload } from "@/services/tenant.service";
import { useApiError } from "@/hooks/useApiError";

const WORKSPACE_KEY = ["tenant", "me"] as const;
// The sidebar reads the current user (name/avatar) but may also surface the
// workspace name; refresh it too after a workspace change.
const ME_KEY = ["auth", "me"] as const;

export const useWorkspace = () =>
  useQuery({
    queryKey: WORKSPACE_KEY,
    queryFn: tenantService.get,
    staleTime: 5 * 60 * 1000,
  });

export const useUpdateWorkspace = () => {
  const queryClient = useQueryClient();
  const t = useTranslations("settings.workspace.toasts");
  const getApiError = useApiError();

  return useMutation({
    mutationFn: (data: UpdateWorkspacePayload) => tenantService.update(data),
    onSuccess: () => {
      toast.success(t("saved"));
      queryClient.invalidateQueries({ queryKey: WORKSPACE_KEY });
      queryClient.invalidateQueries({ queryKey: ME_KEY });
    },
    onError: (error: unknown) => {
      toast.error(getApiError(error, t("error")));
    },
  });
};

export const useUploadLogo = () => {
  const queryClient = useQueryClient();
  const t = useTranslations("settings.workspace.toasts");
  const getApiError = useApiError();

  return useMutation({
    mutationFn: (file: File) => tenantService.uploadLogo(file),
    onSuccess: () => {
      toast.success(t("logoSaved"));
      queryClient.invalidateQueries({ queryKey: WORKSPACE_KEY });
      queryClient.invalidateQueries({ queryKey: ME_KEY });
    },
    onError: (error: unknown) => {
      toast.error(getApiError(error, t("logoError")));
    },
  });
};

export const useRemoveLogo = () => {
  const queryClient = useQueryClient();
  const t = useTranslations("settings.workspace.toasts");
  const getApiError = useApiError();

  return useMutation({
    mutationFn: () => tenantService.removeLogo(),
    onSuccess: () => {
      toast.success(t("logoRemoved"));
      queryClient.invalidateQueries({ queryKey: WORKSPACE_KEY });
      queryClient.invalidateQueries({ queryKey: ME_KEY });
    },
    onError: (error: unknown) => {
      toast.error(getApiError(error, t("logoError")));
    },
  });
};
