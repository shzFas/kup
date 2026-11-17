import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Attribute, AttrValue } from '@kup/shared';
import { useI18n } from '@/lib/i18n';
import { radius, useColors } from '@/lib/theme';
import { HintText } from '../Hint';
import { CheckRow } from '../Check';
import { Sheet } from '../Sheet';
import { Chip, Segmented, T } from '../ui';

export type FormValues = Record<string, AttrValue | undefined>;

export function FieldLabel({ label, required, unit }: { label: string; required?: boolean; unit?: string | null }) {
  return (
    <T style={{ fontWeight: '600', marginBottom: 8 }}>
      {label}
      {unit ? <T color="tertiary">, {unit}</T> : null}
      {required ? <T color="danger"> *</T> : null}
    </T>
  );
}

export function FieldError({ error, hint }: { error?: string; hint?: string | null }) {
  if (!error) return <HintText hint={hint} />;
  return (
    <T variant="caption" color="danger" style={{ marginTop: 6 }}>
      {error}
    </T>
  );
}

export function SelectRow({
  label,
  required,
  value,
  placeholder,
  onPress,
  disabledHint,
  error,
  onClear,
  hint,
}: {
  label: string;
  required?: boolean;
  value?: string;
  placeholder?: string;
  onPress: () => void;
  disabledHint?: string;
  error?: string;
  onClear?: () => void;
  hint?: string | null;
}) {
  const c = useColors();
  const { t } = useI18n();
  const disabled = !!disabledHint;
  return (
    <View style={styles.field}>
      <FieldLabel label={label} required={required} />
      <Pressable
        onPress={disabled ? undefined : onPress}
        style={({ pressed }) => [
          styles.select,
          { backgroundColor: c.fill, borderColor: error ? c.danger : 'transparent', opacity: disabled ? 0.5 : pressed ? 0.7 : 1 },
        ]}>
        <T style={{ flex: 1 }} color={value ? undefined : 'tertiary'} numberOfLines={1}>
          {value || (disabled ? disabledHint : (placeholder ?? t('common.select')))}
        </T>
        {value && onClear ? (
          <Pressable onPress={onClear} hitSlop={10}>
            <Ionicons name="close-circle" size={18} color={c.textTertiary} />
          </Pressable>
        ) : (
          <Ionicons name="chevron-forward" size={18} color={c.textTertiary} />
        )}
      </Pressable>
      <FieldError error={error} hint={hint} />
    </View>
  );
}

export function NumberInput({
  value,
  onChange,
  decimal,
  unit,
  placeholder,
  error,
}: {
  value: string;
  onChange: (s: string) => void;
  decimal?: boolean;
  unit?: string | null;
  placeholder?: string;
  error?: boolean;
}) {
  const c = useColors();
  return (
    <View style={[styles.input, { backgroundColor: c.fill, borderColor: error ? c.danger : 'transparent' }]}>
      <TextInput
        value={value}
        onChangeText={(t) => onChange(decimal ? t.replace(/[^\d.,]/g, '').replace('.', ',') : t.replace(/\D/g, ''))}
        keyboardType={decimal ? 'decimal-pad' : 'number-pad'}
        placeholder={placeholder}
        placeholderTextColor={c.textTertiary}
        style={[styles.inputText, { color: c.text }]}
        returnKeyType="done"
      />
      {unit ? <T color="tertiary">{unit}</T> : null}
    </View>
  );
}

