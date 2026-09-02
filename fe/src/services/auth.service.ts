import { axiosInstance } from "@/lib/api";
import { LoginFormValues } from "@/lib/types/auth";
import { RegisterBodyType } from "@/lib/validations/auth.schema";

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
