"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { formatPrice, type ListingCard, type ListingStatus, type Report } from "@kup/shared";
import { api } from "@/lib/client-api";
import { useAuth } from "@/lib/auth";
import { errorMessage } from "@/lib/errors";
import { relativeDate } from "@/lib/format";
import { STATUS_LABEL } from "@/lib/status";
import { useI18n } from "@/i18n/client";
import type { MsgKey } from "@/i18n/core";
import { EmptyState, ErrorState } from "@/components/ListingCard";
import { Modal } from "@/components/Modal";
import { Photo } from "@/components/Photo";
import { IconSearch, IconShield } from "@/components/icons";

const PAGE_SIZE = 20;

export function AdminPanel() {
  const { user } = useAuth();
  const { t } = useI18n();
  const [tab, setTab] = useState<"reports" | "listings">("reports");
  if (!user) return null;
  if (user.role !== "moderator" && user.role !== "admin") {
    return <EmptyState title={t("form.noAccess")} text={t("admin.noAccess")} action={<Link href="/" className="btn-secondary">{t("common.toHome")}</Link>} />;
  }
  return (
    <div>
      <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
        <IconShield size={26} className="text-accent-600" /> {t("nav.admin")}
      </h1>
      <div className="mt-5 flex gap-1 border-b border-gray-200" role="tablist">
        {(["reports", "listings"] as const).map((k) => (
          <button
            key={k}
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={`px-4 h-11 text-sm font-medium border-b-2 -mb-px ${tab === k ? "border-accent-600 text-accent-700" : "border-transparent text-gray-500 hover:text-gray-800"}`}
          >
            {t(k === "reports" ? "admin.reports" : "admin.listings")}
          </button>
        ))}
      </div>
      <div className="mt-5">{tab === "reports" ? <ReportsTab /> : <ListingsTab />}</div>
    </div>
  );
}

/** Asks for a block reason; resolves with the text or null if cancelled. */
function BlockDialog({ title, onCancel, onConfirm }: { title: string; onCancel: () => void; onConfirm: (reason: string) => Promise<void> }) {
  const { t, lang } = useI18n();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const presets: MsgKey[] = ["report.reason.fraud", "report.reason.wrong_price", "report.reason.duplicate", "report.reason.wrong_category", "report.reason.offensive"];
  return (
    <Modal
      title={t("admin.blockTitle")}
      onClose={onCancel}
      footer={
        <button
          type="button"
          className="btn-primary w-full !h-11 !bg-red-600 hover:!bg-red-700"
          disabled={busy || !reason.trim()}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await onConfirm(reason.trim());
            } catch (e) {
              setError(errorMessage(e, lang));
              setBusy(false);
            }
          }}
        >
          {busy ? t("common.sending") : t("admin.block")}
        </button>
      }
    >
      <p className="text-sm text-gray-600 mb-3 line-clamp-2">{title}</p>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {presets.map((k) => (
          <button key={k} type="button" className="chip !h-7 text-xs border-gray-200 bg-white hover:bg-gray-50" onClick={() => setReason(t(k))}>
            {t(k)}
          </button>
        ))}
      </div>
      <label className="block">
        <span className="block text-sm font-medium mb-1.5">{t("admin.blockReason")}</span>
        <textarea className="input !h-24 py-2 resize-none" value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} autoFocus />
        <span className="block mt-1 text-xs text-gray-500">{t("admin.blockReasonHint")}</span>
      </label>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </Modal>
  );
}

function MiniListing({ l }: { l: ListingCard }) {
  const { t, lang } = useI18n();
  return (
    <Link href={`/l/${l.id}`} target="_blank" className="flex gap-3 min-w-0 group">
      <div className="w-24 shrink-0 aspect-[4/3] rounded-lg overflow-hidden">
        <Photo src={l.photos[0]} alt="" className="w-full h-full" />
      </div>
      <div className="min-w-0">
        <div className="font-medium text-sm leading-snug line-clamp-2 group-hover:text-accent-600">{l.title}</div>
        <div className="text-sm font-semibold">{formatPrice(l.price, l.currency, l.price_suffix)}</div>
        <div className="text-xs text-gray-500 flex flex-wrap gap-x-2">
          <span>{l.city?.name}</span>
          <span suppressHydrationWarning>{relativeDate(l.published_at, lang)}</span>
          <StatusBadge status={l.status} t={t} />
        </div>
      </div>
    </Link>
  );
}

