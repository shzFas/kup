import type { Metadata } from "next";
import { AuthGate } from "@/components/AuthGate";
import { ProfileForm } from "./ProfileForm";

export const metadata: Metadata = { title: "Профиль", robots: { index: false } };

export default function ProfilePage() {
  return (
    <div className="mx-auto max-w-lg px-4 py-6 sm:py-10">
      <AuthGate>
        <ProfileForm />
      </AuthGate>
    </div>
  );
}
