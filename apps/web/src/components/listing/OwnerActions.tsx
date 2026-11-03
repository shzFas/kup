"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ListingCard } from "@kup/shared";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/client-api";
import { errorMessage } from "@/lib/errors";
import { STATUS_TEXT, formatDate } from "@/lib/status";

type Status = ListingCard["status"];

/** Status/edit/delete buttons, rendered only for the owner. */
export function OwnerActions({
  id,
  sellerId,
  isOwner,
  status: initialStatus,
  expiresAt,
  moderationReason,
  onChanged,
  compact = false,
}: {
  id: string;
  sellerId?: string;
  isOwner?: boolean;
  status: Status;
  expiresAt?: string | null;
  moderationReason?: string | null;
  onChanged?: (s: Status | "deleted") => void;
  compact?: boolean;
}) {
  const { user } = useAuth();
  const router = useRouter();
  const [status, setStatus] = useState<Status>(initialStatus);
  const [expires, setExpires] = useState<string | null | undefined>(expiresAt);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const owner = isOwner || (!!user && !!sellerId && user.id === sellerId);
  if (!owner) return null;

  async function run(fn: () => Promise<unknown>, next: Status | "deleted") {
    setBusy(true);
    setError(null);
    try {
      const r = await fn();
      if (next !== "deleted") setStatus(next);
      if (r && typeof r === "object" && "expires_at" in r) setExpires((r as { expires_at: string | null }).expires_at);
      if (onChanged) onChanged(next);
      else if (next === "deleted") router.push("/my");
      else router.refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const setTo = (s: "archived" | "sold") => run(() => api().setListingStatus(id, s), s);
  const prolong = () => run(() => api().prolong(id), "active");
  const cls = compact ? "!h-9 !px-3 text-[13px]" : "";

  return (
    <div className={compact ? "" : "card p-4"}>
      {!compact && status === "expired" && (
        <div className="mb-3 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2.5 text-sm text-amber-800">
          <b>Срок размещения истёк.</b> Объявление не показывается в поиске — продлите его ещё на 30 дней.
        </div>
      )}
      {status === "blocked" && (
        <div className={`${compact ? "mb-2" : "mb-3"} rounded-xl bg-red-50 border border-red-200 px-3 py-2.5 text-sm text-red-800`}>
          <b>Заблокировано модератором.</b>
          {moderationReason ? <> Причина: {moderationReason}</> : null}
        </div>
      )}
      {!compact && (
        <div className="mb-3 text-sm text-gray-600">
          Это ваше объявление · статус: <b className="text-gray-900">{STATUS_TEXT[status]}</b>
          {status === "active" && expires && (
            <div className="mt-0.5 text-gray-500" suppressHydrationWarning>Активно до {formatDate(expires)}</div>
          )}
        </div>
      )}
      {compact && status === "active" && expires && (
        <div className="mb-2 text-xs text-gray-500" suppressHydrationWarning>Активно до {formatDate(expires)}</div>
      )}
      <div className="flex flex-wrap gap-2">
        {status !== "blocked" && <Link href={`/l/${id}/edit`} className={`btn-secondary ${cls}`}>Редактировать</Link>}
        {status === "active" && (
          <>
            <button disabled={busy} className={`btn-secondary ${cls}`} onClick={() => setTo("archived")}>Снять с публикации</button>
            <button disabled={busy} className={`btn-secondary ${cls}`} onClick={() => setTo("sold")}>Продано</button>
          </>
        )}
        {status === "expired" && (
          <button disabled={busy} className={`btn-primary ${cls}`} onClick={prolong}>Продлить</button>
        )}
        {(status === "archived" || status === "sold") && (
          <button disabled={busy} className={`btn-primary ${cls}`} onClick={prolong}>Активировать</button>
        )}
        <button
          disabled={busy}
          className={`btn-danger ${cls}`}
          onClick={() => {
            if (window.confirm("Удалить объявление? Это действие нельзя отменить.")) void run(() => api().deleteListing(id), "deleted");
          }}
        >
          Удалить
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
