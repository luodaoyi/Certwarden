import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { apiRequest, setAccessToken, setRefreshHandler } from "@/lib/api";
import type { ApiUser } from "@/lib/types";

interface AuthContextValue {
  user: ApiUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  register: (input: { email: string; password: string; tenantName: string }) => Promise<void>;
  verifyEmail: (token: string) => Promise<void>;
  forgotPassword: (email: string) => Promise<void>;
  resetPassword: (token: string, newPassword: string) => Promise<void>;
  refreshSession: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

interface TokensPayload {
  access_token: string;
  access_expires_at: string;
}

interface AuthPayload {
  user: ApiUser;
  tokens: TokensPayload;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<ApiUser | null>(null);
  const [loading, setLoading] = useState(true);

  const applyAuthPayload = useCallback((payload: AuthPayload) => {
    setAccessToken(payload.tokens.access_token);
    setUser(payload.user);
  }, []);

  const refreshSession = useCallback(async () => {
    try {
      const payload = await apiRequest<AuthPayload>("/auth/refresh", { method: "POST" }, false);
      applyAuthPayload(payload);
      return payload.tokens.access_token;
    } catch {
      setAccessToken(null);
      setUser(null);
      return null;
    }
  }, [applyAuthPayload]);

  useEffect(() => {
    setRefreshHandler(refreshSession);
    return () => setRefreshHandler(null);
  }, [refreshSession]);

  useEffect(() => {
    void (async () => {
      await refreshSession();
      setLoading(false);
    })();
  }, [refreshSession]);

  const login = useCallback(async (email: string, password: string) => {
    const payload = await apiRequest<AuthPayload>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }, false);
    applyAuthPayload(payload);
  }, [applyAuthPayload]);

  const logout = useCallback(async () => {
    try {
      await apiRequest("/auth/logout", { method: "POST" }, false);
    } finally {
      setAccessToken(null);
      setUser(null);
    }
  }, []);

  const register = useCallback(async (input: { email: string; password: string; tenantName: string }) => {
    await apiRequest("/auth/register", {
      method: "POST",
      body: JSON.stringify({
        email: input.email,
        password: input.password,
        tenant_name: input.tenantName,
      }),
    }, false);
  }, []);

  const verifyEmail = useCallback(async (token: string) => {
    await apiRequest("/auth/verify-email", {
      method: "POST",
      body: JSON.stringify({ token }),
    }, false);
  }, []);

  const forgotPassword = useCallback(async (email: string) => {
    await apiRequest("/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email }),
    }, false);
  }, []);

  const resetPassword = useCallback(async (token: string, newPassword: string) => {
    await apiRequest("/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ token, new_password: newPassword }),
    }, false);
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    loading,
    login,
    logout,
    register,
    verifyEmail,
    forgotPassword,
    resetPassword,
    refreshSession,
  }), [forgotPassword, loading, login, logout, refreshSession, register, resetPassword, user, verifyEmail]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return value;
}
