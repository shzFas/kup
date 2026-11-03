import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import type { Chat } from '@kup/shared';
import { api, ApiError, errorMessage, mediaUrl } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import {
  appendMessage,
  keys,
  markChatReadLocally,
  MESSAGES_LIMIT,
  openChatStore,
  patchChat,
  replaceMessage,
  type ChatsData,
  type LocalMessage,
} from '@/lib/chatCache';
import { socketStore } from '@/lib/events';
import { dayKey } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { useStore } from '@/lib/store';
import { radius, useColors } from '@/lib/theme';
import { ReadTicks } from '@/components/ReadTicks';
import { EmptyState, ErrorState, Loading, T } from '@/components/ui';

let tmpSeq = 0;

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useColors();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const { user } = useAuth();
  const [text, setText] = useState('');
  const [kbOpen, setKbOpen] = useState(false);

  const chatQ = useQuery<Chat>({
    queryKey: keys.chat(id),
    queryFn: () => api.chat(id),
    enabled: !!user,
    initialData: () => qc.getQueryData<ChatsData>(keys.chats)?.items.find((x) => x.id === id),
    initialDataUpdatedAt: () => qc.getQueryState(keys.chats)?.dataUpdatedAt,
  });
  const chat = chatQ.data;

  const msgs = useInfiniteQuery({
    queryKey: keys.messages(id),
    enabled: !!user,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => api.chatMessages(id, { before: pageParam, limit: MESSAGES_LIMIT }) as Promise<LocalMessage[]>,
    // pages[0] is the newest page; the last page is the oldest loaded one.
    getNextPageParam: (last: LocalMessage[]) => (last.length < MESSAGES_LIMIT ? undefined : last[0]?.id),
  });

  // Newest first, for the inverted list.
  const data = useMemo(() => msgs.data?.pages.flatMap((p) => [...p].reverse()) ?? [], [msgs.data]);

  // Mark this conversation as open (realtime provider won't count its messages as unread) while focused.
  useFocusEffect(
    useCallback(() => {
      openChatStore.set(id);
      return () => {
        if (openChatStore.get() === id) openChatStore.set(null);
      };
    }, [id]),
  );

  // Mark read whenever a new incoming message is on screen.
  const newestIncoming = data.find((m) => !m.mine)?.id;
  const lastRead = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!newestIncoming && !chat?.unread) return;
    if (lastRead.current === newestIncoming && !chat?.unread) return;
    lastRead.current = newestIncoming;
    markChatReadLocally(qc, id);
    api.readChat(id).catch(() => {});
  }, [newestIncoming, chat?.unread, id, qc]);

  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setKbOpen(true));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKbOpen(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const deliver = (tmp: LocalMessage) => {
    api
      .sendMessage(id, tmp.text)
      .then((m) => {
        replaceMessage(qc, id, tmp.id, m);
        patchChat(qc, id, (ch) => ({ ...ch, last_message: { text: m.text, at: m.created_at, mine: true } }));
      })
      .catch((e) => {
        replaceMessage(qc, id, tmp.id, { ...tmp, pending: false, failed: true });
        if (e instanceof ApiError && e.status !== 429 && e.status < 500) Alert.alert(t('write.failed'), errorMessage(e));
      });
  };

  const send = (body = text) => {
    const value = body.trim();
    if (!value || !user || !msgs.data) return;
    const tmp: LocalMessage = {
      id: `tmp-${Date.now()}-${tmpSeq++}`,
      chat_id: id,
      sender_id: user.id,
      mine: true,
      text: value.slice(0, 2000),
      created_at: new Date().toISOString(),
      pending: true,
    };
    appendMessage(qc, id, tmp);
    patchChat(qc, id, (ch) => ({ ...ch, last_message: { text: tmp.text, at: tmp.created_at, mine: true } }), true);
    setText('');
    deliver(tmp);
  };

  const onFailed = (m: LocalMessage) =>
    Alert.alert(t('chat.failed'), m.text, [
      {
        text: t('common.retry'),
        onPress: () => {
          const retry = { ...m, pending: true, failed: false, created_at: new Date().toISOString() };
          replaceMessage(qc, id, m.id, null);
          appendMessage(qc, id, retry);
          deliver(retry);
        },
      },
      { text: t('common.delete'), style: 'destructive', onPress: () => replaceMessage(qc, id, m.id, null) },
      { text: t('common.cancel'), style: 'cancel' },
    ]);

  const offline = useDelayedOffline(!!user);

  let body;
  if (msgs.isPending) body = <Loading />;
  else if (msgs.isError)
    body =
      msgs.error instanceof ApiError && msgs.error.status === 404 ? (
        <EmptyState icon="chatbubbles-outline" title={t('chat.notFound')} />
      ) : (
        <ErrorState message={errorMessage(msgs.error)} onRetry={() => msgs.refetch()} />
      );
  else
    body = (
      <FlatList
        inverted
        data={data}
        keyExtractor={(m) => m.id}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 8, flexGrow: 1 }}
        onEndReached={() => msgs.hasNextPage && !msgs.isFetchingNextPage && msgs.fetchNextPage()}
        onEndReachedThreshold={0.3}
        ListFooterComponent={msgs.isFetchingNextPage ? <ActivityIndicator style={{ margin: 12 }} color={c.accent} /> : undefined}
        ListEmptyComponent={
          <View style={[styles.empty, { transform: [{ scaleY: -1 }] }]}>
            <T color="tertiary" style={{ textAlign: 'center' }}>
              {t('chat.empty')}
            </T>
          </View>
        }
        renderItem={({ item, index }) => {
          const older = data[index + 1];
          const newDay = !older || dayKey(older.created_at) !== dayKey(item.created_at);
          const grouped = !!older && !newDay && older.mine === item.mine;
          return (
            <View>
              {newDay && <DaySeparator iso={item.created_at} />}
              <Bubble m={item} grouped={grouped} peerReadAt={chat?.peer_read_at ?? null} onFailed={() => onFailed(item)} />
            </View>
          );
        }}
      />
    );

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <ChatHeader chat={chat} topInset={insets.top} />
      {offline && (
        <View style={[styles.offline, { backgroundColor: c.fill }]}>
          <T variant="caption" color="secondary" style={{ textAlign: 'center' }}>
            {t('chat.offline')}
          </T>
        </View>
      )}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <View style={{ flex: 1 }}>{body}</View>
        <View style={[styles.inputBar, { backgroundColor: c.card, borderTopColor: c.border, paddingBottom: kbOpen ? 8 : insets.bottom + 8 }]}>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder={t('chat.placeholder')}
            placeholderTextColor={c.textTertiary}
            multiline
            maxLength={2000}
            style={[styles.input, { backgroundColor: c.fill, color: c.text }]}
          />
          <Pressable
            onPress={() => send()}
            disabled={!text.trim() || !msgs.data}
            accessibilityLabel={t('chat.send')}
            style={({ pressed }) => [
              styles.sendBtn,
              { backgroundColor: c.accent, opacity: !text.trim() || !msgs.data ? 0.4 : pressed ? 0.7 : 1 },
            ]}>
            <Ionicons name="arrow-up" size={22} color={c.accentText} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

