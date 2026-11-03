import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { keepPreviousData, useQueries, useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import type { Category, ListingCard as Card, Suggestion } from '@kup/shared';
import { api, errorMessage } from '@/lib/api';
import { useCategories } from '@/lib/queries';
import { useI18n } from '@/lib/i18n';
import { getFlag, setFlag } from '@/lib/prefs';
import { openResults } from '@/lib/savedSearches';
import { useDebounced } from '@/lib/useDebounced';
import { radius, useColors } from '@/lib/theme';
import { CategoryIcon } from '@/components/CategoryIcon';
import { ListingCard, ListingCardSkeleton } from '@/components/ListingCard';
import { Divider, EmptyState, ErrorState, Skeleton, T, type IconName } from '@/components/ui';

function openSearch(category: string, q?: string) {
  router.push({ pathname: '/search/[category]', params: q ? { category, q } : { category } });
}

export default function HomeScreen() {
  const c = useColors();
  const { t, listings } = useI18n();
  const insets = useSafeAreaInsets();
  const cats = useCategories();
  const [text, setText] = useState('');
  const [submitted, setSubmitted] = useState('');
  const categories = cats.data ?? [];

  // Search suggestions while typing (not after the text was submitted).
  const typed = text.trim();
  const dq = useDebounced(typed, 200);
  const suggesting = typed.length >= 2 && typed !== submitted;
  const suggest = useQuery({
    queryKey: ['suggest', dq],
    queryFn: () => api.suggest(dq, 8),
    enabled: suggesting && dq.length >= 2,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
  const pickSuggestion = (s: Suggestion) => openResults(s.category, s.filters);

  const [tip, setTip] = useState(false);
  useEffect(() => {
    let alive = true;
    void getFlag('tipNewcomerDismissed').then((d) => alive && setTip(!d));
    return () => {
      alive = false;
    };
  }, []);
  const dismissTip = () => {
    setTip(false);
    void setFlag('tipNewcomerDismissed');
  };

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
            onSubmitEditing={() => setSubmitted(typed)}
            autoCorrect={false}
            placeholder={t('home.searchPlaceholder')}
            placeholderTextColor={c.textTertiary}
            returnKeyType="search"
            style={[styles.searchInput, { color: c.text }]}
            clearButtonMode="while-editing"
          />
        </View>
      </View>

      {suggesting && (
        <View style={[styles.block, { backgroundColor: c.card }]}>
          <Pressable onPress={() => setSubmitted(typed)} style={styles.countRow}>
            <Ionicons name="search" size={20} color={c.accent} />
            <T style={{ flex: 1 }} numberOfLines={1}>
              {t('home.searchFor', { q: typed })}
            </T>
          </Pressable>
          {(suggest.data ?? []).map((s, i) => (
            <View key={`${s.type}:${s.category}:${s.label}:${i}`}>
              <Divider />
              <SuggestionRow s={s} categories={categories} onPress={() => pickSuggestion(s)} />
            </View>
          ))}
        </View>
      )}

      {!!submitted && !suggesting && (
        <View style={[styles.block, { backgroundColor: c.card }]}>
          <T variant="small" color="secondary" style={{ padding: 16, paddingBottom: 4 }}>
            {t('home.inCategories', { q: submitted })}
          </T>
          {categories.map((cat, i) => {
            const q = counts[i];
            return (
              <View key={cat.slug}>
                {i > 0 && <Divider />}
                <Pressable onPress={() => openSearch(cat.slug, submitted)} style={styles.countRow}>
                  <CategoryIcon icon={cat.icon} size={22} color={c.accent} />
                  <T style={{ flex: 1 }}>{cat.name}</T>
                  <T color="secondary">{q?.data != null ? listings(q.data) : q?.isError ? '—' : '…'}</T>
                  <Ionicons name="chevron-forward" size={18} color={c.textTertiary} />
                </Pressable>
              </View>
            );
          })}
        </View>
      )}

      {tip && (
        <View style={[styles.tip, { backgroundColor: c.accentSoft }]}>
          <Ionicons name="information-circle" size={26} color={c.accent} />
          <View style={{ flex: 1, gap: 4 }}>
            <T style={{ fontWeight: '700' }}>{t('home.tipTitle')}</T>
            <T variant="small">{t('home.tipText')}</T>
            <Pressable onPress={dismissTip} hitSlop={8} style={{ alignSelf: 'flex-start', marginTop: 4 }}>
              <T variant="small" color="accent" style={{ fontWeight: '600' }}>
                {t('home.tipDismiss')}
              </T>
            </Pressable>
          </View>
          <Pressable onPress={dismissTip} hitSlop={10} accessibilityLabel={t('common.close')}>
            <Ionicons name="close" size={20} color={c.textSecondary} />
          </Pressable>
        </View>
      )}

      <T variant="h2" style={styles.heading}>
        {t('home.categories')}
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
        {t('home.fresh')}
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
          <EmptyState icon="albums-outline" title={t('home.emptyTitle')} text={t('home.emptyText')} />
        )
      }
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={c.accent} />}
      contentContainerStyle={{ paddingBottom: 24 }}
    />
  );
}

const SUGGEST_ICONS: Record<Suggestion['type'], IconName> = {
  category: 'grid-outline',
  make: 'pricetag-outline',
  model: 'pricetags-outline',
  city: 'location-outline',
  layout: 'home-outline',
};

function SuggestionRow({ s, categories, onPress }: { s: Suggestion; categories: Category[]; onPress: () => void }) {
  const c = useColors();
  const cat = categories.find((x) => x.slug === s.category);
  const useCatIcon = (s.type === 'category' || s.type === 'make' || s.type === 'model') && cat;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.countRow, { opacity: pressed ? 0.6 : 1 }]}>
      {useCatIcon ? (
        <CategoryIcon icon={cat.icon} size={20} color={c.textSecondary} />
      ) : (
        <Ionicons name={SUGGEST_ICONS[s.type] ?? 'search-outline'} size={20} color={c.textSecondary} />
      )}
      <View style={{ flex: 1 }}>
        <T numberOfLines={1}>{s.label}</T>
        {!!s.sublabel && (
          <T variant="caption" color="tertiary" numberOfLines={1}>
            {s.sublabel}
          </T>
        )}
      </View>
      <Ionicons name="arrow-forward" size={16} color={c.textTertiary} />
    </Pressable>
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
  countRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, minHeight: 50, paddingVertical: 6 },
  tip: { flexDirection: 'row', gap: 10, marginHorizontal: 16, marginTop: 16, padding: 14, borderRadius: radius.l, alignItems: 'flex-start' },
  heading: { paddingHorizontal: 16, marginTop: 20, marginBottom: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12, rowGap: 8 },
  tile: { width: '47%', marginHorizontal: '1.5%', height: 100, borderRadius: radius.l, padding: 14, justifyContent: 'space-between' },
  tileIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
});
