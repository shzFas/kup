"use client";
import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ApiError, formatPrice, type Chat, type Message } from "@kup/shared";
import { api } from "@/lib/client-api";
import { useAuth } from "@/lib/auth";
import { errorMessage } from "@/lib/errors";
import { dayKey, dayLabel } from "@/lib/format";
import { useEvents, useServerEvent } from "@/lib/events";
import { useI18n } from "@/i18n/client";
import { LOCALES, TZ } from "@/i18n/core";
import { EmptyState } from "@/components/ListingCard";
import { Photo } from "@/components/Photo";
import { IconArrowLeft, IconSend } from "@/components/icons";
import { ReadTicks, readBy } from "../ReadTicks";

const PAGE = 50;

function mergeMessages(a: Message[], b: Message[]): Message[] {
  const byId = new Map<string, Message>();
  for (const m of [...a, ...b]) byId.set(m.id, m);
  return [...byId.values()].sort((x, y) => new Date(x.created_at).getTime() - new Date(y.created_at).getTime());
}

export function ChatRoom({ id }: { id: string }) {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const { setActiveChat, markChatRead, upsertChat, connected } = useEvents();
  const [chat, setChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "not_found" | "error">("loading");
  const [hasOlder, setHasOlder] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  // How to adjust scroll after the next render: stick to the bottom, or keep position when older messages are prepended.
  const scrollMode = useRef<{ kind: "bottom" } | { kind: "keep"; fromBottom: number } | null>({ kind: "bottom" });
  const pendingRead = useRef(false);
  const meId = user?.id;

  const isMine = useCallback((m: Message) => m.mine || (!!meId && m.sender_id === meId), [meId]);

  const markRead = useCallback(() => {
    if (document.visibilityState !== "visible") {
      pendingRead.current = true;
      return;
    }
    pendingRead.current = false;
    api()
      .readChat(id)
      .then(() => markChatRead(id))
      .catch(() => {});
  }, [id, markChatRead]);

  const nearBottom = () => {
    const el = scroller.current;
    return !el || el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  };

  // Initial load.
  useEffect(() => {
    let cancelled = false;
    setState("loading");
    Promise.all([api().chat(id), api().chatMessages(id, { limit: PAGE })])
      .then(([c, msgs]) => {
        if (cancelled) return;
        setChat(c);
        setMessages(mergeMessages([], msgs));
        setHasOlder(msgs.length >= PAGE);
        setState("ok");
        scrollMode.current = { kind: "bottom" };
        markRead();
      })
      .catch((e) => !cancelled && setState(e instanceof ApiError && (e.status === 404 || e.status === 403) ? "not_found" : "error"));
    return () => {
      cancelled = true;
    };
  }, [id, markRead, lang]);

  // This conversation is on screen: its messages must not bump the global unread counter.
  useEffect(() => {
    setActiveChat(id);
    const onVis = () => {
      if (document.visibilityState === "visible" && pendingRead.current) markRead();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      setActiveChat(null);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [id, setActiveChat, markRead]);

  // After a reconnect we may have missed messages — fetch the latest page and merge.
  const wasConnected = useRef(connected);
  useEffect(() => {
    if (connected && !wasConnected.current && state === "ok") {
      api()
        .chatMessages(id, { limit: PAGE })
        .then((msgs) => {
          if (nearBottom()) scrollMode.current = { kind: "bottom" };
          setMessages((prev) => mergeMessages(prev ?? [], msgs));
        })
        .catch(() => {});
      api().chat(id).then(setChat, () => {});
    }
    wasConnected.current = connected;
  }, [connected, id, state]);

  useServerEvent((e) => {
    if (e.type === "message" && e.chat_id === id) {
      if (nearBottom() || isMine(e.message)) scrollMode.current = { kind: "bottom" };
      setMessages((prev) => mergeMessages(prev ?? [], [e.message]));
      if (!isMine(e.message)) markRead();
    } else if (e.type === "read" && e.chat_id === id && e.reader_id !== meId) {
      setChat((c) => (c ? { ...c, peer_read_at: e.at } : c));
    }
  });

  useLayoutEffect(() => {
    const el = scroller.current;
    const mode = scrollMode.current;
    if (!el || !mode) return;
    if (mode.kind === "bottom") el.scrollTop = el.scrollHeight;
    else el.scrollTop = el.scrollHeight - mode.fromBottom;
    scrollMode.current = null;
  }, [messages]);

  async function loadOlder() {
    const first = messages?.[0];
    if (!first || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const older = await api().chatMessages(id, { before: first.id, limit: PAGE });
      const el = scroller.current;
      scrollMode.current = { kind: "keep", fromBottom: el ? el.scrollHeight - el.scrollTop : 0 };
      setMessages((prev) => mergeMessages(older, prev ?? []));
      setHasOlder(older.length >= PAGE);
    } catch {
      /* keep the button for a retry */
    } finally {
      setLoadingOlder(false);
    }
  }

  async function send() {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    setSendError(null);
    try {
      const m = await api().sendMessage(id, body);
      scrollMode.current = { kind: "bottom" };
      setMessages((prev) => mergeMessages(prev ?? [], [m]));
      setText("");
      if (chat) upsertChat({ ...chat, last_message: { text: m.text, at: m.created_at, mine: true }, unread: 0 });
      input.current?.focus();
    } catch (e) {
      setSendError(e instanceof ApiError && e.status === 410 ? t("chat.err.inactive") : errorMessage(e, lang));
    } finally {
      setSending(false);
    }
  }

  if (state === "not_found" || state === "error") {
    return (
      <div className="px-4 py-8">
        <EmptyState
          title={state === "error" ? t("chats.loadFailed") : t("chats.notFound")}
          action={<Link href="/chats" className="btn-secondary">{t("chats.back")}</Link>}
        />
      </div>
    );
  }

  const time = (iso: string) => new Date(iso).toLocaleTimeString(LOCALES[lang], { hour: "2-digit", minute: "2-digit", timeZone: TZ });

  return (
    <div className="card !rounded-none sm:!rounded-2xl flex flex-col h-[calc(100dvh-4rem)] sm:h-[calc(100dvh-6rem)] overflow-hidden">
      {/* Header: peer + listing */}
      <div className="shrink-0 flex items-center gap-3 border-b border-gray-100 px-3 sm:px-4 py-2.5">
        <Link href="/chats" className="p-2 -ml-2 rounded-lg hover:bg-gray-100" aria-label={t("chats.back")}>
          <IconArrowLeft size={20} />
        </Link>
        {chat ? (
          <Link href={`/l/${chat.listing.id}`} className="flex items-center gap-3 min-w-0 flex-1 group">
            <div className="w-14 shrink-0 aspect-[4/3] rounded-md overflow-hidden">
              <Photo src={chat.listing.photo ?? undefined} alt="" className="w-full h-full" />
            </div>
            <div className="min-w-0">
              <div className="font-semibold truncate">
                {chat.peer.name || t("common.unnamed")}
                <span className="ml-1.5 text-xs font-normal text-gray-400">{chat.role === "seller" ? t("chats.buyer") : t("chats.seller")}</span>
              </div>
              <div className="text-xs text-gray-500 truncate group-hover:text-accent-600">
                {chat.listing.title} · {formatPrice(chat.listing.price, chat.listing.currency)}
              </div>
            </div>
          </Link>
        ) : (
          <div className="flex-1 space-y-1.5">
            <div className="skeleton h-4 w-40" />
            <div className="skeleton h-3 w-56" />
          </div>
        )}
        {!connected && state === "ok" && (
          <span className="text-[11px] text-amber-700 bg-amber-50 rounded-md px-1.5 py-0.5 shrink-0" title={t("chats.offlineHint")}>
            {t("chats.offline")}
          </span>
        )}
      </div>

      {/* Messages */}
      <div ref={scroller} className="flex-1 overflow-y-auto px-3 sm:px-5 py-3 bg-[#f6f7f9]" aria-live="polite" aria-relevant="additions">
        {hasOlder && (
          <div className="text-center mb-3">
            <button type="button" className="btn-secondary !h-8 text-xs" disabled={loadingOlder} onClick={loadOlder}>
              {loadingOlder ? t("common.loading") : t("chats.loadOlder")}
            </button>
          </div>
        )}
        {messages === null && (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className={`skeleton h-10 w-2/3 rounded-2xl ${i % 2 ? "ml-auto" : ""}`} />
            ))}
          </div>
        )}
        {messages?.length === 0 && <p className="text-center text-sm text-gray-400 py-10">{t("chats.noMessages")}</p>}
        {messages?.map((m, i) => {
          const prev = messages[i - 1];
          const mine = isMine(m);
          const newDay = !prev || dayKey(new Date(prev.created_at)) !== dayKey(new Date(m.created_at));
          const grouped = !newDay && prev && isMine(prev) === mine;
          return (
            <div key={m.id}>
              {newDay && (
                <div className="my-3 text-center">
                  <span className="text-xs text-gray-500 bg-white rounded-full px-3 py-1 shadow-sm" suppressHydrationWarning>
                    {dayLabel(m.created_at, lang)}
                  </span>
                </div>
              )}
              <div className={`flex ${mine ? "justify-end" : "justify-start"} ${grouped ? "mt-0.5" : "mt-2"}`}>
                <div
                  className={`max-w-[80%] rounded-2xl px-3 py-1.5 text-[15px] leading-snug shadow-sm whitespace-pre-wrap break-words ${
                    mine ? "bg-accent-600 text-white rounded-br-md" : "bg-white text-gray-900 rounded-bl-md"
                  }`}
                >
                  {m.text}
                  <span className={`ml-2 inline-flex items-center gap-0.5 align-bottom text-[11px] ${mine ? "text-white/75" : "text-gray-400"}`} suppressHydrationWarning>
                    {time(m.created_at)}
                    {mine && <ReadTicks read={readBy(chat?.peer_read_at, m.created_at)} className={readBy(chat?.peer_read_at, m.created_at) ? "!text-white" : "!text-white/70"} />}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Composer */}
      <form
        className="shrink-0 border-t border-gray-100 p-2.5 sm:p-3 pb-[max(0.625rem,env(safe-area-inset-bottom))] flex items-end gap-2 bg-white"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <div className="flex-1 min-w-0">
          {sendError && <p className="mb-1 text-xs text-red-600">{sendError}</p>}
          <textarea
            ref={input}
            className="input !h-auto min-h-10 max-h-36 py-2 resize-none"
            rows={1}
            value={text}
            maxLength={2000}
            placeholder={t("chat.yourMessage")}
            aria-label={t("chat.message")}
            onChange={(e) => {
              setText(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = `${Math.min(e.target.scrollHeight, 144)}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void send();
              }
            }}
          />
        </div>
        <button type="submit" className="btn-primary !px-0 w-10 shrink-0" disabled={sending || !text.trim()} aria-label={t("common.send")}>
          <IconSend size={18} />
        </button>
      </form>
    </div>
  );
}
