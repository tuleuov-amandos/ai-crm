"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { profileService } from "@/services/profile.service";
import { useApiError } from "@/hooks/useApiError";

// After any profile change, refresh `auth/me` so the sidebar (name + avatar)
// and anything else reading the current user updates immediately.
const ME_KEY = ["auth", "me"] as const;

export const useUpdateProfile = () => {
  const queryClient = useQueryClient();
  const t = useTranslations("settings.account.toasts");
  const getApiError = useApiError();

  return useMutation({
    mutationFn: (data: { name: string }) => profileService.update(data),
    onSuccess: () => {
      toast.success(t("profileSaved"));
      queryClient.invalidateQueries({ queryKey: ME_KEY });
    },
    onError: (error: unknown) => {
      toast.error(getApiError(error, t("profileError")));
    },
  });
};

export const useUploadAvatar = () => {
  const queryClient = useQueryClient();
  const t = useTranslations("settings.account.toasts");
  const getApiError = useApiError();

  return useMutation({
    mutationFn: (file: File) => profileService.uploadAvatar(file),
    onSuccess: () => {
      toast.success(t("avatarSaved"));
      queryClient.invalidateQueries({ queryKey: ME_KEY });
    },
    onError: (error: unknown) => {
      toast.error(getApiError(error, t("avatarError")));
    },
  });
};

export const useRemoveAvatar = () => {
  const queryClient = useQueryClient();
  const t = useTranslations("settings.account.toasts");
  const getApiError = useApiError();

  return useMutation({
    mutationFn: () => profileService.removeAvatar(),
    onSuccess: () => {
      toast.success(t("avatarRemoved"));
      queryClient.invalidateQueries({ queryKey: ME_KEY });
    },
    onError: (error: unknown) => {
      toast.error(getApiError(error, t("avatarError")));
    },
  });
};

export const useChangePassword = () => {
  const t = useTranslations("settings.account.toasts");
  const getApiError = useApiError();

  return useMutation({
    mutationFn: (data: {
      currentPassword: string;
      newPassword: string;
      confirmPassword: string;
    }) => profileService.changePassword(data),
    onSuccess: () => {
      toast.success(t("passwordChanged"));
    },
    onError: (error: unknown) => {
      toast.error(getApiError(error, t("passwordError")));
    },
  });
};
