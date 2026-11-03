"use client";
import { createApi, type Api, type TokenStore } from "@kup/shared";
import { PUBLIC_API_URL } from "./config";
import { getClientLang } from "@/i18n/client";

const TOKENS_KEY = "kup.tokens";

type Tokens = { access: string; refresh: string };
const listeners = new Set<(t: Tokens | null) => void>();

export const tokenStore: TokenStore = {
  get() {
    try {
      const raw = localStorage.getItem(TOKENS_KEY);
      return raw ? (JSON.parse(raw) as Tokens) : null;
    } catch {
      return null;
    }
  },
  set(t) {
    try {
      if (t) localStorage.setItem(TOKENS_KEY, JSON.stringify(t));
      else localStorage.removeItem(TOKENS_KEY);
    } catch {
      /* storage unavailable */
    }
    listeners.forEach((l) => l(t));
  },
};

export function onTokensChange(fn: (t: Tokens | null) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

let instance: Api | null = null;

/** Browser API client (tokens in localStorage). */
export function api(): Api {
  if (!instance) {
    instance = createApi({
      baseUrl: PUBLIC_API_URL,
      tokens: tokenStore,
      onLogout: () => listeners.forEach((l) => l(null)),
      lang: getClientLang,
    });
  }
  return instance;
}
