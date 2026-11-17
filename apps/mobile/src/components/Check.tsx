import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatNumber } from '@kup/shared';
import { useColors } from '@/lib/theme';

/** Checkbox / radio row with optional facet count. */
export function CheckRow({
  label,
  checked,
  onPress,
  count,
  subtitle,
  radio,
}: {
  label: string;
  checked: boolean;
  onPress: () => void;
  count?: number;
  subtitle?: string;
  radio?: boolean;
}) {
  const c = useColors();
  const zero = count === 0 && !checked;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={radio ? 'radio' : 'checkbox'}
      accessibilityState={{ checked }}
      style={({ pressed }) => [styles.row, { opacity: pressed ? 0.6 : 1 }]}>
      <Ionicons
        name={radio ? (checked ? 'radio-button-on' : 'radio-button-off') : checked ? 'checkbox' : 'square-outline'}
        size={22}
        color={checked ? c.accent : zero ? c.textTertiary : c.textSecondary}
      />
      <View style={{ flex: 1 }}>
        <Text style={[styles.label, { color: zero ? c.textTertiary : c.text }]}>{label}</Text>
        {subtitle ? <Text style={[styles.sub, { color: c.textTertiary }]}>{subtitle}</Text> : null}
      </View>
      {count != null && <Text style={[styles.count, { color: c.textTertiary }]}>{formatNumber(count)}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44, paddingVertical: 6 },
  label: { fontSize: 16 },
  sub: { fontSize: 12 },
  count: { fontSize: 14 },
});
