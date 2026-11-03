import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert } from 'react-native';
import { router } from 'expo-router';
import { filtersToQuery, type Filters, type SavedSearch } from '@kup/shared';
import { api, errorMessage } from './api';
import { keys } from './chatCache';
import { i18n } from './i18n';

/** Opens search results for a category with the given filters, replacing the remembered state of that category. */
export function openResults(category: string, filters: Filters = {}, query = '') {
  router.push({
    pathname: '/search/[category]',
    params: { category, ...filtersToQuery(filters), ...(query ? { q: query } : {}), reset: '1' },
  });
}

export function useOpenSavedSearch() {
  const qc = useQueryClient();
  return (s: SavedSearch) => {
    if (s.new_count > 0) {
      qc.setQueryData<SavedSearch[]>(keys.savedSearches, (list) => list?.map((x) => (x.id === s.id ? { ...x, new_count: 0 } : x)));
      api.markSavedSearchSeen(s.id).catch(() => void qc.invalidateQueries({ queryKey: keys.savedSearches }));
    }
    openResults(s.request.category, s.request.filters ?? {}, s.request.query ?? '');
  };
}

export function useUpdateSavedSearch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: { name?: string; notify?: boolean } }) => api.updateSavedSearch(id, patch),
    onMutate: ({ id, patch }) =>
      qc.setQueryData<SavedSearch[]>(keys.savedSearches, (list) => list?.map((x) => (x.id === id ? { ...x, ...patch } : x))),
    onSuccess: (s) => qc.setQueryData<SavedSearch[]>(keys.savedSearches, (list) => list?.map((x) => (x.id === s.id ? s : x))),
    onError: (e) => {
      Alert.alert(i18n().t('common.error'), errorMessage(e));
      void qc.invalidateQueries({ queryKey: keys.savedSearches });
    },
  });
}

export function useDeleteSavedSearch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteSavedSearch(id),
    onMutate: (id) => qc.setQueryData<SavedSearch[]>(keys.savedSearches, (list) => list?.filter((x) => x.id !== id)),
    onError: (e) => {
      Alert.alert(i18n().t('common.error'), errorMessage(e));
      void qc.invalidateQueries({ queryKey: keys.savedSearches });
    },
  });
}
