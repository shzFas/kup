import { useState } from 'react';
import { Alert, FlatList, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import type { Listing, ListingStatus } from '@kup/shared';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n, type Key } from '@/lib/i18n';
import { radius, useColors } from '@/lib/theme';
import { ListingCard, ListingCardSkeleton } from '@/components/ListingCard';
import { LoginPrompt } from '@/components/LoginPrompt';
import { Button, Chip, EmptyState, ErrorState, T } from '@/components/ui';

const TABS: { value: ListingStatus; label: Key; empty: Key }[] = [
  { value: 'active', label: 'my.active', empty: 'my.emptyActive' },
  { value: 'expired', label: 'my.expired', empty: 'my.emptyExpired' },
  { value: 'archived', label: 'my.archived', empty: 'my.emptyArchived' },
  { value: 'sold', label: 'my.sold', empty: 'my.emptySold' },
  { value: 'blocked', label: 'my.blocked', empty: 'my.emptyBlocked' },
];

export default function MyListingsScreen() {
  const c = useColors();
  const { t } = useI18n();
  const qc = useQueryClient();
  const { user } = useAuth();
  const [status, setStatus] = useState<ListingStatus>('active');
  const q = useQuery({ queryKey: ['my', status], queryFn: () => api.myListings(status), enabled: !!user });

  const onChanged = (l: Listing) => {
    qc.setQueryData(['listing', l.id], l);
    void qc.invalidateQueries({ queryKey: ['my'] });
    void qc.invalidateQueries({ queryKey: ['search'] });
  };
  const setS = useMutation({
    mutationFn: ({ id, s }: { id: string; s: 'archived' | 'sold' | 'active' }) =>
      s === 'active' ? api.prolong(id) : api.setListingStatus(id, s),
    onSuccess: (l, v) => {
      onChanged(l);
      if (v.s === 'active') Alert.alert(t('listing.prolonged'));
    },
    onError: (e) => Alert.alert(t('common.error'), errorMessage(e)),
  });
  const del = useMutation({
    mutationFn: (id: string) => api.deleteListing(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my'] }),
    onError: (e) => Alert.alert(t('common.error'), errorMessage(e)),
  });

  if (!user) return <LoginPrompt icon="list-outline" text={t('my.login')} />;

  const busy = (id: string) => (setS.isPending && setS.variables?.id === id) || (del.isPending && del.variables === id);
  const tab = TABS.find((x) => x.value === status)!;

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <View style={{ backgroundColor: c.card }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
          {TABS.map((x) => (
            <Chip key={x.value} label={t(x.label)} active={x.value === status} onPress={() => setStatus(x.value)} />
          ))}
        </ScrollView>
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
              {item.status === 'blocked' && <BlockedReason id={item.id} />}
              <View style={styles.actions}>
                {item.status === 'active' && (
                  <>
                    <Button small variant="secondary" title={t('listing.unpublish')} disabled={busy(item.id)} onPress={() => setS.mutate({ id: item.id, s: 'archived' })} />
                    <Button small variant="secondary" title={t('listing.markSold')} disabled={busy(item.id)} onPress={() => setS.mutate({ id: item.id, s: 'sold' })} />
                  </>
                )}
                {item.status === 'expired' && (
                  <Button small icon="refresh" title={t('listing.prolong')} disabled={busy(item.id)} onPress={() => setS.mutate({ id: item.id, s: 'active' })} />
                )}
                {(item.status === 'archived' || item.status === 'sold') && (
                  <Button small title={t('listing.activate')} disabled={busy(item.id)} onPress={() => setS.mutate({ id: item.id, s: 'active' })} />
                )}
                <Button
                  small
                  variant="secondary"
                  icon="create-outline"
                  title={t('my.edit')}
                  onPress={() => router.push({ pathname: '/edit/[id]', params: { id: item.id } })}
                />
                <Button
                  small
                  variant="danger"
                  icon="trash-outline"
                  title=""
                  disabled={busy(item.id)}
                  onPress={() =>
                    Alert.alert(t('listing.deleteQ'), item.title, [
                      { text: t('common.cancel'), style: 'cancel' },
                      { text: t('common.delete'), style: 'destructive', onPress: () => del.mutate(item.id) },
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
                title={t('my.emptyTitle')}
                text={t(tab.empty)}
                action={status === 'active' ? { title: t('my.post'), onPress: () => router.navigate('/post') } : undefined}
              />
            )
          }
        />
      )}
    </View>
  );
}

/** Cards don't carry moderation_reason — load it from the full listing (owner-only field). */
function BlockedReason({ id }: { id: string }) {
  const c = useColors();
  const { t } = useI18n();
  const q = useQuery({ queryKey: ['listing', id], queryFn: () => api.listing(id) });
  const reason = q.data?.moderation_reason;
  return (
    <View style={[styles.blocked, { backgroundColor: c.card, borderColor: c.danger }]}>
      <Ionicons name="ban-outline" size={18} color={c.danger} />
      <T variant="small" style={{ flex: 1 }}>
        {reason ? t('my.blockedReason', { reason }) : t('listing.blockedBanner')}
      </T>
    </View>
  );
}

const styles = StyleSheet.create({
  tabs: { gap: 8, paddingHorizontal: 16, paddingVertical: 10 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginHorizontal: 16, marginTop: -4, marginBottom: 16 },
  blocked: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: -4,
    marginBottom: 12,
    padding: 10,
    borderRadius: radius.m,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
