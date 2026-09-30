"use client";
import {
  ForgotPasswordBodyType,
  LoginBodyType,
  RegisterBodyType,
  ResetPasswordBodyType,
} from "@/lib/validations/auth.schema";
import { authService } from "@/services/auth.service";
import { ApiError } from "@/types/error.type";
import { useApiError } from "@/hooks/useApiError";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useRouter as useLocaleRouter } from "@/i18n/navigation";
import { Locale } from "@/i18n/routing";
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

export const useForgotPassword = () => {
  const locale = useLocale() as Locale;
  const t = useTranslations("auth.toasts");
  const getApiError = useApiError();
  return useMutation({
    // Письмо уходит на языке текущего интерфейса.
    mutationFn: (data: ForgotPasswordBodyType) => {
      return authService.forgotPassword({ ...data, locale });
    },
    onError: (error: ApiError) => {
      toast.error(getApiError(error, t("forgotPasswordError")));
    },
  });
};

// Ошибки обрабатывает страница: для AUTH_PASSWORD_RESET_TOKEN_INVALID
// она показывает отдельное состояние со ссылкой на новый запрос.
export const useResetPassword = () => {
  const router = useLocaleRouter();
  const t = useTranslations("auth.toasts");
  return useMutation<{ message: string }, ApiError, ResetPasswordBodyType>({
    mutationFn: (data: ResetPasswordBodyType) => {
      return authService.resetPassword(data);
    },
    onSuccess: () => {
      toast.success(t("resetPasswordSuccess"));
      router.replace("/login");
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
