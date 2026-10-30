import type { Metadata } from "next";
import { AuthGate } from "@/components/AuthGate";
import { FavoritesList } from "./FavoritesList";

export const metadata: Metadata = { title: "Избранное", robots: { index: false } };

export default function FavoritesPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:py-8">
      <AuthGate>
        <FavoritesList />
      </AuthGate>
    </div>
  );
}
