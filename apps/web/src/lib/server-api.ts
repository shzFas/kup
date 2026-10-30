
import { cache } from "react";
import { createApi, ApiError, type Category } from "@kup/shared";
import { serverApiUrl } from "./config";

/** Anonymous API client for server components. */
export function serverApi() {
  return createApi({ baseUrl: serverApiUrl(), tokens: { get: () => null, set: () => {} } });
}

export const FALLBACK_CATEGORIES: Category[] = [
  { slug: "cars", name: "Автомобили", icon: "car" },
  { slug: "motorcycles", name: "Мотоциклы", icon: "motorcycle" },
  { slug: "mopeds", name: "Мопеды и скутеры", icon: "scooter" },
  { slug: "apartments", name: "Квартиры", icon: "apartment" },
];

export const getCategories = cache(async (): Promise<{ items: Category[]; error: boolean }> => {
  try {
    return { items: await serverApi().categories(), error: false };
  } catch {
    return { items: FALLBACK_CATEGORIES, error: true };
  }
});

export const getSchema = cache(async (slug: string) => serverApi().schema(slug));

export const getListing = cache(async (id: string) => serverApi().listing(id));

export function isNotFound(e: unknown): boolean {
  return e instanceof ApiError && e.status === 404;
}
