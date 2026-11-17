import { useEffect } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Attribute, AttrValue, Listing } from '@kup/shared';
import { api, errorMessage, mediaUrl } from '@/lib/api';
import { useSchema } from '@/lib/queries';
import { rememberRefNames } from '@/lib/refNames';
import { useI18n } from '@/lib/i18n';
import { useColors } from '@/lib/theme';
import { ListingForm, type FormInitial } from '@/components/form/ListingForm';
import { photoIdFromUrl } from '@/components/form/photos';
import { EmptyState, ErrorState, Loading } from '@/components/ui';

function initialFrom(l: Listing, attrs: Attribute[]): FormInitial {
  const values: Record<string, AttrValue | undefined> = {};
  for (const a of attrs) {
    const v = l.attributes[a.key];
    if (v == null) continue;
    values[a.key] = a.type === 'int' || a.type === 'decimal' ? String(v) : v;
  }
  return {
    values,
    price: l.price,
    city: l.city.id,
    description: l.description,
    // API returns photo URLs; ids are derived from the file name (see report).
    photos: l.photos.map((url, i) => ({ key: `e${i}`, uri: mediaUrl(url), id: l.photo_ids?.[i] ?? photoIdFromUrl(url), status: 'done' })),
  };
}

export default function EditListingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useColors();
  const { t } = useI18n();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['listing', id], queryFn: () => api.listing(id) });
  const schema = useSchema(q.data?.category);

  // Seed names for ref values (make/model/city) so rows show labels, not ids.
  useEffect(() => {
    const l = q.data;
    if (!l || !schema.data) return;
    const items = [{ id: l.city.id, name: l.city.name }];
    for (const a of schema.data.attributes) {
      const v = l.attributes[a.key];
      if (a.type === 'ref' && typeof v === 'string' && l.attribute_labels[a.key]) items.push({ id: v, name: l.attribute_labels[a.key] });
    }
    rememberRefNames(items);
  }, [q.data, schema.data]);

  let body;
  if (q.isPending || (q.data && schema.isPending)) body = <Loading />;
  else if (q.isError) body = <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />;
  else if (schema.isError) body = <ErrorState message={errorMessage(schema.error)} onRetry={() => schema.refetch()} />;
  else if (!q.data.is_owner) body = <EmptyState icon="lock-closed-outline" title={t('post.noAccess')} text={t('post.onlyOwn')} />;
  else
    body = (
      <ListingForm
        schema={schema.data!}
        initial={initialFrom(q.data, schema.data!.attributes)}
        submitLabel={t('common.save')}
        onSubmit={async (input) => {
          const { category: _c, ...patch } = input;
          const l = await api.updateListing(id, patch);
          qc.setQueryData(['listing', id], l);
          qc.invalidateQueries({ queryKey: ['my'] });
          qc.invalidateQueries({ queryKey: ['search'] });
          router.back();
          return l;
        }}
      />
    );
  return <View style={{ flex: 1, backgroundColor: c.background }}>{body}</View>;
}
