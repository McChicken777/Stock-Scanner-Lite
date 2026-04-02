import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

export interface CompanyFeatures {
  inventory: boolean;
  alerts: boolean;
  work_orders: boolean;
  progress_tracking: boolean;
  deadline_alerts: boolean;
  time_tracking: boolean;
}

export interface AuthUser {
  id: number;
  username: string;
  role: "admin" | "worker";
  companyId: number | null;
  features: CompanyFeatures;
}

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const defaultFeatures: CompanyFeatures = {
  inventory: true, alerts: true, work_orders: true,
  progress_tracking: true, deadline_alerts: true, time_tracking: true,
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshUser = async () => {
    const r = await fetch("/api/auth/me", { credentials: "include" });
    if (r.ok) {
      const data = await r.json();
      setUser({ ...data, features: data.features ?? defaultFeatures });
    } else {
      setUser(null);
    }
  };

  useEffect(() => {
    refreshUser().finally(() => setIsLoading(false));
  }, []);

  const login = async (username: string, password: string) => {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ username, password }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "Login failed");
    }
    const data = await res.json();
    setUser({ ...data, features: data.features ?? defaultFeatures });
  };

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export function useFeature(feature: keyof CompanyFeatures): boolean {
  const { user } = useAuth();
  return user?.features?.[feature] ?? true;
}
