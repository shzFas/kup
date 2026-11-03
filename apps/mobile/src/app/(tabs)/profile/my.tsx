import { useState } from 'react';
import { Alert, FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ListingCard as Card } from '@kup/shared';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useColors } from '@/lib/theme';
import { ListingCard, ListingCardSkeleton } from '@/components/ListingCard';
import { LoginPrompt } from '@/components/LoginPrompt';
import { Button, EmptyState, ErrorState, Segmented } from '@/components/ui';

type Status = Card['status'];
const TABS: { value: Status; label: string }[] = [
  { value: 'active', label: 'Активные' },
  { value: 'archived', label: 'Архив' },
  { value: 'sold', label: 'Проданные' },
];
const EMPTY: Record<Status, string> = {
  active: 'У вас нет активных объявлений',
  archived: 'Снятые с публикации объявления появятся здесь',
  sold: 'Здесь будут проданные объявления',
};

export default function MyListingsScreen() {
  const c = useColors();
  const qc = useQueryClient();
  const { user } = useAuth();
  const [status, setStatus] = useState<Status>('active');
  const q = useQuery({ queryKey: ['my', status], queryFn: () => api.myListings(status), enabled: !!user });

  const setS = useMutation({
    mutationFn: ({ id, s }: { id: string; s: Status }) => api.setListingStatus(id, s),
    onSuccess: (l) => {
      qc.setQueryData(['listing', l.id], l);
      qc.invalidateQueries({ queryKey: ['my'] });
      qc.invalidateQueries({ queryKey: ['search'] });
    },
    onError: (e) => Alert.alert('Ошибка', errorMessage(e)),
  });
  const del = useMutation({
    mutationFn: (id: string) => api.deleteListing(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my'] }),
    onError: (e) => Alert.alert('Ошибка', errorMessage(e)),
  });

  if (!user) return <LoginPrompt icon="list-outline" text="Здесь будут ваши объявления" />;

  const busy = (id: string) => (setS.isPending && setS.variables?.id === id) || (del.isPending && del.variables === id);

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <View style={{ padding: 16, paddingBottom: 8, backgroundColor: c.card }}>
        <Segmented options={TABS} value={status} onChange={setStatus} />
      </View>
      {q.isError ? (
        <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />
      ) : (
        <FlatList
          data={q.data ?? []}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ paddingTop: 12, flexGrow: 1 }}
          refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} tintColor={c.accent} />}
          renderItem={({ item }) => (
            <View>
              <ListingCard item={item} compact showStatus />
              <View style={styles.actions}>
                {item.status === 'active' ? (
                  <>
                    <Button small variant="secondary" title="Снять" disabled={busy(item.id)} onPress={() => setS.mutate({ id: item.id, s: 'archived' })} />
                    <Button small variant="secondary" title="Продано" disabled={busy(item.id)} onPress={() => setS.mutate({ id: item.id, s: 'sold' })} />
                  </>
                ) : (
                  <Button small title="Активировать" disabled={busy(item.id)} onPress={() => setS.mutate({ id: item.id, s: 'active' })} />
                )}
                <Button small variant="secondary" icon="create-outline" title="Изменить" onPress={() => router.push({ pathname: '/edit/[id]', params: { id: item.id } })} />
                <Button
                  small
                  variant="danger"
                  icon="trash-outline"
                  title=""
                  disabled={busy(item.id)}
                  onPress={() =>
                    Alert.alert('Удалить объявление?', item.title, [
                      { text: 'Отмена', style: 'cancel' },
                      { text: 'Удалить', style: 'destructive', onPress: () => del.mutate(item.id) },
                    ])
                  }
                />
              </View>
            </View>
          )}
          ListEmptyComponent={
            q.isPending ? (
              <View>
                <ListingCardSkeleton />
              </View>
            ) : (
              <EmptyState
                icon="document-text-outline"
                title="Пусто"
                text={EMPTY[status]}
                action={status === 'active' ? { title: 'Подать объявление', onPress: () => router.navigate('/post') } : undefined}
              />
            )
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginHorizontal: 16, marginTop: -4, marginBottom: 16 },
});
