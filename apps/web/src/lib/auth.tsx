"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ApiError, type User } from "@kup/shared";
import { api, onTokensChange, tokenStore } from "./client-api";

const USER_KEY = "kup.user";

interface AuthState {
  user: User | null;
  /** true until we know whether the stored token is valid. */
  loading: boolean;
  setUser: (u: User | null) => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

function readCachedUser(): User | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
}

function writeCachedUser(u: User | null) {
  try {
    if (u) localStorage.setItem(USER_KEY, JSON.stringify(u));
    else localStorage.removeItem(USER_KEY);
  } catch {
    /* ignore */
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const setUser = useCallback((u: User | null) => {
    writeCachedUser(u);
    setUserState(u);
  }, []);

  useEffect(() => {
    const tokens = tokenStore.get() as { access: string } | null;
    if (!tokens) {
      writeCachedUser(null);
      setLoading(false);
      return;
    }
    setUserState(readCachedUser());
    api()
      .me()
      .then((u) => setUser(u))
      .catch((e) => {
        if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
          tokenStore.set(null);
          setUser(null);
        }
      })
      .finally(() => setLoading(false));
  }, [setUser]);

  useEffect(
    () =>
      onTokensChange((t) => {
        if (!t) setUser(null);
      }),
    [setUser],
  );

  const logout = useCallback(async () => {
    await api().logout();
    setUser(null);
  }, [setUser]);

  const value = useMemo(() => ({ user, loading, setUser, logout }), [user, loading, setUser, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth outside AuthProvider");
  return ctx;
}

export function loginHref(next: string): string {
  return `/login?next=${encodeURIComponent(next)}`;
}

/** Redirects to /login when not authenticated. Returns the user (null while loading). */
export function useRequireAuth(): { user: User | null; ready: boolean } {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => {
    if (!loading && !user) {
      const qs = typeof window !== "undefined" ? window.location.search : "";
      router.replace(loginHref(pathname + qs));
    }
  }, [loading, user, router, pathname]);
  return { user, ready: !loading && !!user };
}
