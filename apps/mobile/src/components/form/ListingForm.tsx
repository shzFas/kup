import { Fragment, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, View, type ScrollViewInstance } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatNumber, visibleFormAttributes, type Attribute, type AttrValue, type CategorySchema, type Listing, type ListingInput } from '@kup/shared';
import { ApiError, errorMessage } from '@/lib/api';
import { openPicker } from '@/lib/picker';
import { orderedGroups } from '@/lib/queries';
import { rememberRefNames, useRefNames } from '@/lib/refNames';
import { radius, useColors } from '@/lib/theme';
import { Button, Divider, T } from '../ui';
import { AttributeField, FieldError, FieldLabel, SelectRow, type FormValues } from './AttributeField';
import { PhotosField } from './PhotosField';
import { MAX_PHOTOS, pickPhotos, toJpeg, uploadJpeg, type PhotoItem } from './photos';
import { parseNumber } from '@/lib/format';

export interface FormInitial {
  values: FormValues;
  price: number | null;
  city: string | null;
  description: string;
  photos: PhotoItem[];
}

let seq = 0;
const nextKey = () => `p${Date.now()}_${seq++}`;

function isEmpty(v: AttrValue | undefined) {
  return v == null || v === '' || (Array.isArray(v) && v.length === 0);
}

/** Converts form values to API attributes: only visible, non-computed, non-empty; numbers parsed. */
function toAttributes(attrs: Attribute[], values: FormValues) {
  const out: Record<string, AttrValue> = {};
  for (const a of visibleFormAttributes(attrs, values)) {
    const v = values[a.key];
    if (isEmpty(v)) continue;
    if (a.type === 'int' || a.type === 'decimal') {
      const n = parseNumber(String(v));
      if (n != null) out[a.key] = a.type === 'int' ? Math.round(n) : n;
    } else if (a.type === 'bool') {
      if (v === true) out[a.key] = true;
    } else out[a.key] = v!;
  }
  return out;
}

