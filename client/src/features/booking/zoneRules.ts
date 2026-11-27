import type { FloorZone } from '../../api/types';

/** The zone (Admin → Space Zones) a desk is in, if any. */
export const zoneOfSeat = (zones: FloorZone[], seatId: string) => zones.find((z) => z.seatIds.includes(seatId));

/**
 * Whether a member may book a desk: desks outside every zone are open to all; a zone's desks are
 * only for its teams, departments or business units. Matches the server.
 */
export function mayBook(zones: FloorZone[], seatId: string, memberId: string | null | undefined) {
  const zone = zoneOfSeat(zones, seatId);
  return !zone || (!!memberId && zone.memberIds.includes(memberId));
}

/** "Platform", "Platform and Design", "Platform, Design and Data". */
export const andList = (names: string[]) => (names.length < 2 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`);

/** Who a zone is for: "the Platform team", "the Platform and Design teams". */
export function zoneFor(zone: FloorZone) {
  const noun = { team: 'team', department: 'department', 'business-unit': 'business unit' }[zone.level];
  return `the ${andList(zone.unitNames)} ${noun}${zone.unitNames.length > 1 ? 's' : ''}`;
}
