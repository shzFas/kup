import type { Metadata } from "next";
import { getCategories } from "@/lib/server-api";
import { AuthGate } from "@/components/AuthGate";
import { ListingForm } from "@/components/form/ListingForm";

export const metadata: Metadata = { title: "Подать объявление", robots: { index: false } };

export default async function NewListingPage({ searchParams }: { searchParams: Promise<{ category?: string }> }) {
  const [{ items }, sp] = await Promise.all([getCategories(), searchParams]);
  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:py-8">
      <AuthGate>
        <ListingForm categories={items} initialCategory={sp.category} />
      </AuthGate>
    </div>
  );
}
