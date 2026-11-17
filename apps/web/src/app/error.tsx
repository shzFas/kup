"use client";
import { useI18n } from "@/i18n/client";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  const { t } = useI18n();
  return (
    <div className="mx-auto max-w-lg px-4 py-20 text-center">
      <h1 className="text-xl font-semibold">{t("err.pageTitle")}</h1>
      <p className="mt-1 text-gray-500">{t("err.pageText")}</p>
      <button onClick={reset} className="btn-primary mt-6">{t("common.retry")}</button>
    </div>
  );
}
