import type { ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/lib/theme';
import { T } from './ui';

/** Simple bottom sheet built on Modal. */
export function Sheet({
  visible,
  onClose,
  title,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: c.overlay }]} onPress={onClose} />
      <View style={[styles.sheet, { backgroundColor: c.card, paddingBottom: insets.bottom + 12 }]}>
        <View style={[styles.handle, { backgroundColor: c.border }]} />
        {title && (
          <T variant="h3" style={styles.title}>
            {title}
          </T>
        )}
        {children}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingTop: 8 },
  handle: { alignSelf: 'center', width: 36, height: 5, borderRadius: 3, marginBottom: 8 },
  title: { paddingHorizontal: 16, paddingVertical: 8 },
});
