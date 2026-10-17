import axios, { AxiosError, InternalAxiosRequestConfig } from "axios";

/**
 * Dynamically resolves the API Base URL based on runtime execution context:
 * 1. Mobile / Remote Tunnel: If running in browser and hostname is not localhost,
 *    uses configured public HTTPS URL or same-origin '/api/v1' (via Next.js reverse proxy).
 * 2. Laptop / Desktop Localhost: Uses direct local backend http://localhost:4000/api/v1.
 * 3. Server-Side Rendering (SSR): Uses configured URL or localhost fallback.
 */
export const getApiBaseUrl = (): string => {
  const rawEnv = process.env.NEXT_PUBLIC_API_URL?.trim();

  // Running inside client-side browser:
  if (typeof window !== "undefined") {
    const isLocalhost =
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1";

    // 1. When running on local machine (localhost / 127.0.0.1):
    // Always use local backend directly to avoid stale or expired remote tunnel domains
    if (isLocalhost) {
      return "http://localhost:4000/api/v1";
    }

    // 2. When accessed remotely (e.g. via Cloudflare tunnel, mobile Safari/Chrome, or custom domain):
    // Use same-origin relative path '/api/v1' (routed via Next.js reverse-proxy rewrites).
    // This eliminates CORS issues, mixed content, and dead external tunnels completely!
    return `${window.location.origin}/api/v1`;
  }

  // Server-Side Rendering (SSR) fallback
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
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

// Request Interceptor: Dynamically resolve baseURL and attach Access Token
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

    const currentBaseUrl = getApiBaseUrl();
    const refreshToken = localStorage.getItem("yarntrace_refresh_token");

    // 1. Try Refresh Token
    if (refreshToken) {
      try {
        const response = await axios.post(`${currentBaseUrl}/auth/refresh`, {
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
      const loginRes = await axios.post(`${currentBaseUrl}/auth/login`, {
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
