"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { ListingCard } from "@kup/shared";
import { api } from "@/lib/client-api";
import { errorMessage } from "@/lib/errors";
import { useFavorites } from "@/lib/favorites";
import { CardSkeleton, EmptyState, ErrorState, ListingCardView } from "@/components/ListingCard";

export function FavoritesList() {
  const [items, setItems] = useState<ListingCard[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { ids, loaded } = useFavorites();

  useEffect(() => {
    api()
      .favorites()
      .then(setItems)
      .catch((e) => setError(errorMessage(e)));
  }, []);

  // Hide cards un-hearted on this page.
  const visible = items?.filter((i) => !loaded || ids.has(i.id));

  return (
    <div>
      <h1 className="text-2xl sm:text-3xl font-bold">Избранное</h1>
      <div className="mt-5">
        {error && <ErrorState text={error} />}
        {!error && !visible && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">{[0, 1, 2, 3].map((i) => <CardSkeleton key={i} />)}</div>
        )}
        {visible?.length === 0 && (
          <EmptyState title="В избранном пока пусто" text="Нажмите ♡ на карточке объявления, чтобы сохранить его здесь." action={<Link href="/" className="btn-primary">К объявлениям</Link>} />
        )}
        {visible && visible.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
            {visible.map((it) => <ListingCardView key={it.id} item={it} />)}
          </div>
        )}
      </div>
    </div>
  );
}
