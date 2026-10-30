import { useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueries } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import type { Category, ListingCard as Card } from '@kup/shared';
import { api, errorMessage } from '@/lib/api';
import { useCategories } from '@/lib/queries';
import { listingsCount } from '@/lib/format';
import { radius, useColors } from '@/lib/theme';
import { CategoryIcon } from '@/components/CategoryIcon';
import { ListingCard, ListingCardSkeleton } from '@/components/ListingCard';
import { Divider, EmptyState, ErrorState, Skeleton, T } from '@/components/ui';

function openSearch(category: string, q?: string) {
  router.push({ pathname: '/search/[category]', params: q ? { category, q } : { category } });
}

export default function HomeScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const cats = useCategories();
  const [text, setText] = useState('');
  const [submitted, setSubmitted] = useState('');
  const categories = cats.data ?? [];

  const fresh = useQueries({
    queries: categories.map((cat) => ({
      queryKey: ['fresh', cat.slug],
      queryFn: () => api.search({ category: cat.slug, sort: 'date_desc', page: 1, limit: 10, facets: [] }),
    })),
  });
  const counts = useQueries({
    queries: categories.map((cat) => ({
      queryKey: ['qcount', cat.slug, submitted],
      queryFn: () => api.count({ category: cat.slug, query: submitted }),
      enabled: !!submitted,
    })),
  });

  const feed = useMemo(() => {
    const all: Card[] = fresh.flatMap((q) => q.data?.items ?? []);
    return all.sort((a, b) => b.published_at.localeCompare(a.published_at)).slice(0, 30);
  }, [fresh]);
  const feedLoading = cats.isLoading || (fresh.length > 0 && fresh.every((q) => q.isLoading));
  const feedError = fresh.length > 0 && fresh.every((q) => q.isError) ? fresh[0].error : null;
  const refreshing = fresh.some((q) => q.isRefetching);

  const refresh = () => {
    cats.refetch();
    fresh.forEach((q) => q.refetch());
  };

  const header = (
    <View>
      <View style={[styles.top, { paddingTop: insets.top + 8, backgroundColor: c.card }]}>
        <T variant="title" style={{ color: c.accent }}>
          kup
        </T>
        <View style={[styles.search, { backgroundColor: c.fill }]}>
          <Ionicons name="search" size={18} color={c.textTertiary} />
          <TextInput
            value={text}
            onChangeText={(t) => {
              setText(t);
              if (!t) setSubmitted('');
            }}
            onSubmitEditing={() => setSubmitted(text.trim())}
            placeholder="Поиск по объявлениям"
            placeholderTextColor={c.textTertiary}
            returnKeyType="search"
            style={[styles.searchInput, { color: c.text }]}
            clearButtonMode="while-editing"
          />
        </View>
      </View>

      {!!submitted && (
        <View style={[styles.block, { backgroundColor: c.card }]}>
          <T variant="small" color="secondary" style={{ padding: 16, paddingBottom: 4 }}>
            «{submitted}» в категориях
          </T>
          {categories.map((cat, i) => {
            const q = counts[i];
            return (
              <View key={cat.slug}>
                {i > 0 && <Divider />}
                <Pressable onPress={() => openSearch(cat.slug, submitted)} style={styles.countRow}>
                  <CategoryIcon icon={cat.icon} size={22} color={c.accent} />
                  <T style={{ flex: 1 }}>{cat.name}</T>
                  <T color="secondary">{q?.data != null ? listingsCount(q.data) : q?.isError ? '—' : '…'}</T>
                  <Ionicons name="chevron-forward" size={18} color={c.textTertiary} />
                </Pressable>
              </View>
            );
          })}
        </View>
      )}

      <T variant="h2" style={styles.heading}>
        Категории
      </T>
      {cats.isError ? (
        <ErrorState message={errorMessage(cats.error)} onRetry={() => cats.refetch()} />
      ) : (
        <View style={styles.grid}>
          {cats.isLoading
            ? [0, 1, 2, 3].map((i) => <Skeleton key={i} style={styles.tile} />)
            : categories.map((cat) => <CategoryTile key={cat.slug} cat={cat} />)}
        </View>
      )}
      <T variant="h2" style={styles.heading}>
        Свежие объявления
      </T>
    </View>
  );

  return (
    <FlatList
      style={{ backgroundColor: c.background }}
      data={feed}
      keyExtractor={(i) => i.id}
      renderItem={({ item }) => <ListingCard item={item} />}
      ListHeaderComponent={header}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      ListEmptyComponent={
        feedLoading ? (
          <View>
            <ListingCardSkeleton />
            <ListingCardSkeleton />
          </View>
        ) : feedError ? (
          <ErrorState message={errorMessage(feedError)} onRetry={refresh} />
        ) : cats.isError ? undefined : (
          <EmptyState icon="albums-outline" title="Пока нет объявлений" text="Станьте первым — подайте объявление" />
        )
      }
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={c.accent} />}
      contentContainerStyle={{ paddingBottom: 24 }}
    />
  );
}

function CategoryTile({ cat }: { cat: Category }) {
  const c = useColors();
  return (
    <Pressable
      onPress={() => openSearch(cat.slug)}
      style={({ pressed }) => [styles.tile, { backgroundColor: c.card, opacity: pressed ? 0.7 : 1 }]}>
      <View style={[styles.tileIcon, { backgroundColor: c.accentSoft }]}>
        <CategoryIcon icon={cat.icon} color={c.accent} />
      </View>
      <T style={{ fontWeight: '600' }} numberOfLines={2}>
        {cat.name}
      </T>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  top: { paddingHorizontal: 16, paddingBottom: 12, gap: 10 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: radius.m, paddingHorizontal: 12, height: 44 },
  searchInput: { flex: 1, fontSize: 16, height: 44 },
  block: { marginTop: 12, marginHorizontal: 16, borderRadius: radius.l, overflow: 'hidden' },
  countRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, height: 50 },
  heading: { paddingHorizontal: 16, marginTop: 20, marginBottom: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12, rowGap: 8 },
  tile: { width: '47%', marginHorizontal: '1.5%', height: 100, borderRadius: radius.l, padding: 14, justifyContent: 'space-between' },
  tileIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
});
