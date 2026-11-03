import type { Key } from './i18n';

export interface Country {
  iso: 'CZ' | 'SK' | 'UA' | 'PL' | 'RU' | 'BY' | 'MD' | 'GE' | 'DE';
  code: string; // without "+"
  flag: string;
  /** "#" = digit; other chars are inserted as typed. */
  mask: string;
  /** Accepted national number lengths. */
  lengths: number[];
}

export const COUNTRIES: Country[] = [
  { iso: 'CZ', code: '420', flag: '🇨🇿', mask: '### ### ###', lengths: [9] },
  { iso: 'SK', code: '421', flag: '🇸🇰', mask: '### ### ###', lengths: [9] },
  { iso: 'UA', code: '380', flag: '🇺🇦', mask: '## ### ## ##', lengths: [9] },
  { iso: 'PL', code: '48', flag: '🇵🇱', mask: '### ### ###', lengths: [9] },
  { iso: 'RU', code: '7', flag: '🇷🇺', mask: '### ###-##-##', lengths: [10] },
  { iso: 'BY', code: '375', flag: '🇧🇾', mask: '## ###-##-##', lengths: [9] },
  { iso: 'MD', code: '373', flag: '🇲🇩', mask: '## ### ###', lengths: [8] },
  { iso: 'GE', code: '995', flag: '🇬🇪', mask: '### ## ## ##', lengths: [9] },
  { iso: 'DE', code: '49', flag: '🇩🇪', mask: '### ########', lengths: [10, 11] },
];

export const DEFAULT_COUNTRY = COUNTRIES[0];

export const countryName = (c: Country) => `country.${c.iso}` as Key;

export const maxLength = (c: Country) => Math.max(...c.lengths);

/** Applies the country mask to national digits: CZ "777123456" → "777 123 456". */
export function maskDigits(c: Country, digits: string): string {
  let out = '';
  let i = 0;
  for (const ch of c.mask) {
    if (i >= digits.length) break;
    if (ch === '#') out += digits[i++];
    else out += ch;
  }
  return out + digits.slice(i);
}

/** Example number for the placeholder, e.g. CZ → "777 123 456". */
export function placeholder(c: Country): string {
  const sample = c.iso === 'CZ' ? '777123456' : '123456789012'.slice(0, maxLength(c));
  return maskDigits(c, sample);
}

/**
 * Normalizes typed/pasted input. A pasted international number ("+380 67…", "00420…") switches the
 * country; a leading national "0" (UA/DE…) or "8" (RU) is dropped.
 */
export function parseInput(current: Country, text: string): { country: Country; digits: string } {
  let d = text.replace(/\D/g, '');
  const intl = /^\s*(\+|00)/.test(text);
  if (intl) {
    if (text.trim().startsWith('00')) d = d.slice(2);
    const match = [...COUNTRIES].sort((a, b) => b.code.length - a.code.length).find((c) => d.startsWith(c.code));
    if (match) return { country: match, digits: d.slice(match.code.length).slice(0, maxLength(match)) };
  }
  const max = maxLength(current);
  if (d.length > max && d.startsWith(current.code)) d = d.slice(current.code.length);
  if (current.iso === 'RU' && d.length > max && d.startsWith('8')) d = d.slice(1);
  if (d.startsWith('0') && current.iso !== 'RU') d = d.replace(/^0+/, '');
  return { country: current, digits: d.slice(0, max) };
}

export const isComplete = (c: Country, digits: string) => c.lengths.includes(digits.length);

export const toE164 = (c: Country, digits: string) => `+${c.code}${digits}`;