export function AttributeField({
  attr,
  value,
  onChange,
  error,
  refName,
  parentMissing,
  onOpenRef,
}: {
  attr: Attribute;
  value: AttrValue | undefined;
  onChange: (v: AttrValue | undefined) => void;
  error?: string;
  refName?: string;
  parentMissing?: string;
  onOpenRef: () => void;
}) {
  const c = useColors();
  const { t } = useI18n();
  const [sheet, setSheet] = useState(false);
  const hint = attr.hint;
  const options = attr.options ?? [];

  switch (attr.type) {
    case 'ref':
      return (
        <SelectRow
          label={attr.label}
          required={attr.required}
          value={value != null ? (refName ?? String(value)) : undefined}
          onPress={onOpenRef}
          disabledHint={parentMissing ? t('common.selectFirst', { label: parentMissing }) : undefined}
          error={error}
          hint={hint}
          onClear={attr.required ? undefined : () => onChange(undefined)}
        />
      );
    case 'enum':
      if (options.length <= 4) {
        return (
          <View style={styles.field}>
            <FieldLabel label={attr.label} required={attr.required} />
            <Segmented
              options={options}
              value={(value as string) ?? ''}
              onChange={(v) => onChange(v === value && !attr.required ? undefined : v)}
            />
            <FieldError error={error} hint={hint} />
          </View>
        );
      }
      return (
        <>
          <SelectRow
            label={attr.label}
            required={attr.required}
            value={options.find((o) => o.value === value)?.label}
            onPress={() => setSheet(true)}
            error={error}
            hint={hint}
            onClear={attr.required ? undefined : () => onChange(undefined)}
          />
          <Sheet visible={sheet} onClose={() => setSheet(false)} title={attr.label}>
            <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ paddingHorizontal: 16 }}>
              {options.map((o) => (
                <CheckRow
                  key={o.value}
                  radio
                  label={o.label}
                  checked={value === o.value}
                  onPress={() => {
                    onChange(o.value);
                    setSheet(false);
                  }}
                />
              ))}
            </ScrollView>
          </Sheet>
        </>
      );
    case 'multi_enum': {
      const sel = Array.isArray(value) ? value : [];
      return (
        <View style={styles.field}>
          <FieldLabel label={attr.label} required={attr.required} />
          <View style={styles.wrap}>
            {options.map((o) => (
              <Chip
                key={o.value}
                label={o.label}
                active={sel.includes(o.value)}
                onPress={() => {
                  const next = sel.includes(o.value) ? sel.filter((x) => x !== o.value) : [...sel, o.value];
                  onChange(next.length ? next : undefined);
                }}
              />
            ))}
          </View>
          <FieldError error={error} hint={hint} />
        </View>
      );
    }
    case 'bool':
      return (
        <View style={styles.field}>
          <Pressable style={styles.switchRow} onPress={() => onChange(!value)}>
            <T style={{ flex: 1 }}>
              {attr.label}
              {attr.required ? <T color="danger"> *</T> : null}
            </T>
            <Switch value={!!value} onValueChange={(x) => onChange(x)} trackColor={{ true: c.accent }} />
          </Pressable>
          <FieldError error={error} hint={hint} />
        </View>
      );
    case 'int':
    case 'decimal':
      return (
        <View style={styles.field}>
          <FieldLabel label={attr.label} required={attr.required} />
          <NumberInput
            value={value == null ? '' : String(value)}
            onChange={(s) => onChange(s === '' ? undefined : s)}
            decimal={attr.type === 'decimal'}
            unit={attr.unit}
            placeholder={attr.min != null && attr.max != null ? `${attr.min} – ${attr.max}` : undefined}
            error={!!error}
          />
          <FieldError error={error} hint={hint} />
        </View>
      );
    case 'text':
    default:
      return (
        <View style={styles.field}>
          <FieldLabel label={attr.label} required={attr.required} />
          <TextInput
            value={value == null ? '' : String(value)}
            onChangeText={(t) => onChange(t === '' ? undefined : t)}
            style={[styles.input, styles.inputText, { backgroundColor: c.fill, color: c.text, borderColor: error ? c.danger : 'transparent' }]}
            placeholderTextColor={c.textTertiary}
          />
          <FieldError error={error} hint={hint} />
        </View>
      );
  }
}

const styles = StyleSheet.create({
  field: { paddingHorizontal: 16, paddingVertical: 10 },
  select: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 46, borderRadius: radius.s, paddingHorizontal: 12, borderWidth: 1 },
  input: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 46, borderRadius: radius.s, paddingHorizontal: 12, borderWidth: 1 },
  inputText: { flex: 1, fontSize: 16, minHeight: 46 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  switchRow: { flexDirection: 'row', alignItems: 'center', minHeight: 36 },
});
