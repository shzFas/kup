"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { ListingCard } from "@kup/shared";
import { api } from "@/lib/client-api";
import { errorMessage } from "@/lib/errors";
import { CardSkeleton, EmptyState, ErrorState, ListingCardView } from "@/components/ListingCard";
import { OwnerActions } from "@/components/listing/OwnerActions";
import { IconPlus } from "@/components/icons";

const TABS = [
  { value: "active", label: "Активные", empty: "У вас нет активных объявлений" },
  { value: "expired", label: "Истёк срок", empty: "Нет объявлений с истёкшим сроком" },
  { value: "archived", label: "Снятые", empty: "Нет снятых с публикации объявлений" },
  { value: "sold", label: "Проданные", empty: "Нет проданных объявлений" },
  { value: "blocked", label: "Заблокированные", empty: "Нет заблокированных объявлений" },
] as const;

type Tab = (typeof TABS)[number]["value"];

export function MyListings() {
  const [tab, setTab] = useState<Tab>("active");
  const [items, setItems] = useState<ListingCard[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // ListingCard has no moderation_reason / expires_at — fetched from the full listing.
  const [details, setDetails] = useState<Record<string, { reason: string | null; expires: string | null }>>({});

  const load = useCallback(async (t: Tab) => {
    setItems(null);
    setError(null);
    try {
      const list = await api().myListings(t);
      setItems(list);
      if (t === "blocked") {
        for (const it of list.slice(0, 50)) {
          api()
            .listing(it.id)
            .then((l) => setDetails((d) => ({ ...d, [it.id]: { reason: l.moderation_reason, expires: l.expires_at } })))
            .catch(() => {});
        }
      }
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);

  useEffect(() => {
    void load(tab);
  }, [tab, load]);

  const current = TABS.find((t) => t.value === tab)!;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl sm:text-3xl font-bold">Мои объявления</h1>
        <Link href="/new" className="btn-primary"><IconPlus size={18} /> Подать объявление</Link>
      </div>
      <div className="mt-5 flex gap-1 border-b border-gray-200 overflow-x-auto no-scrollbar" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.value}
            role="tab"
            aria-selected={tab === t.value}
            onClick={() => setTab(t.value)}
            className={`px-4 h-11 text-sm font-medium border-b-2 -mb-px whitespace-nowrap ${tab === t.value ? "border-accent-600 text-accent-700" : "border-transparent text-gray-500 hover:text-gray-800"}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="mt-5 flex flex-col gap-3">
        {error && <ErrorState text={error} />}
        {!error && items === null && [0, 1, 2].map((i) => <CardSkeleton key={i} layout="list" />)}
        {items?.length === 0 && (
          <EmptyState title={current.empty} action={tab === "active" ? <Link href="/new" className="btn-primary">Подать объявление</Link> : undefined} />
        )}
        {items?.map((it) => (
          <ListingCardView
            key={it.id}
            item={it}
            layout="list"
            footer={
              <div className="px-3 pb-3">
                <OwnerActions
                  key={`${it.id}:${details[it.id] ? 1 : 0}`}
                  compact
                  moderationReason={details[it.id]?.reason}
                  expiresAt={details[it.id]?.expires}
                  isOwner
                  id={it.id}
                  status={it.status}
                  onChanged={(s) => setItems((prev) => (prev ?? []).filter((x) => x.id !== it.id || s === tab))}
                />
              </div>
            }
          />
        ))}
      </div>
    </div>
  );
}
