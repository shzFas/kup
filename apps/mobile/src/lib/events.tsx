import { useEffect, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { ServerEvent } from '@kup/shared';
import { api } from './api';
import { useAuth } from './auth';
import {
  appendMessage,
  keys,
  markChatReadLocally,
  openChatStore,
  patchChat,
  type NotificationsData,
} from './chatCache';
import { createStore } from './store';

/** Whether the realtime socket is currently connected (for optional UI hints). */
export const socketStore = createStore(false);

/** Refetch everything that could have changed while we weren't listening. */
function refreshCounters(qc: QueryClient) {
  void qc.invalidateQueries({ queryKey: ['unread'] });
  void qc.invalidateQueries({ queryKey: keys.chats });
  const open = openChatStore.get();
  if (open) {
    void qc.invalidateQueries({ queryKey: keys.messages(open) });
    void qc.invalidateQueries({ queryKey: keys.chat(open) });
  }
}

function handleEvent(qc: QueryClient, myId: string, e: ServerEvent) {
  switch (e.type) {
    case 'message': {
      const m = e.message;
      const isOpen = openChatStore.get() === e.chat_id && AppState.currentState === 'active';
      appendMessage(qc, e.chat_id, m);
      const countUnread = !m.mine && !isOpen;
      const found = patchChat(
        qc,
        e.chat_id,
        (c) => ({
          ...c,
          last_message: { text: m.text, at: m.created_at, mine: m.mine },
          unread: countUnread ? c.unread + 1 : c.unread,
        }),
        true,
      );
      if (!found) void qc.invalidateQueries({ queryKey: keys.chats });
      // The open conversation marks itself read; otherwise the tab badge must be refreshed.
      if (countUnread) void qc.invalidateQueries({ queryKey: keys.unreadChats });
      break;
    }
    case 'read': {
      if (e.reader_id === myId) markChatReadLocally(qc, e.chat_id); // read on another device
      else patchChat(qc, e.chat_id, (c) => ({ ...c, peer_read_at: e.at }));
      break;
    }
    case 'notification': {
      const n = e.notification;
      let added = false;
      qc.setQueryData<NotificationsData>(keys.notifications, (data) => {
        if (!data || data.pages.some((p) => p.items.some((x) => x.id === n.id))) return data;
        added = true;
        const [first, ...rest] = data.pages;
        return { ...data, pages: [{ ...first, items: [n, ...first.items] }, ...rest] };
      });
      if (!n.read && (added || !qc.getQueryData(keys.notifications))) {
        qc.setQueryData<number>(keys.unreadNotifications, (c) => (c ?? 0) + 1);
      }
      if (n.type === 'saved_search') void qc.invalidateQueries({ queryKey: keys.savedSearches });
      if (n.type === 'price_drop') {
        void qc.invalidateQueries({ queryKey: ['favorites'] });
        void qc.invalidateQueries({ queryKey: ['listing', n.listing_id] });
      }
      break;
    }
  }
}

/**
 * App-level realtime connection (GET /v1/ws). Active only while logged in and the app is in the
 * foreground; on reconnect / foreground it refetches counters so nothing missed stays stale.
 */
export function EventsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const userId = user?.id;

  useEffect(() => {
    if (!userId) return;
    let close: (() => void) | null = null;
    let connectedBefore = false;

    const start = () => {
      if (close) return;
      close = api.connectEvents(
        (e) => handleEvent(qc, userId, e),
        (connected) => {
          socketStore.set(connected);
          // A reconnect means events may have been missed.
          if (connected && connectedBefore) refreshCounters(qc);
          if (connected) connectedBefore = true;
        },
      );
    };
    const stop = () => {
      close?.();
      close = null;
      socketStore.set(false);
    };

    if (AppState.currentState !== 'background') start();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') {
        connectedBefore = false; // fresh socket; refresh explicitly instead
        start();
        refreshCounters(qc);
      } else if (s === 'background') stop();
    });
    return () => {
      sub.remove();
      stop();
    };
  }, [userId, qc]);

  return <>{children}</>;
}
