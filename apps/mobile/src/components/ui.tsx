import { useEffect, useRef, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { radius, useColors } from '@/lib/theme';

export type IconName = keyof typeof Ionicons.glyphMap;

export function T({
  children,
  style,
  variant = 'body',
  color,
  numberOfLines,
  selectable,
}: {
  children: ReactNode;
  selectable?: boolean;
  style?: StyleProp<TextStyle>;
  variant?: 'title' | 'h2' | 'h3' | 'body' | 'small' | 'caption' | 'price';
  color?: 'secondary' | 'tertiary' | 'accent' | 'danger' | 'inverse';
  numberOfLines?: number;
}) {
  const c = useColors();
  const colorMap = {
    secondary: c.textSecondary,
    tertiary: c.textTertiary,
    accent: c.accent,
    danger: c.danger,
    inverse: c.accentText,
  };
  return (
    <Text
      numberOfLines={numberOfLines}
      selectable={selectable}
      style={[styles[variant], { color: color ? colorMap[color] : c.text }, style]}>
      {children}
    </Text>
  );
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  loading,
  disabled,
  icon,
  style,
  small,
}: {
  title: string;
  onPress?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  loading?: boolean;
  disabled?: boolean;
  icon?: IconName;
  style?: StyleProp<ViewStyle>;
  small?: boolean;
}) {
  const c = useColors();
  const bg = { primary: c.accent, secondary: c.fill, ghost: 'transparent', danger: c.fill }[variant];
  const fg = { primary: c.accentText, secondary: c.text, ghost: c.accent, danger: c.danger }[variant];
  const off = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={off ? undefined : onPress}
      style={({ pressed }) => [
        styles.button,
        small && styles.buttonSmall,
        { backgroundColor: bg, opacity: off ? 0.5 : pressed ? 0.8 : 1 },
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon && <Ionicons name={icon} size={small ? 16 : 20} color={fg} />}
          <Text style={[small ? styles.buttonTextSmall : styles.buttonText, { color: fg }]} numberOfLines={1}>
            {title}
          </Text>
        </>
      )}
    </Pressable>
  );
}

export function Chip({
  label,
  active,
  onPress,
  onRemove,
  icon,
  disabled,
  muted,
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
  onRemove?: () => void;
  icon?: IconName;
  disabled?: boolean;
  muted?: boolean;
}) {
  const c = useColors();
  const fg = active ? c.accent : muted ? c.textTertiary : c.text;
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: active ? c.accentSoft : c.card,
          borderColor: active ? c.accent : c.border,
          opacity: disabled ? 0.45 : pressed ? 0.7 : 1,
        },
      ]}>
      {icon && <Ionicons name={icon} size={15} color={fg} />}
      <Text style={[styles.chipText, { color: fg }]} numberOfLines={1}>
        {label}
      </Text>
      {onRemove && (
        <Pressable hitSlop={10} onPress={onRemove} accessibilityLabel={`Убрать ${label}`}>
          <Ionicons name="close" size={15} color={fg} />
        </Pressable>
      )}
    </Pressable>
  );
}

