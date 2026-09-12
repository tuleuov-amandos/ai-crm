import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { platformAdminApi } from "./api";

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  plan: string;
  status: "ACTIVE" | "SUSPENDED" | "PENDING";
  createdAt: string;
  adminName: string | null;
  adminEmail: string | null;
  userCount: number;
  contactCount: number;
  dealCount: number;
}

export interface TenantUser {
  id: string;
  name: string;
  email: string;
  roleName: string;
  createdAt: string;
}

export interface TenantDetail extends Tenant {
  users: TenantUser[];
}

export interface PlatformAdminMe {
  id: string;
  email: string;
  name: string;
}

export const useMe = () =>
  useQuery({
    queryKey: ["platform-admin", "me"],
    queryFn: async () =>
      (await platformAdminApi.get<PlatformAdminMe>("platform-admin/me")).data,
  });

export const useTenants = () =>
  useQuery({
    queryKey: ["platform-admin", "tenants"],
    queryFn: async () =>
      (await platformAdminApi.get<Tenant[]>("platform-admin/tenants")).data,
  });

export const useTenantDetail = (id: string) =>
  useQuery({
    queryKey: ["platform-admin", "tenant", id],
    queryFn: async () =>
      (await platformAdminApi.get<TenantDetail>(`platform-admin/tenants/${id}`)).data,
    enabled: !!id,
  });

export const useUpdateTenantStatus = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: Tenant["status"] }) =>
      (await platformAdminApi.patch(`platform-admin/tenants/${id}/status`, { status })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["platform-admin", "tenants"] });
      toast.success("Статус обновлён");
    },
    onError: () => toast.error("Не удалось обновить статус"),
  });
};

export const useLogin = () =>
  useMutation({
    mutationFn: async (body: { email: string; password: string }) =>
      (await platformAdminApi.post("platform-admin/login", body)).data,
  });

export const useLogout = () =>
  useMutation({
    mutationFn: async () => (await platformAdminApi.post("platform-admin/logout")).data,
  });
