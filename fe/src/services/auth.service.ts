import { axiosInstance } from "@/lib/api";
import { LoginFormValues } from "@/lib/types/auth";
import {
  ForgotPasswordBodyType,
  RegisterBodyType,
  ResetPasswordBodyType,
} from "@/lib/validations/auth.schema";
import { Locale } from "@/i18n/routing";

export const authService = {
  login: async (values: LoginFormValues) => {
    const response = await axiosInstance.post("auth/login", values);
    return response.data;
  },
  logout: async () => {
    const response = await axiosInstance.post("auth/logout");
    return response.data;
  },
  register: async (values: RegisterBodyType) => {
    const response = await axiosInstance.post("auth/register", values);
    return response.data;
  },
  // Бэкенд всегда отвечает 200 одним и тем же сообщением — существует email или нет.
  forgotPassword: async (
    values: ForgotPasswordBodyType & { locale: Locale },
  ): Promise<{ message: string }> => {
    const response = await axiosInstance.post("auth/forgot-password", values);
    return response.data;
  },
  // Невалидный/использованный токен -> 400 AUTH_PASSWORD_RESET_TOKEN_INVALID
  // (не 401, чтобы интерцептор в lib/api.ts не запускал refresh).
  resetPassword: async (
    values: ResetPasswordBodyType,
  ): Promise<{ message: string }> => {
    const response = await axiosInstance.post("auth/reset-password", values);
    return response.data;
  },
  me: async (): Promise<{
    id: string;
    email: string;
    name: string;
    avatarUrl: string | null;
    role: string;
    tenantId: string;
    tenantStatus: "PENDING" | "ACTIVE" | "SUSPENDED";
    /** `false` for Google-only accounts — hide the "change password" form. */
    hasPassword: boolean;
    permissions: { action: string; subject: string; conditions?: Record<string, unknown> | null }[];
  }> => {
    const response = await axiosInstance.get("auth/me");
    return response.data;
  },
};
