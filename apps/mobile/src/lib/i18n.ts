import * as SecureStore from 'expo-secure-store';
import { getLocales } from 'expo-localization';
import { formatNumber, LANGS, pickLang, type Lang } from '@kup/shared';
import { ru, type Key } from '@/i18n/ru';
import { uk } from '@/i18n/uk';
import { cs } from '@/i18n/cs';
import { en } from '@/i18n/en';
import { createStore, useStore } from './store';

export type { Key } from '@/i18n/ru';
export { LANGS };

const DICTS: Record<Lang, Record<Key, string>> = { ru, uk, cs, en };
const LOCALES: Record<Lang, string> = { ru: 'ru-RU', uk: 'uk-UA', cs: 'cs-CZ', en: 'en-GB' };
const LANG_KEY = 'kup.lang';

export type Vars = Record<string, string | number>;

/** Plural form index: 0 = one, 1 = few, 2 = many/other (en uses only 0 and 2). */
function pluralIndex(lang: Lang, n: number): number {
  const a = Math.abs(n);
  if (!Number.isInteger(a)) return lang === 'en' ? 2 : 1;
  if (lang === 'en') return a === 1 ? 0 : 2;
  if (lang === 'cs') return a === 1 ? 0 : a >= 2 && a <= 4 ? 1 : 2;
  const m100 = a % 100;
  const m10 = a % 10;
  if (m100 > 10 && m100 < 20) return 2;
  if (m10 === 1) return 0;
  if (m10 > 1 && m10 < 5) return 1;
  return 2;
}

