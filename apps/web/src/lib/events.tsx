"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Chat, ServerEvent } from "@kup/shared";
import { api } from "./client-api";
import { useAuth } from "./auth";

type Listener = (e: ServerEvent) => void;

interface EventsState {
  connected: boolean;
  chatUnread: number;
  notifUnread: number;
  /** Chat list (null until someone asks for it via loadChats). */
  chats: Chat[] | null;
  chatsError: boolean;
  loadChats: () => Promise<void>;
  /** Insert or replace a chat in the list (e.g. after startChat). */
  upsertChat: (c: Chat) => void;
  /** Mark a chat read locally (call after api.readChat). */
  markChatRead: (id: string) => void;
  setNotifUnread: (n: number | ((prev: number) => number)) => void;
  refreshCounters: () => void;
  /** Subscribe to raw server events. */
  subscribe: (fn: Listener) => () => void;
  /** Conversation currently on screen — its incoming messages don't bump the unread counter. */
  setActiveChat: (id: string | null) => void;
}

const Ctx = createContext<EventsState | null>(null);

function sortChats(list: Chat[]): Chat[] {
  return [...list].sort((a, b) => (b.last_message?.at ?? "").localeCompare(a.last_message?.at ?? ""));
}

export function EventsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [connected, setConnected] = useState(false);
  const [chatUnread, setChatUnread] = useState(0);
  const [notifUnread, setNotifUnread] = useState(0);
  const [chats, setChats] = useState<Chat[] | null>(null);
  const [chatsError, setChatsError] = useState(false);
  const listeners = useRef(new Set<Listener>());
  const activeChat = useRef<string | null>(null);
  const chatsRef = useRef<Chat[] | null>(null);
  chatsRef.current = chats;

  const refreshCounters = useCallback(() => {
    if (!userId) return;
    api().chatUnread().then(setChatUnread, () => {});
    api().unreadNotifications().then(setNotifUnread, () => {});
  }, [userId]);

  const loadChats = useCallback(async () => {
    if (!userId) return;
    try {
      const r = await api().chats();
      setChats(sortChats(r.items));
      setChatUnread(r.unread_total);
      setChatsError(false);
    } catch {
      setChatsError(true);
    }
  }, [userId]);

  const upsertChat = useCallback((c: Chat) => {
    setChats((prev) => (prev ? sortChats([c, ...prev.filter((x) => x.id !== c.id)]) : prev));
  }, []);

  const markChatRead = useCallback((id: string) => {
    const before = chatsRef.current?.find((c) => c.id === id)?.unread ?? 0;
    setChats((prev) => prev?.map((c) => (c.id === id ? { ...c, unread: 0 } : c)) ?? prev);
    if (before > 0) setChatUnread((n) => Math.max(0, n - before));
    else if (!chatsRef.current) api().chatUnread().then(setChatUnread, () => {});
  }, []);

  // Reset on logout / user switch.
  useEffect(() => {
    setChats(null);
    setChatUnread(0);
    setNotifUnread(0);
    setConnected(false);
  }, [userId]);

  // Counters on login + on window focus.
  useEffect(() => {
    if (!userId) return;
    refreshCounters();
    const onFocus = () => {
      refreshCounters();
      if (chatsRef.current) void loadChats();
    };
    const onVis = () => document.visibilityState === "visible" && onFocus();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [userId, refreshCounters, loadChats]);

  // The socket.
  useEffect(() => {
    if (!userId) return;
    let wasConnected = false;
    const close = api().connectEvents(
      (e) => {
        if (e.type === "message") {
          const m = e.message;
          const mine = m.mine || m.sender_id === userId;
          const known = chatsRef.current?.some((c) => c.id === e.chat_id);
          const isActive = activeChat.current === e.chat_id && document.visibilityState === "visible";
          if (!mine && !isActive) setChatUnread((n) => n + 1);
          if (chatsRef.current) {
            if (known) {
              setChats((prev) =>
                prev
                  ? sortChats(
                      prev.map((c) =>
                        c.id === e.chat_id
                          ? { ...c, last_message: { text: m.text, at: m.created_at, mine }, unread: !mine && !isActive ? c.unread + 1 : c.unread }
                          : c,
                      ),
                    )
                  : prev,
              );
            } else {
              void loadChats();
            }
          }
        } else if (e.type === "read") {
          if (e.reader_id === userId) {
            // Read in another tab/device.
            const c = chatsRef.current?.find((x) => x.id === e.chat_id);
            if (c && c.unread > 0) {
              setChatUnread((n) => Math.max(0, n - c.unread));
              setChats((prev) => prev?.map((x) => (x.id === e.chat_id ? { ...x, unread: 0 } : x)) ?? prev);
            } else if (!c) api().chatUnread().then(setChatUnread, () => {});
          } else {
            setChats((prev) => prev?.map((x) => (x.id === e.chat_id ? { ...x, peer_read_at: e.at } : x)) ?? prev);
          }
        } else if (e.type === "notification") {
          if (!e.notification.read) setNotifUnread((n) => n + 1);
        }
        listeners.current.forEach((l) => l(e));
      },
      (ok) => {
        setConnected(ok);
        // After a reconnect we may have missed events: resync.
        if (ok && wasConnected) {
          refreshCounters();
          if (chatsRef.current) void loadChats();
        }
        if (ok) wasConnected = true;
      },
    );
    return close;
  }, [userId, refreshCounters, loadChats]);

  const subscribe = useCallback((fn: Listener) => {
    listeners.current.add(fn);
    return () => {
      listeners.current.delete(fn);
    };
  }, []);

  const setActiveChat = useCallback((id: string | null) => {
    activeChat.current = id;
  }, []);

  const value = useMemo<EventsState>(
    () => ({
      connected,
      chatUnread,
      notifUnread,
      chats,
      chatsError,
      loadChats,
      upsertChat,
      markChatRead,
      setNotifUnread,
      refreshCounters,
      subscribe,
      setActiveChat,
    }),
    [connected, chatUnread, notifUnread, chats, chatsError, loadChats, upsertChat, markChatRead, refreshCounters, subscribe, setActiveChat],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useEvents(): EventsState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useEvents outside EventsProvider");
  return ctx;
}

/** Subscribe to server events with a handler that may change every render. */
export function useServerEvent(handler: Listener) {
  const { subscribe } = useEvents();
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => subscribe((e) => ref.current(e)), [subscribe]);
}
