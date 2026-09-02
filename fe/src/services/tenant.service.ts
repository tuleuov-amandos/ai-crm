import { axiosInstance } from "@/lib/api";

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  website: string | null;
  address: string | null;
  companySize: string | null;
  industry: string | null;
  timezone: string | null;
  defaultLocale: string | null;
  logoUrl: string | null;
}

/**
 * PATCH payload — every field optional. `null` clears a column; an omitted key
 * leaves it unchanged.
 */
export interface UpdateWorkspacePayload {
  name?: string;
  website?: string | null;
  address?: string | null;
  companySize?: string | null;
  industry?: string | null;
  timezone?: string | null;
  defaultLocale?: string | null;
}

export const tenantService = {
  get: async (): Promise<Workspace> => {
    const res = await axiosInstance.get("tenants/me");
    return res.data;
  },

  update: async (data: UpdateWorkspacePayload): Promise<Workspace> => {
    const res = await axiosInstance.patch("tenants/me", data);
    return res.data;
  },

  uploadLogo: async (file: File): Promise<Workspace> => {
    const form = new FormData();
    form.append("file", file);
    const res = await axiosInstance.post("tenants/me/logo", form, {
      headers: { "Content-Type": "multipart/form-data" },
      timeout: 30_000,
    });
    return res.data;
  },

  removeLogo: async (): Promise<Workspace> => {
    const res = await axiosInstance.delete("tenants/me/logo");
    return res.data;
  },
};
