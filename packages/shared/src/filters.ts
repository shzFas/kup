import type { Attribute, AttrValue, FilterDef, Filters, FilterValue } from "./types.ts";

/** Query params used for things other than filters. */
export const RESERVED_PARAMS = ["q", "sort", "page"] as const;

/** Serialize filters to flat query params (see docs/API.md). Empty filters are dropped. */
export function filtersToQuery(filters: Filters): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, f] of Object.entries(filters)) {
    const s = serializeOne(f);
    if (s !== null) out[key] = s;
  }
  return out;
}

function serializeOne(f: FilterValue): string | null {
  if ("in" in f) return f.in.length ? f.in.join(",") : null;
  if ("all" in f) return f.all.length ? f.all.join(",") : null;
  if ("eq" in f) {
    if (typeof f.eq === "boolean") return f.eq ? "1" : null;
    return f.eq === "" ? null : f.eq;
  }
  const { gte, lte } = f;
  if (gte == null && lte == null) return null;
  return `${gte ?? ""}..${lte ?? ""}`;
}

/** Parse query params back to filters. Unknown keys are ignored. */
export function queryToFilters(
  query: Record<string, string | string[] | undefined>,
  defs: FilterDef[],
): Filters {
  const out: Filters = {};
  for (const def of defs) {
    const raw = query[def.key];
    const v = Array.isArray(raw) ? raw[0] : raw;
    if (v == null || v === "") continue;
    const parsed = parseOne(def, v);
    if (parsed) out[def.key] = parsed;
  }
  return out;
}

function parseOne(def: FilterDef, v: string): FilterValue | null {
  switch (def.widget) {
    case "multi":
    case "ref": {
      const list = splitList(v);
      return list.length ? { in: list } : null;
    }
    case "multi_all": {
      const list = splitList(v);
      return list.length ? { all: list } : null;
    }
    case "toggle":
      return v === "1" || v === "true" ? { eq: true } : null;
    case "select":
      return { eq: v };
    case "range": {
      const [a, b] = v.includes("..") ? v.split("..") : [v, v];
      const gte = toNum(a);
      const lte = toNum(b);
      if (gte == null && lte == null) return null;
      const r: { gte?: number; lte?: number } = {};
      if (gte != null) r.gte = gte;
      if (lte != null) r.lte = lte;
      return r;
    }
  }
}

function splitList(v: string): string[] {
  return v.split(",").map((s) => s.trim()).filter(Boolean);
}

function toNum(s: string | undefined): number | undefined {
  if (s == null || s.trim() === "") return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

/** True if a field/filter with depends_on should be shown for the current values. */
export function isDependencyMet(
  dep: { key: string; values: string[] } | null,
  values: Record<string, unknown>,
): boolean {
  if (!dep) return true;
  const v = values[dep.key];
  if (v == null) return false;
  if (Array.isArray(v)) return v.some((x) => dep.values.includes(String(x)));
  return dep.values.includes(String(v));
}

/** Current single values for depends_on checks, derived from filters (in/eq). */
export function filterValuesForDeps(filters: Filters): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [k, f] of Object.entries(filters)) {
    if ("in" in f) out[k] = f.in;
    else if ("eq" in f) out[k] = [String(f.eq)];
  }
  return out;
}

/** Drop filters whose depends_on is no longer satisfied, and children whose parent was cleared. Run after every change. */
export function pruneFilters(filters: Filters, defs: FilterDef[]): Filters {
  let current = { ...filters };
  // Loop because removing one filter can invalidate another.
  for (let i = 0; i < defs.length; i++) {
    let changed = false;
    const deps = filterValuesForDeps(current);
    for (const def of defs) {
      if (!(def.key in current)) continue;
      const parentMissing = def.parent != null && !(def.parent in current);
      if (parentMissing || !isDependencyMet(def.depends_on, deps)) {
        delete current[def.key];
        changed = true;
      }
    }
    if (!changed) break;
  }
  return current;
}

/** Short label for an active filter chip, e.g. "Год: 2015–2020". */
export function filterChipLabel(
  def: FilterDef,
  f: FilterValue,
  refNames: Record<string, string> = {},
): string {
  const unit = def.unit ? ` ${def.unit}` : "";
  if ("in" in f || "all" in f) {
    const list = "in" in f ? f.in : f.all;
    const names = list.map((v) => def.options?.find((o) => o.value === v)?.label ?? refNames[v] ?? v);
    return names.length > 2 ? `${def.label}: ${names.slice(0, 2).join(", ")} +${names.length - 2}` : names.join(", ");
  }
  if ("eq" in f) {
    if (typeof f.eq === "boolean") return def.label;
    return def.options?.find((o) => o.value === f.eq)?.label ?? `${def.label}: ${f.eq}`;
  }
  const a = f.gte != null ? formatNumber(f.gte) : null;
  const b = f.lte != null ? formatNumber(f.lte) : null;
  if (a && b) return `${def.label}: ${a}–${b}${unit}`;
  if (a) return `${def.label}: от ${a}${unit}`;
  return `${def.label}: до ${b}${unit}`;
}

/** Attributes to show in the create/edit form for the current values (not computed, deps met). */
export function visibleFormAttributes(attrs: Attribute[], values: Record<string, AttrValue | undefined>): Attribute[] {
  return attrs.filter((a) => !a.computed && isDependencyMet(a.depends_on, values));
}

export function formatNumber(n: number): string {
  // Thin non-breaking space as thousands separator, works the same on Hermes and browsers.
  const [int, frac] = String(n).split(".");
  // Don't group 4-digit numbers: years like 2015 must not become "2 015".
  const grouped = Math.abs(n) < 10000 ? int : int.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return frac ? `${grouped},${frac}` : grouped;
}

const CURRENCY_SIGNS: Record<string, string> = { KZT: "₸", RUB: "₽", USD: "$", EUR: "€" };

export function formatPrice(price: number, currency: string, suffix = ""): string {
  const sign = CURRENCY_SIGNS[currency] ?? currency;
  return `${formatNumber(price)} ${sign}${suffix ? " " + suffix : ""}`;
}
