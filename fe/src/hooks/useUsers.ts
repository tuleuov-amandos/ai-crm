"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { usersService } from "@/services/users.service";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useApiError } from "@/hooks/useApiError";

export const userKeys = {
  all: ["users"] as const,
  lists: () => [...userKeys.all, "list"] as const,
};

export const useGetUsers = () => {
  return useQuery({
    queryKey: userKeys.lists(),
    queryFn: usersService.getAll,
    staleTime: 30_000,
  });
};

export const useUpdateUser = () => {
  const queryClient = useQueryClient();
  const t = useTranslations("settings.members.toasts");
  const getApiError = useApiError();

  return useMutation({
    mutationFn: ({ id, name, role }: { id: string; name?: string; role?: string }) =>
      usersService.update(id, { name, role }),
    onSuccess: () => {
      toast.success(t("updateSuccess"));
      queryClient.invalidateQueries({ queryKey: userKeys.lists() });
    },
    onError: (error: unknown) => {
      toast.error(getApiError(error, t("updateError")));
    },
  });
};

export const useDeleteUser = () => {
  const queryClient = useQueryClient();
  const t = useTranslations("settings.members.toasts");
  const getApiError = useApiError();

  return useMutation({
    mutationFn: (id: string) => usersService.delete(id),
    onSuccess: () => {
      toast.success(t("deleteSuccess"));
      queryClient.invalidateQueries({ queryKey: userKeys.lists() });
    },
    onError: (error: unknown) => {
      toast.error(getApiError(error, t("deleteError")));
    },
  });
};
