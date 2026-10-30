import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { FilterDef, Filters, FilterValue } from '@kup/shared';
import { api, errorMessage } from '@/lib/api';
import { useSchema } from '@/lib/queries';
import { setSearchState, useFacets, useSearchState, withFilter } from '@/lib/search';
import { useFilterRefNames } from '@/lib/useFilterRefNames';
import { openPicker } from '@/lib/picker';
import { useDebounced } from '@/lib/useDebounced';
import { listingsCount } from '@/lib/format';
import { useColors } from '@/lib/theme';
import { FilterRenderer } from '@/components/filters/FilterRenderer';
import { Button, ErrorState, Loading, T } from '@/components/ui';

export default function FiltersScreen() {
  const { category } = useLocalSearchParams<{ category: string }>();
  const c = useColors();
  const insets = useSafeAreaInsets();
  const schema = useSchema(category);
  const committed = useSearchState(category);
  const facets = useFacets(category);
  const [draft, setDraft] = useState<Filters>(committed.filters);
  const defs = schema.data?.filters ?? [];
  const names = useFilterRefNames(defs, draft);

  const debounced = useDebounced(draft, 300);
  const count = useQuery({
    queryKey: ['count', category, committed.query, debounced],
    queryFn: () => api.count({ category, query: committed.query || undefined, filters: debounced }),
    placeholderData: keepPreviousData,
    enabled: !!schema.data,
  });

  const change = (key: string, v: FilterValue | undefined) => setDraft((d) => withFilter(d, key, v, defs));

  const openRef = (d: FilterDef) => {
    const pf = d.parent ? draft[d.parent] : undefined;
    const cur = draft[d.key];
    openPicker({
      title: d.label,
      ref: d.ref!,
      parent: pf && 'in' in pf ? pf.in : undefined,
      multi: true,
      selected: cur && 'in' in cur ? cur.in : [],
      counts: d.facet ? facets[d.key] : undefined,
      onDone: (ids) => change(d.key, { in: ids }),
    });
  };

  const apply = () => {
    setSearchState(category, { filters: draft });
    router.back();
  };

  const pending = count.isFetching || debounced !== draft;
  const label = count.data != null ? `Показать ${listingsCount(count.data)}` : 'Показать объявления';

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <Stack.Screen
        options={{
          title: 'Фильтры',
          headerLeft: () => (
            <Pressable onPress={() => router.back()} hitSlop={10}>
              <T color="accent">Закрыть</T>
            </Pressable>
          ),
          headerRight: () => (
            <Pressable onPress={() => setDraft({})} hitSlop={10}>
              <T color="accent">Сбросить</T>
            </Pressable>
          ),
        }}
      />
      {schema.isPending ? (
        <Loading />
      ) : schema.isError ? (
        <ErrorState message={errorMessage(schema.error)} onRetry={() => schema.refetch()} />
      ) : (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={100}>
          <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={{ paddingBottom: 24 }}>
            <FilterRenderer schema={schema.data} value={draft} onChange={change} facets={facets} names={names} onOpenRef={openRef} />
          </ScrollView>
          <View style={[styles.footer, { backgroundColor: c.card, borderTopColor: c.border, paddingBottom: insets.bottom + 10 }]}>
            {Object.keys(draft).length > 0 && (
              <Button title="Сбросить" variant="secondary" onPress={() => setDraft({})} style={{ paddingHorizontal: 18 }} />
            )}
            <Button
              title={count.isError ? 'Показать' : label}
              onPress={apply}
              loading={pending && count.data == null}
              style={{ flex: 1, opacity: pending ? 0.85 : 1 }}
              disabled={count.data === 0}
            />
          </View>
        </KeyboardAvoidingView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  footer: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
});
