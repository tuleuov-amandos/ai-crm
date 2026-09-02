import axios, { AxiosError, InternalAxiosRequestConfig } from "axios";
import { isLocaleRoot } from "@/i18n/pathname";

// Call the backend directly (cross-origin) rather than through a Next.js
// rewrite. The rewrite made the browser see requests as same-origin (to
// Vercel), so the auth cookies the backend sets in its response were bound
// to the backend's own domain and never sent back on later /auth/me calls.
// Going direct + sameSite:'none';secure cookies (prod) + credentials CORS
// makes the cross-site cookie flow work end to end.
export const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"
).replace(/\/$/, "");
const baseUrl = `${API_BASE_URL}/`;

type RetryConfig = InternalAxiosRequestConfig & {
  _retry?: boolean;
};

export const axiosInstance = axios.create({
  baseURL: baseUrl,
  timeout: 10000,
  headers: {
    "Content-Type": "application/json",
  },
  withCredentials: true,
});

// refreshClient uses the same baseURL, no need for long timeout
const refreshClient = axios.create({
  baseURL: baseUrl,
  withCredentials: true,
  timeout: 10000,
});

let isRefreshing = false;
let failedQueue: Array<{
  resolve: (value?: unknown) => void;
  reject: (reason?: unknown) => void;
}> = [];

const processQueue = (error: unknown) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve();
    }
  });
  failedQueue = [];
};

axiosInstance.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as RetryConfig | undefined;

    // Not a 401 error, no config, or it's a login/register request -> reject normally
    if (
      !originalRequest ||
      error.response?.status !== 401 ||
      originalRequest.url?.includes("auth/login") ||
      originalRequest.url?.includes("auth/register")
    ) {
      return Promise.reject(error);
    }

    // If refresh-token request itself is 401, or already retried -> logout
    if (
      originalRequest.url?.includes("auth/refresh-token") ||
      originalRequest._retry
    ) {
      isRefreshing = false;
      processQueue(error);
      if (
        typeof window !== "undefined" &&
        !isLocaleRoot(window.location.pathname)
      ) {
        window.location.href = "/login";
      }
      return Promise.reject(error);
    }

    // If refreshing, push request to queue
    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        failedQueue.push({ resolve, reject });
      })
        .then(() => {
          // Mark _retry AFTER queue resolved
          // to avoid wrong redirect if this retry also 401
          originalRequest._retry = true;
          return axiosInstance(originalRequest);
        })
        .catch((err) => Promise.reject(err));
    }

    // Start refresh
    originalRequest._retry = true;
    isRefreshing = true;

    try {
      await refreshClient.post("auth/refresh-token", {});
      processQueue(null);
      return axiosInstance(originalRequest);
    } catch (refreshError) {
      processQueue(refreshError);
      if (
        typeof window !== "undefined" &&
        !isLocaleRoot(window.location.pathname)
      ) {
        window.location.href = "/login";
      }
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  },
);