export function ListingForm({
  schema,
  initial,
  submitLabel,
  onSubmit,
}: {
  schema: CategorySchema;
  initial?: FormInitial;
  submitLabel: string;
  onSubmit: (input: ListingInput) => Promise<Listing>;
}) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const names = useRefNames();
  const scroll = useRef<ScrollViewInstance>(null);
  const [values, setValues] = useState<FormValues>(initial?.values ?? {});
  const [price, setPrice] = useState(initial?.price != null ? formatNumber(initial.price) : '');
  const [city, setCity] = useState<string | null>(initial?.city ?? null);
  const [description, setDescription] = useState(initial?.description ?? '');
  const [photos, setPhotos] = useState<PhotoItem[]>(initial?.photos ?? []);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState('');
  const [saving, setSaving] = useState(false);
  // Local JPEG uris kept for retrying failed uploads.
  const localUris = useRef<Record<string, string>>({});

  const attrs = schema.attributes;
  const visible = visibleFormAttributes(attrs, values);
  const groups = orderedGroups(schema, visible.map((a) => a.group));

  const clearError = (k: string) => setErrors((e) => (e[k] ? { ...e, [k]: '' } : e));

  const setValue = (key: string, v: AttrValue | undefined) => {
    setValues((prev) => {
      const next = { ...prev, [key]: v };
      // Reset ref children (e.g. model when make changes), recursively.
      const clear = (parent: string) =>
        attrs.filter((a) => a.parent === parent).forEach((child) => {
          if (next[child.key] !== undefined) {
            next[child.key] = undefined;
            clear(child.key);
          }
        });
      if (prev[key] !== v) clear(key);
      return next;
    });
    clearError(`attributes.${key}`);
  };

  const openRef = (a: Attribute) => {
    const parentVal = a.parent ? values[a.parent] : undefined;
    openPicker({
      title: a.label,
      ref: a.ref!,
      parent: parentVal != null ? [String(parentVal)] : undefined,
      multi: false,
      selected: values[a.key] != null ? [String(values[a.key])] : [],
      onDone: (ids, items) => {
        rememberRefNames(items);
        setValue(a.key, ids[0]);
      },
    });
  };

  const openCity = () =>
    openPicker({
      title: 'Город',
      ref: 'city',
      multi: false,
      selected: city ? [city] : [],
      onDone: (ids, items) => {
        rememberRefNames(items);
        setCity(ids[0] ?? null);
        clearError('city');
      },
    });

  const upload = async (key: string, uri: string) => {
    setPhotos((ps) => ps.map((p) => (p.key === key ? { ...p, status: 'uploading' } : p)));
    try {
      const r = await uploadJpeg(uri);
      setPhotos((ps) => ps.map((p) => (p.key === key ? { ...p, id: r.id, status: 'done' } : p)));
    } catch {
      setPhotos((ps) => ps.map((p) => (p.key === key ? { ...p, status: 'error' } : p)));
    }
  };

  const addPhotos = async () => {
    const assets = await pickPhotos(MAX_PHOTOS - photos.length);
    if (!assets.length) return;
    clearError('photos');
    const items = assets.map((a) => ({ key: nextKey(), uri: a.uri, status: 'uploading' as const }));
    setPhotos((ps) => [...ps, ...items].slice(0, MAX_PHOTOS));
    await Promise.all(
      assets.map(async (a, i) => {
        const key = items[i].key;
        try {
          const jpeg = await toJpeg(a);
          localUris.current[key] = jpeg;
          await upload(key, jpeg);
        } catch {
          setPhotos((ps) => ps.map((p) => (p.key === key ? { ...p, status: 'error' } : p)));
        }
      }),
    );
  };

  const validate = () => {
    const e: Record<string, string> = {};
    for (const a of visible) if (a.required && isEmpty(values[a.key])) e[`attributes.${a.key}`] = 'Обязательное поле';
    const p = parseNumber(price);
    if (p == null || p <= 0) e.price = 'Укажите цену';
    if (!city) e.city = 'Выберите город';
    return e;
  };

  const submit = async () => {
    setBanner('');
    if (photos.some((p) => p.status === 'uploading')) {
      Alert.alert('Фото ещё загружаются', 'Подождите пару секунд и попробуйте снова.');
      return;
    }
    const local = validate();
    setErrors(local);
    if (Object.keys(local).length) {
      setBanner('Заполните обязательные поля');
      return;
    }
    const input: ListingInput = {
      category: schema.category,
      price: Math.round(parseNumber(price)!),
      currency: 'KZT',
      city: city!,
      description: description.trim(),
      photos: photos.filter((p) => p.status === 'done' && p.id).map((p) => p.id!),
      attributes: toAttributes(attrs, values),
    };
    setSaving(true);
    try {
      await onSubmit(input);
    } catch (err) {
      if (err instanceof ApiError && err.fields && Object.keys(err.fields).length) {
        setErrors(err.fields);
        const known = new Set(['price', 'city', 'description', 'photos', ...visible.map((a) => `attributes.${a.key}`)]);
        const unknown = Object.entries(err.fields).filter(([k]) => !known.has(k));
        setBanner(unknown.length ? unknown.map(([k, v]) => `${k}: ${v}`).join('\n') : err.message || 'Проверьте поля формы');
      } else setBanner(errorMessage(err));
      scroll.current?.scrollTo({ y: 0, animated: true });
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <ScrollView ref={scroll} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" contentContainerStyle={{ paddingBottom: 24 }}>
        {!!banner && (
          <View style={[styles.banner, { backgroundColor: c.fill }]}>
            <T color="danger">{banner}</T>
          </View>
        )}
        <View style={[styles.card, { backgroundColor: c.card }]}>
          <PhotosField
            photos={photos}
            onAdd={addPhotos}
            onRemove={(k) => setPhotos((ps) => ps.filter((p) => p.key !== k))}
            onMakeCover={(k) => setPhotos((ps) => [...ps.filter((p) => p.key === k), ...ps.filter((p) => p.key !== k)])}
            onRetry={(k) => {
              const uri = localUris.current[k];
              if (uri) upload(k, uri);
            }}
            error={errors.photos}
          />
        </View>

        {groups.map((g) => (
          <View key={g.key}>
            <T variant="small" color="secondary" style={styles.groupTitle}>
              {g.label}
            </T>
            <View style={[styles.card, { backgroundColor: c.card }]}>
              {visible
                .filter((a) => a.group === g.key)
                .sort((a, b) => Number(b.required) - Number(a.required))
                .map((a, i) => {
                  const parentAttr = a.parent ? attrs.find((x) => x.key === a.parent) : undefined;
                  const v = values[a.key];
                  return (
                    <Fragment key={a.key}>
                      {i > 0 && <Divider />}
                      <AttributeField
                        attr={a}
                        value={v}
                        onChange={(nv) => setValue(a.key, nv)}
                        error={errors[`attributes.${a.key}`] || undefined}
                        refName={v != null ? names[String(v)] : undefined}
                        parentMissing={parentAttr && isEmpty(values[parentAttr.key]) ? parentAttr.label.toLowerCase() : undefined}
                        onOpenRef={() => openRef(a)}
                      />
                    </Fragment>
                  );
                })}
            </View>
          </View>
        ))}

        <T variant="small" color="secondary" style={styles.groupTitle}>
          Цена и расположение
        </T>
        <View style={[styles.card, { backgroundColor: c.card }]}>
          <View style={styles.field}>
            <FieldLabel label="Цена" required />
            <View style={[styles.input, { backgroundColor: c.fill, borderColor: errors.price ? c.danger : 'transparent' }]}>
              <TextInput
                value={price}
                onChangeText={(t) => {
                  const d = t.replace(/\D/g, '').replace(/^0+/, '');
                  setPrice(d ? formatNumber(Number(d)) : '');
                  clearError('price');
                }}
                keyboardType="number-pad"
                placeholder="0"
                placeholderTextColor={c.textTertiary}
                style={[styles.inputText, { color: c.text }]}
              />
              <T color="tertiary">₸</T>
            </View>
            <FieldError error={errors.price || undefined} />
          </View>
          <Divider />
          <SelectRow
            label="Город"
            required
            value={city ? (names[city] ?? city) : undefined}
            onPress={openCity}
            error={errors.city || undefined}
          />
        </View>

        <T variant="small" color="secondary" style={styles.groupTitle}>
          Описание
        </T>
        <View style={[styles.card, { backgroundColor: c.card }]}>
          <View style={styles.field}>
            <TextInput
              value={description}
              onChangeText={(t) => {
                setDescription(t);
                clearError('description');
              }}
              multiline
              placeholder="Расскажите о состоянии, истории, особенностях"
              placeholderTextColor={c.textTertiary}
              style={[styles.textarea, { backgroundColor: c.fill, color: c.text, borderColor: errors.description ? c.danger : 'transparent' }]}
              textAlignVertical="top"
              maxLength={4000}
            />
            <FieldError error={errors.description || undefined} />
          </View>
        </View>
      </ScrollView>
      <View style={[styles.footer, { backgroundColor: c.card, borderTopColor: c.border, paddingBottom: insets.bottom + 10 }]}>
        <Button title={submitLabel} onPress={submit} loading={saving} />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  banner: { margin: 16, marginBottom: 0, padding: 12, borderRadius: radius.m },
  card: { marginHorizontal: 16, borderRadius: radius.l, overflow: 'hidden', marginTop: 12 },
  groupTitle: { paddingHorizontal: 32, marginTop: 20, marginBottom: -4, textTransform: 'uppercase', letterSpacing: 0.4 },
  field: { paddingHorizontal: 16, paddingVertical: 10 },
  input: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 46, borderRadius: radius.s, paddingHorizontal: 12, borderWidth: 1 },
  inputText: { flex: 1, fontSize: 16, minHeight: 46 },
  textarea: { minHeight: 120, borderRadius: radius.s, padding: 12, fontSize: 16, borderWidth: 1 },
  footer: { paddingHorizontal: 16, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
});
