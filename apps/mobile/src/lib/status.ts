import type { ListingStatus } from '@kup/shared';

/** Short status label for cards. */
export const STATUS_SHORT: Record<ListingStatus, string> = {
  active: 'Активно',
  archived: 'В архиве',
  sold: 'Продано',
  expired: 'Срок истёк',
  blocked: 'Заблокировано',
};

/** Longer label for the listing screen. */
export const STATUS_LONG: Record<ListingStatus, string> = {
  active: 'Опубликовано',
  archived: 'Снято с публикации',
  sold: 'Продано',
  expired: 'Срок истёк',
  blocked: 'Заблокировано',
};
