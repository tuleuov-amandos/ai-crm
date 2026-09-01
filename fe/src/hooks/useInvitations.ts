"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { invitationsService } from "@/services/invitations.service";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

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

  return useMutation({
    mutationFn: ({ email, role }: { email: string; role: string }) =>
      invitationsService.create(email, role),
    onSuccess: () => {
      toast.success(t("sendSuccess"));
      queryClient.invalidateQueries({ queryKey: invitationKeys.lists() });
    },
    onError: (error: unknown) => {
      const err = error as { response?: { data?: { message?: string } } };
      const msg = err.response?.data?.message || t("sendError");
      toast.error(msg);
    },
  });
};

export const useRevokeInvitation = () => {
  const queryClient = useQueryClient();
  const t = useTranslations("settings.invitations.toasts");

  return useMutation({
    mutationFn: (id: string) => invitationsService.revoke(id),
    onSuccess: () => {
      toast.success(t("revokeSuccess"));
      queryClient.invalidateQueries({ queryKey: invitationKeys.lists() });
    },
    onError: (error: unknown) => {
      const err = error as { response?: { data?: { message?: string } } };
      const msg = err.response?.data?.message || t("revokeError");
      toast.error(msg);
    },
  });
};

export const useUpdateInvitation = () => {
  const queryClient = useQueryClient();
  const t = useTranslations("settings.invitations.toasts");

  return useMutation({
    mutationFn: ({ id, email, role }: { id: string; email?: string; role?: string }) =>
      invitationsService.update(id, email, role),
    onSuccess: () => {
      toast.success(t("updateSuccess"));
      queryClient.invalidateQueries({ queryKey: invitationKeys.lists() });
    },
    onError: (error: unknown) => {
      const err = error as { response?: { data?: { message?: string } } };
      const msg = err.response?.data?.message || t("updateError");
      toast.error(msg);
    },
  });
};
