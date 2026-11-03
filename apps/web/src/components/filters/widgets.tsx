"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { formatNumber as fmtCount, type FilterDef, type Option, type RefItem } from "@kup/shared";
import { loadRefs } from "./refCache";
import { fmtNum as formatNumber } from "@/lib/num";
import { IconSearch } from "../icons";
import { HintButton } from "../Hint";
import { useI18n } from "@/i18n/client";

type Counts = Record<string, number> | undefined;

/* ---------- range ---------- */

function parseNum(s: string): number | undefined {
  const t = s.replace(/[\s  ]/g, "").replace(",", ".");
  if (t === "") return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

const show = (n: number | undefined) => (n == null ? "" : formatNumber(n));

export function RangeFilter({
  def,
  value,
  onChange,
}: {
  def: FilterDef;
  value: { gte?: number; lte?: number } | undefined;
  onChange: (v: { gte?: number; lte?: number } | undefined) => void;
}) {
  const [from, setFrom] = useState(show(value?.gte));
  const [to, setTo] = useState(show(value?.lte));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef({ from, to });
  latest.current = { from, to };

  // Sync when changed from outside (chip removed, reset).
  useEffect(() => {
    if (parseNum(latest.current.from) !== value?.gte) setFrom(show(value?.gte));
    if (parseNum(latest.current.to) !== value?.lte) setTo(show(value?.lte));
  }, [value?.gte, value?.lte]);

  function commit(f = latest.current.from, t = latest.current.to) {
    if (timer.current) clearTimeout(timer.current);
    let gte = parseNum(f);
    let lte = parseNum(t);
    if (gte != null && lte != null && gte > lte) [gte, lte] = [lte, gte];
    if (gte === value?.gte && lte === value?.lte) return;
    if (gte == null && lte == null) onChange(undefined);
    else onChange({ ...(gte != null ? { gte } : {}), ...(lte != null ? { lte } : {}) });
  }

  function schedule(f: string, t: string) {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => commit(f, t), 700);
  }

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const { t } = useI18n();
  const unit = def.unit ? ` ${def.unit}` : "";
  const inputCls = "input pr-8";
  const fieldProps = (which: "from" | "to") => ({
    type: "text" as const,
    inputMode: (def.step != null && def.step < 1) || def.type === "decimal" ? ("decimal" as const) : ("numeric" as const),
    value: which === "from" ? from : to,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = e.target.value.replace(/[^\d\s.,]/g, "");
      if (which === "from") { setFrom(v); schedule(v, to); }
      else { setTo(v); schedule(from, v); }
    },
    onBlur: () => { commit(); setFrom(show(parseNum(latest.current.from))); setTo(show(parseNum(latest.current.to))); },
    onKeyDown: (e: React.KeyboardEvent) => { if (e.key === "Enter") { e.preventDefault(); commit(); } },
  });

  return (
    <div>
      <div className="flex items-center gap-2">
        <label className="relative flex-1 min-w-0">
          <span className="sr-only">{def.label} {t("range.from")}</span>
          <input {...fieldProps("from")} placeholder={def.min != null ? `${t("range.from")} ${formatNumber(def.min)}` : t("range.from")} className={inputCls} />
          {unit && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">{def.unit}</span>}
        </label>
        <span className="text-gray-300">—</span>
        <label className="relative flex-1 min-w-0">
          <span className="sr-only">{def.label} {t("range.to")}</span>
          <input {...fieldProps("to")} placeholder={def.max != null ? `${t("range.to")} ${formatNumber(def.max)}` : t("range.to")} className={inputCls} />
          {unit && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">{def.unit}</span>}
        </label>
      </div>
      {def.presets && def.presets.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {def.presets.map((p) => {
            const active = value?.lte === p && value?.gte == null;
            return (
              <button
                key={p}
                type="button"
                onClick={() => {
                  if (active) onChange(undefined);
                  else onChange({ lte: p });
                }}
                className={`chip !h-7 !px-2.5 text-xs ${active ? "border-accent-500 bg-accent-50 text-accent-700" : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"}`}
              >
                {t("range.to")} {formatNumber(p)}{unit}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ---------- checkbox list (multi / multi_all) ---------- */

function Check({
  checked,
  label,
  count,
  muted,
  onToggle,
}: {
  checked: boolean;
  label: string;
  count?: number;
  muted?: boolean;
  onToggle: () => void;
}) {
  return (
    <label className={`flex items-center gap-2.5 py-1.5 cursor-pointer text-sm select-none ${muted && !checked ? "text-gray-400" : "text-gray-800"}`}>
      <input type="checkbox" checked={checked} onChange={onToggle} className="w-4 h-4 rounded accent-accent-600 shrink-0" />
      <span className="flex-1 min-w-0 truncate">{label}</span>
      {count != null && <span className="text-xs text-gray-400 tabular-nums">{fmtCount(count)}</span>}
    </label>
  );
}

const COLLAPSE_AT = 7;

export function CheckList({
  options,
  selected,
  counts,
  onChange,
  collapse = COLLAPSE_AT,
}: {
  options: Option[];
  selected: string[];
  counts: Counts;
  onChange: (next: string[]) => void;
  collapse?: number;
}) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const long = options.length > collapse + 1;
  const visible = useMemo(() => {
    if (!long || expanded) return options;
    const head = options.slice(0, collapse);
    // Always show selected ones even when collapsed.
    const extra = options.slice(collapse).filter((o) => selected.includes(o.value));
    return [...head, ...extra];
  }, [options, long, expanded, collapse, selected]);

  const toggle = (v: string) => onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);

  return (
    <div>
      {visible.map((o) => {
        const c = counts ? counts[o.value] ?? 0 : undefined;
        return <Check key={o.value} checked={selected.includes(o.value)} label={o.label} count={c} muted={c === 0} onToggle={() => toggle(o.value)} />;
      })}
      {long && (
        <button type="button" className="mt-1 text-sm text-accent-600 hover:underline" onClick={() => setExpanded((v) => !v)}>
          {expanded ? t("common.collapse") : t("common.showAll", { n: options.length })}
        </button>
      )}
    </div>
  );
}

/* ---------- toggle ---------- */

export function Switch({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string | null }) {
  return (
    <div className="relative flex items-center justify-between gap-3 py-1 select-none">
      <span className="text-sm text-gray-800 flex items-center gap-1.5">
        <span className="cursor-pointer" onClick={() => onChange(!checked)}>{label}</span>
        {hint && <HintButton hint={hint} label={label} />}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors ${checked ? "bg-accent-600" : "bg-gray-300"}`}
      >
        <span className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-5" : ""}`} />
      </button>
    </div>
  );
}

/* ---------- select (segmented, incl. "Любой") ---------- */

export function Segmented({
  options,
  value,
  onChange,
  anyLabel,
}: {
  options: Option[];
  value: string | undefined;
  onChange: (v: string | undefined) => void;
  anyLabel?: string;
}) {
  const all = anyLabel ? [{ value: "", label: anyLabel }, ...options] : options;
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup">
      {all.map((o) => {
        const active = (value ?? "") === o.value;
        return (
          <button
            key={o.value || "_any"}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value || undefined)}
            className={`chip ${active ? "border-accent-600 bg-accent-600 text-white" : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"}`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/* ---------- ref (searchable multi-select) ---------- */

export function RefFilter({
  def,
  selected,
  parentValues,
  counts,
  onChange,
  parentLabel,
}: {
  parentLabel?: string;
  def: FilterDef;
  selected: string[];
  /** null when the filter has no parent. */
  parentValues: string[] | null;
  counts: Counts;
  onChange: (ids: string[], names: Record<string, string>) => void;
}) {
  const { t } = useI18n();
  const disabled = parentValues !== null && parentValues.length === 0;
  const parentKey = parentValues ? [...parentValues].sort().join(",") : "";
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [items, setItems] = useState<RefItem[] | null>(null);
  const [error, setError] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 250);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    if (disabled || !def.ref) {
      setItems(null);
      return;
    }
    let cancelled = false;
    setError(false);
    loadRefs(def.ref, parentValues ?? [], debouncedQ)
      .then((res) => {
        if (cancelled) return;
        setItems(res);
        // Child ref: drop selected values that no longer belong to the selected parents.
        if (parentValues && !debouncedQ) {
          const ids = new Set(res.map((r) => r.id));
          const kept = selectedRef.current.filter((id) => ids.has(id));
          if (kept.length !== selectedRef.current.length) onChangeRef.current(kept, {});
        }
      })
      .catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [def.ref, parentKey, debouncedQ, disabled]);

  if (disabled) {
    return <p className="text-sm text-gray-400 py-1">{t("common.chooseFirst", { what: parentLabel ?? t("common.parentField") })}</p>;
  }

  const list = items ?? [];
  const searching = debouncedQ.length > 0;
  const showSearch = searching || list.length > COLLAPSE_AT;
  // Keep server order (no jumping under the cursor); when collapsed, append selected items from the tail.
  const ordered = list;
  const long = !searching && ordered.length > COLLAPSE_AT + 1;
  const visible =
    long && !expanded ? [...ordered.slice(0, COLLAPSE_AT), ...ordered.slice(COLLAPSE_AT).filter((i) => selected.includes(i.id))] : ordered;

  const toggle = (it: RefItem) => {
    const on = selected.includes(it.id);
    onChange(on ? selected.filter((x) => x !== it.id) : [...selected, it.id], { [it.id]: it.name });
  };

  return (
    <div>
      {showSearch && (
        <div className="relative mb-1.5">
          <IconSearch size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("common.search")} className="input !h-9 pl-9" aria-label={`${t("common.search")}: ${def.label}`} />
        </div>
      )}
      {items === null && !error && (
        <div className="space-y-2 py-1">
          {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-5" />)}
        </div>
      )}
      {error && <p className="text-sm text-red-600 py-1">{t("common.loadListFailed")}</p>}
      {items !== null && list.length === 0 && <p className="text-sm text-gray-400 py-1">{t("common.nothingFound")}</p>}
      <div className={expanded ? "max-h-80 overflow-y-auto pr-1" : ""}>
        {visible.map((it) => {
          const c = counts ? counts[it.id] ?? 0 : undefined;
          return <Check key={it.id} checked={selected.includes(it.id)} label={it.name} count={c} muted={c === 0} onToggle={() => toggle(it)} />;
        })}
      </div>
      {long && (
        <button type="button" className="mt-1 text-sm text-accent-600 hover:underline" onClick={() => setExpanded((v) => !v)}>
          {expanded ? t("common.collapse") : t("common.showAll", { n: ordered.length })}
        </button>
      )}
    </div>
  );
}
