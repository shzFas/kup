import { useQuery } from '@tanstack/react-query';
import type { CategorySchema } from '@kup/shared';
import { api } from './api';
import { rememberRefNames } from './refNames';

export function useCategories() {
  return useQuery({ queryKey: ['categories'], queryFn: api.categories, staleTime: 60 * 60 * 1000 });
}

export function useSchema(slug: string | undefined) {
  return useQuery<CategorySchema>({
    queryKey: ['schema', slug],
    queryFn: () => api.schema(slug!),
    enabled: !!slug,
    staleTime: 60 * 60 * 1000,
  });
}

export function useRefs(ref: string | null | undefined, parent: string[] | undefined, q: string, enabled = true) {
  return useQuery({
    queryKey: ['refs', ref, parent?.join(',') ?? '', q],
    queryFn: async () => {
      const items = await api.refs(ref!, { parent, q: q || undefined });
      rememberRefNames(items);
      return items;
    },
    enabled: !!ref && enabled,
    staleTime: 10 * 60 * 1000,
  });
}

/** Ordered groups: "common" first, then schema order, then unknown groups. */
export function orderedGroups(schema: CategorySchema, keys: string[]) {
  const labels = new Map(schema.groups.map((g) => [g.key, g.label]));
  const order = schema.groups.map((g) => g.key);
  const present = Array.from(new Set(keys));
  present.sort((a, b) => {
    if (a === 'common') return -1;
    if (b === 'common') return 1;
    const ia = order.indexOf(a);
    const ib = order.indexOf(b);
    return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
  });
  return present.map((key) => ({ key, label: labels.get(key) ?? (key === 'common' ? 'Общие' : 'Прочее') }));
}
