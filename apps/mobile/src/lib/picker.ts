import { router } from 'expo-router';
import type { RefItem } from '@kup/shared';
import { createStore } from './store';

/** A pending request for the reference picker screen (/picker). Callbacks live in JS memory. */
export interface PickerRequest {
  title: string;
  ref: string;
  parent?: string[];
  multi: boolean;
  selected: string[];
  /** Optional facet counts by id (search filters). */
  counts?: Record<string, number>;
  onDone: (ids: string[], items: RefItem[]) => void;
}

export const pickerStore = createStore<PickerRequest | null>(null);

export function openPicker(req: PickerRequest) {
  pickerStore.set(req);
  router.push('/picker');
}
