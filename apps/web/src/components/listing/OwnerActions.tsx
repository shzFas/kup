"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ListingCard } from "@kup/shared";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/client-api";
import { errorMessage } from "@/lib/errors";

type Status = ListingCard["status"];

/** Status/edit/delete buttons, rendered only for the owner. */
export function OwnerActions({
  id,
  sellerId,
  isOwner,
  status: initialStatus,
  onChanged,
  compact = false,
}: {
  id: string;
  sellerId?: string;
  isOwner?: boolean;
  status: Status;
  onChanged?: (s: Status | "deleted") => void;
  compact?: boolean;
}) {
  const { user } = useAuth();
  const router = useRouter();
  const [status, setStatus] = useState<Status>(initialStatus);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const owner = isOwner || (!!user && !!sellerId && user.id === sellerId);
  if (!owner) return null;

  async function run(fn: () => Promise<unknown>, next: Status | "deleted") {
    setBusy(true);
    setError(null);
    try {
      await fn();
      if (next !== "deleted") setStatus(next);
      if (onChanged) onChanged(next);
      else if (next === "deleted") router.push("/my");
      else router.refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const setTo = (s: Status) => run(() => api().setListingStatus(id, s), s);
  const cls = compact ? "!h-9 !px-3 text-[13px]" : "";

  return (
    <div className={compact ? "" : "card p-4"}>
      {!compact && (
        <div className="mb-3 text-sm text-gray-600">
          Это ваше объявление · статус: <b className="text-gray-900">{status === "active" ? "активно" : status === "sold" ? "продано" : "снято с публикации"}</b>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Link href={`/l/${id}/edit`} className={`btn-secondary ${cls}`}>Редактировать</Link>
        {status === "active" ? (
          <>
            <button disabled={busy} className={`btn-secondary ${cls}`} onClick={() => setTo("archived")}>Снять с публикации</button>
            <button disabled={busy} className={`btn-secondary ${cls}`} onClick={() => setTo("sold")}>Продано</button>
          </>
        ) : (
          <button disabled={busy} className={`btn-primary ${cls}`} onClick={() => setTo("active")}>Активировать</button>
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
