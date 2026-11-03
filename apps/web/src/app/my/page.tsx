import type { Metadata } from "next";
import { getI18n } from "@/i18n/server";
import { AuthGate } from "@/components/AuthGate";
import { MyListings } from "./MyListings";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("nav.my"), robots: { index: false } };
}

export default function MyPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:py-8">
      <AuthGate>
        <MyListings />
      </AuthGate>
    </div>
  );
}
