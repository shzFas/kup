import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import { useAuth } from './auth';
import { hasExplicitLang, setLang, useI18n } from './i18n';
import { refNamesStore } from './refNames';

/**
 * Keeps the UI language, the server-side `User.lang` and cached data consistent:
 * - on login: adopt the account language unless the user picked one on this device, otherwise push ours;
 * - on change: refetch everything (labels come from the API in the request language) and update the account.
 */
export function useLangSync() {
  const { lang } = useI18n();
  const { user, setUser } = useAuth();
  const qc = useQueryClient();
  const prevLang = useRef(lang);
  const syncedUser = useRef<string | null>(null);

  // Login / boot with a session.
  useEffect(() => {
    if (!user || syncedUser.current === user.id) return;
    syncedUser.current = user.id;
    if (!hasExplicitLang() && user.lang && user.lang !== lang) void setLang(user.lang, false);
    else if (user.lang !== lang) api.updateMe({ lang }).then(setUser, () => {});
  }, [user, lang, setUser]);

  useEffect(() => {
    if (!user) syncedUser.current = null;
  }, [user]);

  // Language switched.
  useEffect(() => {
    if (prevLang.current === lang) return;
    prevLang.current = lang;
    refNamesStore.set({});
    void qc.invalidateQueries();
    if (user && user.lang !== lang) api.updateMe({ lang }).then(setUser, () => {});
  }, [lang, user, qc, setUser]);
}
