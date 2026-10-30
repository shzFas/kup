import { useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { formatPrice, type Listing } from '@kup/shared';
import { api, ApiError, errorMessage } from '@/lib/api';
import { useAuth, goToLogin } from '@/lib/auth';
import { useIsFavorite, useToggleFavorite } from '@/lib/favorites';
import { formatDate, formatMonthYear, formatPhone } from '@/lib/format';
import { orderedGroups, useSchema } from '@/lib/queries';
import { useColors } from '@/lib/theme';
import { Gallery } from '@/components/Gallery';
import { Button, Card, ErrorState, Loading, T } from '@/components/ui';

const STATUS: Record<Listing['status'], string> = { active: 'Опубликовано', archived: 'Снято с публикации', sold: 'Продано' };

export default function ListingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useColors();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const { user } = useAuth();
  const q = useQuery({ queryKey: ['listing', id], queryFn: () => api.listing(id) });
  const listing = q.data;
  const schema = useSchema(listing?.category);
  const fav = useIsFavorite(id, listing?.is_favorite);
  const toggleFav = useToggleFavorite();
  const [phone, setPhone] = useState<string | null>(null);
  const [calling, setCalling] = useState(false);

  const statusM = useMutation({
    mutationFn: (s: Listing['status']) => api.setListingStatus(id, s),
    onSuccess: (l) => {
      qc.setQueryData(['listing', id], l);
      qc.invalidateQueries({ queryKey: ['my'] });
      qc.invalidateQueries({ queryKey: ['search'] });
    },
    onError: (e) => Alert.alert('Ошибка', errorMessage(e)),
  });
  const deleteM = useMutation({
    mutationFn: () => api.deleteListing(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my'] });
      qc.invalidateQueries({ queryKey: ['search'] });
      qc.removeQueries({ queryKey: ['listing', id] });
      router.back();
    },
    onError: (e) => Alert.alert('Ошибка', errorMessage(e)),
  });

  const call = async () => {
    if (!user) return goToLogin();
    setCalling(true);
    try {
      const p = phone ?? (await api.listingPhone(id));
      setPhone(p);
      await Linking.openURL(`tel:${p}`).catch(() => Alert.alert('Телефон продавца', formatPhone(p)));
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) goToLogin();
      else Alert.alert('Не удалось получить номер', errorMessage(e));
    } finally {
      setCalling(false);
    }
  };

  const share = () => {
    if (!listing) return;
    Share.share({
      message: `${listing.title} — ${formatPrice(listing.price, listing.currency, listing.price_suffix)}\nkup://listing/${listing.id}`,
    });
  };

  const confirmDelete = () =>
    Alert.alert('Удалить объявление?', 'Это действие нельзя отменить.', [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Удалить', style: 'destructive', onPress: () => deleteM.mutate() },
    ]);

  const headerRight = () =>
    listing ? (
      <View style={{ flexDirection: 'row', gap: 18 }}>
        <Pressable onPress={share} hitSlop={8} accessibilityLabel="Поделиться">
          <Ionicons name="share-outline" size={24} color={c.accent} />
        </Pressable>
        {!listing.is_owner && (
          <Pressable onPress={() => toggleFav(id, fav)} hitSlop={8} accessibilityLabel="Избранное">
            <Ionicons name={fav ? 'heart' : 'heart-outline'} size={24} color={fav ? '#FF3B5C' : c.accent} />
          </Pressable>
        )}
      </View>
    ) : null;

  if (q.isPending) return <Loading />;
  if (q.isError || !listing)
    return (
      <ErrorState
        message={q.error instanceof ApiError && q.error.status === 404 ? 'Объявление не найдено или удалено' : errorMessage(q.error)}
        onRetry={() => q.refetch()}
      />
    );

  // Characteristics grouped by schema groups; fall back to plain labels if schema not loaded.
  const attrs = schema.data?.attributes ?? [];
  const labeled = attrs.filter((a) => listing.attribute_labels[a.key] != null && listing.attribute_labels[a.key] !== '');
  const groups = schema.data ? orderedGroups(schema.data, labeled.map((a) => a.group)) : [];

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <Stack.Screen options={{ title: '', headerRight }} />
      <ScrollView contentContainerStyle={{ paddingBottom: 110 + insets.bottom }}>
        <Gallery photos={listing.photos} />
        <View style={styles.section}>
          {listing.status !== 'active' && (
            <View style={[styles.badge, { backgroundColor: c.fill }]}>
              <T variant="caption" color="secondary">
                {STATUS[listing.status]}
              </T>
            </View>
          )}
          <T variant="h2">{formatPrice(listing.price, listing.currency, listing.price_suffix)}</T>
          <T variant="h3" style={{ fontWeight: '500' }}>
            {listing.title}
          </T>
          {listing.highlights.length > 0 && <T color="secondary">{listing.highlights.join(' · ')}</T>}
          <View style={styles.meta}>
            <Ionicons name="location-outline" size={16} color={c.textTertiary} />
            <T variant="small" color="secondary">
              {listing.city.name}
            </T>
            <T variant="small" color="tertiary">
              · {formatDate(listing.published_at)} · {listing.views} просм.
            </T>
          </View>
        </View>

        {listing.is_owner && (
          <Card style={styles.card}>
            <T variant="small" color="secondary" style={{ padding: 16, paddingBottom: 8 }}>
              Ваше объявление · {STATUS[listing.status]}
            </T>
            <View style={styles.ownerActions}>
              <Button small icon="create-outline" title="Редактировать" variant="secondary" onPress={() => router.push({ pathname: '/edit/[id]', params: { id } })} />
              {listing.status === 'active' ? (
                <>
                  <Button small title="Снять" variant="secondary" loading={statusM.isPending && statusM.variables === 'archived'} onPress={() => statusM.mutate('archived')} />
                  <Button small title="Продано" variant="secondary" loading={statusM.isPending && statusM.variables === 'sold'} onPress={() => statusM.mutate('sold')} />
                </>
              ) : (
                <Button small title="Активировать" loading={statusM.isPending} onPress={() => statusM.mutate('active')} />
              )}
              <Button small icon="trash-outline" title="Удалить" variant="danger" loading={deleteM.isPending} onPress={confirmDelete} />
            </View>
          </Card>
        )}

        {(groups.length > 0 || (!schema.data && Object.keys(listing.attribute_labels).length > 0)) && (
          <Card style={styles.card}>
            <T variant="h3" style={{ padding: 16, paddingBottom: 4 }}>
              Характеристики
            </T>
            {schema.data
              ? groups.map((g) => (
                  <View key={g.key} style={{ paddingTop: 8 }}>
                    {groups.length > 1 && (
                      <T variant="small" color="tertiary" style={{ paddingHorizontal: 16, paddingVertical: 4 }}>
                        {g.label}
                      </T>
                    )}
                    {labeled
                      .filter((a) => a.group === g.key)
                      .map((a) => (
                        <Spec key={a.key} label={a.label} value={listing.attribute_labels[a.key]} />
                      ))}
                  </View>
                ))
              : Object.entries(listing.attribute_labels).map(([k, v]) => <Spec key={k} label={k} value={v} />)}
            <View style={{ height: 12 }} />
          </Card>
        )}

        {!!listing.description && (
          <Card style={styles.card}>
            <View style={{ padding: 16, gap: 8 }}>
              <T variant="h3">Описание</T>
              <T selectable>{listing.description}</T>
            </View>
          </Card>
        )}

        <Card style={styles.card}>
          <View style={styles.seller}>
            <View style={[styles.avatar, { backgroundColor: c.accentSoft }]}>
              <T variant="h3" color="accent">
                {(listing.seller.name || 'П').slice(0, 1).toUpperCase()}
              </T>
            </View>
            <View style={{ flex: 1 }}>
              <T style={{ fontWeight: '600' }}>{listing.seller.name || 'Продавец'}</T>
              <T variant="small" color="secondary">
                На kup с {formatMonthYear(listing.seller.member_since)}
              </T>
            </View>
          </View>
        </Card>
        {listing.updated_at && (
          <T variant="caption" color="tertiary" style={{ textAlign: 'center', marginTop: 12 }}>
            Обновлено {formatDate(listing.updated_at).toLowerCase()}
          </T>
        )}
      </ScrollView>

      {!listing.is_owner && (
        <View style={[styles.bottom, { backgroundColor: c.card, borderTopColor: c.border, paddingBottom: insets.bottom + 10 }]}>
          <Button
            icon="call"
            title={phone ? formatPhone(phone) : 'Позвонить'}
            onPress={call}
            loading={calling}
            style={{ flex: 1 }}
            disabled={listing.status !== 'active'}
          />
        </View>
      )}
    </View>
  );
}

function Spec({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.spec}>
      <T color="secondary" style={{ flex: 1 }}>
        {label}
      </T>
      <T style={{ flex: 1, textAlign: 'right' }}>{value}</T>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { padding: 16, gap: 6 },
  badge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap', marginTop: 4 },
  card: { marginHorizontal: 16, marginTop: 12 },
  ownerActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, paddingBottom: 16 },
  spec: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 6, gap: 12 },
  seller: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
});
