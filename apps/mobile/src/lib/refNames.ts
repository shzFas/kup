import type { RefItem } from '@kup/shared';
import { createStore, useStore } from './store';

/** Global id → name cache for reference values (makes, models, cities), used by chips and form rows. */
export const refNamesStore = createStore<Record<string, string>>({});

export function rememberRefNames(items: (RefItem | { id: string; name: string })[]) {
  const cur = refNamesStore.get();
  if (items.every((i) => cur[i.id] === i.name)) return;
  const next = { ...cur };
  for (const i of items) next[i.id] = i.name;
  refNamesStore.set(next);
}

export function useRefNames() {
  return useStore(refNamesStore, (s) => s);
}
