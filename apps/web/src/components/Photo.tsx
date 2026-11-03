"use client";
/* eslint-disable @next/next/no-img-element */
import { mediaUrl } from "@/lib/config";
import { IconCamera } from "./icons";
import { useI18n } from "@/i18n/client";

export function Photo({ src, alt, className = "", eager = false }: { src?: string; alt: string; className?: string; eager?: boolean }) {
  const { t } = useI18n();
  if (!src) {
    return (
      <div className={`flex items-center justify-center bg-gray-100 text-gray-300 ${className}`} role="img" aria-label={t("listing.noPhoto")}>
        <IconCamera size={36} />
      </div>
    );
  }
  return <img src={mediaUrl(src)} alt={alt} className={`object-cover bg-gray-100 ${className}`} loading={eager ? "eager" : "lazy"} decoding="async" />;
}
