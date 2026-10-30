import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert } from 'react-native';
import { api, errorMessage } from './api';
import { createStore, useStore } from './store';
import { useRequireAuth } from './auth';

/** Local overrides of is_favorite so every card updates instantly after a toggle. */
const overrides = createStore<Record<string, boolean>>({});

export function useIsFavorite(id: string, fromServer: boolean | undefined) {
  return useStore(overrides, (s) => s[id]) ?? fromServer ?? false;
}

export function useToggleFavorite() {
  const qc = useQueryClient();
  const requireAuth = useRequireAuth();
  const m = useMutation({
    mutationFn: ({ id, value }: { id: string; value: boolean }) =>
      value ? api.addFavorite(id) : api.removeFavorite(id),
    onMutate: ({ id, value }) => overrides.set((s) => ({ ...s, [id]: value })),
    onError: (e, { id, value }) => {
      overrides.set((s) => ({ ...s, [id]: !value }));
      Alert.alert('Не удалось обновить избранное', errorMessage(e));
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['favorites'] }),
  });
  return (id: string, current: boolean) => requireAuth(() => m.mutate({ id, value: !current }));
}

export function resetFavoriteOverrides() {
  overrides.set({});
}
