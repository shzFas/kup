import type { Metadata } from "next";
import { formatPrice, type Listing } from "@kup/shared";
import { getListing, getSchema, isNotFound } from "@/lib/server-api";
import { inCity } from "@/lib/format";
import { mediaUrl } from "@/lib/config";
import { ListingView } from "@/components/listing/ListingView";
import { ClientListing } from "@/components/listing/ClientListing";
import { ErrorState } from "@/components/ListingCard";

type Props = { params: Promise<{ id: string }> };

async function load(id: string): Promise<Listing | "not_found" | "error"> {
  try {
    return await getListing(id);
  } catch (e) {
    return isNotFound(e) ? "not_found" : "error";
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const l = await load(id);
  if (typeof l === "string") return { title: "Объявление", robots: { index: false } };
  const price = formatPrice(l.price, l.currency, l.price_suffix);
  const city = l.city?.name ? ` ${inCity(l.city.name)}` : "";
  const desc = `${l.title} за ${price}${city}. ${l.highlights?.join(", ") ?? ""}. ${l.description?.slice(0, 120) ?? ""}`.trim();
  return {
    title: `${l.title} — ${price}${city}`,
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
        <ErrorState text="Не удалось загрузить объявление. Попробуйте обновить страницу." />
      </div>
    );
  }
  const schema = await getSchema(l.category).catch(() => null);
  return <ListingView listing={l} schema={schema} />;
}
