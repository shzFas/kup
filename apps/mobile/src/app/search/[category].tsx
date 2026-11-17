import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { FlashList } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import {
  filterChipLabel,
  filterValuesForDeps,
  isDependencyMet,
  queryToFilters,
  type FilterDef,
  type ListingCard as Card,
} from '@kup/shared';
import { api, errorMessage } from '@/lib/api';
import { useRequireAuth } from '@/lib/auth';
import { keys } from '@/lib/chatCache';
import { useSchema } from '@/lib/queries';
import { facetsStore, setSearchState, useFacets, useSearchState, withFilter } from '@/lib/search';
import { useFilterRefNames } from '@/lib/useFilterRefNames';
import { openPicker } from '@/lib/picker';
import { useI18n } from '@/lib/i18n';
import { radius, useColors } from '@/lib/theme';
import { ListingCard, ListingCardSkeleton } from '@/components/ListingCard';
import { SortSheet } from '@/components/SortSheet';
import { Chip, EmptyState, ErrorState, Skeleton, T } from '@/components/ui';

const LIMIT = 30;

export default function SearchScreen() {
  const params = useLocalSearchParams<Record<string, string>>();
  const category = String(params.category);
  const c = useColors();
  const { t, listings, lang } = useI18n();
  const qc = useQueryClient();
  const requireAuth = useRequireAuth();
  const [saving, setSaving] = useState(false);
  const schema = useSchema(category);
  const defs = useMemo(() => schema.data?.filters ?? [], [schema.data]);
  const state = useSearchState(category);
  const facets = useFacets(category);
  const [sortOpen, setSortOpen] = useState(false);
  const [text, setText] = useState(state.query);

  // Apply deep-link / navigation params once the schema is known.
  const [applied, setApplied] = useState(false);
  useEffect(() => {
    if (applied || !schema.data) return;
    const { category: _c, q, sort, reset, ...rest } = params;
    const filters = queryToFilters(rest, schema.data.filters);
    // `reset` (saved searches, suggestions) replaces the remembered state even with no filters.
    if (reset != null || q != null || sort != null || Object.keys(filters).length) {
      setSearchState(category, { query: q ?? '', sort: sort ?? '', filters });
      setText(q ?? '');
    }
    setApplied(true);
  }, [schema.data, params, category, applied]);

  const names = useFilterRefNames(defs, state.filters);

  const search = useInfiniteQuery({
    queryKey: ['search', category, state.query, state.filters, state.sort],
    enabled: !!schema.data && applied,
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      api.search({
        category,
        query: state.query || undefined,
        filters: state.filters,
        sort: state.sort || undefined,
        page: pageParam,
        limit: LIMIT,
        ...(pageParam > 1 ? { facets: [] } : {}),
      }),
    getNextPageParam: (last) => (last.page * last.limit < last.total ? last.page + 1 : undefined),
  });

  const first = search.data?.pages[0];
  useEffect(() => {
    if (first) facetsStore.set((s) => ({ ...s, [category]: first.facets ?? {} }));
  }, [first, category]);

  const items = useMemo(() => {
    const seen = new Set<string>();
    const out: Card[] = [];
    for (const p of search.data?.pages ?? []) for (const i of p.items) if (!seen.has(i.id)) (seen.add(i.id), out.push(i));
    return out;
  }, [search.data]);

  const deps = filterValuesForDeps(state.filters);
  const pinned = defs.filter((d) => d.pinned && isDependencyMet(d.depends_on, deps));
  const activeOther = defs.filter((d) => !d.pinned && state.filters[d.key]);
  const activeCount = Object.keys(state.filters).length;

  const setFilter = (key: string, v: Parameters<typeof withFilter>[2]) =>
    setSearchState(category, { filters: withFilter(state.filters, key, v, defs) });

  const openFilters = () => router.push({ pathname: '/filters/[category]', params: { category } });

  const onPinned = (d: FilterDef) => {
    const cur = state.filters[d.key];
    if (d.widget === 'toggle') return setFilter(d.key, cur ? undefined : { eq: true });
    if (d.widget === 'ref' && d.ref) {
      const pf = d.parent ? state.filters[d.parent] : undefined;
      if (d.parent && !pf) return openFilters();
      return openPicker({
        title: d.label,
        ref: d.ref,
        parent: pf && 'in' in pf ? pf.in : undefined,
        multi: true,
        selected: cur && 'in' in cur ? cur.in : [],
        counts: facets[d.key],
        onDone: (ids) => setFilter(d.key, { in: ids }),
      });
    }
    openFilters();
  };

  const sortLabel = schema.data?.sorts.find((s) => s.value === state.sort)?.label ?? schema.data?.sorts[0]?.label ?? t('search.sort');

  const saveSearch = () =>
    requireAuth(async () => {
      if (saving) return;
      setSaving(true);
      try {
        // Descriptive name, e.g. "Мопеды и скутеры: Honda, до 50 000 Kč" (server default is just the category).
        const parts = defs
          .filter((d) => state.filters[d.key])
          .map((d) => filterChipLabel(d, state.filters[d.key], names, lang));
        if (state.query) parts.unshift(t('saved.query', { q: state.query }));
        const base = schema.data?.name ?? category;
        const name = (parts.length ? `${base}: ${parts.slice(0, 4).join(', ')}` : base).slice(0, 100);
        await api.createSavedSearch({
          name,
          request: { category, query: state.query || undefined, filters: state.filters },
          notify: true,
        });
        void qc.invalidateQueries({ queryKey: keys.savedSearches });
        Alert.alert(t('search.saved'), t('search.savedText'));
      } catch (e) {
        Alert.alert(t('search.saveFailed'), errorMessage(e));
      } finally {
        setSaving(false);
      }
    });

  const header = (
    <View style={{ backgroundColor: c.card, paddingBottom: 10 }}>
      <View style={[styles.search, { backgroundColor: c.fill }]}>
        <Ionicons name="search" size={18} color={c.textTertiary} />
        <TextInput
          value={text}
          onChangeText={(t) => {
            setText(t);
            if (!t && state.query) setSearchState(category, { query: '' });
          }}
          onSubmitEditing={() => setSearchState(category, { query: text.trim() })}
          placeholder={schema.data ? t('search.placeholderIn', { category: schema.data.name.toLocaleLowerCase() }) : t('common.search')}
          placeholderTextColor={c.textTertiary}
          returnKeyType="search"
          clearButtonMode="while-editing"
          style={[styles.searchInput, { color: c.text }]}
        />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        <Chip icon="options-outline" label={activeCount ? t('search.filtersN', { n: activeCount }) : t('search.filters')} active={activeCount > 0} onPress={openFilters} />
        {!schema.data && [0, 1, 2].map((i) => <Skeleton key={i} style={{ width: 90, height: 34, borderRadius: 17 }} />)}
        {pinned.map((d) => {
          const f = state.filters[d.key];
          return (
            <Chip
              key={d.key}
              label={f ? filterChipLabel(d, f, names, lang) : d.label}
              active={!!f}
              onPress={() => onPinned(d)}
              onRemove={f && d.widget !== 'toggle' ? () => setFilter(d.key, undefined) : undefined}
            />
          );
        })}
        {activeOther.map((d) => (
          <Chip
            key={d.key}
            active
            label={filterChipLabel(d, state.filters[d.key], names, lang)}
            onPress={openFilters}
            onRemove={() => setFilter(d.key, undefined)}
          />
        ))}
        {activeCount > 1 && <Chip label={t('search.resetAll')} onPress={() => setSearchState(category, { filters: {} })} />}
      </ScrollView>
    </View>
  );

  const bar = (
    <View style={styles.bar}>
      <T variant="small" color="secondary" style={{ flex: 1 }} numberOfLines={1}>
        {first ? t('search.found', { count: listings(first.total) }) : ' '}
      </T>
      <Pressable onPress={saveSearch} style={styles.sortBtn} hitSlop={8} disabled={saving}>
        <Ionicons name="bookmark-outline" size={16} color={c.accent} />
        <T variant="small" color="accent" numberOfLines={1}>
          {t('search.save')}
        </T>
      </Pressable>
      {schema.data && schema.data.sorts.length > 0 && (
        <Pressable onPress={() => setSortOpen(true)} style={styles.sortBtn} hitSlop={8}>
          <Ionicons name="swap-vertical" size={16} color={c.accent} />
          <T variant="small" color="accent" numberOfLines={1}>
            {sortLabel}
          </T>
        </Pressable>
      )}
    </View>
  );

  let body;
  if (schema.isError) body = <ErrorState message={errorMessage(schema.error)} onRetry={() => schema.refetch()} />;
  else if (search.isError && !items.length)
    body = <ErrorState message={errorMessage(search.error)} onRetry={() => search.refetch()} />;
  else
    body = (
      <FlashList
        data={items}
        keyExtractor={(i) => i.id}
        renderItem={({ item }) => <ListingCard item={item} />}
        ListHeaderComponent={bar}
        onEndReached={() => search.hasNextPage && !search.isFetchingNextPage && search.fetchNextPage()}
        onEndReachedThreshold={0.6}
        keyboardDismissMode="on-drag"
        refreshControl={
          <RefreshControl refreshing={search.isRefetching && !search.isFetchingNextPage} onRefresh={() => void search.refetch()} tintColor={c.accent} />
        }
        ListEmptyComponent={
          search.isPending ? (
            <View>
              <ListingCardSkeleton />
              <ListingCardSkeleton />
            </View>
          ) : (
            <EmptyState
              title={t('search.emptyTitle')}
              text={t('search.emptyText')}
              action={activeCount ? { title: t('search.resetFilters'), onPress: () => setSearchState(category, { filters: {} }) } : undefined}
            />
          )
        }
        ListFooterComponent={search.isFetchingNextPage ? <ListingCardSkeleton /> : <View style={{ height: 24 }} />}
      />
    );

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <Stack.Screen options={{ title: schema.data?.name ?? t('nav.search') }} />
      {header}
      <View style={{ flex: 1 }}>{body}</View>
      {schema.data && (
        <SortSheet
          visible={sortOpen}
          onClose={() => setSortOpen(false)}
          sorts={schema.data.sorts}
          value={state.sort}
          onChange={(v) => setSearchState(category, { sort: v })}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: radius.m, paddingHorizontal: 12, height: 40, marginHorizontal: 16, marginTop: 4 },
  searchInput: { flex: 1, fontSize: 16, height: 40 },
  chips: { gap: 8, paddingHorizontal: 16, paddingTop: 10 },
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, gap: 12 },
  sortBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 },
});
