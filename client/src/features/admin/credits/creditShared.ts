import type { CreditOverview } from '../../../api/types';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Days until the next 30-day allotment ("20 Days left"). */
export function daysLeft(o: Pick<CreditOverview, 'cycleStart' | 'cycleDays'>, now = new Date()) {
  const [y, m, d] = o.cycleStart.split('-').map(Number);
  const end = new Date(y, m - 1, d + o.cycleDays);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.max(0, Math.round((end.getTime() - today.getTime()) / DAY_MS));
}
export const daysLeftText = (n: number) => `${n} ${n === 1 ? 'Day' : 'Days'} left`;

/** "1,230" */
export const credits = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 1 });

/** Used out of a limit, as a whole percentage (a limit of 0 with anything used counts as full). */
export const percentOf = (used: number, limit: number) => (limit > 0 ? Math.round((used / limit) * 100) : used > 0 ? 100 : 0);
