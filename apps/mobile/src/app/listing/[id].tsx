import { useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { Listing } from '@kup/shared';
import { api, ApiError, errorMessage } from '@/lib/api';
import { useAuth, goToLogin } from '@/lib/auth';
import { useIsFavorite, useToggleFavorite } from '@/lib/favorites';
import { formatPhone } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { orderedGroups, useSchema } from '@/lib/queries';
import { STATUS_LONG } from '@/lib/status';
import { radius, useColors } from '@/lib/theme';
import { Gallery } from '@/components/Gallery';
import { HintButton } from '@/components/Hint';
import { PriceHistory, ReportSheet, SimilarListings, WriteSheet } from '@/components/listing/ListingExtras';
import { Button, Card, ErrorState, Loading, T } from '@/components/ui';

/** Shown near the contact bar instead of the specs table. */
const SELLER_LANGS = 'seller_langs';

export default function ListingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useColors();
  const { t, tp, price, date, dayMonth, monthYear } = useI18n();
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
  const [writeOpen, setWriteOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  const onChanged = (l: Listing) => {
    qc.setQueryData(['listing', id], l);
    void qc.invalidateQueries({ queryKey: ['my'] });
    void qc.invalidateQueries({ queryKey: ['search'] });
  };
  const statusM = useMutation({
    mutationFn: (s: 'archived' | 'sold' | 'active') => (s === 'active' ? api.prolong(id) : api.setListingStatus(id, s)),
    onSuccess: (l, s) => {
      onChanged(l);
      if (s === 'active') Alert.alert(t('listing.prolonged'));
    },
    onError: (e) => Alert.alert(t('common.error'), errorMessage(e)),
  });
  const deleteM = useMutation({
    mutationFn: () => api.deleteListing(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['my'] });
      void qc.invalidateQueries({ queryKey: ['search'] });
      qc.removeQueries({ queryKey: ['listing', id] });
      router.back();
    },
    onError: (e) => Alert.alert(t('common.error'), errorMessage(e)),
  });

  const call = async () => {
    if (!user) return goToLogin();
    setCalling(true);
    try {
      const p = phone ?? (await api.listingPhone(id));
      setPhone(p);
      await Linking.openURL(`tel:${p}`).catch(() => Alert.alert(t('listing.sellerPhone'), formatPhone(p)));
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) goToLogin();
      else Alert.alert(t('listing.phoneFailed'), errorMessage(e));
    } finally {
      setCalling(false);
    }
  };

  const write = () => {
    if (!user) return goToLogin();
    setWriteOpen(true);
  };
  const report = () => {
    if (!user) return goToLogin();
    setReportOpen(true);
  };

  const share = () => {
    if (!listing) return;
    void Share.share({
      message: `${listing.title} — ${price(listing.price, listing.currency, listing.price_suffix)}\nkup://listing/${listing.id}`,
    });
  };

  const confirmDelete = () =>
    Alert.alert(t('listing.deleteQ'), t('listing.deleteText'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: () => deleteM.mutate() },
    ]);

  const headerRight = () =>
    listing ? (
      <View style={{ flexDirection: 'row', gap: 18 }}>
        <Pressable onPress={share} hitSlop={8} accessibilityLabel={t('listing.share')}>
          <Ionicons name="share-outline" size={24} color={c.accent} />
        </Pressable>
        {!listing.is_owner && (
          <Pressable onPress={() => toggleFav(id, fav)} hitSlop={8} accessibilityLabel={t('listing.favorite')}>
            <Ionicons name={fav ? 'heart' : 'heart-outline'} size={24} color={fav ? '#FF3B5C' : c.accent} />
          </Pressable>
        )}
      </View>
    ) : null;

  if (q.isPending) return <Loading />;
  if (q.isError || !listing)
    return (
      <ErrorState
        message={q.error instanceof ApiError && q.error.status === 404 ? t('listing.notFound') : errorMessage(q.error)}
        onRetry={() => q.refetch()}
      />
    );

  // Characteristics grouped by schema groups; fall back to plain labels if schema not loaded.
  const attrs = (schema.data?.attributes ?? []).filter((a) => a.key !== SELLER_LANGS);
  const labeled = attrs.filter((a) => listing.attribute_labels[a.key] != null && listing.attribute_labels[a.key] !== '');
  const groups = schema.data ? orderedGroups(schema.data, labeled.map((a) => a.group)) : [];
  const sellerLangs = listing.attribute_labels[SELLER_LANGS];
  const active = listing.status === 'active';
  const s = listing.status;

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <Stack.Screen options={{ title: '', headerRight }} />
      <ScrollView contentContainerStyle={{ paddingBottom: (listing.is_owner ? 24 : sellerLangs ? 150 : 120) + insets.bottom }}>
        <Gallery photos={listing.photos} />
        <View style={styles.section}>
          {!active && (
            <View style={[styles.badge, { backgroundColor: s === 'blocked' ? c.danger : c.fill }]}>
              <T variant="caption" color={s === 'blocked' ? 'inverse' : 'secondary'}>
                {t(STATUS_LONG[s])}
              </T>
            </View>
          )}
          <T variant="h2">{price(listing.price, listing.currency, listing.price_suffix)}</T>
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
              · {date(listing.published_at)} · {tp('count.views', listing.views)}
            </T>
          </View>
        </View>

        {listing.is_owner && (
          <Card style={styles.card}>
            {s === 'expired' && (
              <View style={[styles.banner, { backgroundColor: c.accentSoft }]}>
                <Ionicons name="time-outline" size={20} color={c.accent} />
                <T variant="small" style={{ flex: 1 }}>
                  {t('listing.expiredBanner')}
                </T>
              </View>
            )}
            {s === 'blocked' && (
              <View style={[styles.banner, { backgroundColor: c.fill }]}>
                <Ionicons name="ban-outline" size={20} color={c.danger} />
                <View style={{ flex: 1, gap: 4 }}>
                  <T variant="small">{t('listing.blockedBanner')}</T>
                  {!!listing.moderation_reason && (
                    <T variant="small" style={{ fontWeight: '600' }}>
                      {t('listing.blockedReason', { reason: listing.moderation_reason })}
                    </T>
                  )}
                </View>
              </View>
            )}
            <T variant="small" color="secondary" style={{ padding: 16, paddingBottom: 8 }}>
              {t('listing.yours', { status: t(STATUS_LONG[s]) })}
              {active && listing.expires_at ? ` · ${t('listing.activeUntil', { date: dayMonth(listing.expires_at) })}` : ''}
            </T>
            <View style={styles.ownerActions}>
              {s === 'expired' && (
                <Button small icon="refresh" title={t('listing.prolong')} loading={statusM.isPending} onPress={() => statusM.mutate('active')} />
              )}
              <Button
                small
                icon="create-outline"
                title={t('listing.editBtn')}
                variant="secondary"
                onPress={() => router.push({ pathname: '/edit/[id]', params: { id } })}
              />
              {active && (
                <>
                  <Button
                    small
                    title={t('listing.unpublish')}
                    variant="secondary"
                    loading={statusM.isPending && statusM.variables === 'archived'}
                    onPress={() => statusM.mutate('archived')}
                  />
                  <Button
                    small
                    title={t('listing.markSold')}
                    variant="secondary"
                    loading={statusM.isPending && statusM.variables === 'sold'}
                    onPress={() => statusM.mutate('sold')}
                  />
                </>
              )}
              {(s === 'archived' || s === 'sold') && (
                <Button small title={t('listing.activate')} loading={statusM.isPending} onPress={() => statusM.mutate('active')} />
              )}
              <Button small icon="trash-outline" title={t('common.delete')} variant="danger" loading={deleteM.isPending} onPress={confirmDelete} />
            </View>
          </Card>
        )}

        {(groups.length > 0 || (!schema.data && Object.keys(listing.attribute_labels).length > 0)) && (
          <Card style={styles.card}>
            <T variant="h3" style={{ padding: 16, paddingBottom: 4 }}>
              {t('listing.specs')}
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
                        <Spec key={a.key} label={a.label} value={listing.attribute_labels[a.key]} hint={a.hint} />
                      ))}
                  </View>
                ))
              : Object.entries(listing.attribute_labels)
                  .filter(([k]) => k !== SELLER_LANGS)
                  .map(([k, v]) => <Spec key={k} label={k} value={v} />)}
            <View style={{ height: 12 }} />
          </Card>
        )}

        <PriceHistory listing={listing} />

        {!!listing.description && (
          <Card style={styles.card}>
            <View style={{ padding: 16, gap: 8 }}>
              <T variant="h3">{t('listing.description')}</T>
              <T selectable>{listing.description}</T>
            </View>
          </Card>
        )}

        <Card style={styles.card}>
          <View style={styles.seller}>
            <View style={[styles.avatar, { backgroundColor: c.accentSoft }]}>
              <T variant="h3" color="accent">
                {(listing.seller.name || t('listing.seller')).slice(0, 1).toUpperCase()}
              </T>
            </View>
            <View style={{ flex: 1 }}>
              <T style={{ fontWeight: '600' }}>{listing.seller.name || t('listing.seller')}</T>
              <T variant="small" color="secondary">
                {t('listing.memberSince', { date: monthYear(listing.seller.member_since) })}
              </T>
              {!!sellerLangs && listing.is_owner && (
                <T variant="small" color="secondary">
                  {t('listing.sellerSpeaks', { langs: sellerLangs })}
                </T>
              )}
            </View>
          </View>
        </Card>
        {listing.updated_at && (
          <T variant="caption" color="tertiary" style={{ textAlign: 'center', marginTop: 12 }}>
            {t('listing.updated', { date: date(listing.updated_at).toLocaleLowerCase() })}
          </T>
        )}
        {!listing.is_owner && (
          <Pressable onPress={report} style={styles.report} hitSlop={6}>
            <Ionicons name="flag-outline" size={16} color={c.danger} />
            <T variant="small" color="danger">
              {t('listing.report')}
            </T>
          </Pressable>
        )}

        <SimilarListings id={id} />
      </ScrollView>

      {!listing.is_owner && (
        <View style={[styles.bottom, { backgroundColor: c.card, borderTopColor: c.border, paddingBottom: insets.bottom + 10 }]}>
          {!!sellerLangs && (
            <View style={styles.langs}>
              <Ionicons name="language-outline" size={15} color={c.textSecondary} />
              <T variant="caption" color="secondary" numberOfLines={1} style={{ flex: 1 }}>
                {t('listing.sellerSpeaks', { langs: sellerLangs })}
              </T>
            </View>
          )}
          {!active && (
            <T variant="caption" color="tertiary" style={{ textAlign: 'center' }}>
              {t('listing.inactive')}
            </T>
          )}
          <View style={styles.bottomRow}>
            <Button
              icon="call"
              variant="secondary"
              title={phone ? formatPhone(phone) : t('listing.call')}
              onPress={call}
              loading={calling}
              style={{ flex: 1 }}
              disabled={!active}
            />
            <Button icon="chatbubble-ellipses" title={t('listing.write')} onPress={write} style={{ flex: 1 }} disabled={!active} />
          </View>
        </View>
      )}
      <WriteSheet listingId={id} visible={writeOpen} onClose={() => setWriteOpen(false)} />
      <ReportSheet listingId={id} visible={reportOpen} onClose={() => setReportOpen(false)} />
    </View>
  );
}

function Spec({ label, value, hint }: { label: string; value: string; hint?: string | null }) {
  return (
    <View style={styles.spec}>
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <T color="secondary" style={{ flexShrink: 1 }}>
          {label}
        </T>
        <HintButton title={label} hint={hint} size={15} />
      </View>
      <T style={{ flex: 1, textAlign: 'right' }}>{value}</T>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { padding: 16, gap: 6 },
  badge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap', marginTop: 4 },
  card: { marginHorizontal: 16, marginTop: 12 },
  banner: { flexDirection: 'row', gap: 10, padding: 12, margin: 12, marginBottom: 0, borderRadius: radius.m, alignItems: 'flex-start' },
  ownerActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, paddingBottom: 16 },
  spec: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 6, gap: 12 },
  seller: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  report: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 16 },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, gap: 8, paddingHorizontal: 16, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
  bottomRow: { flexDirection: 'row', gap: 10 },
  langs: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
