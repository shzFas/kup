import { filterChipLabel, formatNumber, type FilterDef, type FilterValue, type Lang } from "@kup/shared";
import { translator } from "@/i18n/core";

/** Like shared formatNumber, but 4-digit integers (years, cc) stay ungrouped: 2015, not "2 015". */
export function fmtNum(n: number): string {
  return Number.isInteger(n) && Math.abs(n) < 10000 ? String(n) : formatNumber(n);
}

/** filterChipLabel with fmtNum for ranges. */
export function chipLabel(def: FilterDef, f: FilterValue, names: Record<string, string>, lang: Lang): string {
  if ("in" in f || "all" in f || "eq" in f) return filterChipLabel(def, f, names, lang);
  const { t } = translator(lang);
  const unit = def.unit ? ` ${def.unit}` : "";
  const a = f.gte != null ? fmtNum(f.gte) : null;
  const b = f.lte != null ? fmtNum(f.lte) : null;
  if (a && b) return a === b ? `${def.label}: ${a}${unit}` : `${def.label}: ${a}–${b}${unit}`;
  if (a) return `${def.label}: ${t("range.from")} ${a}${unit}`;
  return `${def.label}: ${t("range.to")} ${b}${unit}`;
}
