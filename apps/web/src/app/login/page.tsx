import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Вход", description: "Вход на kup по номеру телефона", robots: { index: false } };

export default function LoginPage() {
  return (
    <div className="mx-auto max-w-md px-4 py-10 sm:py-16">
      <Suspense fallback={<div className="card p-6 h-72 skeleton" />}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
