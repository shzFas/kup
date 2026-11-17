import { useState } from 'react';
import { FlatList, Modal, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { mediaUrl } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useColors } from '@/lib/theme';
import { T } from './ui';

function Pager({
  photos,
  width,
  height,
  index,
  onIndex,
  onPress,
  fit,
}: {
  photos: string[];
  width: number;
  height: number;
  index: number;
  onIndex: (i: number) => void;
  onPress?: () => void;
  fit: 'cover' | 'contain';
}) {
  return (
    <FlatList
      data={photos}
      horizontal
      pagingEnabled
      initialScrollIndex={index}
      getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
      showsHorizontalScrollIndicator={false}
      keyExtractor={(p, i) => p + i}
      onMomentumScrollEnd={(e) => onIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
      renderItem={({ item }) =>
        fit === 'contain' ? (
          // ScrollView zoom works on iOS; Android shows the photo fitted.
          <ScrollView
            style={{ width, height }}
            maximumZoomScale={3}
            minimumZoomScale={1}
            centerContent
            showsHorizontalScrollIndicator={false}
            showsVerticalScrollIndicator={false}>
            <Image source={{ uri: mediaUrl(item) }} style={{ width, height }} contentFit="contain" />
          </ScrollView>
        ) : (
          <Pressable onPress={onPress}>
            <Image source={{ uri: mediaUrl(item) }} style={{ width, height }} contentFit="cover" transition={150} />
          </Pressable>
        )
      }
    />
  );
}

export function Gallery({ photos }: { photos: string[] }) {
  const c = useColors();
  const { t } = useI18n();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [index, setIndex] = useState(0);
  const [full, setFull] = useState(false);
  const h = Math.round(width * 0.75);

  if (!photos.length) {
    return (
      <View style={{ width, height: h * 0.7, backgroundColor: c.fill, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name="image-outline" size={48} color={c.textTertiary} />
        <T color="tertiary">{t('form.noPhoto')}</T>
      </View>
    );
  }

  return (
    <View style={{ backgroundColor: c.fill }}>
      <Pager photos={photos} width={width} height={h} index={index} onIndex={setIndex} onPress={() => setFull(true)} fit="cover" />
      <View style={styles.counter}>
        <T variant="caption" style={{ color: '#fff' }}>
          {index + 1} / {photos.length}
        </T>
      </View>
      <Modal visible={full} animationType="fade" onRequestClose={() => setFull(false)} supportedOrientations={['portrait']}>
        <View style={{ flex: 1, backgroundColor: '#000' }}>
          <Pager
            key={String(full)}
            photos={photos}
            width={width}
            height={height}
            index={index}
            onIndex={setIndex}
            fit="contain"
          />
          <View style={[styles.fullTop, { top: insets.top + 8 }]}>
            <T style={{ color: '#fff' }}>
              {index + 1} / {photos.length}
            </T>
            <Pressable onPress={() => setFull(false)} hitSlop={12} accessibilityLabel={t('common.close')}>
              <Ionicons name="close" size={30} color="#fff" />
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  counter: { position: 'absolute', right: 12, bottom: 12, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  fullTop: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});
