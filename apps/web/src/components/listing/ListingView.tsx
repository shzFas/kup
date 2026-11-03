import Link from "next/link";
import { formatPrice, type CategorySchema, type Listing, type ListingCard } from "@kup/shared";
import { memberSince, relativeDate } from "@/lib/format";
import { Gallery } from "./Gallery";
import { PhoneButton } from "./PhoneButton";
import { OwnerActions } from "./OwnerActions";
import { PriceHistory } from "./PriceHistory";
import { SimilarListings } from "./SimilarListings";
import { ContactSellerButton, ReportButton } from "./ContactActions";
import { FavoriteButton } from "../FavoriteButton";
import { IconEye, IconPin } from "../icons";

/** Characteristics grouped by schema groups, only attributes that have a label value. */
export function characteristics(listing: Listing, schema: CategorySchema | null) {
  const labels = listing.attribute_labels ?? {};
  if (!schema) {
    return [{ key: "all", label: "Характеристики", rows: Object.entries(labels).map(([k, v]) => ({ key: k, label: k, value: v })) }];
  }
  const groups = schema.groups.map((g) => ({ key: g.key, label: g.label, rows: [] as { key: string; label: string; value: string }[] }));
  const other = { key: "_other", label: "Прочее", rows: [] as { key: string; label: string; value: string }[] };
  for (const a of schema.attributes) {
    const v = labels[a.key];
    if (v == null || v === "") continue;
    (groups.find((g) => g.key === a.group) ?? other).rows.push({ key: a.key, label: a.label, value: v });
  }
  return [...groups, other].filter((g) => g.rows.length > 0);
}

const STATUS_NOTE: Record<Listing["status"], string | null> = {
  active: null,
  archived: "Объявление снято с публикации",
  sold: "Продано",
  expired: "Срок размещения объявления истёк",
  blocked: "Объявление заблокировано модератором",
};

export function ListingView({
  listing,
  schema,
  onOwnerChanged,
  similar,
}: {
  listing: Listing;
  schema: CategorySchema | null;
  similar?: ListingCard[] | null;
  onOwnerChanged?: (s: Listing["status"] | "deleted") => void;
}) {
  const groups = characteristics(listing, schema);
  const price = formatPrice(listing.price, listing.currency, listing.price_suffix);
  return (
    <div className="mx-auto max-w-7xl px-4 py-5 sm:py-6">
      <nav className="text-sm text-gray-500 mb-3 truncate" aria-label="Хлебные крошки">
        <Link href="/" className="hover:text-accent-600">Главная</Link>
        <span className="mx-1.5">/</span>
        <Link href={`/s/${listing.category}`} className="hover:text-accent-600">{schema?.name ?? "Объявления"}</Link>
        <span className="mx-1.5">/</span>
        <span className="text-gray-700">{listing.title}</span>
      </nav>

      {STATUS_NOTE[listing.status] && (
        <div className="mb-4 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">{STATUS_NOTE[listing.status]}</div>
      )}

      <div className="grid lg:grid-cols-[minmax(0,1fr)_360px] gap-6 items-start">
        <div className="min-w-0">
          <Gallery photos={listing.photos} title={listing.title} />

          {/* Mobile title/price */}
          <div className="lg:hidden mt-4">
            <h1 className="text-xl font-bold leading-snug">{listing.title}</h1>
            <div className="mt-1 text-2xl font-extrabold">{price}</div>
          </div>

          {listing.highlights?.length > 0 && (
            <div className="mt-5 flex flex-wrap gap-2">
              {listing.highlights.map((h) => (
                <span key={h} className="rounded-lg bg-white border border-gray-200 px-3 py-1.5 text-sm">{h}</span>
              ))}
            </div>
          )}

          {groups.length > 0 && (
            <section className="mt-6 card p-5">
              <h2 className="text-lg font-semibold">Характеристики</h2>
              <div className="mt-2 space-y-5">
                {groups.map((g) => (
                  <div key={g.key}>
                    <h3 className="text-sm font-medium text-gray-500 mb-1">{g.label}</h3>
                    <dl className="grid sm:grid-cols-2 gap-x-8">
                      {g.rows.map((r) => (
                        <div key={r.key} className="flex justify-between gap-4 py-2 border-b border-dashed border-gray-100 text-sm">
                          <dt className="text-gray-500">{r.label}</dt>
                          <dd className="text-right font-medium text-gray-900">{r.value}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                ))}
              </div>
            </section>
          )}

          {listing.price_history?.length >= 2 && (
            <div className="mt-6">
              <PriceHistory history={listing.price_history} currency={listing.currency} suffix={listing.price_suffix} />
            </div>
          )}

          <section className="mt-6 card p-5">
            <h2 className="text-lg font-semibold">Описание</h2>
            {listing.description ? (
              <p className="mt-2 whitespace-pre-line break-words text-[15px] leading-relaxed text-gray-800">{listing.description}</p>
            ) : (
              <p className="mt-2 text-gray-400">Продавец не добавил описание</p>
            )}
          </section>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-20">
          <div className="card p-5">
            <div className="hidden lg:block">
              <h1 className="text-xl font-bold leading-snug">{listing.title}</h1>
              <div className="mt-2 text-3xl font-extrabold">{price}</div>
            </div>
            <div className="mt-0 lg:mt-3 flex items-center gap-1.5 text-sm text-gray-600">
              <IconPin size={16} /> {listing.city?.name}
            </div>
            <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-gray-500">
              <span suppressHydrationWarning>Опубликовано {relativeDate(listing.published_at)}</span>
              <span className="inline-flex items-center gap-1"><IconEye size={14} /> {listing.views}</span>
            </div>
            <div className="mt-4 space-y-2">
              <PhoneButton id={listing.id} />
              <ContactSellerButton listingId={listing.id} sellerId={listing.seller?.id} isOwner={listing.is_owner} status={listing.status} />
              <FavoriteButton id={listing.id} withLabel className="btn-secondary w-full" />
            </div>
          </div>

          <div className="card p-5 flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-accent-100 text-accent-700 font-semibold flex items-center justify-center text-lg shrink-0">
              {(listing.seller?.name || "П").slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="font-semibold truncate">{listing.seller?.name || "Частное лицо"}</div>
              {listing.seller?.member_since && <div className="text-sm text-gray-500">{memberSince(listing.seller.member_since)}</div>}
            </div>
          </div>

          <OwnerActions
            id={listing.id}
            sellerId={listing.seller?.id}
            isOwner={listing.is_owner}
            status={listing.status}
            expiresAt={listing.expires_at}
            moderationReason={listing.moderation_reason}
            onChanged={onOwnerChanged}
          />
          <div className="px-1">
            <ReportButton listingId={listing.id} sellerId={listing.seller?.id} isOwner={listing.is_owner} />
          </div>
        </aside>
      </div>

      <SimilarListings key={listing.id} id={listing.id} initial={similar} />
    </div>
  );
}
