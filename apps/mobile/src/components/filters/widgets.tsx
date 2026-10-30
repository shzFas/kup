import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatNumber, type FilterDef, type FilterValue } from '@kup/shared';
import { parseNumber } from '@/lib/format';
import { radius, useColors } from '@/lib/theme';
import { CheckRow } from '../Check';
import { Chip, T } from '../ui';

type OnChange = (v: FilterValue | undefined) => void;

const fmt = (n: number | undefined) => (n == null ? '' : formatNumber(n));

export function RangeWidget({ def, value, onChange }: { def: FilterDef; value?: FilterValue; onChange: OnChange }) {
  const c = useColors();
  const v = value && !('in' in value) && !('all' in value) && !('eq' in value) ? value : {};
  const [from, setFrom] = useState(fmt(v.gte));
  const [to, setTo] = useState(fmt(v.lte));
  const [focus, setFocus] = useState<'gte' | 'lte'>('lte');

  // Keep inputs in sync with external changes (reset, chip removal, presets).
  useEffect(() => {
    if (parseNumber(from) !== v.gte) setFrom(fmt(v.gte));
    if (parseNumber(to) !== v.lte) setTo(fmt(v.lte));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v.gte, v.lte]);

  const decimal = def.type === 'decimal' || (def.step != null && def.step < 1);
  const emit = (gte: number | undefined, lte: number | undefined) => {
    const r: { gte?: number; lte?: number } = {};
    if (gte != null) r.gte = gte;
    if (lte != null) r.lte = lte;
    onChange(r);
  };
  const unit = def.unit ? `, ${def.unit}` : '';

  const input = (side: 'gte' | 'lte', text: string, set: (s: string) => void) => (
    <View style={[styles.input, { backgroundColor: c.fill }]}>
      <T color="tertiary" variant="small">
        {side === 'gte' ? 'от' : 'до'}
      </T>
      <TextInput
        value={text}
        onFocus={() => setFocus(side)}
        onChangeText={(t) => {
          set(t);
          const n = parseNumber(t);
          if (side === 'gte') emit(n, v.lte);
          else emit(v.gte, n);
        }}
        onBlur={() => set(fmt(side === 'gte' ? v.gte : v.lte))}
        keyboardType={decimal ? 'decimal-pad' : 'number-pad'}
        placeholder={side === 'gte' ? (def.min != null ? fmt(def.min) : '') : def.max != null ? fmt(def.max) : ''}
        placeholderTextColor={c.textTertiary}
        style={[styles.inputText, { color: c.text }]}
        returnKeyType="done"
      />
    </View>
  );

  return (
    <View style={styles.block}>
      <T style={styles.label}>
        {def.label}
        <T color="tertiary">{unit}</T>
      </T>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {input('gte', from, setFrom)}
        {input('lte', to, setTo)}
      </View>
      {def.presets && def.presets.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingTop: 8 }} keyboardShouldPersistTaps="handled">
          {def.presets.map((p) => {
            const active = v.lte === p || v.gte === p;
            return (
              <Chip
                key={p}
                label={`${focus === 'gte' ? 'от' : 'до'} ${formatNumber(p)}`}
                active={active}
                onPress={() => {
                  if (focus === 'gte') emit(v.gte === p ? undefined : p, v.lte);
                  else emit(v.gte, v.lte === p ? undefined : p);
                }}
              />
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const COLLAPSED = 6;

export function MultiWidget({
  def,
  value,
  onChange,
  counts,
}: {
  def: FilterDef;
  value?: FilterValue;
  onChange: OnChange;
  counts?: Record<string, number>;
}) {
  const [expanded, setExpanded] = useState(false);
  const all = def.widget === 'multi_all';
  const selected = value && 'in' in value ? value.in : value && 'all' in value ? value.all : [];
  const options = def.options ?? [];
  // Keep selected values visible even when collapsed.
  const shown = expanded || options.length <= COLLAPSED + 2 ? options : options.filter((o, i) => i < COLLAPSED || selected.includes(o.value));
  const toggle = (val: string) => {
    const next = selected.includes(val) ? selected.filter((x) => x !== val) : [...selected, val];
    onChange(all ? { all: next } : { in: next });
  };
  return (
    <View style={styles.block}>
      <T style={styles.label}>{def.label}</T>
      {all && (
        <T variant="caption" color="tertiary" style={{ marginTop: -4, marginBottom: 2 }}>
          Должны быть все отмеченные
        </T>
      )}
      {shown.map((o) => (
        <CheckRow
          key={o.value}
          label={o.label}
          checked={selected.includes(o.value)}
          onPress={() => toggle(o.value)}
          count={def.facet && counts ? (counts[o.value] ?? 0) : undefined}
        />
      ))}
      {shown.length < options.length && <ShowAll onPress={() => setExpanded(true)} n={options.length} />}
      {expanded && options.length > COLLAPSED + 2 && (
        <Pressable onPress={() => setExpanded(false)} style={{ paddingVertical: 8 }}>
          <T color="accent">Свернуть</T>
        </Pressable>
      )}
    </View>
  );
}

function ShowAll({ onPress, n }: { onPress: () => void; n: number }) {
  return (
    <Pressable onPress={onPress} style={{ paddingVertical: 8 }}>
      <T color="accent">Показать все ({n})</T>
    </Pressable>
  );
}

export function ToggleWidget({ def, value, onChange }: { def: FilterDef; value?: FilterValue; onChange: OnChange }) {
  const c = useColors();
  const on = !!value && 'eq' in value && value.eq === true;
  return (
    <Pressable style={[styles.block, styles.toggle]} onPress={() => onChange(on ? undefined : { eq: true })}>
      <T style={{ flex: 1 }}>{def.label}</T>
      <Switch value={on} onValueChange={(x) => onChange(x ? { eq: true } : undefined)} trackColor={{ true: c.accent }} />
    </Pressable>
  );
}

export function SelectWidget({ def, value, onChange }: { def: FilterDef; value?: FilterValue; onChange: OnChange }) {
  const cur = value && 'eq' in value ? String(value.eq) : '';
  const options = [{ value: '', label: 'Любой' }, ...(def.options ?? [])];
  return (
    <View style={styles.block}>
      <T style={styles.label}>{def.label}</T>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {options.map((o) => (
          <Chip key={o.value || '_any'} label={o.label} active={cur === o.value} onPress={() => onChange(o.value ? { eq: o.value } : undefined)} />
        ))}
      </ScrollView>
    </View>
  );
}

export function RefWidget({
  def,
  value,
  names,
  disabledHint,
  onOpen,
  onClear,
}: {
  def: FilterDef;
  value?: FilterValue;
  names: Record<string, string>;
  disabledHint?: string;
  onOpen: () => void;
  onClear: () => void;
}) {
  const c = useColors();
  const ids = value && 'in' in value ? value.in : [];
  const summary = ids.map((id) => names[id] ?? id).join(', ');
  const disabled = !!disabledHint;
  return (
    <Pressable onPress={disabled ? undefined : onOpen} style={({ pressed }) => [styles.block, styles.ref, { opacity: disabled ? 0.45 : pressed ? 0.6 : 1 }]}>
      <View style={{ flex: 1 }}>
        <T variant={ids.length ? 'small' : 'body'} color={ids.length ? 'secondary' : undefined}>
          {def.label}
        </T>
        {ids.length > 0 ? (
          <T numberOfLines={2}>{summary}</T>
        ) : disabled ? (
          <T variant="caption" color="tertiary">
            {disabledHint}
          </T>
        ) : null}
      </View>
      {ids.length > 0 ? (
        <Pressable hitSlop={10} onPress={onClear} accessibilityLabel={`Сбросить ${def.label}`}>
          <Ionicons name="close-circle" size={20} color={c.textTertiary} />
        </Pressable>
      ) : (
        <Ionicons name="chevron-forward" size={18} color={c.textTertiary} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  block: { paddingHorizontal: 16, paddingVertical: 10 },
  label: { fontWeight: '600', marginBottom: 8 },
  input: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: radius.s, paddingHorizontal: 12, height: 44 },
  inputText: { flex: 1, fontSize: 16, height: 44 },
  toggle: { flexDirection: 'row', alignItems: 'center', minHeight: 50 },
  ref: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 56 },
});
