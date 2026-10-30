const MONTHS_GEN = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];

export function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

export function listingsCount(n: number): string {
  return `${n.toLocaleString("ru-RU").replace(/ /g, " ")} ${plural(n, "объявление", "объявления", "объявлений")}`;
}

/** "только что", "5 минут назад", "сегодня в 14:05", "вчера в 09:10", "12 октября", "12 октября 2025". */
export function relativeDate(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const diffMin = Math.floor((now.getTime() - d.getTime()) / 60000);
  if (diffMin < 1) return "только что";
  if (diffMin < 60) return `${diffMin} ${plural(diffMin, "минуту", "минуты", "минут")} назад`;
  const hhmm = d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
  const day = (x: Date) => x.toLocaleDateString("en-CA", { timeZone: TZ });
  if (day(d) === day(now)) return `сегодня в ${hhmm}`;
  const y = new Date(now.getTime() - 86400000);
  if (day(d) === day(y)) return `вчера в ${hhmm}`;
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "numeric", day: "numeric" }).formatToParts(d);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const nowYear = Number(new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric" }).format(now));
  const base = `${get("day")} ${MONTHS_GEN[get("month") - 1]}`;
  return get("year") === nowYear ? base : `${base} ${get("year")}`;
}

const TZ = "Asia/Almaty";

/** "на kup с октября 2026". */
export function memberSince(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const months = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
  return `на kup с ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** Prepositional case for common Kazakhstan cities ("в Астане"); falls back to the nominative. */
const PREPOSITIONAL: Record<string, string> = {
  "Астана": "Астане",
  "Караганда": "Караганде",
  "Шымкент": "Шымкенте",
  "Актобе": "Актобе",
  "Павлодар": "Павлодаре",
  "Усть-Каменогорск": "Усть-Каменогорске",
  "Семей": "Семее",
  "Костанай": "Костанае",
  "Кызылорда": "Кызылорде",
  "Атырау": "Атырау",
  "Актау": "Актау",
  "Тараз": "Таразе",
  "Петропавловск": "Петропавловске",
  "Уральск": "Уральске",
  "Туркестан": "Туркестане",
  "Талдыкорган": "Талдыкоргане",
  "Кокшетау": "Кокшетау",
  "Экибастуз": "Экибастузе",
};

export function inCity(name: string): string {
  return `в ${PREPOSITIONAL[name] ?? name}`;
}

export function formatPhone(p: string): string {
  const m = p.match(/^\+7(\d{3})(\d{3})(\d{2})(\d{2})$/);
  return m ? `+7 ${m[1]} ${m[2]}-${m[3]}-${m[4]}` : p;
}
