import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useI18n } from '@/lib/i18n';
import { useColors } from '@/lib/theme';
import { Sheet } from './Sheet';
import { Button, T } from './ui';

/** ⓘ button that opens a small bottom sheet with an explanation (schema `hint`). Renders nothing without a hint. */
export function HintButton({ title, hint, size = 18 }: { title: string; hint: string | null | undefined; size?: number }) {
  const c = useColors();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  if (!hint) return null;
  return (
    <>
      <Pressable onPress={() => setOpen(true)} hitSlop={10} accessibilityRole="button" accessibilityLabel={`${t('filters.hint')}: ${title}`}>
        <Ionicons name="information-circle-outline" size={size} color={c.accent} />
      </Pressable>
      <Sheet visible={open} onClose={() => setOpen(false)} title={title}>
        <View style={{ paddingHorizontal: 16, paddingBottom: 8, gap: 16 }}>
          <T>{hint}</T>
          <Button title={t('common.ok')} variant="secondary" onPress={() => setOpen(false)} />
        </View>
      </Sheet>
    </>
  );
}

/** Muted explanation under a form field. */
export function HintText({ hint }: { hint: string | null | undefined }) {
  if (!hint) return null;
  return (
    <T variant="caption" color="tertiary" style={{ marginTop: 6 }}>
      {hint}
    </T>
  );
}
