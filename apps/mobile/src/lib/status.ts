import type { ListingStatus } from '@kup/shared';
import type { Key } from './i18n';

/** Short status label keys for cards. */
export const STATUS_SHORT: Record<ListingStatus, Key> = {
  active: 'status.active',
  archived: 'status.archived',
  sold: 'status.sold',
  expired: 'status.expired',
  blocked: 'status.blocked',
};

/** Longer label keys for the listing screen. */
export const STATUS_LONG: Record<ListingStatus, Key> = {
  active: 'statusLong.active',
  archived: 'statusLong.archived',
  sold: 'statusLong.sold',
  expired: 'statusLong.expired',
  blocked: 'statusLong.blocked',
};
