/** Language-independent helpers. Locale-aware date/number/price formatting lives in `useI18n()` (lib/i18n.ts). */

/** Pretty-prints an E.164 number: "+420777123456" → "+420 777 123 456", "+77011234567" → "+7 701 123-45-67". */
export function formatPhone(p: string): string {
  const d = p.replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('7')) {
    return `+7 ${d.slice(1, 4)} ${d.slice(4, 7)}-${d.slice(7, 9)}-${d.slice(9)}`;
  }
  for (const code of ['420', '421', '380', '375', '373', '995', '48', '49']) {
    if (d.startsWith(code) && d.length > code.length + 6) {
      const rest = d.slice(code.length);
      return `+${code} ${rest.replace(/(\d{3})(?=\d)/g, '$1 ').trim()}`;
    }
  }
  return p;
}

/** Parses "1 250 000" / "2,5" → number | undefined */
export function parseNumber(s: string): number | undefined {
  const t = s.replace(/[\s\u00a0\u202f]/g, '').replace(',', '.');
  if (t === '' || t === '.' || t === '-') return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

/** Local calendar day key, for grouping messages. */
export function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}
