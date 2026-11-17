"use client";
import { useEffect, useRef, useState } from "react";
import { LANGS, type Lang } from "@kup/shared";
import { useI18n } from "@/i18n/client";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/client-api";
import { IconChevronDown, IconGlobe } from "./icons";

/** Saves the UI language to the profile (used for notifications). Errors are ignored: the cookie is what matters. */
function useSaveLang() {
  const { user, setUser } = useAuth();
  return (l: Lang) => {
    if (!user || user.lang === l) return;
    api()
      .updateMe({ lang: l })
      .then((u) => setUser({ ...u, lang: u.lang ?? l }))
      .catch(() => {});
  };
}

/** Header language menu (names from LANGS). */
export function LangSwitcher({ className = "" }: { className?: string }) {
  const { lang, setLang, switching, t } = useI18n();
  const save = useSaveLang();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent | TouchEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("touchstart", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("touchstart", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={box} className={`relative shrink-0 ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="btn-ghost !px-2 !gap-1 uppercase text-[13px]"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t("lang.label")}
        title={t("lang.label")}
      >
        {switching ? <span className="w-4 h-4 rounded-full border-2 border-gray-300 border-t-accent-600 animate-spin" /> : <IconGlobe size={18} />}
        <span>{lang}</span>
        <IconChevronDown size={14} className="text-gray-400 hidden sm:block" />
      </button>
      {open && (
        <ul role="listbox" aria-label={t("lang.label")} className="absolute right-0 mt-2 z-40 w-44 card p-1.5 shadow-lg">
          {LANGS.map((l) => (
            <li key={l.code} role="option" aria-selected={l.code === lang}>
              <button
                type="button"
                lang={l.code}
                onClick={() => {
                  setOpen(false);
                  if (l.code === lang) return;
                  setLang(l.code);
                  save(l.code);
                }}
                className={`w-full text-left rounded-lg px-3 py-2 text-sm hover:bg-gray-100 flex items-center justify-between ${l.code === lang ? "font-semibold text-accent-700" : ""}`}
              >
                {l.name}
                <span className="text-xs uppercase text-gray-400">{l.code}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Keeps the profile language and the UI language in sync after login:
 * no explicit choice on this device → adopt the profile language; explicit choice → store it in the profile.
 */
export function LangSync() {
  const { user } = useAuth();
  const { lang, explicit, setLang } = useI18n();
  const save = useSaveLang();
  const done = useRef<string | null>(null);
  useEffect(() => {
    if (!user || done.current === user.id) return;
    done.current = user.id;
    if (!user.lang || user.lang === lang) return;
    if (explicit) save(lang);
    else setLang(user.lang);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, lang, explicit]);
  return null;
}
