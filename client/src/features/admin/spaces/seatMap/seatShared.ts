import type { AdminSeat } from '../../../../api/types';
import { dateFromKey, ordinal } from '../../events/eventShared';

/** A desk on the map while editing: saved desks keep their id, new ones get "new-1", "new-2"… */
export type MapSeat = AdminSeat & { isNew?: boolean };

/** The floor plan's own proportions (575.94 × 560.27): seat x/y are percentages of it. */
export const PLAN_RATIO = 560.27 / 575.94;

/**
 * A space type's letters on the map: D for desks, M for meeting rooms, FB for phone booths and C for
 * cabins; any other type goes by its initials ("Focus Pod" → FP). Matches the server.
 */
export function seatPrefix(spaceType: string): string {
  const t = spaceType.toLowerCase();
  if (t.includes('meeting')) return 'M';
  if (t.includes('phone') || t.includes('booth')) return 'FB';
  if (t.includes('cabin')) return 'C';
  if (t.includes('desk')) return 'D';
  const initials = spaceType
    .trim()
    .split(/\s+/)
    .map((w) => w.replace(/[^a-z]/gi, '')[0] ?? '')
    .join('')
    .toUpperCase()
    .slice(0, 3);
  return initials || 'D';
}

/** The next label for a type: its letters and one past the highest number using them ("D61", "M1"). Matches the server. */
export function nextSeatLabel(seats: Pick<AdminSeat, 'label'>[], spaceType: string): string {
  const prefix = seatPrefix(spaceType);
  const used = seats
    .map((s) => /^([a-z]+)(\d+)$/i.exec(s.label))
    .filter((m): m is RegExpExecArray => !!m && m[1].toUpperCase() === prefix)
    .map((m) => Number(m[2]));
  return `${prefix}${Math.max(0, ...used) + 1}`;
}

/** Meeting rooms and phone booths stay open to everyone; desks, cabins and the rest can be someone's permanent seat. */
export const canKeepFor = (spaceType: string) => !['M', 'FB'].includes(seatPrefix(spaceType));

/** What to call a space in a sentence: "Seat D5", "Meeting Room M1", "Phone Booth FB1", "Cabin C1". */
export function spaceNoun(spaceType: string) {
  return ({ D: 'Seat', M: 'Meeting Room', FB: 'Phone Booth', C: 'Cabin' } as Record<string, string>)[seatPrefix(spaceType)] ?? 'Space';
}

/** The zone of the desk nearest a point on the plan: a new desk joins the bay it was dropped in. */
export function nearestZone(seats: Pick<AdminSeat, 'x' | 'y' | 'zone'>[], x: number, y: number, fallback: string): string {
  let best = fallback;
  let bestD = Infinity;
  for (const s of seats) {
    // y is a percentage of a slightly shorter side; weigh it so distances are true on the plan.
    const d = (s.x - x) ** 2 + ((s.y - y) * PLAN_RATIO) ** 2;
    if (d < bestD) {
      bestD = d;
      best = s.zone;
    }
  }
  return best;
}

/** "12th July, 2025" */
export function seatDate(key: string) {
  const d = dateFromKey(key);
  return `${ordinal(d.getDate())} ${d.toLocaleDateString('en-US', { month: 'long' })}, ${d.getFullYear()}`;
}

/** "Assigned since May 2025", or "Assigned from Jul 2026" when it starts later. */
export function assignedSince(key: string, today: string) {
  const d = dateFromKey(key);
  const when = `${d.toLocaleDateString('en-US', { month: 'short' })} ${d.getFullYear()}`;
  return key > today ? `Assigned from ${when}` : `Assigned since ${when}`;
}

/** "WeWork Vaishnavi Signature • 2nd floor" */
export const seatPlace = (building: string, floor: string) => `${building} • ${floor}`;
