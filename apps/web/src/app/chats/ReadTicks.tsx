"use client";
import { useI18n } from "@/i18n/client";
import { IconCheck, IconCheckDouble } from "@/components/icons";

/** ✓ sent, ✓✓ read by the peer. */
export function ReadTicks({ read, className = "" }: { read: boolean; className?: string }) {
  const { t } = useI18n();
  const label = read ? t("chats.read") : t("chats.sent");
  return (
    <span className={`inline-flex ${read ? "text-accent-500" : "text-gray-400"} ${className}`} role="img" aria-label={label} title={label}>
      {read ? <IconCheckDouble size={16} /> : <IconCheck size={16} />}
    </span>
  );
}

/** True if the peer has read up to (or past) the given moment. Compares as dates — precision may differ. */
export function readBy(peerReadAt: string | null | undefined, at: string): boolean {
  if (!peerReadAt) return false;
  return new Date(peerReadAt).getTime() >= new Date(at).getTime();
}
