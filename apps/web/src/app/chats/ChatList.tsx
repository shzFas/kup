"use client";
import Link from "next/link";
import { useEffect } from "react";
import { formatPrice, type Chat } from "@kup/shared";
import { shortDateTime } from "@/lib/format";
import { useEvents } from "@/lib/events";
import { useI18n } from "@/i18n/client";
import { EmptyState, ErrorState } from "@/components/ListingCard";
import { Photo } from "@/components/Photo";
import { Badge } from "@/components/Modal";
import { ReadTicks, readBy } from "./ReadTicks";

export function ChatList() {
  const { t } = useI18n();
  const { chats, chatsError, loadChats } = useEvents();

  useEffect(() => {
    void loadChats();
  }, [loadChats]);

  return (
    <div>
      <h1 className="text-2xl sm:text-3xl font-bold">{t("nav.chats")}</h1>
      <div className="mt-5">
        {chatsError && !chats && <ErrorState />}
        {!chatsError && chats === null && (
          <div className="flex flex-col gap-2">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-20 rounded-2xl" />)}</div>
        )}
        {chats?.length === 0 && <EmptyState title={t("chats.emptyTitle")} text={t("chats.emptyText")} action={<Link href="/" className="btn-primary">{t("common.toListings")}</Link>} />}
        {chats && chats.length > 0 && (
          <ul className="card divide-y divide-gray-100 overflow-hidden">
            {chats.map((c) => (
              <ChatRow key={c.id} chat={c} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function ChatRow({ chat: c }: { chat: Chat }) {
  const { t, lang } = useI18n();
  const last = c.last_message;
  const read = !!last?.mine && readBy(c.peer_read_at, last.at);
  return (
    <li>
      <Link href={`/chats/${c.id}`} className={`flex gap-3 p-3 sm:p-4 hover:bg-gray-50 ${c.unread > 0 ? "bg-accent-50/50" : ""}`}>
        <div className="w-16 sm:w-20 shrink-0 aspect-[4/3] rounded-lg overflow-hidden">
          <Photo src={c.listing.photo ?? undefined} alt="" className="w-full h-full" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className={`truncate ${c.unread > 0 ? "font-semibold" : "font-medium"}`}>
              {c.peer.name || t("common.unnamed")}
              <span className="ml-1.5 text-xs font-normal text-gray-400">{c.role === "seller" ? t("chats.buyer") : t("chats.seller")}</span>
            </span>
            {last && (
              <span className="text-xs text-gray-400 shrink-0" suppressHydrationWarning>
                {shortDateTime(last.at, lang)}
              </span>
            )}
          </div>
          <div className="text-xs text-gray-500 truncate">
            {c.listing.title} · {formatPrice(c.listing.price, c.listing.currency)}
          </div>
          <div className="mt-0.5 flex items-center justify-between gap-2">
            <span className={`text-sm truncate ${c.unread > 0 ? "text-gray-900" : "text-gray-600"}`}>
              {last?.mine && <ReadTicks read={read} className="mr-1 align-[-3px]" />}
              {last ? (last.mine ? `${t("chats.you")}: ${last.text}` : last.text) : ""}
            </span>
            <Badge n={c.unread} className="shrink-0" />
          </div>
        </div>
      </Link>
    </li>
  );
}
