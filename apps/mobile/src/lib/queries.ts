import { useQuery } from '@tanstack/react-query';
import type { CategorySchema } from '@kup/shared';
import { api } from './api';
import { useAuth } from './auth';
import { keys } from './chatCache';
import { i18n } from './i18n';
import { rememberRefNames } from './refNames';

export function useCategories() {
  return useQuery({ queryKey: ['categories'], queryFn: api.categories, staleTime: 60 * 60 * 1000 });
}

export function useSchema(slug: string | undefined) {
  return useQuery<CategorySchema>({
    queryKey: ['schema', slug],
    queryFn: () => api.schema(slug!),
    enabled: !!slug,
    staleTime: 60 * 60 * 1000,
  });
}

export function useRefs(ref: string | null | undefined, parent: string[] | undefined, q: string, enabled = true) {
  return useQuery({
    queryKey: ['refs', ref, parent?.join(',') ?? '', q],
    queryFn: async () => {
      const items = await api.refs(ref!, { parent, q: q || undefined });
      rememberRefNames(items);
      return items;
    },
    enabled: !!ref && enabled,
    staleTime: 10 * 60 * 1000,
  });
}

/** Ordered groups: "common" first, then schema order, then unknown groups. */
export function orderedGroups(schema: CategorySchema, keys: string[]) {
  const labels = new Map(schema.groups.map((g) => [g.key, g.label]));
  const order = schema.groups.map((g) => g.key);
  const present = Array.from(new Set(keys));
  present.sort((a, b) => {
    if (a === 'common') return -1;
    if (b === 'common') return 1;
    const ia = order.indexOf(a);
    const ib = order.indexOf(b);
    return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
  });
  return present.map((key) => ({ key, label: labels.get(key) ?? i18n().t(key === 'common' ? 'common.commonGroup' : 'common.otherGroup') }));
}

/** Unread chat messages (tab badge). Kept fresh by the events provider. */
export function useUnreadChats() {
  const { user } = useAuth();
  return useQuery({ queryKey: keys.unreadChats, queryFn: api.chatUnread, enabled: !!user, staleTime: 60_000 }).data ?? 0;
}

/** Unread notifications (badges). The events provider increments it on realtime events. */
export function useUnreadNotifications() {
  const { user } = useAuth();
  return useQuery({ queryKey: keys.unreadNotifications, queryFn: api.unreadNotifications, enabled: !!user, staleTime: 60_000 }).data ?? 0;
}

/** Saved searches (shared by Favorites › Searches and Profile › Saved searches). */
export function useSavedSearches() {
  const { user } = useAuth();
  return useQuery({ queryKey: keys.savedSearches, queryFn: api.savedSearches, enabled: !!user });
}

/** Total of new listings across saved searches (badge). */
export function useSavedSearchesNew() {
  const q = useSavedSearches();
  return (q.data ?? []).reduce((s, x) => s + (x.new_count || 0), 0);
}
