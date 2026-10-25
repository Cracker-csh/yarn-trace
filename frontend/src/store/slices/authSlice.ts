import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { AuthState, User } from "../../types/auth";

const initialState: AuthState = {
  user: null,
  accessToken: null,
  refreshToken: null,
  isAuthenticated: false,
  isInitialized: false,
  isLoading: false,
  error: null,
};

const setAuthCookie = (token: string) => {
  if (typeof document !== "undefined") {
    document.cookie = `yarntrace_access_token=${encodeURIComponent(token)}; path=/; max-age=604800; SameSite=Lax`;
  }
};

const clearAuthCookie = () => {
  if (typeof document !== "undefined") {
    document.cookie = `yarntrace_access_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax`;
  }
};

export const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.isLoading = action.payload;
    },
    setCredentials: (
      state,
      action: PayloadAction<{
        user: User;
        accessToken: string;
        refreshToken: string;
      }>
    ) => {
      state.user = action.payload.user;
      state.accessToken = action.payload.accessToken;
      state.refreshToken = action.payload.refreshToken;
      state.isAuthenticated = true;
      state.isInitialized = true;
      state.isLoading = false;
      state.error = null;

      if (typeof window !== "undefined") {
        localStorage.setItem("yarntrace_access_token", action.payload.accessToken);
        localStorage.setItem("yarntrace_refresh_token", action.payload.refreshToken);
        localStorage.setItem("yarntrace_user", JSON.stringify(action.payload.user));
        setAuthCookie(action.payload.accessToken);
      }
    },
    setUser: (state, action: PayloadAction<User>) => {
      state.user = action.payload;
      state.isAuthenticated = true;
      state.isInitialized = true;
      if (typeof window !== "undefined") {
        localStorage.setItem("yarntrace_user", JSON.stringify(action.payload));
      }
    },
    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload;
      state.isLoading = false;
    },
    logout: (state) => {
      state.user = null;
      state.accessToken = null;
      state.refreshToken = null;
      state.isAuthenticated = false;
      state.isInitialized = true;
      state.isLoading = false;
      state.error = null;

      if (typeof window !== "undefined") {
        localStorage.removeItem("yarntrace_access_token");
        localStorage.removeItem("yarntrace_refresh_token");
        localStorage.removeItem("yarntrace_user");
        clearAuthCookie();
      }
    },
    initializeAuthFromStorage: (state) => {
      if (typeof window !== "undefined") {
        const token = localStorage.getItem("yarntrace_access_token");
        const refreshToken = localStorage.getItem("yarntrace_refresh_token");
        const userStr = localStorage.getItem("yarntrace_user");

        if (token && refreshToken && userStr) {
          try {
            state.user = JSON.parse(userStr);
            state.accessToken = token;
            state.refreshToken = refreshToken;
            state.isAuthenticated = true;
            setAuthCookie(token);
          } catch {
            localStorage.removeItem("yarntrace_access_token");
            localStorage.removeItem("yarntrace_refresh_token");
            localStorage.removeItem("yarntrace_user");
            clearAuthCookie();
            state.user = null;
            state.accessToken = null;
            state.refreshToken = null;
            state.isAuthenticated = false;
          }
        } else {
          clearAuthCookie();
          state.user = null;
          state.accessToken = null;
          state.refreshToken = null;
          state.isAuthenticated = false;
        }
      }
      state.isInitialized = true;
    },
  },
});

export const {
  setLoading,
  setCredentials,
  setUser,
  setError,
  logout,
  initializeAuthFromStorage,
} = authSlice.actions;

export default authSlice.reducer;
