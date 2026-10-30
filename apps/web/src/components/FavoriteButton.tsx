"use client";
import { useFavorites } from "@/lib/favorites";
import { IconHeart } from "./icons";

export function FavoriteButton({ id, className = "", withLabel = false }: { id: string; className?: string; withLabel?: boolean }) {
  const { isFavorite, toggle } = useFavorites();
  const on = isFavorite(id);
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        void toggle(id);
      }}
      aria-pressed={on}
      aria-label={on ? "Убрать из избранного" : "В избранное"}
      title={on ? "Убрать из избранного" : "В избранное"}
      className={`${on ? "text-red-500" : "text-gray-500 hover:text-red-500"} ${className}`}
    >
      <IconHeart size={20} filled={on} />
      {withLabel && <span>{on ? "В избранном" : "В избранное"}</span>}
    </button>
  );
}
