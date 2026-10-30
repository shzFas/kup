import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import type { User } from '@kup/shared';
import { api, loadTokens, onForcedLogout } from './api';

interface AuthState {
  ready: boolean;
  user: User | null;
  setUser: (u: User | null) => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const qc = useQueryClient();

  useEffect(() => {
    let alive = true;
    (async () => {
      const t = await loadTokens();
      if (t) {
        try {
          const me = await api.me();
          if (alive) setUser(me);
        } catch {
          // Offline or token rejected: refresh logic in the client already cleared tokens if invalid.
        }
      }
      if (alive) setReady(true);
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(
    () =>
      onForcedLogout(() => {
        setUser(null);
        qc.removeQueries({ queryKey: ['me'] });
      }),
    [qc],
  );

  const logout = useCallback(async () => {
    await api.logout();
    setUser(null);
    qc.clear();
  }, [qc]);

  const value = useMemo(() => ({ ready, user, setUser, logout }), [ready, user, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
}

/** Opens the login modal; once logged in the modal closes and the user is back where they were. */
export function goToLogin() {
  router.push('/login');
}

/** Returns a guard: runs `fn` if logged in, otherwise opens login. */
export function useRequireAuth() {
  const { user } = useAuth();
  return useCallback(
    (fn: () => void) => {
      if (user) fn();
      else goToLogin();
    },
    [user],
  );
}
