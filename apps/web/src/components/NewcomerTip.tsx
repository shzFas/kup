"use client";
import { useEffect, useState } from "react";
import { useI18n } from "@/i18n/client";
import { IconInfo, IconLightbulb, IconX } from "./icons";

const KEY = "kup.newcomerTip.dismissed";

/** First-visit tip about the ⓘ hints. Dismissal is remembered in localStorage. */
export function NewcomerTip() {
  const { t } = useI18n();
  const [show, setShow] = useState(false);
  useEffect(() => {
    try {
      setShow(localStorage.getItem(KEY) !== "1");
    } catch {
      setShow(true);
    }
  }, []);
  if (!show) return null;
  const dismiss = () => {
    setShow(false);
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      /* ignore */
    }
  };
  const [before, after] = t("tip.text").split("{i}");
  return (
    <div role="note" className="mb-5 flex items-start gap-3 rounded-2xl border border-accent-100 bg-accent-50 px-4 py-3 text-sm text-accent-700">
      <IconLightbulb size={20} className="shrink-0 mt-0.5" />
      <p className="flex-1">
        <b>{t("tip.title")}</b> {before}
        {after !== undefined && (
          <>
            <IconInfo size={15} className="inline -mt-0.5" aria-label="ⓘ" />
            {after}
          </>
        )}
      </p>
      <button type="button" onClick={dismiss} className="p-1 -m-1 rounded-lg hover:bg-accent-100" aria-label={t("tip.dismiss")}>
        <IconX size={16} />
      </button>
    </div>
  );
}
