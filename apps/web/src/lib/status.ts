import type { ListingStatus } from "@kup/shared";
import type { MsgKey } from "@/i18n/core";

/** Short status label for cards (active has none). */
export const STATUS_LABEL: Record<ListingStatus, MsgKey> = {
  active: "status.active",
  archived: "status.archived",
  sold: "status.sold",
  expired: "status.expired",
  blocked: "status.blocked",
};
