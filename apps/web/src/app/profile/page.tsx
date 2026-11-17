import type { Metadata } from "next";
import { getI18n } from "@/i18n/server";
import { AuthGate } from "@/components/AuthGate";
import { ProfileForm } from "./ProfileForm";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("nav.profile"), robots: { index: false } };
}

export default function ProfilePage() {
  return (
    <div className="mx-auto max-w-lg px-4 py-6 sm:py-10">
      <AuthGate>
        <ProfileForm />
      </AuthGate>
    </div>
  );
}
