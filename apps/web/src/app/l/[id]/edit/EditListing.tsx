"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { Category, Listing } from "@kup/shared";
import { api } from "@/lib/client-api";
import { useAuth } from "@/lib/auth";
import { errorMessage } from "@/lib/errors";
import { ListingForm } from "@/components/form/ListingForm";
import { EmptyState } from "@/components/ListingCard";
import { useI18n } from "@/i18n/client";

export function EditListing({ id, categories }: { id: string; categories: Category[] }) {
  const { user } = useAuth();
  const { t, lang } = useI18n();
  const [listing, setListing] = useState<Listing | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api()
      .listing(id)
      .then(setListing)
      .catch((e) => setError(errorMessage(e, lang, t("listing.notFound"))));
  }, [id, lang, t]);

  if (error) return <EmptyState title={t("form.openFailed")} text={error} action={<Link href="/my" className="btn-secondary">{t("nav.my")}</Link>} />;
  if (!listing) return <div className="space-y-4"><div className="skeleton h-8 w-60" /><div className="skeleton h-64 rounded-2xl" /></div>;
  const owner = listing.is_owner || (user && listing.seller?.id === user.id);
  if (!owner) return <EmptyState title={t("form.noAccess")} text={t("form.noAccessText")} action={<Link href={`/l/${id}`} className="btn-secondary">{t("form.toListing")}</Link>} />;
  return <ListingForm categories={categories} listing={listing} />;
}
