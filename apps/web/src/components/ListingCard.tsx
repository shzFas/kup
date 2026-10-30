import Link from "next/link";
import { formatPrice, type ListingCard as Card } from "@kup/shared";
import { relativeDate } from "@/lib/format";
import { Photo } from "./Photo";
import { FavoriteButton } from "./FavoriteButton";

const STATUS: Record<string, string> = { archived: "Снято с публикации", sold: "Продано" };

export function ListingCardView({ item, layout = "grid", eager = false, footer }: { item: Card; layout?: "grid" | "list"; eager?: boolean; footer?: React.ReactNode }) {
  const status = STATUS[item.status];
  if (layout === "list") {
    return (
      <article className="card overflow-hidden relative group">
        <Link href={`/l/${item.id}`} className="flex gap-3 sm:gap-4 p-3">
          <div className="relative w-32 sm:w-56 shrink-0 aspect-[4/3] rounded-xl overflow-hidden">
            <Photo src={item.photos[0]} alt={item.title} className="w-full h-full" eager={eager} />
            {item.photos.length > 1 && <span className="absolute bottom-1.5 right-1.5 rounded-md bg-black/55 px-1.5 text-[11px] text-white">{item.photos.length} фото</span>}
          </div>
          <div className="min-w-0 flex-1 flex flex-col pr-8">
            <h3 className="font-medium text-[15px] sm:text-base leading-snug line-clamp-2 group-hover:text-accent-600">{item.title}</h3>
            <div className="mt-1 text-lg font-bold">{formatPrice(item.price, item.currency, item.price_suffix)}</div>
            {item.highlights.length > 0 && <p className="mt-1 text-sm text-gray-600 line-clamp-2">{item.highlights.join(" · ")}</p>}
            <div className="mt-auto pt-2 text-xs text-gray-500 flex flex-wrap gap-x-2">
              <span>{item.city?.name}</span>
              <span suppressHydrationWarning>{relativeDate(item.published_at)}</span>
              {status && <span className="text-amber-700">{status}</span>}
            </div>
          </div>
        </Link>
        <FavoriteButton id={item.id} className="absolute top-3 right-3 p-1.5 rounded-full hover:bg-gray-100" />
        {footer}
      </article>
    );
  }
  return (
    <article className="card overflow-hidden relative group flex flex-col">
      <Link href={`/l/${item.id}`} className="flex flex-col flex-1">
        <div className="relative aspect-[4/3]">
          <Photo src={item.photos[0]} alt={item.title} className="w-full h-full" eager={eager} />
          {status && <span className="absolute top-2 left-2 rounded-md bg-gray-900/75 px-2 py-0.5 text-xs text-white">{status}</span>}
        </div>
        <div className="p-3 flex flex-col flex-1">
          <div className="text-[17px] font-bold">{formatPrice(item.price, item.currency, item.price_suffix)}</div>
          <h3 className="mt-0.5 text-sm font-medium leading-snug line-clamp-2 group-hover:text-accent-600">{item.title}</h3>
          {item.highlights.length > 0 && <p className="mt-1 text-xs text-gray-600 line-clamp-2">{item.highlights.join(" · ")}</p>}
          <div className="mt-auto pt-2 text-xs text-gray-500 flex flex-wrap gap-x-2">
            <span className="truncate">{item.city?.name}</span>
            <span suppressHydrationWarning>{relativeDate(item.published_at)}</span>
          </div>
        </div>
      </Link>
      <FavoriteButton id={item.id} className="absolute top-2 right-2 p-1.5 rounded-full bg-white/90 shadow-sm" />
      {footer}
    </article>
  );
}

export function CardSkeleton({ layout = "grid" }: { layout?: "grid" | "list" }) {
  if (layout === "list") {
    return (
      <div className="card p-3 flex gap-4">
        <div className="skeleton w-32 sm:w-56 aspect-[4/3] rounded-xl" />
        <div className="flex-1 space-y-2 py-1">
          <div className="skeleton h-4 w-3/4" />
          <div className="skeleton h-5 w-1/3" />
          <div className="skeleton h-3 w-2/3" />
        </div>
      </div>
    );
  }
  return (
    <div className="card overflow-hidden">
      <div className="skeleton aspect-[4/3] rounded-none" />
      <div className="p-3 space-y-2">
        <div className="skeleton h-5 w-1/2" />
        <div className="skeleton h-4 w-5/6" />
        <div className="skeleton h-3 w-2/3" />
      </div>
    </div>
  );
}

export function EmptyState({ title, text, action }: { title: string; text?: string; action?: React.ReactNode }) {
  return (
    <div className="card px-6 py-12 text-center">
      <div className="text-lg font-semibold">{title}</div>
      {text && <p className="mt-1 text-gray-500">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ text = "Не удалось загрузить данные. Попробуйте обновить страницу." }: { text?: string }) {
  return (
    <div className="card px-6 py-10 text-center border-red-100">
      <div className="text-lg font-semibold text-red-700">Ошибка загрузки</div>
      <p className="mt-1 text-gray-600">{text}</p>
    </div>
  );
}
