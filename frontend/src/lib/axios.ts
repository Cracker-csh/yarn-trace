import axios, { AxiosError, InternalAxiosRequestConfig } from "axios";

/**
 * Resolve the YarnTrace API base URL.
 *
 * Local development:
 *   http://localhost:4000/api/v1
 *
 * Production:
 *   NEXT_PUBLIC_API_URL
 *
 * Browser fallback:
 *   same-origin /api/v1
 */
export const getApiBaseUrl = (): string => {
  const rawEnv = process.env.NEXT_PUBLIC_API_URL?.trim();

  // Browser/client-side execution
  if (typeof window !== "undefined") {
    const hostname = window.location.hostname;

    const isLocalhost = hostname === "localhost" || hostname === "127.0.0.1";

    // Local development
    if (isLocalhost) {
      return "http://localhost:4000/api/v1";
    }

    // Explicit public API URL
    if (rawEnv && rawEnv.startsWith("http") && !rawEnv.includes("trycloudflare.com")) {
      return rawEnv.replace(/\/+$/, "");
    }

    // Same-origin reverse-proxy fallback
    return `${window.location.origin}/api/v1`;
  }

  // Server-side rendering
  if (rawEnv && !rawEnv.includes(",") && !rawEnv.includes("trycloudflare.com")) {
    return rawEnv.replace(/\/+$/, "");
  }

  return "http://localhost:4000/api/v1";
};

export const apiClient = axios.create({
  baseURL: getApiBaseUrl(),
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
  failedQueue.forEach((promise) => {
    if (error) {
      promise.reject(error);
    } else {
      promise.resolve(token);
    }
  });

  failedQueue = [];
};

/**
 * Request interceptor
 *
 * Dynamically resolves the API URL and attaches
 * the current access token when available.
 */
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    config.baseURL = getApiBaseUrl();

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

/**
 * Response interceptor
 *
 * Automatically refreshes the access token when
 * the backend returns HTTP 401.
 */
apiClient.interceptors.response.use(
  (response) => response,

  async (error: AxiosError) => {
    const originalRequest = error.config as
      | (InternalAxiosRequestConfig & {
          _retry?: boolean;
        })
      | undefined;

    // Not a 401 or request already retried
    if (
      !error.response ||
      error.response.status !== 401 ||
      !originalRequest ||
      originalRequest._retry
    ) {
      return Promise.reject(error);
    }

    /**
     * Another request is already refreshing the token.
     * Queue this request until the refresh finishes.
     */
    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        failedQueue.push({
          resolve,
          reject,
        });
      })
        .then((token) => {
          if (originalRequest.headers && token) {
            originalRequest.headers.Authorization = `Bearer ${token}`;
          }

          originalRequest._retry = true;

          return apiClient(originalRequest);
        })
        .catch((refreshError) => {
          return Promise.reject(refreshError);
        });
    }

    originalRequest._retry = true;
    isRefreshing = true;

    // Refresh only makes sense in the browser
    if (typeof window === "undefined") {
      isRefreshing = false;
      return Promise.reject(error);
    }

    const currentBaseUrl = getApiBaseUrl();

    const refreshToken = localStorage.getItem("yarntrace_refresh_token");

    /**
     * No refresh token:
     * clear the local session and send the user
     * back to the login page.
     */
    if (!refreshToken) {
      isRefreshing = false;

      localStorage.removeItem("yarntrace_access_token");
      localStorage.removeItem("yarntrace_refresh_token");
      localStorage.removeItem("yarntrace_user");
      document.cookie = "yarntrace_access_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax";

      if (!window.location.pathname.startsWith("/login")) {
        window.location.href = `/login?redirect=${encodeURIComponent(window.location.pathname)}`;
      }

      return Promise.reject(error);
    }

    try {
      /**
       * Refresh the access token.
       */
      const response = await axios.post(`${currentBaseUrl}/auth/refresh`, {
        refreshToken,
      });

      const {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
        user,
      } = response.data.data;

      localStorage.setItem("yarntrace_access_token", newAccessToken);
      localStorage.setItem("yarntrace_refresh_token", newRefreshToken);
      document.cookie = `yarntrace_access_token=${encodeURIComponent(newAccessToken)}; path=/; max-age=604800; SameSite=Lax`;

      if (user) {
        localStorage.setItem("yarntrace_user", JSON.stringify(user));
      }

      /**
       * Attach the new access token to the
       * original failed request.
       */
      if (originalRequest.headers) {
        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
      }

      /**
       * Release queued requests.
       */
      processQueue(null, newAccessToken);

      /**
       * Retry the original request.
       */
      return apiClient(originalRequest);
    } catch (refreshError) {
      /**
       * Refresh token is invalid/expired.
       * There is NO automatic admin login fallback.
       */
      processQueue(refreshError as Error, null);

      localStorage.removeItem("yarntrace_access_token");
      localStorage.removeItem("yarntrace_refresh_token");
      localStorage.removeItem("yarntrace_user");
      document.cookie = "yarntrace_access_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax";

      if (!window.location.pathname.startsWith("/login")) {
        window.location.href = `/login?redirect=${encodeURIComponent(window.location.pathname)}`;
      }

      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  }
);
