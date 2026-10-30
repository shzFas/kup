import * as SecureStore from 'expo-secure-store';
import { createApi, ApiError } from '@kup/shared';

export const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8180';

const TOKENS_KEY = 'kup.tokens';
type Tokens = { access: string; refresh: string };

// Tokens are cached in memory; SecureStore is the persistent copy.
let memTokens: Tokens | null = null;
const logoutListeners = new Set<() => void>();

export async function loadTokens(): Promise<Tokens | null> {
  try {
    const raw = await SecureStore.getItemAsync(TOKENS_KEY);
    memTokens = raw ? (JSON.parse(raw) as Tokens) : null;
  } catch {
    memTokens = null;
  }
  return memTokens;
}

export function hasTokens() {
  return memTokens != null;
}

export function onForcedLogout(fn: () => void) {
  logoutListeners.add(fn);
  return () => {
    logoutListeners.delete(fn);
  };
}

export const api = createApi({
  baseUrl: API_URL,
  tokens: {
    get: () => memTokens,
    async set(t) {
      memTokens = t;
      try {
        if (t) await SecureStore.setItemAsync(TOKENS_KEY, JSON.stringify(t));
        else await SecureStore.deleteItemAsync(TOKENS_KEY);
      } catch {
        // ignore storage errors; in-memory session still works
      }
    },
  },
  onLogout: () => logoutListeners.forEach((l) => l()),
});

export const mediaUrl = (path: string) => api.mediaUrl(path);

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 429) return 'Слишком много запросов. Попробуйте чуть позже.';
    if (e.status >= 500) return 'Ошибка сервера. Попробуйте позже.';
    return e.message || 'Что-то пошло не так';
  }
  if (e instanceof TypeError) return 'Нет соединения с сервером';
  if (e instanceof Error) return e.message;
  return 'Что-то пошло не так';
}

export function isAuthError(e: unknown) {
  return e instanceof ApiError && e.status === 401;
}

export { ApiError };
