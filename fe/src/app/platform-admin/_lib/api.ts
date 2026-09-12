import axios from "axios";
import { API_BASE_URL } from "@/lib/api";

export const platformAdminApi = axios.create({
  baseURL: `${API_BASE_URL}/`,
  timeout: 10000,
  headers: { "Content-Type": "application/json" },
  withCredentials: true,
});

platformAdminApi.interceptors.response.use(
  (response) => response,
  (error) => {
    if (
      error.response?.status === 401 &&
      typeof window !== "undefined" &&
      !window.location.pathname.includes("/platform-admin/login")
    ) {
      window.location.href = "/platform-admin/login";
    }
    return Promise.reject(error);
  },
);
