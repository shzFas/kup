import { ApiError, type Lang } from "@kup/shared";
import { translator } from "@/i18n/core";

/** Human-readable error. API messages already come in the request language. */
export function errorMessage(e: unknown, lang: Lang, fallback?: string): string {
  const { t } = translator(lang);
  if (e instanceof ApiError) {
    if (e.status === 429) return t("err.tooMany");
    if (e.status >= 500) return t("err.server");
    return e.message || fallback || t("err.generic");
  }
  if (e instanceof TypeError) return t("err.network");
  return fallback || t("err.generic");
}