function StatusBadge({ status, t }: { status: ListingStatus; t: (k: MsgKey) => string }) {
  const cls = status === "active" ? "text-green-700" : status === "blocked" ? "text-red-600" : "text-amber-700";
  return <span className={cls}>{t(STATUS_LABEL[status])}</span>;
}

function Pager({ page, total, onPage }: { page: number; total: number; onPage: (p: number) => void }) {
  const { t } = useI18n();
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (pages <= 1) return null;
  return (
    <nav className="mt-5 flex items-center justify-center gap-2" aria-label={t("common.pages")}>
      <button type="button" className="btn-secondary !h-9" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        {t("common.prev")}
      </button>
      <span className="text-sm text-gray-500">
        {page} / {pages}
      </span>
      <button type="button" className="btn-secondary !h-9" disabled={page >= pages} onClick={() => onPage(page + 1)}>
        {t("common.next")}
      </button>
    </nav>
  );
}

function ReportsTab() {
  const { t, tn, lang } = useI18n();
  const [status, setStatus] = useState<"open" | "resolved">("open");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ items: Report[]; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [blocking, setBlocking] = useState<Report | null>(null);
  const [rowError, setRowError] = useState<{ id: string; text: string } | null>(null);

  const load = useCallback(async () => {
    setData(null);
    setError(null);
    try {
      setData(await api().admin.reports(status, page));
    } catch (e) {
      setError(errorMessage(e, lang));
    }
  }, [status, page, lang]);

  useEffect(() => {
    void load();
  }, [load]);

  // A block closes every open report on that listing.
  const dropListing = (listingId: string) =>
    setData((d) => (d ? { items: d.items.filter((r) => r.listing.id !== listingId), total: Math.max(0, d.total - d.items.filter((r) => r.listing.id === listingId).length) } : d));

  async function dismiss(r: Report) {
    setRowError(null);
    try {
      await api().admin.resolveReport(r.id, "dismiss");
      setData((d) => (d ? { items: d.items.filter((x) => x.id !== r.id), total: Math.max(0, d.total - 1) } : d));
    } catch (e) {
      setRowError({ id: r.id, text: errorMessage(e, lang) });
    }
  }

  return (
    <div>
      <div className="flex gap-2 mb-4">
        {(["open", "resolved"] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => {
              setStatus(s);
              setPage(1);
            }}
            className={`chip ${status === s ? "border-gray-900 bg-gray-900 text-white" : "border-gray-200 bg-white"}`}
          >
            {t(s === "open" ? "admin.open" : "admin.resolved")}
          </button>
        ))}
        {data && <span className="ml-auto self-center text-sm text-gray-500">{tn("admin.reportsCount", data.total)}</span>}
      </div>
      {error && <ErrorState text={error} />}
      {!error && !data && <div className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-28 rounded-2xl" />)}</div>}
      {data?.items.length === 0 && <EmptyState title={t(status === "open" ? "admin.noOpen" : "admin.noResolved")} />}
      <div className="flex flex-col gap-3">
        {data?.items.map((r) => (
          <article key={r.id} className="card p-4">
            <div className="grid md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-4">
              <MiniListing l={r.listing} />
              <div className="text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-md bg-red-50 text-red-700 px-2 py-0.5 font-medium">{t(`report.reason.${r.reason}` as MsgKey)}</span>
                  {r.reports_for_listing > 1 && <span className="text-xs text-red-600 font-medium">{tn("admin.reportsForListing", r.reports_for_listing)}</span>}
                  <span className="text-xs text-gray-400" suppressHydrationWarning>
                    {relativeDate(r.created_at, lang)}
                  </span>
                </div>
                {r.comment && <p className="mt-2 text-gray-700 italic whitespace-pre-line break-words">{r.comment}</p>}
                <p className="mt-1 text-xs text-gray-400 truncate">
                  {t("admin.reporter")}: {r.reporter_id}
                </p>
              </div>
            </div>
            {r.status === "open" && (
              <div className="mt-3 pt-3 border-t border-gray-100 flex flex-wrap gap-2 justify-end">
                <button type="button" className="btn-secondary !h-9" onClick={() => void dismiss(r)}>
                  {t("admin.dismiss")}
                </button>
                <button type="button" className="btn-danger !h-9" onClick={() => setBlocking(r)} disabled={r.listing.status === "blocked"}>
                  {t("admin.block")}
                </button>
              </div>
            )}
            {rowError?.id === r.id && <p className="mt-2 text-sm text-red-600">{rowError.text}</p>}
          </article>
        ))}
      </div>
      {data && <Pager page={page} total={data.total} onPage={setPage} />}
      {blocking && (
        <BlockDialog
          title={blocking.listing.title}
          onCancel={() => setBlocking(null)}
          onConfirm={async (reason) => {
            await api().admin.resolveReport(blocking.id, "block", reason);
            dropListing(blocking.listing.id);
            setBlocking(null);
          }}
        />
      )}
    </div>
  );
}

