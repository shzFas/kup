import type { Metadata } from "next";
import { formatPrice, type Listing } from "@kup/shared";
import { getListing, getSchema, isNotFound, serverApi } from "@/lib/server-api";
import { inCity } from "@/lib/format";
import { mediaUrl } from "@/lib/config";
import { ListingView } from "@/components/listing/ListingView";
import { ClientListing } from "@/components/listing/ClientListing";
import { ErrorState } from "@/components/ListingCard";
import { getI18n } from "@/i18n/server";

type Props = { params: Promise<{ id: string }> };

async function load(id: string): Promise<Listing | "not_found" | "error"> {
  try {
    return await getListing(id);
  } catch (e) {
    return isNotFound(e) ? "not_found" : "error";
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const [{ id }, { t, lang }] = await Promise.all([params, getI18n()]);
  const l = await load(id);
  if (typeof l === "string") return { title: t("seo.listing"), robots: { index: false } };
  const price = formatPrice(l.price, l.currency, l.price_suffix);
  const rent = !!l.price_suffix;
  const verb = t(rent ? "seo.rent" : "seo.buy");
  const where = l.city?.name ? inCity(l.city, lang) : "";
  // "Škoda Octavia — купить в Праге", "Škoda Octavia — prodej Praha"
  const desc = t("seo.listingDescription", { title: l.title, price, where, highlights: l.highlights?.join(", ") ?? "" })
    .concat(l.description ? ` ${l.description.slice(0, 120)}` : "")
    .trim();
  return {
    title: `${l.title} — ${verb}${where ? " " + where : ""} · ${price}`,
    description: desc,
    openGraph: { title: l.title, description: desc, images: l.photos?.[0] ? [mediaUrl(l.photos[0])] : undefined },
  };
}

export default async function ListingPage({ params }: Props) {
  const { id } = await params;
  const l = await load(id);
  if (l === "not_found") return <ClientListing id={id} />;
  if (l === "error") {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12">
        <ErrorState text={(await getI18n()).t("listing.loadFailedText")} />
      </div>
    );
  }
  const [schema, similar] = await Promise.all([
    getSchema(l.category).catch(() => null),
    serverApi((await getI18n()).lang).similar(l.id, 8).catch(() => null),
  ]);
  return <ListingView listing={l} schema={schema} similar={similar} />;
}
