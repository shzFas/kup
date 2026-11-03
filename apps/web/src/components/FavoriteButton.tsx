"use client";
import { useFavorites } from "@/lib/favorites";
import { IconHeart } from "./icons";
import { useI18n } from "@/i18n/client";

export function FavoriteButton({ id, className = "", withLabel = false }: { id: string; className?: string; withLabel?: boolean }) {
  const { isFavorite, toggle } = useFavorites();
  const { t } = useI18n();
  const on = isFavorite(id);
  const label = on ? t("fav.remove") : t("fav.add");
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        void toggle(id);
      }}
      aria-pressed={on}
      aria-label={label}
      title={label}
      className={`${on ? "text-red-500" : "text-gray-500 hover:text-red-500"} ${className}`}
    >
      <IconHeart size={20} filled={on} />
      {withLabel && <span>{on ? t("fav.inFavorites") : t("fav.add")}</span>}
    </button>
  );
}