const LISTING_STATUSES: ListingStatus[] = ["active", "blocked", "expired", "archived", "sold"];

function ListingsTab() {
  const { t, tn, lang } = useI18n();
  const [status, setStatus] = useState<ListingStatus | "">("active");
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ items: ListingCard[]; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [blocking, setBlocking] = useState<ListingCard | null>(null);
  const [rowError, setRowError] = useState<{ id: string; text: string } | null>(null);

  const load = useCallback(async () => {
    setData(null);
    setError(null);
    try {
      setData(await api().admin.listings({ status: status || undefined, q: query || undefined, page }));
    } catch (e) {
      setError(errorMessage(e, lang));
    }
  }, [status, query, page, lang]);

  useEffect(() => {
    void load();
  }, [load]);

  const setRowStatus = (id: string, s: ListingStatus) =>
    setData((d) => (d ? { ...d, items: d.items.map((x) => (x.id === id ? { ...x, status: s } : x)) } : d));

  async function unblock(l: ListingCard) {
    setRowError(null);
    try {
      await api().admin.unblockListing(l.id);
      setRowStatus(l.id, "active");
    } catch (e) {
      setRowError({ id: l.id, text: errorMessage(e, lang) });
    }
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <form
          className="relative flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            setPage(1);
            setQuery(q.trim());
          }}
        >
          <IconSearch size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className="input pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("admin.searchPlaceholder")} aria-label={t("common.search")} type="search" />
        </form>
        <select
          className="input sm:!w-56"
          value={status}
          aria-label={t("owner.status")}
          onChange={(e) => {
            setStatus(e.target.value as ListingStatus | "");
            setPage(1);
          }}
        >
          <option value="">{t("admin.allStatuses")}</option>
          {LISTING_STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(STATUS_LABEL[s])}
            </option>
          ))}
        </select>
      </div>
      {data && <p className="mb-3 text-sm text-gray-500">{tn("count.listings", data.total)}</p>}
      {error && <ErrorState text={error} />}
      {!error && !data && <div className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-24 rounded-2xl" />)}</div>}
      {data?.items.length === 0 && <EmptyState title={t("common.nothingFound")} />}
      <div className="flex flex-col gap-3">
        {data?.items.map((l) => (
          <article key={l.id} className="card p-4 flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex-1 min-w-0">
              <MiniListing l={l} />
            </div>
            <div className="flex gap-2 sm:justify-end shrink-0">
              {l.status === "blocked" ? (
                <button type="button" className="btn-secondary !h-9" onClick={() => void unblock(l)}>
                  {t("admin.unblock")}
                </button>
              ) : (
                <button type="button" className="btn-danger !h-9" onClick={() => setBlocking(l)}>
                  {t("admin.block")}
                </button>
              )}
            </div>
            {rowError?.id === l.id && <p className="text-sm text-red-600">{rowError.text}</p>}
          </article>
        ))}
      </div>
      {data && <Pager page={page} total={data.total} onPage={setPage} />}
      {blocking && (
        <BlockDialog
          title={blocking.title}
          onCancel={() => setBlocking(null)}
          onConfirm={async (reason) => {
            await api().admin.blockListing(blocking.id, reason);
            setRowStatus(blocking.id, "blocked");
            setBlocking(null);
          }}
        />
      )}
    </div>
  );
}
