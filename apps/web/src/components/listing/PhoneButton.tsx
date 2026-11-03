"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth, loginHref } from "@/lib/auth";
import { api } from "@/lib/client-api";
import { errorMessage } from "@/lib/errors";
import { formatPhone } from "@/lib/format";
import { IconPhone } from "../icons";
import { useI18n } from "@/i18n/client";

export function PhoneButton({ id }: { id: string }) {
  const { user } = useAuth();
  const { t, lang } = useI18n();
  const router = useRouter();
  const [phone, setPhone] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (phone) {
    return (
      <a href={`tel:${phone}`} className="btn-primary w-full !h-12 text-base">
        <IconPhone size={18} /> {formatPhone(phone)}
      </a>
    );
  }
  return (
    <div>
      <button
        type="button"
        disabled={loading}
        className="btn-primary w-full !h-12 text-base"
        onClick={async () => {
          if (!user) {
            router.push(loginHref(`/l/${id}`));
            return;
          }
          setLoading(true);
          setError(null);
          try {
            setPhone(await api().listingPhone(id));
          } catch (e) {
            setError(errorMessage(e, lang));
          } finally {
            setLoading(false);
          }
        }}
      >
        <IconPhone size={18} /> {loading ? t("common.loading") : t("listing.showPhone")}
      </button>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
