import Link from "next/link";
import type { ListingCard } from "@kup/shared";
import { getCategories, serverApi } from "@/lib/server-api";
import { CategoryIcon, IconChevronRight } from "@/components/icons";
import { ListingCardView, ErrorState } from "@/components/ListingCard";
import { listingsCount } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const { items: categories, error } = await getCategories();
  const api = serverApi();
  const sections = await Promise.all(
    categories.map(async (c) => {
      try {
        const r = await api.search({ category: c.slug, limit: 8, page: 1, facets: [] });
        return { category: c, items: r.items as ListingCard[], total: r.total, error: false };
      } catch {
        return { category: c, items: [] as ListingCard[], total: 0, error: true };
      }
    }),
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:py-8">
      <h1 className="sr-only">kup — доска объявлений</h1>
      <section aria-label="Категории" className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {categories.map((c) => {
          const total = sections.find((s) => s.category.slug === c.slug)?.total;
          return (
            <Link key={c.slug} href={`/s/${c.slug}`} className="card p-4 sm:p-5 flex items-center gap-3 sm:gap-4 hover:border-accent-200 hover:shadow-md transition">
              <span className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-accent-50 text-accent-600 flex items-center justify-center shrink-0">
                <CategoryIcon icon={c.icon} />
              </span>
              <span className="min-w-0">
                <span className="block font-semibold leading-tight">{c.name}</span>
                {total != null && total > 0 && <span className="block text-xs text-gray-500 mt-0.5">{listingsCount(total)}</span>}
              </span>
            </Link>
          );
        })}
      </section>

      {error && (
        <div className="mt-8">
          <ErrorState text="Сервер недоступен. Попробуйте обновить страницу чуть позже." />
        </div>
      )}

      {sections
        .filter((s) => s.items.length > 0)
        .map((s) => (
          <section key={s.category.slug} className="mt-10">
            <div className="flex items-end justify-between gap-4 mb-4">
              <h2 className="text-xl sm:text-2xl font-bold">
                Свежие объявления · <span className="text-gray-500 font-semibold">{s.category.name}</span>
              </h2>
              <Link href={`/s/${s.category.slug}`} className="text-sm text-accent-600 hover:underline inline-flex items-center shrink-0">
                Все <IconChevronRight size={16} />
              </Link>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
              {s.items.map((item, i) => (
                <ListingCardView key={item.id} item={item} eager={i < 4} />
              ))}
            </div>
          </section>
        ))}

      {!error && sections.every((s) => s.items.length === 0) && (
        <div className="mt-10 card px-6 py-12 text-center">
          <div className="text-lg font-semibold">Пока нет объявлений</div>
          <p className="mt-1 text-gray-500">Станьте первым — разместите объявление бесплатно.</p>
          <Link href="/new" className="btn-primary mt-4">Подать объявление</Link>
        </div>
      )}
    </div>
  );
}
