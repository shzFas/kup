import type { Metadata } from "next";
import { getI18n } from "@/i18n/server";
import { AuthGate } from "@/components/AuthGate";
import { ChatRoom } from "./ChatRoom";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("nav.chats"), robots: { index: false } };
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="mx-auto max-w-3xl px-0 sm:px-4 sm:py-4">
      <AuthGate fallback={<div className="skeleton h-[60vh] rounded-2xl m-4" />}>
        <ChatRoom id={id} />
      </AuthGate>
    </div>
  );
}