function fill(s: string, vars?: Vars) {
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

// ---------- Intl with graceful fallback (Hermes ships Intl, but locale data may be partial) ----------

function tryIntl<T>(make: () => T): T | null {
  try {
    if (typeof Intl === 'undefined') return null;
    return make();
  } catch {
    return null;
  }
}

const pad = (n: number) => String(n).padStart(2, '0');

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function parse(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function makeBundle(lang: Lang) {
  const dict = DICTS[lang];
  const locale = LOCALES[lang];

  const t = (key: Key, vars?: Vars): string => fill(dict[key] ?? ru[key] ?? key, vars);
  /** Plural string: forms separated by "|" (one|few|many); `{n}` is the formatted number. */
  const tp = (key: Key, n: number, vars?: Vars): string => {
    const forms = (dict[key] ?? ru[key]).split('|');
    const i = Math.min(pluralIndex(lang, n), forms.length - 1);
    return fill(forms[i] ?? forms[forms.length - 1], { n: num(n), ...vars });
  };

  const numFmt = tryIntl(() => new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }));
  function num(n: number): string {
    // Years etc. (< 10000) stay ungrouped like the shared formatter.
    if (Math.abs(n) < 10000 && Number.isInteger(n)) return String(n);
    if (numFmt) {
      try {
        return numFmt.format(n);
      } catch {
        /* fall through */
      }
    }
    return formatNumber(n);
  }

  const CURRENCY: Record<string, string> = { CZK: 'Kč', EUR: '€', USD: '$', KZT: '₸' };
  const price = (value: number, currency: string, suffix = '') =>
    `${num(value)} ${CURRENCY[currency] ?? currency}${suffix ? ' ' + suffix : ''}`;

  const dayMonthFmt = tryIntl(() => new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long' }));
  const dayMonthYearFmt = tryIntl(() => new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric' }));
  const shortFmt = tryIntl(() => new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }));
  const monthYearFmt = tryIntl(() => new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }));
  const timeFmt = tryIntl(() => new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', hour12: false }));

  const use = (f: Intl.DateTimeFormat | null, d: Date, fallback: () => string) => {
    if (f) {
      try {
        const s = f.format(d);
        if (s) return s;
      } catch {
        /* fall through */
      }
    }
    return fallback();
  };
  const numeric = (d: Date) => `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;

  const clockOf = (d: Date) => use(timeFmt, d, () => `${pad(d.getHours())}:${pad(d.getMinutes())}`);
  /** "3 ноября" / "3. listopadu" (+ year if not this year). */
  const dayMonthOf = (d: Date) =>
    d.getFullYear() === new Date().getFullYear() ? use(dayMonthFmt, d, () => numeric(d)) : use(dayMonthYearFmt, d, () => numeric(d));

  const isYesterday = (d: Date) => {
    const y = new Date();
    y.setDate(y.getDate() - 1);
    return sameDay(d, y);
  };

  return {
    lang,
    locale,
    t,
    tp,
    num,
    price,
    /** "Сегодня, 14:05" / "Вчера, 09:00" / "3 ноября" — listing dates. */
    date(iso: string | null | undefined) {
      const d = parse(iso);
      if (!d) return '';
      if (sameDay(d, new Date())) return t('date.todayAt', { time: clockOf(d) });
      if (isYesterday(d)) return t('date.yesterdayAt', { time: clockOf(d) });
      return dayMonthOf(d);
    },
    /** "14:05" today, "Вчера", "3 нояб." this year, "03.11.2025" otherwise — for lists. */
    shortTime(iso: string | null | undefined) {
      const d = parse(iso);
      if (!d) return '';
      if (sameDay(d, new Date())) return clockOf(d);
      if (isYesterday(d)) return t('date.yesterday');
      if (d.getFullYear() === new Date().getFullYear()) return use(shortFmt, d, () => numeric(d));
      return numeric(d);
    },
    /** Chat day separators: "Сегодня" / "Вчера" / "3 ноября". */
    day(iso: string | null | undefined) {
      const d = parse(iso);
      if (!d) return '';
      if (sameDay(d, new Date())) return t('date.today');
      if (isYesterday(d)) return t('date.yesterday');
      return dayMonthOf(d);
    },
    dayMonth(iso: string | null | undefined) {
      const d = parse(iso);
      return d ? dayMonthOf(d) : '';
    },
    monthYear(iso: string | null | undefined) {
      const d = parse(iso);
      return d ? use(monthYearFmt, d, () => `${pad(d.getMonth() + 1)}.${d.getFullYear()}`) : '';
    },
    clock(iso: string | null | undefined) {
      const d = parse(iso);
      return d ? clockOf(d) : '';
    },
    listings: (n: number) => tp('count.listings', n),
  };
}

export type I18n = ReturnType<typeof makeBundle>;

const bundles: Partial<Record<Lang, I18n>> = {};
function bundle(lang: Lang): I18n {
  return (bundles[lang] ??= makeBundle(lang));
}

export const langStore = createStore<Lang>(deviceLang());
/** True if the user picked a language explicitly on this device (otherwise it follows the device / account). */
let explicitChoice = false;

export function deviceLang(): Lang {
  try {
    const tags = getLocales().map((l) => l.languageTag);
    return pickLang(tags.join(','));
  } catch {
    return 'ru';
  }
}

export function getLang(): Lang {
  return langStore.get();
}

export function hasExplicitLang() {
  return explicitChoice;
}

/** Current bundle, for code outside React render (alerts, error messages). */
export function i18n(): I18n {
  return bundle(langStore.get());
}

/** Translation + locale-aware formatting; re-renders on language change (identity changes per language). */
export function useI18n(): I18n {
  return bundle(useStore(langStore, (s) => s));
}

export async function loadLang(): Promise<Lang> {
  try {
    const saved = await SecureStore.getItemAsync(LANG_KEY);
    if (saved === 'ru' || saved === 'uk' || saved === 'cs' || saved === 'en') {
      explicitChoice = true;
      langStore.set(saved);
    }
  } catch {
    // storage unavailable — keep device language
  }
  return langStore.get();
}

/** Switches the UI language. `persist` = the user's explicit choice (saved on the device). */
export async function setLang(lang: Lang, persist = true) {
  if (persist) {
    explicitChoice = true;
    try {
      await SecureStore.setItemAsync(LANG_KEY, lang);
    } catch {
      // ignore
    }
  }
  if (langStore.get() !== lang) langStore.set(lang);
}
