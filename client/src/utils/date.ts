const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}

/** e.g. "Fri, 18th June, 2026" */
export function formatFull(d: Date): string {
  return `${WEEKDAYS[d.getDay()]}, ${ordinal(d.getDate())} ${MONTHS[d.getMonth()]}, ${d.getFullYear()}`;
}

/** e.g. "18th June" */
export function formatShort(d: Date): string {
  return `${ordinal(d.getDate())} ${MONTHS[d.getMonth()]}`;
}

/** ISO yyyy-mm-dd in local time (avoids UTC off-by-one). */
export function toISODate(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Parses an ISO yyyy-mm-dd string as a local-time Date (inverse of toISODate). */
export function fromISODate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}
