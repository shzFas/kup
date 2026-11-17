import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import type { ListingCard as Card } from '@kup/shared';
import { mediaUrl } from '@/lib/api';
import { useIsFavorite, useToggleFavorite } from '@/lib/favorites';
import { useI18n } from '@/lib/i18n';
import { STATUS_SHORT } from '@/lib/status';
import { radius, useColors } from '@/lib/theme';
import { Skeleton, T } from './ui';

function ListingCardImpl({ item, showStatus, compact }: { item: Card; showStatus?: boolean; compact?: boolean }) {
  const c = useColors();
  const { t, price, date } = useI18n();
  const fav = useIsFavorite(item.id, item.is_favorite);
  const toggle = useToggleFavorite();
  const cover = item.photos[0];

  return (
    <Pressable
      onPress={() => router.push({ pathname: '/listing/[id]', params: { id: item.id } })}
      style={({ pressed }) => [styles.card, compact && styles.compact, { backgroundColor: c.card, opacity: pressed ? 0.9 : 1 }]}>
      <View style={[compact ? styles.thumbCompact : styles.thumb, { backgroundColor: c.fill }]}>
        {cover ? (
          <Image source={{ uri: mediaUrl(cover) }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} recyclingKey={item.id} />
        ) : (
          <View style={styles.noPhoto}>
            <Ionicons name="image-outline" size={compact ? 24 : 36} color={c.textTertiary} />
          </View>
        )}
        {item.photos.length > 1 && !compact && (
          <View style={styles.photoCount}>
            <Ionicons name="images-outline" size={12} color="#fff" />
            <T variant="caption" style={{ color: '#fff' }}>
              {item.photos.length}
            </T>
          </View>
        )}
        <Pressable
          hitSlop={8}
          onPress={() => toggle(item.id, fav)}
          style={styles.heart}
          accessibilityLabel={fav ? t('card.removeFavorite') : t('card.addFavorite')}>
          <Ionicons name={fav ? 'heart' : 'heart-outline'} size={22} color={fav ? '#FF3B5C' : '#fff'} />
        </Pressable>
      </View>
      <View style={[styles.body, compact && { flex: 1 }]}>
        <T variant="price">{price(item.price, item.currency, item.price_suffix)}</T>
        <T numberOfLines={2} style={{ fontWeight: '500' }}>
          {item.title}
        </T>
        {item.highlights.length > 0 && (
          <T variant="small" color="secondary" numberOfLines={compact ? 2 : 1}>
            {item.highlights.join(' · ')}
          </T>
        )}
        <T variant="caption" color="tertiary" numberOfLines={1}>
          {[item.city?.name, date(item.published_at)].filter(Boolean).join(' · ')}
        </T>
        {showStatus && item.status !== 'active' && (
          <View style={[styles.status, { backgroundColor: item.status === 'blocked' ? c.danger : c.fill }]}>
            <T variant="caption" color={item.status === 'blocked' ? 'inverse' : 'secondary'}>
              {t(STATUS_SHORT[item.status])}
            </T>
          </View>
        )}
      </View>
    </Pressable>
  );
}

export const ListingCard = memo(ListingCardImpl);

export function ListingCardSkeleton() {
  const c = useColors();
  return (
    <View style={[styles.card, { backgroundColor: c.card }]}>
      <Skeleton style={{ aspectRatio: 4 / 3, borderRadius: 0 }} />
      <View style={styles.body}>
        <Skeleton style={{ height: 20, width: '40%' }} />
        <Skeleton style={{ height: 16, width: '80%' }} />
        <Skeleton style={{ height: 14, width: '60%' }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.l, overflow: 'hidden', marginHorizontal: 16, marginBottom: 12 },
  compact: { flexDirection: 'row' },
  thumb: { aspectRatio: 4 / 3, width: '100%' },
  thumbCompact: { width: 120, minHeight: 110 },
  noPhoto: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  photoCount: {
    position: 'absolute',
    left: 10,
    bottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  heart: { position: 'absolute', right: 8, top: 8, backgroundColor: 'rgba(0,0,0,0.25)', borderRadius: 18, padding: 6 },
  body: { padding: 12, gap: 3 },
  status: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, marginTop: 4 },
});
