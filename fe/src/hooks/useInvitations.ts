"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { invitationsService } from "@/services/invitations.service";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useApiError } from "@/hooks/useApiError";

export const invitationKeys = {
  all: ["invitations"] as const,
  lists: () => [...invitationKeys.all, "list"] as const,
};

export const useGetInvitations = () => {
  return useQuery({
    queryKey: invitationKeys.lists(),
    queryFn: invitationsService.getAll,
    staleTime: 10_000,
  });
};

export const useCreateInvitation = () => {
  const queryClient = useQueryClient();
  const t = useTranslations("settings.invitations.toasts");
  const getApiError = useApiError();

  return useMutation({
    mutationFn: ({ email, role }: { email: string; role: string }) =>
      invitationsService.create(email, role),
    onSuccess: () => {
      toast.success(t("sendSuccess"));
      queryClient.invalidateQueries({ queryKey: invitationKeys.lists() });
    },
    onError: (error: unknown) => {
      toast.error(getApiError(error, t("sendError")));
    },
  });
};

export const useRevokeInvitation = () => {
  const queryClient = useQueryClient();
  const t = useTranslations("settings.invitations.toasts");
  const getApiError = useApiError();

  return useMutation({
    mutationFn: (id: string) => invitationsService.revoke(id),
    onSuccess: () => {
      toast.success(t("revokeSuccess"));
      queryClient.invalidateQueries({ queryKey: invitationKeys.lists() });
    },
    onError: (error: unknown) => {
      toast.error(getApiError(error, t("revokeError")));
    },
  });
};

export const useUpdateInvitation = () => {
  const queryClient = useQueryClient();
  const t = useTranslations("settings.invitations.toasts");
  const getApiError = useApiError();

  return useMutation({
    mutationFn: ({ id, email, role }: { id: string; email?: string; role?: string }) =>
      invitationsService.update(id, email, role),
    onSuccess: () => {
      toast.success(t("updateSuccess"));
      queryClient.invalidateQueries({ queryKey: invitationKeys.lists() });
    },
    onError: (error: unknown) => {
      toast.error(getApiError(error, t("updateError")));
    },
  });
};
