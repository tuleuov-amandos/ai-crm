"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { usersService } from "@/services/users.service";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

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

  return useMutation({
    mutationFn: ({ id, name, role }: { id: string; name?: string; role?: string }) =>
      usersService.update(id, { name, role }),
    onSuccess: () => {
      toast.success(t("updateSuccess"));
      queryClient.invalidateQueries({ queryKey: userKeys.lists() });
    },
    onError: (error: unknown) => {
      const err = error as { response?: { data?: { message?: string } } };
      const msg = err.response?.data?.message || t("updateError");
      toast.error(msg);
    },
  });
};

export const useDeleteUser = () => {
  const queryClient = useQueryClient();
  const t = useTranslations("settings.members.toasts");

  return useMutation({
    mutationFn: (id: string) => usersService.delete(id),
    onSuccess: () => {
      toast.success(t("deleteSuccess"));
      queryClient.invalidateQueries({ queryKey: userKeys.lists() });
    },
    onError: (error: unknown) => {
      const err = error as { response?: { data?: { message?: string } } };
      const msg = err.response?.data?.message || t("deleteError");
      toast.error(msg);
    },
  });
};
