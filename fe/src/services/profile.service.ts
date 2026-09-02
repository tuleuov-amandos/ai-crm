import { axiosInstance } from "@/lib/api";

export interface MyProfile {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  role: string;
}

export const profileService = {
  get: async (): Promise<MyProfile> => {
    const res = await axiosInstance.get("users/me");
    return res.data;
  },

  update: async (data: { name: string }): Promise<MyProfile> => {
    const res = await axiosInstance.patch("users/me", data);
    return res.data;
  },

  uploadAvatar: async (file: File): Promise<MyProfile> => {
    const form = new FormData();
    form.append("file", file);
    const res = await axiosInstance.patch("users/me/avatar", form, {
      headers: { "Content-Type": "multipart/form-data" },
      timeout: 30_000,
    });
    return res.data;
  },

  removeAvatar: async (): Promise<MyProfile> => {
    const res = await axiosInstance.delete("users/me/avatar");
    return res.data;
  },

  changePassword: async (data: {
    currentPassword: string;
    newPassword: string;
    confirmPassword: string;
  }): Promise<{ message: string }> => {
    const res = await axiosInstance.patch("auth/password", data);
    return res.data;
  },
};
