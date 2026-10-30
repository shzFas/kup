import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { router, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { RefItem } from '@kup/shared';
import { errorMessage } from '@/lib/api';
import { pickerStore } from '@/lib/picker';
import { useRefs } from '@/lib/queries';
import { useRefNames } from '@/lib/refNames';
import { useStore } from '@/lib/store';
import { useDebounced } from '@/lib/useDebounced';
import { radius, useColors } from '@/lib/theme';
import { CheckRow } from '@/components/Check';
import { Button, Divider, EmptyState, ErrorState, Loading, T } from '@/components/ui';

export default function PickerScreen() {
  const req = useStore(pickerStore, (s) => s);
  const c = useColors();
  const insets = useSafeAreaInsets();
  const [q, setQ] = useState('');
  const dq = useDebounced(q.trim(), 250);
  const [selected, setSelected] = useState<string[]>(req?.selected ?? []);
  const names = useRefNames();
  const refs = useRefs(req?.ref, req?.parent, dq, !!req);
  const multiParent = (req?.parent?.length ?? 0) > 1;

  const items = useMemo(() => {
    const list = refs.data ?? [];
    if (!req?.counts || dq) return list;
    // With facet counts: items that have results first.
    return [...list].sort((a, b) => Number((req.counts![b.id] ?? 0) > 0) - Number((req.counts![a.id] ?? 0) > 0));
  }, [refs.data, req, dq]);

  if (!req) {
    return <EmptyState title="Нечего выбирать" action={{ title: 'Назад', onPress: () => router.back() }} />;
  }

  const finish = (ids: string[], picked: RefItem[]) => {
    req.onDone(ids, picked);
    router.back();
  };

  const toggle = (it: RefItem) => {
    if (!req.multi) return finish([it.id], [it]);
    setSelected((s) => (s.includes(it.id) ? s.filter((x) => x !== it.id) : [...s, it.id]));
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.card }}>
      <Stack.Screen
        options={{
          title: req.title,
          headerLeft: () => (
            <Pressable onPress={() => router.back()} hitSlop={10}>
              <T color="accent">Отмена</T>
            </Pressable>
          ),
          headerRight: () =>
            selected.length > 0 ? (
              <Pressable onPress={() => (req.multi ? setSelected([]) : finish([], []))} hitSlop={10}>
                <T color="accent">Сбросить</T>
              </Pressable>
            ) : null,
        }}
      />
      <View style={[styles.search, { backgroundColor: c.fill }]}>
        <Ionicons name="search" size={18} color={c.textTertiary} />
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Поиск"
          placeholderTextColor={c.textTertiary}
          autoCorrect={false}
          clearButtonMode="while-editing"
          style={[styles.input, { color: c.text }]}
        />
      </View>
      {refs.isPending ? (
        <Loading />
      ) : refs.isError ? (
        <ErrorState message={errorMessage(refs.error)} onRetry={() => refs.refetch()} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => i.id}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          ItemSeparatorComponent={() => <Divider inset={50} />}
          contentContainerStyle={{ paddingBottom: 100 }}
          renderItem={({ item }) => (
            <View style={{ paddingHorizontal: 16 }}>
              <CheckRow
                label={item.name}
                subtitle={multiParent && item.parent ? names[item.parent] : undefined}
                checked={selected.includes(item.id)}
                radio={!req.multi}
                count={req.counts ? (req.counts[item.id] ?? 0) : undefined}
                onPress={() => toggle(item)}
              />
            </View>
          )}
          ListEmptyComponent={<EmptyState title="Ничего не найдено" text={q ? 'Попробуйте другое написание' : undefined} />}
        />
      )}
      {req.multi && (
        <View style={[styles.footer, { paddingBottom: insets.bottom + 10, backgroundColor: c.card, borderTopColor: c.border }]}>
          <Button
            title={selected.length ? `Готово (${selected.length})` : 'Готово'}
            onPress={() =>
              finish(
                selected,
                (refs.data ?? []).filter((i) => selected.includes(i.id)),
              )
            }
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: radius.m, paddingHorizontal: 12, height: 40, margin: 16, marginBottom: 8 },
  input: { flex: 1, fontSize: 16, height: 40 },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
});
