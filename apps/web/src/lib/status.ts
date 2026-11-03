import type { ListingStatus } from "@kup/shared";

/** Short status label for cards (active has none). */
export const STATUS_LABEL: Record<ListingStatus, string> = {
  active: "Активно",
  archived: "Снято с публикации",
  sold: "Продано",
  expired: "Срок истёк",
  blocked: "Заблокировано",
};

/** Lower-case status for "статус: …" sentences. */
export const STATUS_TEXT: Record<ListingStatus, string> = {
  active: "активно",
  archived: "снято с публикации",
  sold: "продано",
  expired: "срок истёк",
  blocked: "заблокировано",
};

const DATE_FMT = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Almaty" });

export function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : DATE_FMT.format(d).replace(/\s*г\.$/, "");
}
