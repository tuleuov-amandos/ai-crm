"use client";
import { LoginBodyType, RegisterBodyType } from "@/lib/validations/auth.schema";
import { authService } from "@/services/auth.service";
import { ApiError } from "@/types/error.type";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

export const useLogin = () => {
  const router = useRouter();
  const t = useTranslations("auth.toasts");

  return useMutation({
    mutationFn: (data: LoginBodyType) => {
      return authService.login(data);
    },

    onSuccess: () => {
      toast.success(t("loginSuccess"));
      router.push("/dashboard");
    },

    onError: (error: ApiError) => {
      const message = error.response?.data.message || t("loginError");
      // let message = "Login failed";

      // if (typeof data?.message === "string") {
      //   message = data.message;
      // } else if (Array.isArray(data?.message) && data.message.length > 0) {
      //   // Get message from the first element in array
      //   message = data.message[0]?.message || "Login failed";
      // }
      toast.error(message);
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
  return useMutation({
    mutationFn: (data: RegisterBodyType) => {
      return authService.register(data);
    },
    onSuccess: () => {
      toast.success(t("registerSuccess"));
      router.push("/login");
    },
    onError: (error: ApiError) => {
      const message = error?.response?.data?.message || t("registerError");
      toast.error(message);
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