/** True if the realtime socket has been down for a few seconds (avoids flashing on reconnects). */
function useDelayedOffline(enabled: boolean) {
  const connected = useStore(socketStore, (s) => s);
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    if (!enabled || connected) {
      setOffline(false);
      return;
    }
    const tm = setTimeout(() => setOffline(true), 4000);
    return () => clearTimeout(tm);
  }, [connected, enabled]);
  return offline;
}

function ChatHeader({ chat, topInset }: { chat: Chat | undefined; topInset: number }) {
  const c = useColors();
  const { t, price } = useI18n();
  return (
    <View style={[styles.header, { paddingTop: topInset + 6, backgroundColor: c.card, borderBottomColor: c.border }]}>
      <Pressable onPress={() => router.back()} hitSlop={12} accessibilityLabel={t('common.back')}>
        <Ionicons name="chevron-back" size={28} color={c.accent} />
      </Pressable>
      {chat ? (
        <Pressable
          style={({ pressed }) => [styles.headerMain, { opacity: pressed ? 0.7 : 1 }]}
          onPress={() => router.push({ pathname: '/listing/[id]', params: { id: chat.listing.id } })}>
          <View style={[styles.headerThumb, { backgroundColor: c.fill }]}>
            {chat.listing.photo ? (
              <Image source={{ uri: mediaUrl(chat.listing.photo) }} style={StyleSheet.absoluteFill} contentFit="cover" />
            ) : (
              <Ionicons name="image-outline" size={18} color={c.textTertiary} />
            )}
          </View>
          <View style={{ flex: 1 }}>
            <T style={{ fontWeight: '600' }} numberOfLines={1}>
              {chat.peer.name || t(chat.role === 'buyer' ? 'chats.seller' : 'chats.buyer')}
            </T>
            <T variant="caption" color="secondary" numberOfLines={1}>
              {chat.listing.title} · {price(chat.listing.price, chat.listing.currency)}
            </T>
          </View>
        </Pressable>
      ) : (
        <View style={styles.headerMain}>
          <T style={{ fontWeight: '600' }}>{t('nav.chat')}</T>
        </View>
      )}
    </View>
  );
}

