import { LANGS, type Lang } from "@kup/shared";
import { ru, type Dict, type MsgKey } from "./ru";
import { uk } from "./uk";
import { cs } from "./cs";
import { en } from "./en";

export type { Lang, MsgKey, Dict };
export { LANGS };

export const DEFAULT_LANG: Lang = "ru";
export const LANG_COOKIE = "lang";

const DICTS: Record<Lang, Dict> = { ru, uk, cs, en };

/** BCP-47 locale used for Intl formatting. */
export const LOCALES: Record<Lang, string> = { ru: "ru-RU", uk: "uk-UA", cs: "cs-CZ", en: "en-GB" };

/** The market is Czechia — dates are shown in Prague time. */
export const TZ = "Europe/Prague";

export function isLang(v: unknown): v is Lang {
  return v === "ru" || v === "uk" || v === "cs" || v === "en";
}

export type Vars = Record<string, string | number>;

function interpolate(s: string, vars?: Vars): string {
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

export type PluralEntry = { one?: string; two?: string; few?: string; many?: string; zero?: string; other: string };

export interface Translator {
  lang: Lang;
  locale: string;
  /** Translate a message; `{name}` placeholders are replaced from vars. */
  t: (key: MsgKey, vars?: Vars) => string;
  /** Plural message: picks the form for n via Intl.PluralRules; `{n}` is the formatted number. */
  tn: (key: MsgKey, n: number, vars?: Vars) => string;
  /** Locale-aware number (grouping per language). */
  num: (n: number) => string;
}

const cache = new Map<Lang, Translator>();

export function translator(lang: Lang): Translator {
  const hit = cache.get(lang);
  if (hit) return hit;
  const dict = DICTS[lang] ?? ru;
  const locale = LOCALES[lang];
  const rules = new Intl.PluralRules(locale);
  const nf = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
  const lookup = (key: MsgKey) => (dict[key] ?? ru[key]) as string | PluralEntry;
  const num = (n: number) => nf.format(n).replace(/[   ]/g, " ");
  const tr: Translator = {
    lang,
    locale,
    num,
    t: (key, vars) => {
      const v = lookup(key);
      return interpolate(typeof v === "string" ? v : v.other, vars);
    },
    tn: (key, n, vars) => {
      const v = lookup(key);
      const s = typeof v === "string" ? v : (v[rules.select(n) as keyof PluralEntry] ?? v.other);
      return interpolate(s, { n: num(n), ...vars });
    },
  };
  cache.set(lang, tr);
  return tr;
}
