"use client";
import { createContext, useCallback, useContext, useMemo, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { Lang } from "@kup/shared";
import { LANG_COOKIE, translator, type Translator } from "./core";

let clientLang: Lang = "ru";
const langListeners = new Set<(l: Lang) => void>();

/** Language used by the browser API client (Accept-Language). */
export function getClientLang(): Lang {
  return clientLang;
}

function setClientLang(l: Lang) {
  if (l === clientLang) return;
  clientLang = l;
  langListeners.forEach((fn) => fn(l));
}

/** Called when the UI language changes (caches keyed by language reset themselves). */
export function onLangChange(fn: (l: Lang) => void): () => void {
  langListeners.add(fn);
  return () => langListeners.delete(fn);
}

export function writeLangCookie(l: Lang) {
  document.cookie = `${LANG_COOKIE}=${l}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
}

interface I18nState extends Translator {
  /** True if the language came from the cookie (the user chose it), not from Accept-Language. */
  explicit: boolean;
  /** Switch language: cookie + server re-render (labels from the API come in the new language). */
  setLang: (l: Lang) => void;
  switching: boolean;
}

const Ctx = createContext<I18nState | null>(null);

export function I18nProvider({ lang, explicit, children }: { lang: Lang; explicit: boolean; children: ReactNode }) {
  // Set synchronously so effects of children fetch in the right language.
  setClientLang(lang);
  if (typeof document !== "undefined" && document.documentElement.lang !== lang) document.documentElement.lang = lang;
  const router = useRouter();
  const [switching, startTransition] = useTransition();

  const setLang = useCallback(
    (l: Lang) => {
      writeLangCookie(l);
      setClientLang(l);
      document.documentElement.lang = l;
      startTransition(() => router.refresh());
    },
    [router],
  );

  const value = useMemo<I18nState>(() => ({ ...translator(lang), explicit, setLang, switching }), [lang, explicit, setLang, switching]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n(): I18nState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useI18n outside I18nProvider");
  return ctx;
}
