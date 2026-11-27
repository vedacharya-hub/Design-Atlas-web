/* Status, dates and labels for My Bookings. */
import type { BookingPerson, MyBooking, MyBookingKind } from '../../api/types';

export type BookingStatus = 'active' | 'ongoing' | 'completed' | 'cancelled';

const fromKey = (key: string, minutes = 0) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, 0, minutes);
};

/** Active until it starts, ongoing while it runs, then completed; cancelled stays cancelled. */
export function statusOf(b: MyBooking, now: Date): BookingStatus {
  if (b.cancelled) return 'cancelled';
  if (now < fromKey(b.dates[0], b.start)) return 'active';
  if (now < fromKey(b.dates[b.dates.length - 1], b.end)) return 'ongoing';
  return 'completed';
}

/** Team desks call a booking that hasn't started "upcoming", as in the design; the rest "active". */
export function statusLabel(b: MyBooking, status: BookingStatus) {
  if (status === 'active') return b.kind === 'team-desks' ? 'UPCOMING' : 'ACTIVE';
  return status.toUpperCase();
}

/** Guests can be invited while a meeting room or private office you booked hasn't started. */
export const canInvite = (b: MyBooking, status: BookingStatus) => b.guestsAllowed && status === 'active';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "16 September, 2026"; "14 Sep - 15 Sep, 2026" for days in a row; "14, 16 & 18 Sep, 2026" otherwise. */
export function formatDates(keys: string[]) {
  const ds = keys.map((k) => fromKey(k));
  const first = ds[0];
  const last = ds[ds.length - 1];
  if (ds.length === 1) return `${first.getDate()} ${MONTHS_LONG[first.getMonth()]}, ${first.getFullYear()}`;
  const short = (d: Date, year = false) => `${d.getDate()} ${MONTHS[d.getMonth()]}${year ? `, ${d.getFullYear()}` : ''}`;
  const sameYear = first.getFullYear() === last.getFullYear();
  const consecutive = ds.every((d, i) => i === 0 || Math.round((d.getTime() - ds[i - 1].getTime()) / 86_400_000) === 1);
  if (consecutive) return `${short(first, !sameYear)} - ${short(last)}, ${last.getFullYear()}`;
  const sameMonth = sameYear && ds.every((d) => d.getMonth() === first.getMonth());
  const parts = ds.map((d) => (sameMonth ? String(d.getDate()) : short(d)));
  const list = `${parts.slice(0, -1).join(', ')} & ${parts[parts.length - 1]}`;
  return sameMonth ? `${list} ${MONTHS[first.getMonth()]}, ${first.getFullYear()}` : `${list}, ${last.getFullYear()}`;
}

/** "4:00 PM" */
export function formatTime(minutes: number) {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

/** "All Day (9:00 AM - 8:00 PM)" or "4:00 PM - 6:00 PM (2 Hours)". */
export function formatHours(b: MyBooking) {
  const range = `${formatTime(b.start)} - ${formatTime(b.end)}`;
  if (b.allDay) return `All Day (${range})`;
  const mins = b.end - b.start;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const length = m === 0 ? `${h} ${h === 1 ? 'Hour' : 'Hours'}` : h === 0 ? `${m} Min` : `${h} Hr ${m} Min`;
  return `${range} (${length})`;
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export const PEOPLE_LABEL: Record<MyBookingKind, string | null> = {
  'meeting-room': 'Attendees',
  'shared-desk': null,
  'office-desk': null,
  'team-desks': 'Members',
  'private-office': 'Members',
};

export const avatarUrl = (p: BookingPerson) => (p.avatar ? (p.avatar.startsWith('data:') ? p.avatar : `/admin/avatars/${p.avatar}`) : null);

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

/** "SEPTEMBER 2026" */
export const monthLabel = (key: string) => {
  const d = fromKey(key);
  return `${MONTHS_LONG[d.getMonth()].toUpperCase()} ${d.getFullYear()}`;
};

export const weekday = (key: string) => fromKey(key).toLocaleDateString('en-IN', { weekday: 'short' }).toUpperCase();
export const dayOfMonth = (key: string) => fromKey(key).getDate();
export const dateFromKey = fromKey;