function DaySeparator({ iso }: { iso: string }) {
  const c = useColors();
  const { day } = useI18n();
  return (
    <View style={styles.day}>
      <View style={[styles.dayPill, { backgroundColor: c.fill }]}>
        <T variant="caption" color="secondary">
          {day(iso)}
        </T>
      </View>
    </View>
  );
}

function Bubble({
  m,
  grouped,
  peerReadAt,
  onFailed,
}: {
  m: LocalMessage;
  grouped: boolean;
  peerReadAt: string | null;
  onFailed: () => void;
}) {
  const c = useColors();
  const { clock, t } = useI18n();
  const mine = m.mine;
  return (
    <Pressable
      onPress={m.failed ? onFailed : undefined}
      onLongPress={() => Alert.alert('', m.text)}
      style={[styles.bubbleRow, { justifyContent: mine ? 'flex-end' : 'flex-start', marginTop: grouped ? 2 : 8 }]}>
      <View
        style={[
          styles.bubble,
          mine
            ? { backgroundColor: c.accent, borderBottomRightRadius: 4 }
            : { backgroundColor: c.card, borderBottomLeftRadius: 4 },
          m.failed && { opacity: 0.6 },
        ]}>
        <T selectable style={{ color: mine ? c.accentText : c.text }}>
          {m.text}
        </T>
        <View style={styles.meta}>
          <T variant="caption" style={{ color: mine ? 'rgba(255,255,255,0.75)' : c.textTertiary }}>
            {clock(m.created_at)}
          </T>
          {mine &&
            (m.failed ? (
              <Ionicons name="alert-circle" size={14} color="#fff" />
            ) : m.pending ? (
              <Ionicons name="time-outline" size={13} color="rgba(255,255,255,0.75)" />
            ) : (
              <ReadTicks at={m.created_at} peerReadAt={peerReadAt} size={14} light />
            ))}
        </View>
      </View>
      {m.failed && (
        <T variant="caption" color="danger" style={{ alignSelf: 'center', marginLeft: 6, maxWidth: 110 }}>
          {t('chat.failed')}
        </T>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8, paddingBottom: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  headerMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerThumb: { width: 38, height: 38, borderRadius: radius.s, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  offline: { paddingVertical: 4, paddingHorizontal: 16 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  day: { alignItems: 'center', marginVertical: 10 },
  dayPill: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10 },
  bubbleRow: { flexDirection: 'row' },
  bubble: { maxWidth: '80%', paddingHorizontal: 12, paddingTop: 7, paddingBottom: 5, borderRadius: 18 },
  meta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 3, marginTop: 2 },
  inputBar: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 12, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth },
  input: { flex: 1, minHeight: 40, maxHeight: 120, borderRadius: 20, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 10, fontSize: 16 },
  sendBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});
