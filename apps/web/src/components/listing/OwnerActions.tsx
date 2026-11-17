"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ListingCard } from "@kup/shared";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/client-api";
import { errorMessage } from "@/lib/errors";
import { STATUS_LABEL } from "@/lib/status";
import { formatDate } from "@/lib/format";
import { useI18n } from "@/i18n/client";

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
  const { t, lang } = useI18n();
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
      setError(errorMessage(e, lang));
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
          <b>{t("owner.expiredTitle")}</b> {t("owner.expiredText")}
        </div>
      )}
      {status === "blocked" && (
        <div className={`${compact ? "mb-2" : "mb-3"} rounded-xl bg-red-50 border border-red-200 px-3 py-2.5 text-sm text-red-800`}>
          <b>{t("owner.blockedTitle")}</b>
          {moderationReason ? <> {t("owner.reason", { reason: moderationReason })}</> : null}
          {!compact && <div className="mt-1 text-red-700/80">{t("owner.blockedText")}</div>}
        </div>
      )}
      {!compact && (
        <div className="mb-3 text-sm text-gray-600">
          {t("owner.yours")} · {t("owner.status")}: <b className="text-gray-900">{t(STATUS_LABEL[status]).toLowerCase()}</b>
          {status === "active" && expires && (
            <div className="mt-0.5 text-gray-500" suppressHydrationWarning>{t("owner.activeUntil", { date: formatDate(expires, lang) })}</div>
          )}
        </div>
      )}
      {compact && status === "active" && expires && (
        <div className="mb-2 text-xs text-gray-500" suppressHydrationWarning>{t("owner.activeUntil", { date: formatDate(expires, lang) })}</div>
      )}
      <div className="flex flex-wrap gap-2">
        {status !== "blocked" && <Link href={`/l/${id}/edit`} className={`btn-secondary ${cls}`}>{t("owner.edit")}</Link>}
        {status === "active" && (
          <>
            <button disabled={busy} className={`btn-secondary ${cls}`} onClick={() => setTo("archived")}>{t("owner.archive")}</button>
            <button disabled={busy} className={`btn-secondary ${cls}`} onClick={() => setTo("sold")}>{t("owner.sold")}</button>
          </>
        )}
        {status === "expired" && (
          <button disabled={busy} className={`btn-primary ${cls}`} onClick={prolong}>{t("owner.prolong")}</button>
        )}
        {(status === "archived" || status === "sold") && (
          <button disabled={busy} className={`btn-primary ${cls}`} onClick={prolong}>{t("owner.activate")}</button>
        )}
        <button
          disabled={busy}
          className={`btn-danger ${cls}`}
          onClick={() => {
            if (window.confirm(t("owner.deleteConfirm"))) void run(() => api().deleteListing(id), "deleted");
          }}
        >
          {t("common.delete")}
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
