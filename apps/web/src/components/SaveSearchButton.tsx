"use client";
import Link from "next/link";
import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { Filters } from "@kup/shared";
import { api } from "@/lib/client-api";
import { loginHref, useAuth } from "@/lib/auth";
import { errorMessage } from "@/lib/errors";
import { useI18n } from "@/i18n/client";
import { Modal } from "./Modal";
import { Switch } from "./filters/widgets";
import { IconBookmark, IconCheck } from "./icons";

/** «Сохранить поиск» on /s — saves category + query + filters, optionally with notifications. */
export function SaveSearchButton({
  category,
  categoryName,
  query,
  filters,
  chips,
}: {
  category: string;
  categoryName: string;
  query: string;
  filters: Filters;
  chips: string[];
}) {
  const { user } = useAuth();
  const { t, lang } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Key of the search that was just saved, so the button shows "saved" until filters change.
  const key = JSON.stringify([category, query, filters]);
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const saved = savedKey === key;

  function start() {
    if (!user) {
      router.push(loginHref(pathname + window.location.search));
      return;
    }
    const parts = [...(query ? [`«${query}»`] : []), ...chips.slice(0, 3)];
    setName(`${categoryName}${parts.length ? `: ${parts.join(", ")}` : ""}`.slice(0, 100));
    setNotify(true);
    setError(null);
    setOpen(true);
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await api().createSavedSearch({
        name: name.trim() || undefined,
        request: { category, filters, ...(query ? { query } : {}) },
        notify,
      });
      setSavedKey(key);
      setOpen(false);
    } catch (e) {
      setError(errorMessage(e, lang));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {saved ? (
        <Link href="/searches" className="btn-secondary !h-9 text-green-700">
          <IconCheck size={16} /> {t("saved.done")}
        </Link>
      ) : (
        <button type="button" onClick={start} className="btn-secondary !h-9">
          <IconBookmark size={16} /> {t("saved.save")}
        </button>
      )}
      {open && (
        <Modal
          title={t("saved.modalTitle")}
          onClose={() => setOpen(false)}
          footer={
            <button type="button" className="btn-primary w-full !h-11" disabled={busy} onClick={save}>
              {busy ? t("common.saving") : t("common.save")}
            </button>
          }
        >
          <label className="block">
            <span className="block text-sm font-medium mb-1.5">{t("saved.name")}</span>
            <input
              className="input"
              value={name}
              maxLength={100}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void save()}
              autoFocus
            />
          </label>
          <div className="mt-4">
            <Switch label={t("saved.notify")} checked={notify} onChange={setNotify} />
            <p className="mt-1 text-xs text-gray-500">{t("saved.notifyHint")}</p>
          </div>
          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        </Modal>
      )}
    </>
  );
}
