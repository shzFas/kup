"use client";
import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ApiError, REPORT_REASONS, type ListingStatus, type ReportReason } from "@kup/shared";
import { api } from "@/lib/client-api";
import { loginHref, useAuth } from "@/lib/auth";
import { useEvents } from "@/lib/events";
import { errorMessage } from "@/lib/errors";
import { Modal } from "../Modal";
import { IconChat, IconFlag } from "../icons";
import { useI18n } from "@/i18n/client";
import type { MsgKey } from "@/i18n/core";

const TEMPLATES: MsgKey[] = ["chat.tpl.available", "chat.tpl.bargain", "chat.tpl.view"];

function useIsOwner(sellerId?: string, isOwner?: boolean) {
  const { user } = useAuth();
  return !!isOwner || (!!user && !!sellerId && user.id === sellerId);
}

/** «Написать продавцу» — hidden for the owner and for non-active listings. */
export function ContactSellerButton({ listingId, sellerId, isOwner, status }: { listingId: string; sellerId?: string; isOwner?: boolean; status: ListingStatus }) {
  const { user } = useAuth();
  const owner = useIsOwner(sellerId, isOwner);
  const router = useRouter();
  const pathname = usePathname();
  const { upsertChat } = useEvents();
  const { t, lang } = useI18n();
  const templates = TEMPLATES.map((k) => t(k));
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(templates[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (owner || status !== "active") return null;

  async function send() {
    const body = text.trim();
    if (!body) return;
    setBusy(true);
    setError(null);
    try {
      const chat = await api().startChat(listingId, body);
      upsertChat(chat);
      router.push(`/chats/${chat.id}`);
    } catch (e) {
      if (e instanceof ApiError && e.status === 410) setError(t("chat.err.inactive"));
      else if (e instanceof ApiError && e.status === 400) setError(e.message || t("chat.err.cannot"));
      else setError(errorMessage(e, lang));
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="btn-secondary w-full !h-12 text-base"
        onClick={() => (user ? setOpen(true) : router.push(loginHref(pathname)))}
      >
        <IconChat size={18} /> {t("chat.writeSeller")}
      </button>
      {open && (
        <Modal
          title={t("chat.toSeller")}
          onClose={() => setOpen(false)}
          footer={
            <button type="button" className="btn-primary w-full !h-11" disabled={busy || !text.trim()} onClick={send}>
              {busy ? t("common.sending") : t("common.send")}
            </button>
          }
        >
          <div className="flex flex-wrap gap-2">
            {templates.map((tpl) => (
              <button key={tpl} type="button" onClick={() => setText(tpl)} className={`chip ${text === tpl ? "border-accent-500 bg-accent-50 text-accent-700" : "border-gray-200 bg-white hover:bg-gray-50"}`}>
                {tpl}
              </button>
            ))}
          </div>
          <textarea
            className="input !h-32 mt-3 py-2 resize-none"
            value={text}
            maxLength={2000}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void send();
              }
            }}
            placeholder={t("chat.yourMessage")}
            aria-label={t("chat.message")}
            autoFocus
          />
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        </Modal>
      )}
    </>
  );
}

/** «Пожаловаться» — hidden for the owner. */
export function ReportButton({ listingId, sellerId, isOwner }: { listingId: string; sellerId?: string; isOwner?: boolean }) {
  const { user } = useAuth();
  const owner = useIsOwner(sellerId, isOwner);
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const { t, lang } = useI18n();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (owner) return null;

  async function submit() {
    if (!reason) return;
    setBusy(true);
    setError(null);
    try {
      await api().report(listingId, reason, comment.trim());
      setDone(true);
    } catch (e) {
      setError(errorMessage(e, lang));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-red-600"
        onClick={() => (user ? setOpen(true) : router.push(loginHref(pathname)))}
      >
        <IconFlag size={16} /> {done ? t("report.sent") : t("report.button")}
      </button>
      {open && (
        <Modal
          title={t("report.title")}
          onClose={() => setOpen(false)}
          footer={
            done ? (
              <button type="button" className="btn-secondary w-full !h-11" onClick={() => setOpen(false)}>{t("common.close")}</button>
            ) : (
              <button type="button" className="btn-primary w-full !h-11" disabled={busy || !reason} onClick={submit}>
                {busy ? t("common.sending") : t("report.submit")}
              </button>
            )
          }
        >
          {done ? (
            <div className="py-6 text-center">
              <div className="text-lg font-semibold">{t("report.thanks")}</div>
              <p className="mt-1 text-sm text-gray-500">{t("report.thanksText")}</p>
            </div>
          ) : (
            <>
              <fieldset className="space-y-1">
                <legend className="text-sm text-gray-600 mb-2">{t("report.question")}</legend>
                {REPORT_REASONS.map((r) => (
                  <label key={r.value} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-gray-50 cursor-pointer">
                    <input type="radio" name="reason" value={r.value} checked={reason === r.value} onChange={() => setReason(r.value)} className="accent-accent-600 w-4 h-4" />
                    <span className="text-sm">{t(`report.reason.${r.value}` as MsgKey)}</span>
                  </label>
                ))}
              </fieldset>
              <textarea
                className="input !h-24 mt-3 py-2 resize-none"
                value={comment}
                maxLength={1000}
                onChange={(e) => setComment(e.target.value)}
                placeholder={t("report.commentPlaceholder")}
                aria-label={t("report.comment")}
              />
              {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
            </>
          )}
        </Modal>
      )}
    </>
  );
}
