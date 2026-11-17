import { useMemo } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { router, Stack } from 'expo-router';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import type { Notification } from '@kup/shared';
import { api, errorMessage, mediaUrl } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { keys, type NotificationsData, type NotificationsPage } from '@/lib/chatCache';
import { useI18n } from '@/lib/i18n';
import { radius, useColors } from '@/lib/theme';
import { LoginPrompt } from '@/components/LoginPrompt';
import { EmptyState, ErrorState, Loading, T } from '@/components/ui';

const LIMIT = 50;

export default function NotificationsScreen() {
  const c = useColors();
  const { t } = useI18n();
  const { user } = useAuth();
  const qc = useQueryClient();
  const q = useInfiniteQuery({
    queryKey: keys.notifications,
    enabled: !!user,
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }): Promise<NotificationsPage> => {
      const r = await api.notifications({ limit: LIMIT, before: pageParam });
      if (!pageParam) qc.setQueryData(keys.unreadNotifications, r.unread_count);
      return r;
    },
    getNextPageParam: (last) => (last.items.length < LIMIT ? undefined : last.items[last.items.length - 1]?.id),
  });
  const items = useMemo(() => q.data?.pages.flatMap((p) => p.items) ?? [], [q.data]);
  const hasUnread = items.some((n) => !n.read);

  const markRead = (ids?: string[]) => {
    qc.setQueryData<NotificationsData>(keys.notifications, (data) =>
      data
        ? { ...data, pages: data.pages.map((p) => ({ ...p, items: p.items.map((n) => (!ids || ids.includes(n.id) ? { ...n, read: true } : n)) })) }
        : data,
    );
    qc.setQueryData<number>(keys.unreadNotifications, (n) => (ids ? Math.max(0, (n ?? 0) - ids.length) : 0));
    api
      .readNotifications(ids)
      .catch(() => {})
      .finally(() => void qc.invalidateQueries({ queryKey: keys.unreadNotifications }));
  };

  const open = (n: Notification) => {
    if (!n.read) markRead([n.id]);
    if (n.listing_id) router.push({ pathname: '/listing/[id]', params: { id: n.listing_id } });
  };

  if (!user) return <LoginPrompt icon="notifications-outline" text={t('notif.login')} />;
  if (q.isPending) return <Loading />;
  if (q.isError) return <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />;

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <Stack.Screen
        options={{
          headerRight: () =>
            hasUnread ? (
              <Pressable onPress={() => markRead()} hitSlop={10}>
                <T color="accent">{t('notif.readAll')}</T>
              </Pressable>
            ) : null,
        }}
      />
      <FlatList
        data={items}
        keyExtractor={(n) => n.id}
        contentContainerStyle={{ paddingVertical: 8, flexGrow: 1 }}
        refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} tintColor={c.accent} />}
        onEndReached={() => q.hasNextPage && !q.isFetchingNextPage && q.fetchNextPage()}
        renderItem={({ item }) => <NotificationRow n={item} onPress={() => open(item)} />}
        ListFooterComponent={q.isFetchingNextPage ? <Loading /> : undefined}
        ListEmptyComponent={<EmptyState icon="notifications-outline" title={t('notif.emptyTitle')} text={t('notif.emptyText')} />}
      />
    </View>
  );
}

function NotificationRow({ n, onPress }: { n: Notification; onPress: () => void }) {
  const c = useColors();
  const { shortTime } = useI18n();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, { backgroundColor: n.read ? c.card : c.accentSoft, opacity: pressed ? 0.7 : 1 }]}>
      <View style={[styles.thumb, { backgroundColor: c.fill }]}>
        {n.image ? (
          <Image source={{ uri: mediaUrl(n.image) }} style={StyleSheet.absoluteFill} contentFit="cover" />
        ) : (
          <Ionicons name={n.type === 'price_drop' ? 'trending-down' : 'search'} size={22} color={c.textTertiary} />
        )}
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Ionicons
            name={n.type === 'price_drop' ? 'pricetag' : 'bookmark'}
            size={13}
            color={n.type === 'price_drop' ? c.success : c.accent}
          />
          <T variant="small" style={{ fontWeight: n.read ? '500' : '700', flex: 1 }} numberOfLines={2}>
            {n.title}
          </T>
        </View>
        <T variant="small" color="secondary" numberOfLines={2}>
          {n.body}
        </T>
        <T variant="caption" color="tertiary">
          {shortTime(n.created_at)}
        </T>
      </View>
      {!n.read && <View style={[styles.dot, { backgroundColor: c.accent }]} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 16, marginVertical: 4, padding: 12, borderRadius: radius.l },
  thumb: { width: 56, height: 56, borderRadius: radius.m, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
