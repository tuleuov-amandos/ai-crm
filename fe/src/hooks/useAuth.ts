"use client";
import { LoginBodyType, RegisterBodyType } from "@/lib/validations/auth.schema";
import { authService } from "@/services/auth.service";
import { ApiError } from "@/types/error.type";
import { useApiError } from "@/hooks/useApiError";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

export const useLogin = () => {
  const router = useRouter();
  const t = useTranslations("auth.toasts");
  const getApiError = useApiError();

  return useMutation({
    mutationFn: (data: LoginBodyType) => {
      return authService.login(data);
    },

    onSuccess: () => {
      toast.success(t("loginSuccess"));
      router.push("/dashboard");
    },

    onError: (error: ApiError) => {
      toast.error(getApiError(error, t("loginError")));
    },
  });
};

export const useLogout = () => {
  const router = useRouter();
  const t = useTranslations("auth.toasts");

  return useMutation({
    mutationFn: () => {
      return authService.logout();
    },
    onSuccess: () => {
      toast.success(t("logoutSuccess"));
      router.push("/login");
    },
  });
};

export const useRegister = () => {
  const router = useRouter();
  const t = useTranslations("auth.toasts");
  const getApiError = useApiError();
  return useMutation({
    mutationFn: (data: RegisterBodyType) => {
      return authService.register(data);
    },
    onSuccess: () => {
      toast.success(t("registerSuccess"));
      router.push("/login");
    },
    onError: (error: ApiError) => {
      toast.error(getApiError(error, t("registerError")));
    },
  });
};

export const useMe = () => {
  return useQuery({
    queryKey: ["auth", "me"],
    queryFn: authService.me,
    staleTime: 5 * 60 * 1000, // 5 mins
  });
};
