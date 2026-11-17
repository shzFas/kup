import { useState } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { useSavedSearchesNew } from '@/lib/queries';
import { useColors } from '@/lib/theme';
import { ListingCard, ListingCardSkeleton } from '@/components/ListingCard';
import { LoginPrompt } from '@/components/LoginPrompt';
import { SavedSearchList } from '@/components/SavedSearchList';
import { EmptyState, ErrorState, Segmented } from '@/components/ui';

type Tab = 'listings' | 'searches';

export default function FavoritesScreen() {
  const c = useColors();
  const { t } = useI18n();
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>('listings');
  const savedNew = useSavedSearchesNew();
  if (!user) return <LoginPrompt icon="heart-outline" text={t('fav.login')} />;
  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <View style={{ padding: 16, paddingBottom: 8, backgroundColor: c.card }}>
        <Segmented
          options={[
            { value: 'listings', label: t('fav.listings') },
            { value: 'searches', label: savedNew ? `${t('fav.searches')} · ${savedNew}` : t('fav.searches') },
          ]}
          value={tab}
          onChange={setTab}
        />
      </View>
      {tab === 'listings' ? <FavoriteListings /> : <SavedSearchList />}
    </View>
  );
}

function FavoriteListings() {
  const c = useColors();
  const { t } = useI18n();
  const q = useQuery({ queryKey: ['favorites'], queryFn: api.favorites });
  if (q.isError) return <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />;
  return (
    <FlatList
      data={(q.data ?? []).map((i) => ({ ...i, is_favorite: true }))}
      keyExtractor={(i) => i.id}
      renderItem={({ item }) => <ListingCard item={item} compact />}
      contentContainerStyle={{ paddingTop: 12, flexGrow: 1 }}
      refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} tintColor={c.accent} />}
      ListEmptyComponent={
        q.isPending ? (
          <View>
            <ListingCardSkeleton />
          </View>
        ) : (
          <EmptyState
            icon="heart-outline"
            title={t('fav.emptyTitle')}
            text={t('fav.emptyText')}
            action={{ title: t('fav.toSearch'), onPress: () => router.navigate('/') }}
          />
        )
      }
    />
  );
}
