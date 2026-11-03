import Link from "next/link";
import { getI18n } from "@/i18n/server";

export default async function NotFound() {
  const { t } = await getI18n();
  return (
    <div className="mx-auto max-w-lg px-4 py-20 text-center">
      <div className="text-6xl font-extrabold text-accent-600">404</div>
      <h1 className="mt-3 text-xl font-semibold">{t("err.notFoundTitle")}</h1>
      <p className="mt-1 text-gray-500">{t("err.notFoundText")}</p>
      <Link href="/" className="btn-primary mt-6">{t("common.toHome")}</Link>
    </div>
  );
}
