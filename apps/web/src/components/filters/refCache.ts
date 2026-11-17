"use client";
import type { RefItem } from "@kup/shared";
import { api } from "@/lib/client-api";
import { getClientLang, onLangChange } from "@/i18n/client";

const cache = new Map<string, Promise<RefItem[]>>();
// Names are localized: drop everything when the UI language changes.
onLangChange(() => cache.clear());

export function loadRefs(ref: string, parent: string[] = [], q = ""): Promise<RefItem[]> {
  const key = `${getClientLang()}|${ref}|${[...parent].sort().join(",")}|${q.trim().toLowerCase()}`;
  let p = cache.get(key);
  if (!p) {
    p = api().refs(ref, { parent: parent.length ? parent : undefined, q: q.trim() || undefined });
    p.catch(() => cache.delete(key));
    cache.set(key, p);
  }
  return p;
}
