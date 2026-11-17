import type { InfiniteData, QueryClient } from '@tanstack/react-query';
import type { Chat, Message, Notification } from '@kup/shared';
import { createStore } from './store';

/** Query keys for stage-2 data (kept in one place so the realtime provider and screens agree). */
export const keys = {
  chats: ['chats'] as const,
  chat: (id: string) => ['chat', id] as const,
  messages: (id: string) => ['messages', id] as const,
  unreadChats: ['unread', 'chats'] as const,
  unreadNotifications: ['unread', 'notifications'] as const,
  notifications: ['notifications'] as const,
  savedSearches: ['savedSearches'] as const,
};

export const MESSAGES_LIMIT = 50;

/** Message as kept in the cache: optimistic ones have a temp id and `pending`/`failed`. */
export type LocalMessage = Message & { pending?: boolean; failed?: boolean };
export type MessagesData = InfiniteData<LocalMessage[], string | undefined>;
export type ChatsData = { items: Chat[]; unread_total: number };
export type NotificationsPage = { items: Notification[]; unread_count: number };
export type NotificationsData = InfiniteData<NotificationsPage, string | undefined>;

/** Id of the conversation currently on screen (null if none) — its messages are not counted as unread. */
export const openChatStore = createStore<string | null>(null);

/**
 * Adds a message to the newest page of a chat's cached history (no-op if the history isn't loaded).
 * Dedupes by id; a server copy of my own message replaces a pending optimistic one with the same text.
 */
export function appendMessage(qc: QueryClient, chatId: string, m: LocalMessage) {
  qc.setQueryData<MessagesData>(keys.messages(chatId), (data) => {
    if (!data) return data;
    if (data.pages.some((p) => p.some((x) => x.id === m.id))) return data;
    const pages = [...data.pages];
    let first = pages[0] ?? [];
    if (m.mine && !m.pending) {
      const i = first.findIndex((x) => x.pending && !x.failed && x.text === m.text);
      if (i >= 0) {
        first = [...first];
        first[i] = m;
        pages[0] = first;
        return { ...data, pages };
      }
    }
    pages[0] = [...first, m];
    return { ...data, pages };
  });
}

/** Replaces (or removes, with null) a message by id in the cached history. */
export function replaceMessage(qc: QueryClient, chatId: string, id: string, next: LocalMessage | null) {
  qc.setQueryData<MessagesData>(keys.messages(chatId), (data) => {
    if (!data) return data;
    const exists = next && next.id !== id && data.pages.some((p) => p.some((x) => x.id === next.id));
    return {
      ...data,
      pages: data.pages.map((p) =>
        p.flatMap((x) => (x.id !== id ? [x] : next && !exists ? [next] : [])),
      ),
    };
  });
}

/** Patches a chat in both the list cache and the single-chat cache. */
export function patchChat(qc: QueryClient, chatId: string, patch: (c: Chat) => Chat, moveToTop = false) {
  let found = false;
  qc.setQueryData<ChatsData>(keys.chats, (data) => {
    if (!data) return data;
    const i = data.items.findIndex((c) => c.id === chatId);
    if (i < 0) return data;
    found = true;
    const updated = patch(data.items[i]);
    const items = [...data.items];
    if (moveToTop) {
      items.splice(i, 1);
      items.unshift(updated);
    } else items[i] = updated;
    return { ...data, items };
  });
  qc.setQueryData<Chat>(keys.chat(chatId), (c) => (c ? patch(c) : c));
  return found;
}

/** Puts a chat returned by the API (e.g. from POST /v1/chats) into the caches. */
export function upsertChat(qc: QueryClient, chat: Chat) {
  qc.setQueryData(keys.chat(chat.id), chat);
  const found = patchChat(qc, chat.id, () => chat, true);
  if (!found) void qc.invalidateQueries({ queryKey: keys.chats });
}

export function markChatReadLocally(qc: QueryClient, chatId: string) {
  patchChat(qc, chatId, (c) => (c.unread ? { ...c, unread: 0 } : c));
  void qc.invalidateQueries({ queryKey: keys.unreadChats });
}
