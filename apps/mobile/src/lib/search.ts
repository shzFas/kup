import { pruneFilters, type FilterDef, type Filters, type FilterValue } from '@kup/shared';
import { createStore, useStore } from './store';

export interface SearchState {
  query: string;
  filters: Filters;
  sort: string;
}

export const emptySearch = (): SearchState => ({ query: '', filters: {}, sort: '' });

/** Committed search state per category + facets of the last search response. */
export const searchStore = createStore<Record<string, SearchState>>({});
export const facetsStore = createStore<Record<string, Record<string, Record<string, number>>>>({});

export function useSearchState(category: string): SearchState {
  return useStore(searchStore, (s) => s[category]) ?? EMPTY;
}
const EMPTY = emptySearch();

export function setSearchState(category: string, patch: Partial<SearchState>) {
  searchStore.set((s) => ({ ...s, [category]: { ...(s[category] ?? emptySearch()), ...patch } }));
}

export function useFacets(category: string) {
  return useStore(facetsStore, (s) => s[category]) ?? NO_FACETS;
}
const NO_FACETS: Record<string, Record<string, number>> = {};

function isEmptyValue(v: FilterValue | undefined): boolean {
  if (!v) return true;
  if ('in' in v) return v.in.length === 0;
  if ('all' in v) return v.all.length === 0;
  if ('eq' in v) return v.eq === false || v.eq === '';
  return v.gte == null && v.lte == null;
}

/** Set (or clear with undefined) one filter, drop empties and prune dependent filters. */
export function withFilter(filters: Filters, key: string, value: FilterValue | undefined, defs: FilterDef[]): Filters {
  const next = { ...filters };
  if (isEmptyValue(value)) delete next[key];
  else next[key] = value!;
  return pruneFilters(next, defs);
}

export function activeFilterCount(filters: Filters) {
  return Object.keys(filters).length;
}
