import { useState } from 'react';
import { Alert, FlatList, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { REPORT_REASONS, type Listing, type ListingCard, type ReportReason } from '@kup/shared';
import { api, ApiError, errorMessage, mediaUrl } from '@/lib/api';
import { upsertChat } from '@/lib/chatCache';
import { useI18n, type Key } from '@/lib/i18n';
import { radius, useColors } from '@/lib/theme';
import { CheckRow } from '../Check';
import { Sheet } from '../Sheet';
import { Button, Card, Chip, T } from '../ui';

/** Price changes, oldest → newest; shown only when the price actually changed. */
export function PriceHistory({ listing }: { listing: Listing }) {
  const c = useColors();
  const { t, price, dayMonth } = useI18n();
  const h = listing.price_history ?? [];
  if (h.length < 2) return null;
  const rows = [...h].reverse(); // newest first
  return (
    <Card style={styles.card}>
      <T variant="h3" style={{ padding: 16, paddingBottom: 8 }}>
        {t('listing.priceHistory')}
      </T>
      {rows.map((p, i) => {
        const prev = rows[i + 1];
        const diff = prev ? p.price - prev.price : 0;
        return (
          <View key={p.at + i} style={styles.priceRow}>
            <T color="secondary" style={{ flex: 1 }}>
              {dayMonth(p.at)}
            </T>
            {prev ? (
              <View style={styles.diff}>
                <Ionicons name={diff < 0 ? 'arrow-down' : 'arrow-up'} size={14} color={diff < 0 ? c.success : c.danger} />
                <T variant="small" style={{ color: diff < 0 ? c.success : c.danger }}>
                  {price(Math.abs(diff), listing.currency)}
                </T>
              </View>
            ) : (
              <T variant="small" color="tertiary">
                {t('listing.priceStart')}
              </T>
            )}
            <T style={{ fontWeight: i === 0 ? '700' : '400', minWidth: 110, textAlign: 'right' }}>{price(p.price, listing.currency)}</T>
          </View>
        );
      })}
      <View style={{ height: 8 }} />
    </Card>
  );
}

export function SimilarListings({ id }: { id: string }) {
  const { t } = useI18n();
  const q = useQuery({ queryKey: ['similar', id], queryFn: () => api.similar(id, 8), staleTime: 5 * 60_000 });
  const items = q.data ?? [];
  if (!items.length) return null;
  return (
    <View style={{ marginTop: 20 }}>
      <T variant="h3" style={{ paddingHorizontal: 16, marginBottom: 10 }}>
        {t('listing.similar')}
      </T>
      <FlatList
        horizontal
        data={items}
        keyExtractor={(i) => i.id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}
        renderItem={({ item }) => <Tile item={item} />}
      />
    </View>
  );
}

function Tile({ item }: { item: ListingCard }) {
  const c = useColors();
  const { price } = useI18n();
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/listing/[id]', params: { id: item.id } })}
      style={({ pressed }) => [styles.tile, { backgroundColor: c.card, opacity: pressed ? 0.8 : 1 }]}>
      <View style={[styles.tileImg, { backgroundColor: c.fill }]}>
        {item.photos[0] ? (
          <Image source={{ uri: mediaUrl(item.photos[0]) }} style={StyleSheet.absoluteFill} contentFit="cover" recyclingKey={item.id} />
        ) : (
          <Ionicons name="image-outline" size={28} color={c.textTertiary} />
        )}
      </View>
      <View style={{ padding: 8, gap: 2 }}>
        <T style={{ fontWeight: '700' }} numberOfLines={1}>
          {price(item.price, item.currency, item.price_suffix)}
        </T>
        <T variant="small" numberOfLines={2}>
          {item.title}
        </T>
        <T variant="caption" color="tertiary" numberOfLines={1}>
          {item.city?.name}
        </T>
      </View>
    </Pressable>
  );
}

const TEMPLATES: Key[] = ['write.tpl1', 'write.tpl2', 'write.tpl3', 'write.tpl4'];

/** Quick message templates → POST /v1/chats → opens the conversation. */
export function WriteSheet({ listingId, visible, onClose }: { listingId: string; visible: boolean; onClose: () => void }) {
  const c = useColors();
  const { t } = useI18n();
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  const send = async (value: string) => {
    const v = value.trim();
    if (!v || sending) return;
    setSending(true);
    try {
      const chat = await api.startChat(listingId, v);
      upsertChat(qc, chat);
      void qc.invalidateQueries({ queryKey: ['messages', chat.id] });
      setText('');
      onClose();
      router.push({ pathname: '/chat/[id]', params: { id: chat.id } });
    } catch (e) {
      const msg =
        e instanceof ApiError && e.status === 410
          ? t('write.inactive')
          : e instanceof ApiError && e.status === 400 && e.code !== 'validation_failed'
            ? e.message || t('write.ownListing')
            : errorMessage(e);
      Alert.alert(t('write.failed'), msg);
    } finally {
      setSending(false);
    }
  };

  return (
    <Sheet visible={visible} onClose={onClose} title={t('write.title')}>
      <View style={{ paddingHorizontal: 16, gap: 12 }}>
        <View style={styles.templates}>
          {TEMPLATES.map((k) => (
            <Chip key={k} label={t(k)} onPress={() => send(t(k))} disabled={sending} />
          ))}
        </View>
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder={t('write.placeholder')}
            placeholderTextColor={c.textTertiary}
            multiline
            maxLength={2000}
            style={[styles.input, { backgroundColor: c.fill, color: c.text }]}
          />
          <Button title={t('write.send')} onPress={() => send(text)} loading={sending} disabled={!text.trim()} style={{ height: 44 }} />
        </View>
      </View>
    </Sheet>
  );
}

export function ReportSheet({ listingId, visible, onClose }: { listingId: string; visible: boolean; onClose: () => void }) {
  const c = useColors();
  const { t } = useI18n();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [comment, setComment] = useState('');
  const [sending, setSending] = useState(false);

  const submit = async () => {
    if (!reason) return;
    setSending(true);
    try {
      await api.report(listingId, reason, comment.trim());
      onClose();
      setReason(null);
      setComment('');
      Alert.alert(t('report.thanks'));
    } catch (e) {
      Alert.alert(t('report.failed'), errorMessage(e));
    } finally {
      setSending(false);
    }
  };

  return (
    <Sheet visible={visible} onClose={onClose} title={t('report.title')}>
      <ScrollView style={{ maxHeight: 520 }} contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }} keyboardShouldPersistTaps="handled">
        {REPORT_REASONS.map((r) => (
          <CheckRow key={r.value} radio label={t(`report.${r.value}` as Key)} checked={reason === r.value} onPress={() => setReason(r.value)} />
        ))}
        <TextInput
          value={comment}
          onChangeText={setComment}
          placeholder={t('report.comment')}
          placeholderTextColor={c.textTertiary}
          multiline
          maxLength={1000}
          style={[styles.input, { backgroundColor: c.fill, color: c.text, minHeight: 70 }]}
        />
        <Button title={t('report.send')} onPress={submit} loading={sending} disabled={!reason} />
      </ScrollView>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: 16, marginTop: 12 },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 6 },
  diff: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  tile: { width: 160, borderRadius: radius.m, overflow: 'hidden' },
  tileImg: { width: 160, height: 120, alignItems: 'center', justifyContent: 'center' },
  templates: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  input: { flex: 1, minHeight: 44, maxHeight: 120, borderRadius: radius.m, paddingHorizontal: 12, paddingTop: 11, paddingBottom: 11, fontSize: 16 },
});
