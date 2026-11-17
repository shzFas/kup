import { useQueries } from '@tanstack/react-query';
import type { FilterDef, Filters } from '@kup/shared';
import { api } from './api';
import { rememberRefNames, useRefNames } from './refNames';

/** Makes sure names for selected ref values (e.g. from a deep link) are known, for chip labels. */
export function useFilterRefNames(defs: FilterDef[], filters: Filters) {
  const names = useRefNames();
  const missing = defs.filter((d) => {
    const f = filters[d.key];
    return d.ref && f && 'in' in f && f.in.some((id) => !(id in names));
  });
  useQueries({
    queries: missing.map((d) => {
      const pf = d.parent ? filters[d.parent] : undefined;
      const parent = pf && 'in' in pf ? pf.in : undefined;
      return {
        queryKey: ['refs', d.ref, parent?.join(',') ?? '', ''],
        queryFn: async () => {
          const items = await api.refs(d.ref!, { parent });
          rememberRefNames(items);
          return items;
        },
        staleTime: 10 * 60 * 1000,
      };
    }),
  });
  return names;
}
