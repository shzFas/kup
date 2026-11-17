"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Notification } from "@kup/shared";
import { api } from "@/lib/client-api";
import { errorMessage } from "@/lib/errors";
import { relativeDate } from "@/lib/format";
import { useEvents, useServerEvent } from "@/lib/events";
import { useI18n } from "@/i18n/client";
import { EmptyState, ErrorState } from "@/components/ListingCard";
import { Photo } from "@/components/Photo";
import { IconBookmark, IconTrendDown } from "@/components/icons";

const PAGE = 30;

export function NotificationsList() {
  const { t, lang } = useI18n();
  const router = useRouter();
  const { setNotifUnread, notifUnread } = useEvents();
  const [items, setItems] = useState<Notification[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api().notifications({ limit: PAGE });
      setItems(r.items);
      setHasMore(r.items.length >= PAGE);
      setNotifUnread(r.unread_count);
    } catch (e) {
      setError(errorMessage(e, lang));
    }
  }, [lang, setNotifUnread]);

  useEffect(() => {
    void load();
  }, [load]);

  useServerEvent((e) => {
    if (e.type !== "notification") return;
    setItems((prev) => (prev && !prev.some((n) => n.id === e.notification.id) ? [e.notification, ...prev] : prev));
  });

  async function more() {
    const last = items?.[items.length - 1];
    if (!last) return;
    setLoadingMore(true);
    try {
      const r = await api().notifications({ limit: PAGE, before: last.id });
      setItems((prev) => [...(prev ?? []), ...r.items.filter((n) => !prev?.some((p) => p.id === n.id))]);
      setHasMore(r.items.length >= PAGE);
    } catch {
      /* keep the button */
    } finally {
      setLoadingMore(false);
    }
  }

  async function readAll() {
    setItems((prev) => prev?.map((n) => ({ ...n, read: true })) ?? prev);
    setNotifUnread(0);
    await api().readNotifications().catch(() => {});
  }

  function open(n: Notification) {
    if (!n.read) {
      setItems((prev) => prev?.map((x) => (x.id === n.id ? { ...x, read: true } : x)) ?? prev);
      setNotifUnread((c) => Math.max(0, c - 1));
      api().readNotifications([n.id]).catch(() => {});
    }
    router.push(`/l/${n.listing_id}`);
  }

  const unread = items?.some((n) => !n.read) || notifUnread > 0;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl sm:text-3xl font-bold">{t("nav.notifications")}</h1>
        {unread && (
          <button type="button" className="btn-secondary !h-9" onClick={readAll}>
            {t("notif.readAll")}
          </button>
        )}
      </div>
      <div className="mt-5">
        {error && <ErrorState text={error} />}
        {!error && items === null && (
          <div className="flex flex-col gap-2">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-20 rounded-2xl" />)}</div>
        )}
        {items?.length === 0 && (
          <EmptyState
            title={t("notif.emptyTitle")}
            text={t("notif.emptyText")}
            action={<Link href="/searches" className="btn-secondary">{t("nav.searches")}</Link>}
          />
        )}
        {items && items.length > 0 && (
          <ul className="card divide-y divide-gray-100 overflow-hidden">
            {items.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => open(n)}
                  className={`w-full text-left flex gap-3 p-3 sm:p-4 hover:bg-gray-50 ${n.read ? "" : "bg-accent-50/60"}`}
                >
                  <div className="relative w-20 sm:w-24 shrink-0 aspect-[4/3] rounded-lg overflow-hidden">
                    <Photo src={n.image ?? undefined} alt="" className="w-full h-full" />
                    <span
                      className={`absolute bottom-1 left-1 rounded-md p-0.5 text-white ${n.type === "price_drop" ? "bg-green-600" : "bg-accent-600"}`}
                      title={n.type === "price_drop" ? t("notif.type.price_drop") : t("notif.type.saved_search")}
                    >
                      {n.type === "price_drop" ? <IconTrendDown size={14} /> : <IconBookmark size={14} />}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className={`text-sm leading-snug ${n.read ? "text-gray-800" : "font-semibold text-gray-900"}`}>{n.title}</div>
                    <div className="mt-0.5 text-sm text-gray-600 line-clamp-2">{n.body}</div>
                    <div className="mt-1 text-xs text-gray-400" suppressHydrationWarning>
                      {relativeDate(n.created_at, lang)}
                    </div>
                  </div>
                  {!n.read && <span className="mt-1.5 w-2.5 h-2.5 rounded-full bg-accent-600 shrink-0" aria-label={t("notif.unread")} />}
                </button>
              </li>
            ))}
          </ul>
        )}
        {hasMore && (
          <div className="mt-4 text-center">
            <button type="button" className="btn-secondary" disabled={loadingMore} onClick={more}>
              {loadingMore ? t("common.loading") : t("common.loadMore")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
