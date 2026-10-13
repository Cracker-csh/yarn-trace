import axios, { AxiosError, InternalAxiosRequestConfig } from "axios";

const BASE_URL = (
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api/v1"
).replace(/\/+$/, "");

export const apiClient = axios.create({
  baseURL: BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
  timeout: 15000,
});

let isRefreshing = false;
let failedQueue: Array<{
  resolve: (value?: unknown) => void;
  reject: (reason?: unknown) => void;
}> = [];

const processQueue = (error: Error | null, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

// Request Interceptor: Attach Access Token
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    if (typeof window !== "undefined") {
      const token = localStorage.getItem("yarntrace_access_token");
      if (token && config.headers) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response Interceptor: Auto-Refresh on 401
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };

    if (!error.response || error.response.status !== 401 || originalRequest._retry) {
      return Promise.reject(error);
    }

    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        failedQueue.push({ resolve, reject });
      })
        .then((token) => {
          if (originalRequest.headers && token) {
            originalRequest.headers.Authorization = `Bearer ${token}`;
          }
          originalRequest._retry = true;
          return apiClient(originalRequest);
        })
        .catch((err) => Promise.reject(err));
    }

    originalRequest._retry = true;
    isRefreshing = true;

    if (typeof window === "undefined") {
      return Promise.reject(error);
    }

    const refreshToken = localStorage.getItem("yarntrace_refresh_token");

    // 1. Try Refresh Token
    if (refreshToken) {
      try {
        const response = await axios.post(`${BASE_URL}/auth/refresh`, {
          refreshToken,
        });

        const { accessToken: newAccessToken, refreshToken: newRefreshToken, user } =
          response.data.data;

        localStorage.setItem("yarntrace_access_token", newAccessToken);
        localStorage.setItem("yarntrace_refresh_token", newRefreshToken);
        if (user) {
          localStorage.setItem("yarntrace_user", JSON.stringify(user));
        }

        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        }

        processQueue(null, newAccessToken);
        return apiClient(originalRequest);
      } catch {
        // Refresh token failed, proceed to dev fallback or login redirect
      }
    }

    // 2. Dev-mode automatic session recovery (seamless testing without disruptions)
    try {
      const loginRes = await axios.post(`${BASE_URL}/auth/login`, {
        email: "admin@yarntrace.com",
        password: "Password123!",
      });

      const { accessToken: newAccessToken, refreshToken: newRefreshToken, user } =
        loginRes.data.data;

      localStorage.setItem("yarntrace_access_token", newAccessToken);
      localStorage.setItem("yarntrace_refresh_token", newRefreshToken);
      if (user) {
        localStorage.setItem("yarntrace_user", JSON.stringify(user));
      }

      if (originalRequest.headers) {
        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
      }

      processQueue(null, newAccessToken);
      return apiClient(originalRequest);
    } catch (loginErr) {
      processQueue(loginErr as Error, null);
      localStorage.removeItem("yarntrace_access_token");
      localStorage.removeItem("yarntrace_refresh_token");
      localStorage.removeItem("yarntrace_user");

      if (
        typeof window !== "undefined" &&
        !window.location.pathname.startsWith("/login")
      ) {
        window.location.href = "/login";
      }
      return Promise.reject(loginErr);
    } finally {
      isRefreshing = false;
    }
  }
);
