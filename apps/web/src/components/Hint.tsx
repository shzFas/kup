"use client";
import { useEffect, useId, useRef, useState } from "react";
import { useI18n } from "@/i18n/client";
import { IconInfo } from "./icons";

/**
 * ⓘ toggletip. Hover/focus shows it on desktop, tap toggles it on touch; Esc or an outside tap closes it.
 * Render inside a `relative` container: the bubble spans the container's width below the button row.
 */
export function HintButton({ hint, label }: { hint: string; label: string }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const id = useId();
  const btn = useRef<HTMLButtonElement>(null);
  const bubble = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        setPinned(false);
        btn.current?.focus();
      }
    };
    const onDoc = (e: Event) => {
      const n = e.target as Node;
      if (!btn.current?.contains(n) && !bubble.current?.contains(n)) {
        setOpen(false);
        setPinned(false);
      }
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("touchstart", onDoc, { passive: true });
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("touchstart", onDoc);
    };
  }, [open]);

  return (
    <>
      <button
        ref={btn}
        type="button"
        className={`inline-flex align-middle p-0.5 -m-0.5 rounded-full ${open ? "text-accent-600" : "text-gray-400 hover:text-accent-600"}`}
        aria-label={t("common.whatIs", { what: label })}
        aria-expanded={open}
        aria-controls={id}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          const next = !(open && pinned);
          setPinned(next);
          setOpen(next);
        }}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => !pinned && setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => !pinned && setOpen(false)}
      >
        <IconInfo size={16} />
      </button>
      {/* Live region stays mounted so screen readers announce the text when it appears. */}
      <div id={id} role="status" className="contents">
        {open && (
          <div
            ref={bubble}
            className="absolute left-0 right-0 top-full z-30 mt-1 rounded-xl bg-gray-900 px-3 py-2 text-[13px] font-normal leading-snug text-white shadow-lg"
          >
            {hint}
          </div>
        )}
      </div>
    </>
  );
}

/** Helper text under a form field. */
export function FieldHint({ hint, id }: { hint: string; id?: string }) {
  return (
    <p id={id} className="mt-1 text-xs leading-snug text-gray-500">
      {hint}
    </p>
  );
}
