import { FlatList, RefreshControl, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useColors } from '@/lib/theme';
import { ListingCard, ListingCardSkeleton } from '@/components/ListingCard';
import { LoginPrompt } from '@/components/LoginPrompt';
import { EmptyState, ErrorState } from '@/components/ui';

export default function FavoritesScreen() {
  const c = useColors();
  const { user } = useAuth();
  const q = useQuery({ queryKey: ['favorites'], queryFn: api.favorites, enabled: !!user });
  if (!user) return <LoginPrompt icon="heart-outline" text="Сохраняйте понравившиеся объявления, чтобы вернуться к ним позже" />;
  if (q.isError) return <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />;
  return (
    <FlatList
      style={{ backgroundColor: c.background }}
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
          <EmptyState icon="heart-outline" title="В избранном пусто" text="Нажмите ♡ на объявлении, чтобы сохранить его" action={{ title: 'К поиску', onPress: () => router.navigate('/') }} />
        )
      }
    />
  );
}
