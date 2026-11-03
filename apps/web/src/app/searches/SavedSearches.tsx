"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { Category, SavedSearch } from "@kup/shared";
import { api } from "@/lib/client-api";
import { errorMessage } from "@/lib/errors";
import { formatDate } from "@/lib/format";
import { searchHref } from "@/lib/search";
import { useI18n } from "@/i18n/client";
import { EmptyState, ErrorState } from "@/components/ListingCard";
import { Switch } from "@/components/filters/widgets";
import { CategoryIcon, IconTrash } from "@/components/icons";
import { Badge } from "@/components/Modal";

export function SavedSearches() {
  const { t, tn, lang } = useI18n();
  const [items, setItems] = useState<SavedSearch[] | null>(null);
  const [cats, setCats] = useState<Category[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{ id: string; text: string } | null>(null);
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    api()
      .savedSearches()
      .then(setItems)
      .catch((e) => setError(errorMessage(e, lang)));
    api()
      .categories()
      .then(setCats)
      .catch(() => {});
  }, [lang]);

  const patchLocal = (s: SavedSearch) => setItems((prev) => prev?.map((x) => (x.id === s.id ? s : x)) ?? prev);

  async function update(s: SavedSearch, patch: { name?: string; notify?: boolean }) {
    setRowError(null);
    patchLocal({ ...s, ...patch });
    try {
      patchLocal(await api().updateSavedSearch(s.id, patch));
    } catch (e) {
      patchLocal(s);
      setRowError({ id: s.id, text: errorMessage(e, lang) });
    }
  }

  async function remove(s: SavedSearch) {
    if (!window.confirm(t("searches.deleteConfirm", { name: s.name }))) return;
    setRowError(null);
    try {
      await api().deleteSavedSearch(s.id);
      setItems((prev) => prev?.filter((x) => x.id !== s.id) ?? prev);
    } catch (e) {
      setRowError({ id: s.id, text: errorMessage(e, lang) });
    }
  }

  return (
    <div>
      <h1 className="text-2xl sm:text-3xl font-bold">{t("nav.searches")}</h1>
      <p className="mt-1 text-gray-500 text-sm">{t("searches.intro")}</p>
      <div className="mt-5 flex flex-col gap-3">
        {error && <ErrorState text={error} />}
        {!error && items === null && [0, 1, 2].map((i) => <div key={i} className="skeleton h-24 rounded-2xl" />)}
        {items?.length === 0 && (
          <EmptyState title={t("searches.emptyTitle")} text={t("searches.emptyText")} action={<Link href="/" className="btn-primary">{t("common.toListings")}</Link>} />
        )}
        {items?.map((s) => {
          const cat = cats.find((c) => c.slug === s.request.category);
          const href = searchHref(s.request.category, { filters: s.request.filters ?? {}, q: s.request.query ?? "", saved: s.id });
          const nFilters = Object.keys(s.request.filters ?? {}).length;
          return (
            <article key={s.id} className="card p-4 sm:p-5">
              <div className="flex items-start gap-3">
                <span className="w-11 h-11 rounded-xl bg-accent-50 text-accent-600 flex items-center justify-center shrink-0">
                  <CategoryIcon icon={cat?.icon ?? ""} size={22} />
                </span>
                <div className="min-w-0 flex-1">
                  {editing?.id === s.id ? (
                    <form
                      className="flex gap-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const name = editing.name.trim();
                        setEditing(null);
                        if (name && name !== s.name) void update(s, { name });
                      }}
                    >
                      <input
                        className="input !h-9"
                        value={editing.name}
                        maxLength={100}
                        autoFocus
                        aria-label={t("saved.name")}
                        onChange={(e) => setEditing({ id: s.id, name: e.target.value })}
                        onKeyDown={(e) => e.key === "Escape" && setEditing(null)}
                      />
                      <button type="submit" className="btn-primary !h-9">{t("common.save")}</button>
                    </form>
                  ) : (
                    <Link href={href} className="font-semibold hover:text-accent-600 inline-flex items-center gap-2 max-w-full">
                      <span className="truncate">{s.name}</span>
                      <Badge n={s.new_count} />
                    </Link>
                  )}
                  <div className="mt-0.5 text-sm text-gray-500 flex flex-wrap gap-x-2">
                    <span>{cat?.name ?? s.request.category}</span>
                    {s.request.query && <span>«{s.request.query}»</span>}
                    {nFilters > 0 && <span>{tn("searches.filters", nFilters)}</span>}
                    <span suppressHydrationWarning>· {formatDate(s.created_at, lang)}</span>
                  </div>
                  {s.new_count > 0 && (
                    <Link href={href} className="mt-1 inline-block text-sm font-medium text-accent-600 hover:underline">
                      {tn("searches.newCount", s.new_count)}
                    </Link>
                  )}
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-3">
                <div className="min-w-[14rem]">
                  <Switch label={t("saved.notify")} checked={s.notify} onChange={(v) => void update(s, { notify: v })} />
                </div>
                <div className="flex gap-2">
                  <Link href={href} className="btn-secondary !h-9">{t("searches.open")}</Link>
                  <button type="button" className="btn-ghost !h-9" onClick={() => setEditing({ id: s.id, name: s.name })}>
                    {t("searches.rename")}
                  </button>
                  <button type="button" className="btn-ghost !h-9 !px-2 text-red-600" onClick={() => void remove(s)} aria-label={t("common.delete")} title={t("common.delete")}>
                    <IconTrash size={18} />
                  </button>
                </div>
              </div>
              {rowError?.id === s.id && <p className="mt-2 text-sm text-red-600">{rowError.text}</p>}
            </article>
          );
        })}
      </div>
    </div>
  );
}
