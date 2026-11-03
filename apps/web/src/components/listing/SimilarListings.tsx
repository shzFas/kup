"use client";
import { useEffect, useState } from "react";
import type { ListingCard } from "@kup/shared";
import { api } from "@/lib/client-api";
import { ListingCardView } from "../ListingCard";

/** «Похожие объявления». Uses SSR-provided items when available, otherwise fetches in the browser. */
export function SimilarListings({ id, initial }: { id: string; initial?: ListingCard[] | null }) {
  const [items, setItems] = useState<ListingCard[] | null>(initial ?? null);
  useEffect(() => {
    if (initial) return;
    let cancelled = false;
    api()
      .similar(id, 8)
      .then((r) => !cancelled && setItems(r))
      .catch(() => !cancelled && setItems([]));
    return () => {
      cancelled = true;
    };
  }, [id, initial]);
  const list = (items ?? []).filter((x) => x.id !== id);
  if (list.length === 0) return null;
  return (
    <section className="mt-10">
      <h2 className="text-xl font-bold">Похожие объявления</h2>
      <div className="mt-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
        {list.map((it) => <ListingCardView key={it.id} item={it} />)}
      </div>
    </section>
  );
}
