import type { Metadata } from "next";
import { getI18n } from "@/i18n/server";
import { AuthGate } from "@/components/AuthGate";
import { NotificationsList } from "./NotificationsList";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("nav.notifications"), robots: { index: false } };
}

export default function Page() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:py-8">
      <AuthGate>
        <NotificationsList />
      </AuthGate>
    </div>
  );
}
