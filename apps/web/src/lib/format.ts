import type { Lang } from "@kup/shared";
import { LOCALES, TZ, translator } from "@/i18n/core";

const dayKey = (x: Date) => x.toLocaleDateString("en-CA", { timeZone: TZ });

/** "1 234 объявления" in the given language. */
export function listingsCount(n: number, lang: Lang): string {
  return translator(lang).tn("count.listings", n);
}

/** "только что", "5 минут назад", "сегодня в 14:05", "вчера в 09:10", "12 октября", "12 октября 2025". */
export function relativeDate(iso: string, lang: Lang, now: Date = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const { t, locale } = { t: translator(lang).t, locale: LOCALES[lang] };
  const diffMin = Math.floor((now.getTime() - d.getTime()) / 60000);
  if (diffMin < 1) return t("date.justNow");
  if (diffMin < 60) return new Intl.RelativeTimeFormat(locale, { numeric: "always" }).format(-diffMin, "minute");
  const time = d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", timeZone: TZ });
  if (dayKey(d) === dayKey(now)) return t("date.todayAt", { time });
  if (dayKey(d) === dayKey(new Date(now.getTime() - 86400000))) return t("date.yesterdayAt", { time });
  return dayMonth(d, lang, now);
}

function dayMonth(d: Date, lang: Lang, now: Date): string {
  const y = (x: Date) => x.toLocaleDateString("en-CA", { timeZone: TZ, year: "numeric" });
  return new Intl.DateTimeFormat(LOCALES[lang], { timeZone: TZ, day: "numeric", month: "long", ...(y(d) === y(now) ? {} : { year: "numeric" }) })
    .format(d)
    .replace(/\s*(г\.|р\.)$/, "");
}

/** "12 октября 2026" / "12. října 2026" / "12 October 2026". */
export function formatDate(iso: string, lang: Lang): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat(LOCALES[lang], { day: "numeric", month: "long", year: "numeric", timeZone: TZ })
    .format(d)
    .replace(/\s*(г\.|р\.)$/, "");
}

/** Short date+time for chat / notifications: "14:05", "вчера 14:05", "12 окт. 14:05". */
export function shortDateTime(iso: string, lang: Lang, now: Date = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const locale = LOCALES[lang];
  const time = d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", timeZone: TZ });
  if (dayKey(d) === dayKey(now)) return time;
  if (dayKey(d) === dayKey(new Date(now.getTime() - 86400000))) return `${translator(lang).t("date.yesterday")} ${time}`;
  return `${d.toLocaleDateString(locale, { day: "numeric", month: "short", timeZone: TZ })} ${time}`;
}

/** Day separator in chat: "Сегодня", "Вчера", "12 октября". */
export function dayLabel(iso: string, lang: Lang, now: Date = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const { t } = translator(lang);
  if (dayKey(d) === dayKey(now)) return t("date.today");
  if (dayKey(d) === dayKey(new Date(now.getTime() - 86400000))) return t("date.yesterdayCap");
  return dayMonth(d, lang, now);
}

export { dayKey };

/** "на kup с октября 2026" — month in the genitive where the language needs it. */
export function memberSince(iso: string, lang: Lang): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const parts = new Intl.DateTimeFormat(LOCALES[lang], { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).formatToParts(d);
  const month = parts.find((p) => p.type === "month")?.value ?? "";
  const year = parts.find((p) => p.type === "year")?.value ?? "";
  // English: "October 2026" (no genitive); others use the genitive month from the day-context format.
  const date = lang === "en" ? new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(d) : `${month} ${year}`;
  return translator(lang).t("seller.since", { date });
}

/**
 * Locative "where" phrase for Czech cities, by city id: ru "в Праге", uk "у Празі", en "in Prague".
 * Czech SEO uses the plain city name ("prodej Praha").
 */
const LOCATIVE: Record<string, { ru: string; uk: string }> = {
  praha: { ru: "в Праге", uk: "у Празі" },
  brno: { ru: "в Брно", uk: "у Брно" },
  ostrava: { ru: "в Остраве", uk: "в Остраві" },
  plzen: { ru: "в Пльзене", uk: "у Пльзені" },
  liberec: { ru: "в Либерце", uk: "у Ліберці" },
  olomouc: { ru: "в Оломоуце", uk: "в Оломоуці" },
  "ceske-budejovice": { ru: "в Ческе-Будеёвице", uk: "у Чеських Будейовицях" },
  "hradec-kralove": { ru: "в Градец-Кралове", uk: "у Градець-Кралове" },
  "usti-nad-labem": { ru: "в Усти-над-Лабем", uk: "в Усті-над-Лабем" },
  pardubice: { ru: "в Пардубице", uk: "у Пардубицях" },
  zlin: { ru: "в Злине", uk: "у Зліні" },
  "karlovy-vary": { ru: "в Карловых Варах", uk: "у Карлових Варах" },
  kladno: { ru: "в Кладно", uk: "у Кладно" },
  jihlava: { ru: "в Йиглаве", uk: "у Йиглаві" },
  teplice: { ru: "в Теплице", uk: "у Тепліце" },
  opava: { ru: "в Опаве", uk: "в Опаві" },
};

export function inCity(city: { id: string; name: string }, lang: Lang): string {
  const loc = LOCATIVE[city.id];
  if (lang === "ru") return loc?.ru ?? `в ${city.name}`;
  if (lang === "uk") return loc?.uk ?? `у ${city.name}`;
  if (lang === "en") return `in ${city.name}`;
  return city.name;
}

/** Pretty-print E.164: +420 777 123 456, +380 67 123 4567, +7 701 123-45-67. */
export function formatPhone(p: string): string {
  let m = p.match(/^\+(420|421)(\d{3})(\d{3})(\d{3})$/);
  if (m) return `+${m[1]} ${m[2]} ${m[3]} ${m[4]}`;
  m = p.match(/^\+380(\d{2})(\d{3})(\d{4})$/);
  if (m) return `+380 ${m[1]} ${m[2]} ${m[3]}`;
  m = p.match(/^\+48(\d{3})(\d{3})(\d{3})$/);
  if (m) return `+48 ${m[1]} ${m[2]} ${m[3]}`;
  m = p.match(/^\+7(\d{3})(\d{3})(\d{2})(\d{2})$/);
  if (m) return `+7 ${m[1]} ${m[2]}-${m[3]}-${m[4]}`;
  return p;
}
