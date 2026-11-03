import { useState } from 'react';
import { Alert, FlatList, Pressable, RefreshControl, StyleSheet, Switch, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { SavedSearch } from '@kup/shared';
import { errorMessage } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useCategories, useSavedSearches } from '@/lib/queries';
import { useDeleteSavedSearch, useOpenSavedSearch, useUpdateSavedSearch } from '@/lib/savedSearches';
import { radius, useColors } from '@/lib/theme';
import { CategoryIcon } from './CategoryIcon';
import { Sheet } from './Sheet';
import { Badge, Button, EmptyState, ErrorState, Loading, T } from './ui';

/** Saved searches: open (marks seen), new_count badge, notify switch, rename, delete. */
export function SavedSearchList() {
  const c = useColors();
  const { t, tp } = useI18n();
  const q = useSavedSearches();
  const cats = useCategories();
  const open = useOpenSavedSearch();
  const update = useUpdateSavedSearch();
  const del = useDeleteSavedSearch();
  const [renaming, setRenaming] = useState<SavedSearch | null>(null);
  const [name, setName] = useState('');

  if (q.isPending) return <Loading />;
  if (q.isError) return <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />;

  const more = (s: SavedSearch) =>
    Alert.alert(s.name, undefined, [
      {
        text: t('saved.rename'),
        onPress: () => {
          setName(s.name);
          setRenaming(s);
        },
      },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () =>
          Alert.alert(t('saved.deleteQ'), s.name, [
            { text: t('common.cancel'), style: 'cancel' },
            { text: t('common.delete'), style: 'destructive', onPress: () => del.mutate(s.id) },
          ]),
      },
      { text: t('common.cancel'), style: 'cancel' },
    ]);

  const saveName = () => {
    const n = name.trim();
    if (renaming && n && n !== renaming.name) update.mutate({ id: renaming.id, patch: { name: n } });
    setRenaming(null);
  };

  return (
    <>
      <FlatList
        data={q.data}
        keyExtractor={(s) => s.id}
        contentContainerStyle={{ padding: 16, gap: 12, flexGrow: 1 }}
        refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} tintColor={c.accent} />}
        renderItem={({ item: s }) => {
          const cat = cats.data?.find((x) => x.slug === s.request.category);
          const nFilters = Object.keys(s.request.filters ?? {}).length;
          const summary = [
            cat?.name,
            s.request.query ? t('saved.query', { q: s.request.query }) : null,
            nFilters ? tp('count.filters', nFilters) : null,
          ]
            .filter(Boolean)
            .join(' · ');
          return (
            <View style={[styles.card, { backgroundColor: c.card }]}>
              <Pressable onPress={() => open(s)} style={({ pressed }) => [styles.main, { opacity: pressed ? 0.7 : 1 }]}>
                <View style={[styles.icon, { backgroundColor: c.accentSoft }]}>
                  <CategoryIcon icon={cat?.icon ?? ''} size={22} color={c.accent} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <T style={{ fontWeight: '600' }} numberOfLines={2}>
                    {s.name}
                  </T>
                  <T variant="small" color="secondary" numberOfLines={2}>
                    {summary || t('saved.allListings')}
                  </T>
                </View>
                {s.new_count > 0 && <NewBadge n={s.new_count} />}
                <Pressable hitSlop={10} onPress={() => more(s)} accessibilityLabel={t('common.more')}>
                  <Ionicons name="ellipsis-horizontal" size={20} color={c.textSecondary} />
                </Pressable>
              </Pressable>
              <View style={[styles.notify, { borderTopColor: c.border }]}>
                <Ionicons name="notifications-outline" size={18} color={c.textSecondary} />
                <T variant="small" style={{ flex: 1 }}>
                  {t('saved.notify')}
                </T>
                <Switch
                  value={s.notify}
                  onValueChange={(v) => update.mutate({ id: s.id, patch: { notify: v } })}
                  trackColor={{ true: c.accent }}
                />
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          <EmptyState
            icon="bookmark-outline"
            title={t('saved.emptyTitle')}
            text={t('saved.emptyText')}
            action={{ title: t('fav.toSearch'), onPress: () => router.navigate('/') }}
          />
        }
      />
      <Sheet visible={!!renaming} onClose={() => setRenaming(null)} title={t('saved.renameTitle')}>
        <View style={{ paddingHorizontal: 16, gap: 12 }}>
          <TextInput
            value={name}
            onChangeText={setName}
            autoFocus
            maxLength={100}
            returnKeyType="done"
            onSubmitEditing={saveName}
            style={[styles.input, { backgroundColor: c.fill, color: c.text }]}
          />
          <Button title={t('common.save')} onPress={saveName} disabled={!name.trim()} />
        </View>
      </Sheet>
    </>
  );
}

function NewBadge({ n }: { n: number }) {
  const { tp } = useI18n();
  return (
    <View style={{ alignItems: 'flex-end', gap: 2 }}>
      <Badge n={n} />
      <T variant="caption" color="danger">
        {tp('count.newListings', n)}
      </T>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.l, overflow: 'hidden' },
  main: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  icon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  notify: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth },
  input: { height: 46, borderRadius: radius.s, paddingHorizontal: 12, fontSize: 16 },
});