export function Segmented<V extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: V; label: string }[];
  value: V;
  onChange: (v: V) => void;
}) {
  const c = useColors();
  return (
    <View style={[styles.segmented, { backgroundColor: c.fill }]}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            style={[styles.segment, active && { backgroundColor: c.card, ...styles.segmentShadow }]}>
            <Text
              numberOfLines={1}
              style={[styles.segmentText, { color: active ? c.text : c.textSecondary, fontWeight: active ? '600' : '500' }]}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const c = useColors();
  return <View style={[styles.card, { backgroundColor: c.card }, style]}>{children}</View>;
}

export function Row({
  title,
  value,
  onPress,
  icon,
  disabled,
  hint,
  danger,
  error,
}: {
  title: string;
  value?: string;
  onPress?: () => void;
  icon?: IconName;
  disabled?: boolean;
  hint?: string;
  danger?: boolean;
  error?: string;
}) {
  const c = useColors();
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      style={({ pressed }) => [styles.row, { opacity: disabled ? 0.45 : pressed ? 0.6 : 1 }]}>
      {icon && <Ionicons name={icon} size={20} color={danger ? c.danger : c.textSecondary} />}
      <View style={{ flex: 1 }}>
        <Text style={[styles.body, { color: danger ? c.danger : c.text }]}>{title}</Text>
        {hint && <Text style={[styles.caption, { color: c.textTertiary }]}>{hint}</Text>}
        {error && <Text style={[styles.caption, { color: c.danger }]}>{error}</Text>}
      </View>
      {value ? (
        <Text style={[styles.body, { color: c.textSecondary, maxWidth: '55%' }]} numberOfLines={1}>
          {value}
        </Text>
      ) : null}
      {onPress && <Ionicons name="chevron-forward" size={18} color={c.textTertiary} />}
    </Pressable>
  );
}

export function Divider({ inset = 16 }: { inset?: number }) {
  const c = useColors();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: c.border, marginLeft: inset }} />;
}

export function Skeleton({ style }: { style?: StyleProp<ViewStyle> }) {
  const c = useColors();
  const v = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    const a = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(v, { toValue: 0.5, duration: 700, useNativeDriver: true }),
      ]),
    );
    a.start();
    return () => a.stop();
  }, [v]);
  return <Animated.View style={[{ backgroundColor: c.skeleton, borderRadius: radius.s, opacity: v }, style]} />;
}

export function EmptyState({
  icon = 'search-outline',
  title,
  text,
  action,
}: {
  icon?: IconName;
  title: string;
  text?: string;
  action?: { title: string; onPress: () => void };
}) {
  const c = useColors();
  return (
    <View style={styles.empty}>
      <Ionicons name={icon} size={48} color={c.textTertiary} />
      <T variant="h3" style={{ textAlign: 'center' }}>
        {title}
      </T>
      {text && (
        <T color="secondary" style={{ textAlign: 'center' }}>
          {text}
        </T>
      )}
      {action && <Button title={action.title} onPress={action.onPress} style={{ marginTop: 8, alignSelf: 'center', paddingHorizontal: 24 }} />}
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <EmptyState
      icon="cloud-offline-outline"
      title="Не удалось загрузить"
      text={message}
      action={onRetry ? { title: 'Повторить', onPress: onRetry } : undefined}
    />
  );
}

export function Loading() {
  const c = useColors();
  return (
    <View style={styles.empty}>
      <ActivityIndicator color={c.accent} />
    </View>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <T variant="h3" style={{ marginTop: 20, marginBottom: 8, paddingHorizontal: 16 }}>
      {children}
    </T>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 28, fontWeight: '700', letterSpacing: -0.4 },
  h2: { fontSize: 22, fontWeight: '700', letterSpacing: -0.2 },
  h3: { fontSize: 17, fontWeight: '600' },
  body: { fontSize: 16, lineHeight: 22 },
  small: { fontSize: 14, lineHeight: 19 },
  caption: { fontSize: 12, lineHeight: 16 },
  price: { fontSize: 18, fontWeight: '700' },
  button: {
    height: 50,
    borderRadius: radius.m,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
  },
  buttonSmall: { height: 36, borderRadius: radius.s, paddingHorizontal: 12 },
  buttonText: { fontSize: 17, fontWeight: '600' },
  buttonTextSmall: { fontSize: 14, fontWeight: '600' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 17,
    borderWidth: 1,
    maxWidth: 260,
  },
  chipText: { fontSize: 14, fontWeight: '500', flexShrink: 1 },
  segmented: { flexDirection: 'row', borderRadius: 10, padding: 2 },
  segment: { flex: 1, height: 34, borderRadius: 8, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  segmentShadow: { shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  segmentText: { fontSize: 14 },
  card: { borderRadius: radius.l, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, minHeight: 50, paddingVertical: 10 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 10, minHeight: 240 },
});
