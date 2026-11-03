import type { Metadata } from "next";
import { getI18n } from "@/i18n/server";
import { getCategories } from "@/lib/server-api";
import { AuthGate } from "@/components/AuthGate";
import { EditListing } from "./EditListing";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("form.editListingTitle"), robots: { index: false } };
}

export default async function EditPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, { items }] = await Promise.all([params, getCategories()]);
  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:py-8">
      <AuthGate>
        <EditListing id={id} categories={items} />
      </AuthGate>
    </div>
  );
}
