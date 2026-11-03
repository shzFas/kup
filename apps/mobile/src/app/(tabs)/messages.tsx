import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import type { Chat } from '@kup/shared';
import { api, errorMessage, mediaUrl } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { keys, type ChatsData } from '@/lib/chatCache';
import { useI18n } from '@/lib/i18n';
import { radius, useColors } from '@/lib/theme';
import { LoginPrompt } from '@/components/LoginPrompt';
import { ReadTicks } from '@/components/ReadTicks';
import { Badge, Divider, EmptyState, ErrorState, Loading, T } from '@/components/ui';

export default function MessagesScreen() {
  const c = useColors();
  const { t } = useI18n();
  const { user } = useAuth();
  const q = useQuery<ChatsData>({ queryKey: keys.chats, queryFn: api.chats, enabled: !!user });

  if (!user) return <LoginPrompt icon="chatbubbles-outline" text={t('chats.login')} />;
  if (q.isPending) return <Loading />;
  if (q.isError) return <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />;

  return (
    <FlatList
      style={{ backgroundColor: c.card }}
      data={q.data.items}
      keyExtractor={(i) => i.id}
      renderItem={({ item }) => <ChatRow chat={item} />}
      ItemSeparatorComponent={() => <Divider inset={84} />}
      contentContainerStyle={{ flexGrow: 1 }}
      refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} tintColor={c.accent} />}
      ListEmptyComponent={<EmptyState icon="chatbubbles-outline" title={t('chats.emptyTitle')} text={t('chats.emptyText')} />}
    />
  );
}

function ChatRow({ chat }: { chat: Chat }) {
  const c = useColors();
  const { t, shortTime } = useI18n();
  const last = chat.last_message;
  const unread = chat.unread > 0;
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/chat/[id]', params: { id: chat.id } })}
      style={({ pressed }) => [styles.row, { opacity: pressed ? 0.7 : 1 }]}>
      <View style={[styles.thumb, { backgroundColor: c.fill }]}>
        {chat.listing.photo ? (
          <Image source={{ uri: mediaUrl(chat.listing.photo) }} style={StyleSheet.absoluteFill} contentFit="cover" />
        ) : (
          <Ionicons name="image-outline" size={22} color={c.textTertiary} />
        )}
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <View style={styles.line}>
          <T style={{ flex: 1, fontWeight: '600' }} numberOfLines={1}>
            {chat.peer.name || t(chat.role === 'buyer' ? 'chats.seller' : 'chats.buyer')}
          </T>
          {last && (
            <View style={styles.time}>
              {last.mine && <ReadTicks at={last.at} peerReadAt={chat.peer_read_at} size={14} />}
              <T variant="caption" color={unread ? 'accent' : 'tertiary'}>
                {shortTime(last.at)}
              </T>
            </View>
          )}
        </View>
        <T variant="small" color="secondary" numberOfLines={1}>
          {chat.listing.title}
        </T>
        <View style={styles.line}>
          <T variant="small" numberOfLines={1} style={{ flex: 1, fontWeight: unread ? '600' : '400' }} color={unread ? undefined : 'tertiary'}>
            {last ? (last.mine ? t('chats.you') : '') + last.text : ''}
          </T>
          <Badge n={chat.unread} />
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10 },
  thumb: { width: 56, height: 56, borderRadius: radius.m, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  line: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  time: { flexDirection: 'row', alignItems: 'center', gap: 3 },
});
