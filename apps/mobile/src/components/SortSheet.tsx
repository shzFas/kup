import { Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Option } from '@kup/shared';
import { useI18n } from '@/lib/i18n';
import { useColors } from '@/lib/theme';
import { Sheet } from './Sheet';
import { T } from './ui';

export function SortSheet({
  visible,
  onClose,
  sorts,
  value,
  onChange,
}: {
  visible: boolean;
  onClose: () => void;
  sorts: Option[];
  value: string;
  onChange: (v: string) => void;
}) {
  const c = useColors();
  const { t } = useI18n();
  return (
    <Sheet visible={visible} onClose={onClose} title={t('search.sort')}>
      {sorts.map((s, i) => {
        const active = value ? value === s.value : i === 0;
        return (
          <Pressable
            key={s.value}
            onPress={() => {
              onChange(s.value);
              onClose();
            }}
            style={({ pressed }) => [styles.row, { opacity: pressed ? 0.6 : 1 }]}>
            <T style={{ flex: 1, fontWeight: active ? '600' : '400' }}>{s.label}</T>
            {active && <Ionicons name="checkmark" size={22} color={c.accent} />}
          </Pressable>
        );
      })}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, height: 50 },
});
