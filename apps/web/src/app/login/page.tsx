import type { Metadata } from "next";
import { getI18n } from "@/i18n/server";
import { Suspense } from "react";
import { LoginForm } from "./LoginForm";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("login.metaTitle"), description: t("login.metaDescription"), robots: { index: false } };
}

export default function LoginPage() {
  return (
    <div className="mx-auto max-w-md px-4 py-10 sm:py-16">
      <Suspense fallback={<div className="card p-6 h-72 skeleton" />}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
