"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { api } from "./client-api";
import { loginHref, useAuth } from "./auth";

interface FavState {
  ids: Set<string>;
  loaded: boolean;
  isFavorite: (id: string) => boolean;
  toggle: (id: string) => Promise<void>;
}

const FavContext = createContext<FavState | null>(null);

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [ids, setIds] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!user) {
      setIds(new Set());
      setLoaded(false);
      return;
    }
    let cancelled = false;
    api()
      .favorites()
      .then((items) => {
        if (!cancelled) {
          setIds(new Set(items.map((i) => i.id)));
          setLoaded(true);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [user]);

  const toggle = useCallback(
    async (id: string) => {
      if (!user) {
        router.push(loginHref(pathname + window.location.search));
        return;
      }
      const was = ids.has(id);
      const flip = (on: boolean) =>
        setIds((prev) => {
          const n = new Set(prev);
          if (on) n.add(id);
          else n.delete(id);
          return n;
        });
      flip(!was);
      try {
        if (was) await api().removeFavorite(id);
        else await api().addFavorite(id);
      } catch {
        flip(was);
      }
    },
    [user, ids, router, pathname],
  );

  const value = useMemo(() => ({ ids, loaded, isFavorite: (id: string) => ids.has(id), toggle }), [ids, loaded, toggle]);
  return <FavContext.Provider value={value}>{children}</FavContext.Provider>;
}

export function useFavorites(): FavState {
  const ctx = useContext(FavContext);
  if (!ctx) throw new Error("useFavorites outside FavoritesProvider");
  return ctx;
}
