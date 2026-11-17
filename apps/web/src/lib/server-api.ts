import { cache } from "react";
import { createApi, ApiError, type Category, type Lang } from "@kup/shared";
import { serverApiUrl } from "./config";
import { getLang } from "@/i18n/server";

/** Anonymous API client for server components, answering in the request's UI language. */
export function serverApi(lang: Lang) {
  return createApi({ baseUrl: serverApiUrl(), tokens: { get: () => null, set: () => {} }, lang: () => lang });
}

const FALLBACK_NAMES: Record<string, Record<Lang, string>> = {
  cars: { ru: "Автомобили", uk: "Автомобілі", cs: "Automobily", en: "Cars" },
  motorcycles: { ru: "Мотоциклы", uk: "Мотоцикли", cs: "Motocykly", en: "Motorcycles" },
  mopeds: { ru: "Мопеды и скутеры", uk: "Мопеди та скутери", cs: "Mopedy a skútry", en: "Mopeds & scooters" },
  apartments: { ru: "Квартиры", uk: "Квартири", cs: "Byty", en: "Apartments" },
};
const FALLBACK_ICONS: Record<string, string> = { cars: "car", motorcycles: "motorcycle", mopeds: "scooter", apartments: "apartment" };

export function fallbackCategories(lang: Lang): Category[] {
  return Object.entries(FALLBACK_NAMES).map(([slug, n]) => ({ slug, name: n[lang], icon: FALLBACK_ICONS[slug] }));
}

const categoriesFor = cache(async (lang: Lang): Promise<{ items: Category[]; error: boolean }> => {
  try {
    return { items: await serverApi(lang).categories(), error: false };
  } catch {
    return { items: fallbackCategories(lang), error: true };
  }
});

export const getCategories = async () => categoriesFor(await getLang());

const schemaFor = cache(async (slug: string, lang: Lang) => serverApi(lang).schema(slug));
export const getSchema = async (slug: string) => schemaFor(slug, await getLang());

const listingFor = cache(async (id: string, lang: Lang) => serverApi(lang).listing(id));
export const getListing = async (id: string) => listingFor(id, await getLang());

export function isNotFound(e: unknown): boolean {
  return e instanceof ApiError && e.status === 404;
}
