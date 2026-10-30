import {
  filtersToQuery,
  pruneFilters,
  queryToFilters,
  type CategorySchema,
  type FilterDef,
  type Filters,
  type SearchRequest,
} from "@kup/shared";

export const PAGE_SIZE = 30;

export interface SearchState {
  filters: Filters;
  q: string;
  sort: string;
  page: number;
}

export type RawQuery = Record<string, string | string[] | undefined>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export function parseSearchState(query: RawQuery, schema: CategorySchema): SearchState {
  const filters = pruneFilters(queryToFilters(query, schema.filters), schema.filters);
  const sortRaw = first(query.sort) ?? "";
  const sort = schema.sorts.some((s) => s.value === sortRaw) ? sortRaw : "";
  const page = Math.max(1, Math.floor(Number(first(query.page)) || 1));
  return { filters, q: (first(query.q) ?? "").trim(), sort, page };
}

export function searchHref(category: string, s: Partial<SearchState>): string {
  const params = new URLSearchParams();
  if (s.q) params.set("q", s.q);
  for (const [k, v] of Object.entries(filtersToQuery(s.filters ?? {}))) params.set(k, v);
  if (s.sort) params.set("sort", s.sort);
  if (s.page && s.page > 1) params.set("page", String(s.page));
  const qs = params.toString().replace(/%2C/gi, ",");
  return `/s/${category}${qs ? "?" + qs : ""}`;
}

export function toSearchRequest(category: string, s: SearchState, extra: Partial<SearchRequest> = {}): SearchRequest {
  const req: SearchRequest = { category, filters: s.filters, page: s.page, limit: PAGE_SIZE, ...extra };
  if (s.q) req.query = s.q;
  if (s.sort) req.sort = s.sort;
  return req;
}

/** Remove one filter key (and anything depending on it). */
export function withoutFilter(filters: Filters, key: string, defs: FilterDef[]): Filters {
  const next = { ...filters };
  delete next[key];
  return pruneFilters(next, defs);
}

/** Ordered groups for the filter panel: `common` first, then the schema order; unknown groups last. */
export function groupFilters(schema: CategorySchema, defs: FilterDef[]) {
  const groups = [...schema.groups];
  if (!groups.some((g) => g.key === "common")) groups.unshift({ key: "common", label: "Общее" });
  groups.sort((a, b) => (a.key === "common" ? -1 : b.key === "common" ? 1 : 0));
  const out: { key: string; label: string; filters: FilterDef[] }[] = groups.map((g) => ({ ...g, filters: [] }));
  const other: FilterDef[] = [];
  for (const d of defs) {
    const g = out.find((x) => x.key === d.group);
    if (g) g.filters.push(d);
    else other.push(d);
  }
  if (other.length) out.push({ key: "_other", label: "Прочее", filters: other });
  return out.filter((g) => g.filters.length > 0);
}
