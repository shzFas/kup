import { formatNumber } from '@kup/shared';

const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const MONTHS_NOM = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];

const pad = (n: number) => String(n).padStart(2, '0');

export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOfDay(now) - startOfDay(d)) / 86400000);
  if (diffDays === 0) return `Сегодня, ${time}`;
  if (diffDays === 1) return `Вчера, ${time}`;
  const base = `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  return d.getFullYear() === now.getFullYear() ? base : `${base} ${d.getFullYear()}`;
}

export function formatMonthYear(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${MONTHS_NOM[d.getMonth()]} ${d.getFullYear()}`;
}

export function plural(n: number, forms: [string, string, string]): string {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return forms[2];
  if (b > 1 && b < 5) return forms[1];
  if (b === 1) return forms[0];
  return forms[2];
}

export function listingsCount(n: number): string {
  return `${formatNumber(n)} ${plural(n, ['объявление', 'объявления', 'объявлений'])}`;
}

/** "+77011234567" → "+7 701 123-45-67" */
export function formatPhone(p: string): string {
  const d = p.replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('7')) {
    return `+7 ${d.slice(1, 4)} ${d.slice(4, 7)}-${d.slice(7, 9)}-${d.slice(9)}`;
  }
  return p;
}

/** Parses "1 250 000" / "2,5" → number | undefined */
export function parseNumber(s: string): number | undefined {
  const t = s.replace(/[\s  ]/g, '').replace(',', '.');
  if (t === '' || t === '.' || t === '-') return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}
