import type { Metadata } from "next";
import { getI18n } from "@/i18n/server";
import { AuthGate } from "@/components/AuthGate";
import { FavoritesList } from "./FavoritesList";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("nav.favorites"), robots: { index: false } };
}

export default function FavoritesPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:py-8">
      <AuthGate>
        <FavoritesList />
      </AuthGate>
    </div>
  );
}
