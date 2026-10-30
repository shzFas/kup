"use client";
import type { RefItem } from "@kup/shared";
import { api } from "@/lib/client-api";

const cache = new Map<string, Promise<RefItem[]>>();

export function loadRefs(ref: string, parent: string[] = [], q = ""): Promise<RefItem[]> {
  const key = `${ref}|${[...parent].sort().join(",")}|${q.trim().toLowerCase()}`;
  let p = cache.get(key);
  if (!p) {
    p = api().refs(ref, { parent: parent.length ? parent : undefined, q: q.trim() || undefined });
    p.catch(() => cache.delete(key));
    cache.set(key, p);
  }
  return p;
}
