import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useI18n } from '@/lib/i18n';
import { radius, useColors } from '@/lib/theme';
import { T } from '../ui';
import { MAX_PHOTOS, type PhotoItem } from './photos';

export function PhotosField({
  photos,
  onAdd,
  onRemove,
  onMakeCover,
  onRetry,
  error,
}: {
  photos: PhotoItem[];
  onAdd: () => void;
  onRemove: (key: string) => void;
  onMakeCover: (key: string) => void;
  onRetry: (key: string) => void;
  error?: string;
}) {
  const c = useColors();
  const { t } = useI18n();
  const uploading = photos.filter((p) => p.status === 'uploading').length;
  return (
    <View style={{ paddingVertical: 12 }}>
      <View style={styles.head}>
        <T style={{ fontWeight: '600' }}>{t('form.photos')}</T>
        <T variant="small" color="tertiary">
          {uploading
            ? t('form.photosUploading', { done: photos.length - uploading, total: photos.length })
            : t('form.photosCount', { n: photos.length, max: MAX_PHOTOS })}
        </T>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {photos.length < MAX_PHOTOS && (
          <Pressable onPress={onAdd} style={[styles.tile, styles.add, { borderColor: c.accent, backgroundColor: c.accentSoft }]}>
            <Ionicons name="camera-outline" size={28} color={c.accent} />
            <T variant="caption" color="accent">
              {t('form.addPhoto')}
            </T>
          </Pressable>
        )}
        {photos.map((p, i) => (
          <Pressable key={p.key} onPress={() => (p.status === 'error' ? onRetry(p.key) : i > 0 && onMakeCover(p.key))} style={[styles.tile, { backgroundColor: c.fill }]}>
            <Image source={{ uri: p.uri }} style={StyleSheet.absoluteFill} contentFit="cover" />
            {p.status === 'uploading' && (
              <View style={styles.overlay}>
                <ActivityIndicator color="#fff" />
              </View>
            )}
            {p.status === 'error' && (
              <View style={styles.overlay}>
                <Ionicons name="refresh" size={24} color="#fff" />
                <T variant="caption" style={{ color: '#fff' }}>
                  {t('form.retry')}
                </T>
              </View>
            )}
            {i === 0 && (
              <View style={[styles.cover, { backgroundColor: c.accent }]}>
                <T variant="caption" color="inverse">
                  {t('form.cover')}
                </T>
              </View>
            )}
            <Pressable onPress={() => onRemove(p.key)} hitSlop={8} style={styles.remove} accessibilityLabel={t('form.removePhoto')}>
              <Ionicons name="close" size={14} color="#fff" />
            </Pressable>
          </Pressable>
        ))}
      </ScrollView>
      <T variant="caption" color={error ? 'danger' : 'tertiary'} style={{ paddingHorizontal: 16, marginTop: 6 }}>
        {error ?? t('form.photosHint')}
      </T>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, marginBottom: 10 },
  row: { gap: 8, paddingHorizontal: 16 },
  tile: { width: 96, height: 96, borderRadius: radius.m, overflow: 'hidden' },
  add: { borderWidth: 1.5, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: 2 },
  overlay: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  cover: { position: 'absolute', left: 4, bottom: 4, borderRadius: 4, paddingHorizontal: 4 },
  remove: { position: 'absolute', right: 4, top: 4, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
});
