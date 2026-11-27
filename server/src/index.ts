import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  floors,
  companyShifts,
  nextCompanyShiftNumber,
  members,
  bookings,
  seatsByFloor,
  floorShifts,
  shiftColorPalette,
  companyCredits,
  orgUnits,
  creditGroups,
  creditAllocationSettings,
  meetingRooms,
  roomDailyBusy,
  roomBookings,
  ROOM_HOURS,
  buildingEvents,
  desks,
  deskBookings,
  nextDeskBookingId,
  nextDeskReference,
  favouriteDesks,
  privateOffices,
  officeBookings,
  nextOfficeBookingId,
  announcements,
  nextAnnouncementNumber,
  adminEvents,
  nextAdminEventNumber,
  adminUsers,
  nextAdminUserNumber,
  adminUserDefaults,
  workLocations,
  businessUnits,
  departments,
  teams,
  nextOrgNumber,
  bookingHistory,
  companyBookingHistory,
  historyDates,
  adminBuildings,
  nextBuildingNumber,
  adminSpaces,
  nextSpaceNumber,
  defaultSpaceBooking,
  spaceTypes,
  nextSpaceTypeNumber,
  adminRoles,
  nextRoleNumber,
  adminAccessLevels,
  nextAccessLevelNumber,
  nextLocationCode,
  companySettings,
  creditCycle,
  overageSettings,
  teamOverage,
  WORKSPACE_PERMISSIONS,
  SYSTEM_PERMISSIONS,
  seatPrefix,
} from './data/seed.js';
import type {
  CoworkingPermissions,
  Booking,
  FilterOptions,
  RecurrenceRule,
  BookingAssignment,
  FloorShift,
  CreditGroup,
  RoomBooking,
  DeskBooking,
  DeskOption,
  OfficeBooking,
  Announcement,
  AnnouncementStatus,
  AdminEvent,
  AdminEventStatus,
  AdminEventView,
  AdminUser,
  MembershipTag,
  UserStatus,
  OrgKind,
  BulkUserRow,
  BulkUploadJob,
  BookingPerson,
  MyBooking,
  AdminBuilding,
  AdminAccessLevel,
  CompanyShift,
  AdminSpace,
  AdminSpaceView,
  SpaceBookingSettings,
  SpaceStatus,
  SpaceType,
  AdminRole,
  Seat,
  AdminSeat,
  AdminSeatMap,
  SpaceZone,
  SpaceZoneView,
  ZoneColor,
  ZoneLevel,
} from './types.js';

const app = express();
const PORT = process.env.PORT ?? 4000;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

app.use(cors());
// Event photos travel as data URLs, so bodies can run to a few megabytes.
app.use(express.json({ limit: '15mb' }));
// Floor-plan image and other static assets.
app.use(express.static(path.join(__dirname, '..', 'public')));

let bookingSeq = 1;

/** Filter options for the sub-header dropdowns. */
app.get('/api/filters', (_req, res) => {
  const options: FilterOptions = {
    buildings: [...new Set(floors.map((f) => f.building))],
    floors: floors.map((f) => ({ id: f.id, label: f.floorLabel, building: f.building })),
    offices: floors.map((f) => ({ floorId: f.id, officeNo: f.officeNo })),
    // The company's active shifts, in the order they were added.
    shifts: companyShifts.filter((s) => s.status === 'active').map((s) => ({ id: s.id, label: `${s.name} - ${clockLabel(s.startTime)}` })),
  };
  res.json(options);
});

app.get('/api/floors/:id', (req, res) => {
  const floor = floors.find((f) => f.id === req.params.id);
  if (!floor) return res.status(404).json({ error: 'Floor not found' });
  res.json(floor);
});

/**
 * A seat as members see it: a permanent seat (Admin → Space Map) is taken for everyone else, and who
 * it is kept for stays with the admins.
 */
const publicSeat = ({ assignment, notes: _notes, ...seat }: Seat): Seat => (assignment ? { ...seat, status: 'unavailable' } : seat);

/** Seats for a floor, optionally filtered by zone. */
app.get('/api/floors/:id/seats', (req, res) => {
  const seats = seatsByFloor[req.params.id];
  if (!seats) return res.status(404).json({ error: 'Floor not found' });
  const zone = req.query.zone as string | undefined;
  res.json((zone && zone !== 'all' ? seats.filter((s) => s.zone === zone) : seats).map(publicSeat));
});

/** Shifts configured for a floor's "Shifts" admin tab. */
app.get('/api/floors/:id/shifts', (req, res) => {
  if (!floors.some((f) => f.id === req.params.id)) return res.status(404).json({ error: 'Floor not found' });
  res.json(floorShifts[req.params.id] ?? []);
});

/** Turns the "Shifts" admin tab on/off for a floor without discarding its shifts. */
app.patch('/api/floors/:id/shifts-enabled', (req, res) => {
  const floor = floors.find((f) => f.id === req.params.id);
  if (!floor) return res.status(404).json({ error: 'Floor not found' });
  const { enabled } = req.body as { enabled?: boolean };
  if (typeof enabled !== 'boolean') return res.status(400).json({ error: '"enabled" must be a boolean.' });
  floor.shiftsEnabled = enabled;
  res.json(floor);
});

let shiftSeq = Object.values(floorShifts).reduce((n, list) => n + list.length, 0) + 1;

app.post('/api/floors/:id/shifts', (req, res) => {
  const floorId = req.params.id;
  if (!floors.some((f) => f.id === floorId)) return res.status(404).json({ error: 'Floor not found' });
  const { name, startTime, endTime, color } = req.body as Partial<FloorShift>;
  if (!name || !startTime || !endTime) {
    return res.status(400).json({ error: 'name, startTime and endTime are required.' });
  }
  const list = floorShifts[floorId] ?? (floorShifts[floorId] = []);
  const shift: FloorShift = {
    id: `fshift-${shiftSeq++}`,
    floorId,
    name,
    startTime,
    endTime,
    color: color || shiftColorPalette[list.length % shiftColorPalette.length],
    seatIds: [],
    enabled: true,
  };
  list.push(shift);
  res.status(201).json(shift);
});

app.put('/api/floors/:id/shifts/:shiftId', (req, res) => {
  const list = floorShifts[req.params.id];
  const shift = list?.find((s) => s.id === req.params.shiftId);
  if (!shift) return res.status(404).json({ error: 'Shift not found' });
  const { name, startTime, endTime, color, seatIds, enabled } = req.body as Partial<FloorShift>;
  if (name !== undefined) shift.name = name;
  if (startTime !== undefined) shift.startTime = startTime;
  if (endTime !== undefined) shift.endTime = endTime;
  if (color !== undefined) shift.color = color;
  if (seatIds !== undefined) shift.seatIds = seatIds;
  if (enabled !== undefined) shift.enabled = enabled;
  res.json(shift);
});

app.delete('/api/floors/:id/shifts/:shiftId', (req, res) => {
  const list = floorShifts[req.params.id];
  const idx = list?.findIndex((s) => s.id === req.params.shiftId) ?? -1;
  if (idx < 0 || !list) return res.status(404).json({ error: 'Shift not found' });
  list.splice(idx, 1);
  res.status(204).end();
});

/** Company-wide credit usage for the admin "Credits" tab. */
app.get('/api/credits', (_req, res) => {
  res.json(companyCredits);
});

/** Whether the "Credit Allocation" admin tab is turned on. */
app.get('/api/credit-allocation-settings', (_req, res) => {
  res.json(creditAllocationSettings);
});

const MIN_OVERAGE_LIMIT = 50;

app.patch('/api/credit-allocation-settings', (req, res) => {
  const { enabled, totalCreditLimit, overageManagementEnabled, overageLimit } = req.body as Partial<{
    enabled: boolean;
    totalCreditLimit: number;
    overageManagementEnabled: boolean;
    overageLimit: number;
  }>;
  const nextOverageLimit = overageLimit ?? creditAllocationSettings.overageLimit;
  const overageManagementWillBeOn = overageManagementEnabled ?? creditAllocationSettings.overageManagementEnabled;
  if (overageManagementWillBeOn && nextOverageLimit < MIN_OVERAGE_LIMIT) {
    return res.status(400).json({ error: `"overageLimit" must be at least ${MIN_OVERAGE_LIMIT} while overage management is on.` });
  }
  if (enabled !== undefined) creditAllocationSettings.enabled = enabled;
  if (totalCreditLimit !== undefined) creditAllocationSettings.totalCreditLimit = totalCreditLimit;
  if (overageManagementEnabled !== undefined) creditAllocationSettings.overageManagementEnabled = overageManagementEnabled;
  if (overageLimit !== undefined) creditAllocationSettings.overageLimit = overageLimit;
  res.json(creditAllocationSettings);
});

/** The Business Unit → Department → Team hierarchy credits can be allotted to. */
app.get('/api/org-units', (_req, res) => {
  res.json(orgUnits);
});

/** Dedicated credit allocations ("credit groups"). A unit with none draws from its parent's pool. */
app.get('/api/credit-groups', (_req, res) => {
  res.json(creditGroups);
});

let creditGroupSeq = creditGroups.length + 1;

app.post('/api/credit-groups', (req, res) => {
  const { orgUnitId, allocatedCredits, overageCap } = req.body as Partial<CreditGroup>;
  if (!orgUnitId || typeof allocatedCredits !== 'number') {
    return res.status(400).json({ error: 'orgUnitId and allocatedCredits are required.' });
  }
  if (!orgUnits.some((u) => u.id === orgUnitId)) return res.status(404).json({ error: 'Org unit not found' });
  if (creditGroups.some((g) => g.orgUnitId === orgUnitId)) {
    return res.status(409).json({ error: 'This org unit already has a credit group — edit it instead.' });
  }
  const group: CreditGroup = {
    id: `cg-${creditGroupSeq++}`,
    orgUnitId,
    allocatedCredits,
    usedCredits: 0,
    ...(overageCap !== undefined ? { overageCap } : {}),
  };
  creditGroups.push(group);
  res.status(201).json(group);
});

app.put('/api/credit-groups/:id', (req, res) => {
  const group = creditGroups.find((g) => g.id === req.params.id);
  if (!group) return res.status(404).json({ error: 'Credit group not found' });
  const { allocatedCredits, overageCap } = req.body as Partial<CreditGroup> & { overageCap?: number | null };
  if (allocatedCredits !== undefined) group.allocatedCredits = allocatedCredits;
  if (overageCap !== undefined) {
    if (overageCap === null) delete group.overageCap;
    else group.overageCap = overageCap;
  }
  res.json(group);
});

app.delete('/api/credit-groups/:id', (req, res) => {
  const idx = creditGroups.findIndex((g) => g.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error: 'Credit group not found' });
  creditGroups.splice(idx, 1);
  res.status(204).end();
});

/** Searchable member directory. Current user is always returned first. */
app.get('/api/members', (req, res) => {
  const q = (req.query.query as string | undefined)?.toLowerCase().trim();
  const filtered = q
    ? members.filter((m) => m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q))
    : members;
  res.json([...filtered].sort((a, b) => Number(!!b.isCurrentUser) - Number(!!a.isCurrentUser)));
});

app.get('/api/bookings', (_req, res) => {
  res.json(bookings);
});

/** Desk-page bookings cancelled (by an admin, or with their shift or zone): they stay listed as cancelled. */
const cancelledFloorBookings: Booking[] = [];
let cancelledFloorSeq = 1;

/** Desks no longer booked by anyone on the floor are free again. */
function freeSeats(floorId: string, seatIds: string[]) {
  for (const id of seatIds) {
    const seat = seatsByFloor[floorId]?.find((s) => s.id === id);
    const stillBooked = bookings.some((b) => b.floorId === floorId && b.assignments.some((a) => a.seatId === id));
    if (seat?.status === 'unavailable' && !stillBooked) seat.status = 'available';
  }
}

interface CreateBookingBody {
  floorId: string;
  shift: string;
  date: string;
  mode: 'self' | 'others';
  assignments: BookingAssignment[];
  recurrence?: RecurrenceRule;
}

app.post('/api/bookings', (req, res) => {
  const body = req.body as CreateBookingBody;
  const { floorId, shift, date, mode, assignments, recurrence } = body ?? {};

  if (!floorId || !shift || !date || !mode || !Array.isArray(assignments) || assignments.length === 0) {
    return res.status(400).json({ error: 'Missing required booking fields.' });
  }
  if (mode === 'others' && recurrence) {
    return res.status(400).json({ error: 'Recurring bookings support a single person only.' });
  }
  // Only the company's active shifts (Admin → Company Settings → Shift Management) can be booked.
  if (!companyShifts.some((s) => s.id === shift && s.status === 'active')) {
    return res.status(400).json({ error: 'That shift isn’t open for booking.' });
  }

  const seats = seatsByFloor[floorId];
  if (!seats) return res.status(404).json({ error: 'Floor not found' });

  // Validate availability of every assigned seat.
  const unavailable = assignments.filter((a) => {
    const seat = seats.find((s) => s.id === a.seatId);
    // A permanent seat is kept for its person: nobody else books it.
    return !seat || seat.status === 'unavailable' || !!seat.assignment;
  });
  if (unavailable.length > 0) {
    return res.status(409).json({
      error: 'One or more selected seats are no longer available.',
      seatIds: unavailable.map((a) => a.seatId),
    });
  }

  // A desk in a zone (Admin → Space Zones) is only for its team, department or business unit.
  for (const a of assignments) {
    const seat = seats.find((s) => s.id === a.seatId)!;
    const zone = seatZone(floorId, seat);
    if (!zone || inZoneUnit(directoryEntry(a.memberId), zone)) continue;
    const who = members.find((m) => m.id === a.memberId);
    return res.status(403).json({
      error: `${seat.label} is in ${zone.name}, a restricted zone for ${andList(activeZoneUnits(zone).map((u) => u.name))}.${who ? `${who.isCurrentUser ? 'You' : who.name} can’t book it` : 'Pick another seat'}.`,
      seatIds: [seat.id],
    });
  }

  // Commit: mark seats unavailable.
  for (const a of assignments) {
    const seat = seats.find((s) => s.id === a.seatId)!;
    seat.status = 'unavailable';
  }

  const booking: Booking = {
    id: `B-${String(bookingSeq++).padStart(4, '0')}`,
    floorId,
    shift,
    date,
    mode,
    assignments,
    recurrence,
    createdAt: new Date().toISOString(),
  };
  bookings.push(booking);
  res.status(201).json(booking);
});

let roomBookingSeq = 1;

interface RoomSlot {
  date: string;
  start: number;
  end: number;
  guests: number;
}

/** Validates a date/start/duration/guests request; returns the slot or an error message. */
function parseRoomSlot(input: { date?: unknown; start?: unknown; duration?: unknown; guests?: unknown }): RoomSlot | string {
  const date = String(input.date ?? '');
  const start = Number(input.start);
  const duration = Number(input.duration);
  const guests = Number(input.guests);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return 'A date (YYYY-MM-DD) is required.';
  if (!Number.isInteger(start) || !Number.isInteger(duration) || duration <= 0) return 'A start time and duration are required.';
  if (!Number.isInteger(guests) || guests < 1) return 'Number of guests is required.';
  const end = start + duration;
  if (start < ROOM_HOURS.open || end > ROOM_HOURS.close) return 'Meeting rooms are open 8:00 AM - 10:00 PM.';
  return { date, start, end, guests };
}

/** `ignoreBookingId` lets a booking be checked against everything except itself (rescheduling). */
function isRoomFree(roomId: string, slot: RoomSlot, ignoreBookingId?: string) {
  const overlaps = (s: number, e: number) => s < slot.end && slot.start < e;
  const daily = roomDailyBusy[roomId] ?? [];
  return (
    !daily.some(([s, e]) => overlaps(s, e)) &&
    !roomBookings.some((b) => b.id !== ignoreBookingId && b.roomId === roomId && b.date === slot.date && overlaps(b.start, b.end))
  );
}

const ROOM_SLOT_STEP = 30;
const minutesNow = () => {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
};

/** Rooms that fit the group and are free for the whole slot, smallest suitable room first. */
app.get('/api/meeting-rooms/availability', (req, res) => {
  const slot = parseRoomSlot(req.query);
  if (typeof slot === 'string') return res.status(400).json({ error: slot });
  const rooms = meetingRooms
    .filter((r) => r.capacity >= slot.guests && isRoomFree(r.id, slot))
    .sort((a, b) => a.capacity - b.capacity || a.creditsPerHour - b.creditsPerHour);
  res.json({ ...slot, rooms });
});

app.get('/api/meeting-rooms/bookings', (_req, res) => {
  res.json({ bookings: roomBookings, rooms: meetingRooms });
});

/**
 * Other start times, every 30 minutes, at which a booking's room is free for the same duration on
 * the same day (later than now when the booking is today).
 */
app.get('/api/meeting-rooms/bookings/:id/slots', (req, res) => {
  const booking = roomBookings.find((b) => b.id === req.params.id);
  if (!booking) return res.status(404).json({ error: 'Booking not found.' });
  const room = meetingRooms.find((r) => r.id === booking.roomId)!;
  const duration = booking.end - booking.start;
  const earliest = booking.date === todayKey() ? Math.ceil(minutesNow() / ROOM_SLOT_STEP) * ROOM_SLOT_STEP : ROOM_HOURS.open;
  const slots: number[] = [];
  for (let start = Math.max(ROOM_HOURS.open, earliest); start + duration <= ROOM_HOURS.close; start += ROOM_SLOT_STEP) {
    const slot = { date: booking.date, start, end: start + duration, guests: booking.guests };
    if (start !== booking.start && isRoomFree(room.id, slot, booking.id)) slots.push(start);
  }
  res.json({ booking, room, slots });
});

/** Reschedule: same room, date and duration; only the start time moves. */
app.patch('/api/meeting-rooms/bookings/:id', (req, res) => {
  const booking = roomBookings.find((b) => b.id === req.params.id);
  if (!booking) return res.status(404).json({ error: 'Booking not found.' });
  const room = meetingRooms.find((r) => r.id === booking.roomId)!;
  const start = Number(req.body?.start);
  const duration = booking.end - booking.start;
  if (!Number.isInteger(start) || start < ROOM_HOURS.open || start + duration > ROOM_HOURS.close) {
    return res.status(400).json({ error: 'Meeting rooms are open 8:00 AM - 10:00 PM.' });
  }
  if (booking.date === todayKey() && start < minutesNow()) return res.status(400).json({ error: 'That time has already passed.' });
  const slot = { date: booking.date, start, end: start + duration, guests: booking.guests };
  if (!isRoomFree(room.id, slot, booking.id)) return res.status(409).json({ error: `${room.name} is no longer free at that time.` });
  booking.start = slot.start;
  booking.end = slot.end;
  res.json({ booking, room });
});

/** Cancelled room bookings stay listed in My Bookings. */
const cancelledRoomBookings: RoomBooking[] = [];

app.delete('/api/meeting-rooms/bookings/:id', (req, res) => {
  const i = roomBookings.findIndex((b) => b.id === req.params.id);
  if (i < 0) return res.status(404).json({ error: 'Booking not found.' });
  const [removed] = roomBookings.splice(i, 1);
  cancelledRoomBookings.push(removed);
  res.json({ booking: removed, room: meetingRooms.find((r) => r.id === removed.roomId) });
});

app.post('/api/meeting-rooms/bookings', (req, res) => {
  const slot = parseRoomSlot(req.body ?? {});
  if (typeof slot === 'string') return res.status(400).json({ error: slot });
  const room = meetingRooms.find((r) => r.id === req.body?.roomId);
  if (!room) return res.status(404).json({ error: 'Meeting room not found.' });
  if (room.capacity < slot.guests) return res.status(400).json({ error: `${room.name} seats up to ${room.capacity}.` });
  if (!isRoomFree(room.id, slot)) return res.status(409).json({ error: `${room.name} is no longer free for that time.` });

  const booking: RoomBooking = {
    id: `MR-${String(roomBookingSeq++).padStart(4, '0')}`,
    roomId: room.id,
    ...slot,
    credits: (room.creditsPerHour * (slot.end - slot.start)) / 60,
    createdAt: new Date().toISOString(),
  };
  roomBookings.push(booking);
  res.status(201).json({ booking, room });
});

/** Events running at a building on a given date (YYYY-MM-DD), in start-time order. */
app.get('/api/events', (req, res) => {
  const building = String(req.query.building ?? '').trim();
  const date = String(req.query.date ?? '');
  if (!building) return res.status(400).json({ error: 'A building is required.' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'A date (YYYY-MM-DD) is required.' });
  const [y, m, d] = date.split('-').map(Number);
  const weekday = new Date(y, m - 1, d).getDay();
  const events = buildingEvents
    .filter((e) => e.building.toLowerCase() === building.toLowerCase() && e.days.includes(weekday))
    .sort((a, b) => a.start - b.start)
    .map(({ days: _days, ...event }) => event);
  res.json({ building, date, events });
});

// ---------- Desk booking (Iris) ----------
// All desk endpoints act for the signed-in member.
const CURRENT_MEMBER = members.find((m) => m.isCurrentUser)?.id ?? 'u-001';
const isDateKey = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const todayKey = () => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/**
 * Colleagues' bookings, simulated deterministically per date: about a third of desks go on weekdays,
 * few at weekends, and the member's own favourite/recent desks are rarely taken by others.
 */
function takenByOthers(deskId: string, date: string) {
  const [y, m, d] = date.split('-').map(Number);
  const weekend = [0, 6].includes(new Date(y, m - 1, d).getDay());
  const personal =
    (favouriteDesks[CURRENT_MEMBER] ?? []).includes(deskId) ||
    deskBookings.some((b) => b.memberId === CURRENT_MEMBER && b.deskId === deskId && b.date < todayKey());
  let h = 2166136261;
  for (const ch of `${date}:${deskId}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const rate = weekend ? 0.1 : personal ? 0.15 : 0.35;
  return ((h >>> 0) % 1000) / 1000 < rate;
}

function isDeskFree(deskId: string, date: string, ignoreBookingId?: string) {
  return (
    !takenByOthers(deskId, date) &&
    !deskBookings.some((b) => b.deskId === deskId && b.date === date && b.id !== ignoreBookingId)
  );
}

const withDesk = (b: DeskBooking) => ({ ...b, desk: desks.find((d) => d.id === b.deskId)! });
/** Cancelled days are kept so the rest of their booking can still be listed with them. */
const cancelledDeskBookings: DeskBooking[] = [];
const deskNumber = (id: string) => Number(id.slice(1));

/** "2026-10-22,2026-10-23" (or a single `date`) → sorted, de-duplicated date keys. */
function readDates(query: Record<string, unknown>): string[] | null {
  const raw = String(query.dates ?? query.date ?? '');
  const dates = [...new Set(raw.split(',').map((d) => d.trim()).filter(Boolean))].sort();
  return dates.length > 0 && dates.every(isDateKey) ? dates : null;
}

/**
 * Desk suggestions for one or more dates. A desk qualifies only if it is free on every date the
 * member still needs (dates they already have a desk on are reported in `existing`). Up to two
 * favourite / recently booked desks come first, then the free desks closest to them: four in total
 * (Iris adds a "choose seats manually" card as the fifth).
 */
app.get('/api/desks/recommendations', (req, res) => {
  const dates = readDates(req.query as Record<string, unknown>);
  if (!dates) return res.status(400).json({ error: 'One or more dates (YYYY-MM-DD) are required.' });

  const mine = deskBookings.filter((b) => b.memberId === CURRENT_MEMBER);
  const existing = mine.filter((b) => dates.includes(b.date));
  const needed = dates.filter((d) => !existing.some((b) => b.date === d));
  const freeOnAll = (deskId: string) => needed.length > 0 && needed.every((d) => isDeskFree(deskId, d));

  const favourites = favouriteDesks[CURRENT_MEMBER] ?? [];
  const recent = [...mine]
    .filter((b) => b.date < todayKey())
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((b) => b.deskId)
    .filter((id, i, all) => all.indexOf(id) === i);

  const options: DeskOption[] = [];
  const unavailable: { deskId: string; kind: 'favourite' | 'recent' }[] = [];
  const consider = (deskId: string, kind: 'favourite' | 'recent', reason: string) => {
    if (options.some((o) => o.desk.id === deskId) || unavailable.some((u) => u.deskId === deskId)) return;
    if (!freeOnAll(deskId)) return void unavailable.push({ deskId, kind });
    if (options.length < 2) options.push({ desk: desks.find((d) => d.id === deskId)!, kind, reason });
  };
  favourites.forEach((id) => consider(id, 'favourite', recent.includes(id) ? 'Favourite · Recently booked' : 'Favourite'));
  recent.slice(0, 2).forEach((id) => consider(id, 'recent', 'Recently booked'));

  const anchorId = options[0]?.desk.id ?? favourites[0] ?? recent[0];
  const anchor = desks.find((d) => d.id === anchorId) ?? desks[0];
  const nearby = desks
    .filter((d) => freeOnAll(d.id) && !options.some((o) => o.desk.id === d.id))
    .sort((a, b) => Number(a.zone !== anchor.zone) - Number(b.zone !== anchor.zone) || Math.abs(a.number - anchor.number) - Math.abs(b.number - anchor.number));
  for (const desk of nearby.slice(0, 4 - options.length)) {
    const gap = Math.abs(desk.number - anchor.number);
    const reason = !anchorId
      ? `${desk.zone} · ${desk.features[0] ?? 'Open desk'}`
      : gap === 1
        ? `Next to ${anchor.id}`
        : desk.zone === anchor.zone
          ? `Same pod as ${anchor.id}`
          : `Near ${anchor.id}`;
    options.push({ desk, kind: 'nearby', reason });
  }

  res.json({
    dates,
    needed,
    existing: existing.map(withDesk),
    favourites,
    recent: recent.slice(0, 2),
    unavailable,
    options,
    freeDesks: desks.filter((d) => freeOnAll(d.id)),
  });
});

/** The member's desk bookings (past and upcoming) and the days they cancelled, each with its desk. */
app.get('/api/desks/bookings', (_req, res) => {
  const mine = (list: DeskBooking[]) =>
    list.filter((b) => b.memberId === CURRENT_MEMBER).sort((a, b) => a.date.localeCompare(b.date)).map(withDesk);
  res.json({ bookings: mine(deskBookings), cancelled: mine(cancelledDeskBookings) });
});

/** Books one desk for one or more dates in a single go (all or nothing). */
app.post('/api/desks/bookings', (req, res) => {
  const { deskId } = req.body ?? {};
  const dates = readDates({ dates: Array.isArray(req.body?.dates) ? req.body.dates.join(',') : req.body?.date });
  if (!dates || dates[0] < todayKey()) return res.status(400).json({ error: 'Pick today or future dates.' });
  const desk = desks.find((d) => d.id === deskId);
  if (!desk) return res.status(404).json({ error: 'Desk not found.' });
  const clash = deskBookings.find((b) => b.memberId === CURRENT_MEMBER && dates.includes(b.date));
  if (clash) return res.status(409).json({ error: `You already have ${clash.deskId} booked on ${clash.date}.`, code: 'member-busy' });
  const takenOn = dates.filter((d) => !isDeskFree(desk.id, d));
  if (takenOn.length) return res.status(409).json({ error: `${desk.id} is no longer free on ${takenOn.join(', ')}.`, code: 'desk-taken' });

  const createdAt = new Date().toISOString();
  const groupId = `DG-${Date.now().toString(36)}`;
  const reference = nextDeskReference();
  const created: DeskBooking[] = dates.map((date) => ({ id: nextDeskBookingId(), deskId: desk.id, memberId: CURRENT_MEMBER, date, groupId, reference, createdAt }));
  deskBookings.push(...created);
  res.status(201).json({ bookings: created.map(withDesk) });
});

/** Reschedule: move a booking to a new date (and optionally a different desk). */
app.patch('/api/desks/bookings/:id', (req, res) => {
  const booking = deskBookings.find((b) => b.id === req.params.id && b.memberId === CURRENT_MEMBER);
  if (!booking) return res.status(404).json({ error: 'Booking not found.' });
  const date = req.body?.date;
  const deskId = req.body?.deskId ?? booking.deskId;
  if (!isDateKey(date) || date < todayKey()) return res.status(400).json({ error: 'Pick today or a future date.' });
  if (!desks.some((d) => d.id === deskId)) return res.status(404).json({ error: 'Desk not found.' });
  const clash = deskBookings.find((b) => b.memberId === CURRENT_MEMBER && b.date === date && b.id !== booking.id);
  if (clash) return res.status(409).json({ error: `You already have ${clash.deskId} booked that day.`, code: 'member-busy' });
  if (!isDeskFree(deskId, date, booking.id)) return res.status(409).json({ error: `${deskId} is not free that day.`, code: 'desk-taken' });

  booking.date = date;
  booking.deskId = deskId;
  res.json(withDesk(booking));
});

app.delete('/api/desks/bookings/:id', (req, res) => {
  const i = deskBookings.findIndex((b) => b.id === req.params.id && b.memberId === CURRENT_MEMBER);
  if (i < 0) return res.status(404).json({ error: 'Booking not found.' });
  const [removed] = deskBookings.splice(i, 1);
  cancelledDeskBookings.push(removed);
  res.json(withDesk(removed));
});

// ---------- Private offices (Iris) ----------
/** Other companies' day bookings, simulated per date: about a quarter of offices go each weekday. */
function officeTakenByOthers(officeId: string, date: string) {
  const [y, m, d] = date.split('-').map(Number);
  if ([0, 6].includes(new Date(y, m - 1, d).getDay())) return false;
  let h = 2166136261;
  for (const ch of `office:${date}:${officeId}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return ((h >>> 0) % 1000) / 1000 < 0.25;
}

function isOfficeFree(officeId: string, date: string, ignoreBookingId?: string) {
  return !officeTakenByOthers(officeId, date) && !officeBookings.some((b) => b.officeId === officeId && b.date === date && b.id !== ignoreBookingId);
}

const withOffice = (b: OfficeBooking) => ({ ...b, office: privateOffices.find((o) => o.id === b.officeId)! });

/** Offices free on every requested date, smallest first. */
app.get('/api/private-offices/availability', (req, res) => {
  const dates = readDates(req.query as Record<string, unknown>);
  if (!dates) return res.status(400).json({ error: 'One or more dates (YYYY-MM-DD) are required.' });
  const offices = privateOffices
    .filter((o) => dates.every((d) => isOfficeFree(o.id, d)))
    .sort((a, b) => a.capacity - b.capacity);
  res.json({ dates, offices });
});

app.get('/api/private-offices/bookings', (_req, res) => {
  const mine = officeBookings.filter((b) => b.memberId === CURRENT_MEMBER).sort((a, b) => a.date.localeCompare(b.date));
  res.json({ bookings: mine.map(withOffice) });
});

/** Books one office for every date in one go (all or nothing). */
app.post('/api/private-offices/bookings', (req, res) => {
  const office = privateOffices.find((o) => o.id === req.body?.officeId);
  if (!office) return res.status(404).json({ error: 'Private office not found.' });
  const dates = readDates({ dates: Array.isArray(req.body?.dates) ? req.body.dates.join(',') : '' });
  if (!dates || dates[0] < todayKey()) return res.status(400).json({ error: 'Pick today or future dates.' });
  const takenOn = dates.filter((d) => !isOfficeFree(office.id, d));
  if (takenOn.length) return res.status(409).json({ error: `${office.name} is no longer free on ${takenOn.join(', ')}.` });

  const createdAt = new Date().toISOString();
  const groupId = `OG-${Date.now().toString(36)}`;
  const reference = nextDeskReference();
  const created: OfficeBooking[] = dates.map((date) => ({
    id: nextOfficeBookingId(),
    officeId: office.id,
    memberId: CURRENT_MEMBER,
    date,
    groupId,
    reference,
    credits: office.creditsPerDay,
    createdAt,
  }));
  officeBookings.push(...created);
  res.status(201).json({ bookings: created.map(withOffice) });
});

/** Reschedule one day to another date, in the same office. */
app.patch('/api/private-offices/bookings/:id', (req, res) => {
  const booking = officeBookings.find((b) => b.id === req.params.id && b.memberId === CURRENT_MEMBER);
  if (!booking) return res.status(404).json({ error: 'Booking not found.' });
  const date = req.body?.date;
  if (!isDateKey(date) || date < todayKey()) return res.status(400).json({ error: 'Pick today or a future date.' });
  const office = privateOffices.find((o) => o.id === booking.officeId)!;
  const clash = officeBookings.find((b) => b.groupId === booking.groupId && b.date === date && b.id !== booking.id);
  if (clash) return res.status(409).json({ error: `You already have ${office.name} that day.` });
  if (!isOfficeFree(office.id, date, booking.id)) return res.status(409).json({ error: `${office.name} isn't free that day.` });
  booking.date = date;
  res.json(withOffice(booking));
});

/** Cancelled office days stay listed in My Bookings. */
const cancelledOfficeBookings: OfficeBooking[] = [];

app.delete('/api/private-offices/bookings/:id', (req, res) => {
  const i = officeBookings.findIndex((b) => b.id === req.params.id && b.memberId === CURRENT_MEMBER);
  if (i < 0) return res.status(404).json({ error: 'Booking not found.' });
  const [removed] = officeBookings.splice(i, 1);
  cancelledOfficeBookings.push(removed);
  res.json(withOffice(removed));
});

// ---------- My Bookings ----------
// Everything the member has booked, or been booked into, across the product lines: the live stores
// (meeting rooms, desks and private offices booked here or through Iris, and the desk booking page)
// plus the seeded history. Guests invited from My Bookings are kept per booking.
const ALL_DAY = { start: 9 * 60, end: 20 * 60 };
const bookingGuests: Record<string, BookingPerson[]> = {};
let guestSeq = 1;

function person(memberId: string): BookingPerson {
  const m = members.find((x) => x.id === memberId);
  if (!m) return { id: memberId, name: 'Former member' };
  const admin = adminUsers.find((a) => a.email.toLowerCase() === m.email.toLowerCase());
  return { id: m.id, name: m.name, email: m.email, avatarColor: m.avatarColor, ...(admin?.avatar ? { avatar: admin.avatar } : {}) };
}

/** "#120021" from a booking id's number. */
const shortRef = (id: string) => `#${120000 + (Number(id.replace(/\D/g, '')) % 100000)}`;

function groupBy<T>(items: T[], key: (item: T) => string) {
  const groups = new Map<string, T[]>();
  for (const item of items) groups.set(key(item), [...(groups.get(key(item)) ?? []), item]);
  return [...groups.values()];
}

/** The member's own bookings (My Bookings), or everyone's (Admin → Company Bookings). */
const myBookings = () => listBookings('mine');

function listBookings(scope: 'mine' | 'company'): MyBooking[] {
  const me = person(CURRENT_MEMBER);
  const included = (memberId: string) => scope === 'company' || memberId === CURRENT_MEMBER;
  const people = (id: string, list: BookingPerson[]) => [...list, ...(bookingGuests[id] ?? [])];
  const list: MyBooking[] = [];

  // Meeting rooms, one booking each.
  const rooms: [RoomBooking, boolean][] = [...roomBookings.map((b) => [b, false] as [RoomBooking, boolean]), ...cancelledRoomBookings.map((b) => [b, true] as [RoomBooking, boolean])];
  for (const [b, cancelled] of rooms) {
    const room = meetingRooms.find((r) => r.id === b.roomId)!;
    list.push({
      id: b.id,
      kind: 'meeting-room',
      title: room.name,
      location: `WeWork ${room.building}`,
      reference: shortRef(b.id),
      tag: `${room.capacity} Seats`,
      photo: room.photo,
      space: 'wework',
      dates: [b.date],
      start: b.start,
      end: b.end,
      allDay: false,
      credits: b.credits,
      cancelled,
      createdBy: me,
      createdByMe: true,
      people: people(b.id, [me]),
      guestsAllowed: true,
    });
  }

  // Office desks: the days booked together are one booking (cancelled days apart from the rest).
  const desksMine = [...deskBookings.map((b) => ({ b, cancelled: false })), ...cancelledDeskBookings.map((b) => ({ b, cancelled: true }))].filter(({ b }) => included(b.memberId));
  for (const group of groupBy(desksMine, ({ b, cancelled }) => `${b.groupId}:${cancelled}`)) {
    const days = group.map(({ b }) => b).sort((a, b) => a.date.localeCompare(b.date));
    const desk = desks.find((d) => d.id === days[0].deskId)!;
    const owner = person(days[0].memberId);
    const cancelled = group[0].cancelled;
    const id = cancelled ? `${days[0].groupId}-cancelled` : days[0].groupId;
    list.push({
      id,
      kind: 'office-desk',
      title: `Desk ${desk.id}`,
      location: desk.building,
      reference: `#${days[0].reference}`,
      tag: 'Office Desk',
      photo: 'ft-photo.jpg',
      space: 'office',
      dates: days.map((d) => d.date),
      ...ALL_DAY,
      allDay: true,
      cancelled,
      createdBy: owner,
      createdByMe: owner.id === CURRENT_MEMBER,
      people: [owner],
      guestsAllowed: false,
    });
  }

  // The desk booking page: one desk for yourself, or several desks for a team on one day.
  for (const { b, cancelled } of [...bookings.map((b) => ({ b, cancelled: false })), ...cancelledFloorBookings.map((b) => ({ b, cancelled: true }))]) {
    const seats = seatsByFloor[b.floorId] ?? [];
    const floor = floors.find((f) => f.id === b.floorId);
    const team = b.mode === 'others' || b.assignments.length > 1;
    const seat = seats.find((s) => s.id === b.assignments[0]?.seatId);
    list.push({
      id: b.id,
      kind: team ? 'team-desks' : 'office-desk',
      title: team ? 'Team Desks at Office' : `Desk ${seat?.label ?? ''}`.trim(),
      location: floor?.building ?? 'Vaishnavi Signature',
      reference: shortRef(b.id),
      tag: 'Office Desk',
      ...(team ? {} : { photo: 'ft-photo.jpg' }),
      space: 'office',
      dates: [b.date],
      ...ALL_DAY,
      allDay: true,
      cancelled,
      createdBy: me,
      createdByMe: true,
      people: team ? b.assignments.map((a) => person(a.memberId)) : [me],
      ...(team ? { desks: b.assignments.length } : {}),
      guestsAllowed: false,
    });
  }

  // Bookable private offices: the days booked together are one booking.
  const officesMine = [...officeBookings.map((b) => ({ b, cancelled: false })), ...cancelledOfficeBookings.map((b) => ({ b, cancelled: true }))].filter(({ b }) => included(b.memberId));
  for (const group of groupBy(officesMine, ({ b, cancelled }) => `${b.groupId}:${cancelled}`)) {
    const days = group.map(({ b }) => b).sort((a, b) => a.date.localeCompare(b.date));
    const office = privateOffices.find((o) => o.id === days[0].officeId)!;
    const owner = person(days[0].memberId);
    const cancelled = group[0].cancelled;
    const id = cancelled ? `${days[0].groupId}-cancelled` : days[0].groupId;
    list.push({
      id,
      kind: 'private-office',
      title: `BPO - ${office.name}`,
      location: `WeWork ${office.building}`,
      reference: `#${days[0].reference}`,
      tag: 'BPO',
      photo: office.photo,
      space: 'wework',
      dates: days.map((d) => d.date),
      ...ALL_DAY,
      allDay: true,
      credits: days.reduce((n, d) => n + d.credits, 0),
      desks: office.capacity,
      cancelled,
      createdBy: owner,
      createdByMe: owner.id === CURRENT_MEMBER,
      people: people(id, [owner]),
      guestsAllowed: owner.id === CURRENT_MEMBER,
    });
  }

  for (const r of scope === 'company' ? [...bookingHistory, ...companyBookingHistory] : bookingHistory) {
    const createdByMe = r.createdById === CURRENT_MEMBER;
    list.push({
      id: r.id,
      kind: r.kind,
      title: r.title,
      location: r.location,
      reference: shortRef(r.id),
      tag: r.tag,
      ...(r.photo ? { photo: r.photo } : {}),
      space: r.space,
      dates: historyDates(r),
      start: r.start,
      end: r.end,
      allDay: r.allDay,
      ...(r.credits !== undefined ? { credits: r.credits } : {}),
      cancelled: r.cancelled,
      createdBy: person(r.createdById),
      createdByMe,
      people: people(r.id, r.peopleIds.map(person)),
      ...(r.kind === 'team-desks' || r.kind === 'private-office' ? { desks: r.peopleIds.length } : {}),
      guestsAllowed: createdByMe && (r.kind === 'meeting-room' || r.kind === 'private-office'),
    });
  }
  return list;
}

app.get('/api/my-bookings', (_req, res) => {
  res.json({ bookings: myBookings() });
});

// ---------- Admin → Company Bookings ----------
// Everyone's bookings across the product lines. An admin can cancel the ones in the office (a desk,
// several desks for a team, or a meeting room) that haven't ended; the rest are view only.
const ADMIN_CANCELLABLE: MyBooking['kind'][] = ['office-desk', 'team-desks', 'meeting-room'];

/** Still to come or under way: its last day is after today, or today and not yet over. */
function notOver(b: MyBooking) {
  const last = b.dates[b.dates.length - 1];
  const today = todayKey();
  if (last !== today) return last > today;
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes() < b.end;
}

app.get('/api/admin/company-bookings', (_req, res) => {
  res.json({ bookings: listBookings('company') });
});

/** Cancels an office desk, team desks or meeting room booking; returns the company's bookings after. */
app.delete('/api/admin/company-bookings/:id', (req, res) => {
  const id = req.params.id;
  const booking = listBookings('company').find((b) => b.id === id);
  if (!booking) return res.status(404).json({ error: 'Booking not found.' });
  if (!ADMIN_CANCELLABLE.includes(booking.kind)) return res.status(403).json({ error: 'Only desk and meeting room bookings in the office can be cancelled here.' });
  if (booking.cancelled) return res.status(409).json({ error: 'This booking is already cancelled.' });
  if (!notOver(booking)) return res.status(409).json({ error: 'This booking has already ended, so it can’t be cancelled.' });

  const room = roomBookings.findIndex((b) => b.id === id);
  const floor = bookings.findIndex((b) => b.id === id);
  if (room >= 0) {
    cancelledRoomBookings.push(...roomBookings.splice(room, 1));
  } else if (floor >= 0) {
    const [removed] = bookings.splice(floor, 1);
    cancelledFloorBookings.push(removed);
    freeSeats(removed.floorId, removed.assignments.map((a) => a.seatId));
  } else if (deskBookings.some((b) => b.groupId === id)) {
    // Days already gone stay as they were; today and after are cancelled.
    const today = todayKey();
    for (let i = deskBookings.length - 1; i >= 0; i--) {
      if (deskBookings[i].groupId === id && deskBookings[i].date >= today) cancelledDeskBookings.push(...deskBookings.splice(i, 1));
    }
  } else {
    const record = [...bookingHistory, ...companyBookingHistory].find((r) => r.id === id);
    if (!record) return res.status(404).json({ error: 'Booking not found.' });
    record.cancelled = true;
  }
  res.json({ bookings: listBookings('company') });
});

/** Invites a guest to a meeting room or private office the member booked, before it starts. */
app.post('/api/my-bookings/:id/guests', (req, res) => {
  const booking = myBookings().find((b) => b.id === req.params.id);
  if (!booking) return res.status(404).json({ error: 'Booking not found.' });
  if (!booking.guestsAllowed) return res.status(400).json({ error: 'Guests can only be invited to meeting rooms and private offices you booked.' });
  if (booking.cancelled) return res.status(400).json({ error: 'This booking was cancelled.' });
  const [y, m, d] = booking.dates[0].split('-').map(Number);
  if (new Date(y, m - 1, d, 0, booking.start) <= new Date()) return res.status(400).json({ error: 'This booking has already started.' });
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  const email = typeof req.body?.email === 'string' ? req.body.email.trim() : '';
  if (!name) return res.status(400).json({ error: 'Add the guest’s name.' });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: 'Add a valid email for the guest.' });
  if (booking.people.some((p) => p.email?.toLowerCase() === email.toLowerCase())) return res.status(409).json({ error: `${email} is already on this booking.` });
  const seats = booking.kind === 'meeting-room' ? parseInt(booking.tag, 10) : NaN;
  if (seats && booking.people.length >= seats) return res.status(400).json({ error: `${booking.title} seats up to ${seats}.` });
  (bookingGuests[booking.id] ??= []).push({ id: `G-${guestSeq++}`, name, email, guest: true });
  res.status(201).json(myBookings().find((b) => b.id === booking.id));
});

// ---------- Admin: announcements ----------
function announcementStatus(a: Announcement): AnnouncementStatus {
  if (a.archived) return 'archived';
  const today = todayKey();
  if (a.from > today) return 'scheduled';
  if (a.to < today) return 'completed';
  return 'active';
}
const withStatus = (a: Announcement) => ({ ...a, status: announcementStatus(a) });

app.get('/api/admin/announcements', (_req, res) => {
  res.json({ announcements: [...announcements].sort((a, b) => a.number - b.number).map(withStatus) });
});

app.post('/api/admin/announcements', (req, res) => {
  const { title, message, from, to, location } = req.body ?? {};
  if (typeof title !== 'string' || !title.trim()) return res.status(400).json({ error: 'A title is required.' });
  if (!isDateKey(from) || !isDateKey(to)) return res.status(400).json({ error: 'From and To dates are required.' });
  if (to < from) return res.status(400).json({ error: 'The end date must be on or after the start date.' });
  const number = nextAnnouncementNumber();
  const created: Announcement = {
    id: `AN-${number}`,
    number,
    title: title.trim(),
    message: typeof message === 'string' ? message.trim() : '',
    from,
    to,
    location: typeof location === 'string' && location.trim() ? location.trim() : 'Company Level',
    archived: false,
    createdAt: new Date().toISOString(),
  };
  announcements.push(created);
  res.status(201).json(withStatus(created));
});

/** Archive or restore. */
app.patch('/api/admin/announcements/:id', (req, res) => {
  const item = announcements.find((a) => a.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'Announcement not found.' });
  if (typeof req.body?.archived === 'boolean') item.archived = req.body.archived;
  res.json(withStatus(item));
});

app.delete('/api/admin/announcements/:id', (req, res) => {
  const i = announcements.findIndex((a) => a.id === req.params.id);
  if (i < 0) return res.status(404).json({ error: 'Announcement not found.' });
  const [removed] = announcements.splice(i, 1);
  res.json(withStatus(removed));
});

// ---------- Admin: events ----------
/** Archived wins; then a past event is completed, one not yet listed is scheduled, the rest are active. */
function adminEventStatus(e: AdminEvent): AdminEventStatus {
  if (e.archived) return 'archived';
  const today = todayKey();
  if (e.date < today) return 'completed';
  if (e.listingDate > today) return 'scheduled';
  return 'active';
}
function eventView(e: AdminEvent): AdminEventView {
  const loc = workLocations.find((l) => l.id === e.locationId);
  return { ...e, location: loc?.name ?? '', address: loc?.address ?? '', status: adminEventStatus(e) };
}
/** The signed-in admin, who creates events. */
const CURRENT_ADMIN = adminUsers.find((u) => u.id === 'AU-21') ?? adminUsers[0];
const MAX_EVENT_IMAGES = 6;
const isEventImage = (v: unknown) => typeof v === 'string' && (v.startsWith('data:image/') || /^\/[\w/.-]+\.(jpe?g|png|webp|gif)$/i.test(v));

/** Checks the fields present in `body`; with `whole`, every field must be there. Returns what's wrong, if anything. */
function eventProblem(body: Record<string, unknown>, whole: boolean): string | null {
  const has = (k: string) => body[k] !== undefined;
  if ((whole || has('title')) && (typeof body.title !== 'string' || !body.title.trim())) return 'Give the event a name.';
  if (has('title') && String(body.title).trim().length > 120) return 'Keep the event name under 120 characters.';
  if ((whole || has('description')) && (typeof body.description !== 'string' || !body.description.trim())) return 'Add a description.';
  if (has('description') && String(body.description).length > 2000) return 'Keep the description under 2000 characters.';
  if ((whole || has('capacity')) && !(Number.isInteger(body.capacity) && (body.capacity as number) >= 1 && (body.capacity as number) <= 10000))
    return 'Capacity must be between 1 and 10,000.';
  if ((whole || has('locationId')) && !workLocations.some((l) => l.id === body.locationId)) return 'Choose a building.';
  if ((whole || has('date')) && !isDateKey(body.date)) return 'Choose the event date.';
  if ((whole || has('time')) && !(Number.isInteger(body.time) && (body.time as number) >= 0 && (body.time as number) < 24 * 60)) return 'Choose the event time.';
  if ((whole || has('listingDate')) && !isDateKey(body.listingDate)) return 'Choose the listing date.';
  for (const k of ['rsvpRequired', 'featured', 'archived'])
    if (has(k) && typeof body[k] !== 'boolean') return `${k} must be true or false.`;
  if (whole || has('images')) {
    if (!Array.isArray(body.images) || body.images.length === 0) return 'Add at least one image.';
    if (body.images.length > MAX_EVENT_IMAGES) return `Add up to ${MAX_EVENT_IMAGES} images.`;
    if (!body.images.every(isEventImage)) return 'One of the images can’t be used.';
  }
  return null;
}

app.get('/api/admin/events', (_req, res) => {
  res.json({ events: [...adminEvents].sort((a, b) => a.number - b.number).map(eventView) });
});

app.post('/api/admin/events', (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const problem = eventProblem(body, true);
  if (problem) return res.status(400).json({ error: problem });
  if ((body.listingDate as string) > (body.date as string)) return res.status(400).json({ error: 'The listing date must be on or before the event date.' });
  const number = nextAdminEventNumber();
  const created: AdminEvent = {
    id: `EV-${number}`,
    number,
    title: (body.title as string).trim(),
    description: (body.description as string).trim(),
    capacity: body.capacity as number,
    locationId: body.locationId as string,
    date: body.date as string,
    time: body.time as number,
    listingDate: body.listingDate as string,
    rsvpRequired: body.rsvpRequired === true,
    featured: body.featured === true,
    images: body.images as string[],
    archived: false,
    createdBy: { id: CURRENT_ADMIN.id, name: CURRENT_ADMIN.name },
    createdOn: todayKey(),
    rsvps: [],
  };
  adminEvents.push(created);
  res.status(201).json(eventView(created));
});

/** Edit any of the event's details, archive it or restore it. */
app.patch('/api/admin/events/:id', (req, res) => {
  const event = adminEvents.find((e) => e.id === req.params.id);
  if (!event) return res.status(404).json({ error: 'Event not found.' });
  const body = (req.body ?? {}) as Record<string, unknown>;
  const problem = eventProblem(body, false);
  if (problem) return res.status(400).json({ error: problem });
  const date = (body.date as string | undefined) ?? event.date;
  const listingDate = (body.listingDate as string | undefined) ?? event.listingDate;
  if (listingDate > date) return res.status(400).json({ error: 'The listing date must be on or before the event date.' });
  if (typeof body.title === 'string') event.title = body.title.trim();
  if (typeof body.description === 'string') event.description = body.description.trim();
  if (body.capacity !== undefined) event.capacity = body.capacity as number;
  if (body.locationId !== undefined) event.locationId = body.locationId as string;
  if (body.time !== undefined) event.time = body.time as number;
  if (body.images !== undefined) event.images = body.images as string[];
  for (const k of ['rsvpRequired', 'featured', 'archived'] as const) if (typeof body[k] === 'boolean') event[k] = body[k];
  event.date = date;
  event.listingDate = listingDate;
  res.json(eventView(event));
});

app.delete('/api/admin/events/:id', (req, res) => {
  const i = adminEvents.findIndex((e) => e.id === req.params.id);
  if (i < 0) return res.status(404).json({ error: 'Event not found.' });
  const [removed] = adminEvents.splice(i, 1);
  res.json(eventView(removed));
});

// ---------- Admin: users ----------
const MEMBERSHIPS: MembershipTag[][] = [['PO', 'ATLAS'], ['AA']];
const sameTags = (a: MembershipTag[], b: MembershipTag[]) => a.length === b.length && a.every((t) => b.includes(t));

app.get('/api/admin/users', (_req, res) => {
  res.json({ users: adminUsers });
});

app.get('/api/admin/locations', (_req, res) => {
  res.json({ locations: workLocations });
});

// ---------- company structure: Business Unit → Department → Team ----------
const ORG_KINDS: OrgKind[] = ['business-units', 'departments', 'teams'];
const ORG_NOUN: Record<OrgKind, string> = { 'business-units': 'business unit', departments: 'department', teams: 'team' };
const orgList = (kind: OrgKind) => (kind === 'business-units' ? businessUnits : kind === 'departments' ? departments : teams);
const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const activeAccessLevels = () => adminAccessLevels.filter((a) => a.status === 'active');
/** An active access level's stored name for a name in any case ("level 2" → "Level 2"), or undefined. */
const accessLevelName = (name: string) => (name ? activeAccessLevels().find((a) => sameName(a.name, name))?.name : undefined);

/**
 * A user's team, department and business unit must follow the structure: the team sits in the
 * department, which sits in the business unit. Any of them may be blank. Returns what's wrong, if anything.
 */
function orgMismatch(businessUnit: string, department: string, team: string): string | null {
  const bu = businessUnit ? businessUnits.find((b) => sameName(b.name, businessUnit)) : undefined;
  if (businessUnit && !bu) return `There's no business unit called ${businessUnit}.`;
  const dp = department ? departments.find((d) => sameName(d.name, department)) : undefined;
  if (department && !dp) return `There's no department called ${department}.`;
  if (dp && (!bu || dp.businessUnitId !== bu.id)) return `${department} isn't part of ${businessUnit || 'that business unit'}.`;
  const tm = team ? teams.find((t) => sameName(t.name, team)) : undefined;
  if (team && !tm) return `There's no team called ${team}.`;
  if (tm && (!dp || tm.departmentId !== dp.id)) return `${team} isn't part of ${department || 'that department'}.`;
  return null;
}

app.get('/api/admin/org', (_req, res) => {
  res.json({ businessUnits, departments, teams });
});

/** Adds a business unit, a department (in a business unit) or a team (in a department). */
app.post('/api/admin/org/:kind', (req, res) => {
  const kind = req.params.kind as OrgKind;
  if (!ORG_KINDS.includes(kind)) return res.status(404).json({ error: 'Not found.' });
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  if (!name) return res.status(400).json({ error: 'A name is required.' });
  if ((orgList(kind) as { name: string }[]).some((u) => sameName(u.name, name)))
    return res.status(409).json({ error: `There's already a ${ORG_NOUN[kind]} called ${name}.` });

  if (kind === 'business-units') {
    const n = nextOrgNumber(kind);
    const unit = { id: `bu-${n}`, code: `BU-${n}`, name, status: 'active' as UserStatus };
    businessUnits.push(unit);
    return res.status(201).json(unit);
  }
  if (kind === 'departments') {
    const parent = businessUnits.find((b) => b.id === req.body?.businessUnitId);
    if (!parent) return res.status(400).json({ error: 'Choose the business unit this department belongs to.' });
    const n = nextOrgNumber(kind);
    const unit = { id: `dp-${n}`, code: `DP-${n}`, name, businessUnitId: parent.id, status: 'active' as UserStatus };
    departments.push(unit);
    return res.status(201).json(unit);
  }
  const parent = departments.find((d) => d.id === req.body?.departmentId);
  if (!parent) return res.status(400).json({ error: 'Choose the department this team belongs to.' });
  const managerId = req.body?.managerId;
  if (managerId && !adminUsers.some((u) => u.id === managerId)) return res.status(400).json({ error: 'That manager isn’t in the directory.' });
  const n = nextOrgNumber(kind);
  const unit = { id: `tm-${n}`, code: `TM-${n}`, name, departmentId: parent.id, status: 'active' as UserStatus, ...(managerId ? { managerId } : {}) };
  teams.push(unit);
  res.status(201).json(unit);
});

/**
 * Edit a unit: archive (inactive) or restore (active), rename it, move a team to another department
 * or a department to another business unit, or change a team's manager. Users name their team,
 * department and business unit, so renames and moves are carried through to them. Archiving lets
 * its people go down the structure: a team's members lose the team; a department's people lose it
 * and their team; a business unit's people lose all three. Restoring doesn't place them back.
 */
app.patch('/api/admin/org/:kind/:id', (req, res) => {
  const kind = req.params.kind as OrgKind;
  if (!ORG_KINDS.includes(kind)) return res.status(404).json({ error: 'Not found.' });
  const unit = (orgList(kind) as { id: string; name: string; status: UserStatus }[]).find((u) => u.id === req.params.id);
  if (!unit) return res.status(404).json({ error: `That ${ORG_NOUN[kind]} doesn't exist.` });
  const body = (req.body ?? {}) as Record<string, unknown>;

  if (body.status !== undefined && !(['active', 'inactive'] as UserStatus[]).includes(body.status as UserStatus))
    return res.status(400).json({ error: 'Status must be active or inactive.' });
  const name = typeof body.name === 'string' ? body.name.trim() : undefined;
  if (body.name !== undefined && !name) return res.status(400).json({ error: `Give the ${ORG_NOUN[kind]} a name.` });
  if (name && (orgList(kind) as { id: string; name: string }[]).some((u) => u.id !== unit.id && sameName(u.name, name)))
    return res.status(409).json({ error: `There's already a ${ORG_NOUN[kind]} called ${name}.` });
  const newDept = kind === 'teams' && body.departmentId !== undefined ? departments.find((d) => d.id === body.departmentId) : undefined;
  if (kind === 'teams' && body.departmentId !== undefined && !newDept) return res.status(400).json({ error: 'Choose the department this team belongs to.' });
  const newBu = kind === 'departments' && body.businessUnitId !== undefined ? businessUnits.find((b) => b.id === body.businessUnitId) : undefined;
  if (kind === 'departments' && body.businessUnitId !== undefined && !newBu) return res.status(400).json({ error: 'Choose the business unit this department belongs to.' });
  if (kind === 'teams' && body.managerId !== undefined && body.managerId !== null && !adminUsers.some((u) => u.id === body.managerId))
    return res.status(400).json({ error: 'That manager isn’t in the directory.' });

  const oldName = unit.name;
  if (body.status !== undefined) unit.status = body.status as UserStatus;
  if (name) unit.name = name;

  const buNameOf = (id: string) => businessUnits.find((b) => b.id === id)?.name ?? '';
  if (kind === 'teams') {
    const team = unit as (typeof teams)[number];
    if (newDept) team.departmentId = newDept.id;
    if (body.managerId === null) delete team.managerId;
    else if (typeof body.managerId === 'string') team.managerId = body.managerId;
    const dept = departments.find((d) => d.id === team.departmentId);
    for (const u of adminUsers) {
      if (u.team !== oldName) continue;
      u.team = team.name;
      if (dept) {
        u.department = dept.name;
        u.businessUnit = buNameOf(dept.businessUnitId);
      }
    }
  } else if (kind === 'departments') {
    const dept = unit as (typeof departments)[number];
    if (newBu) dept.businessUnitId = newBu.id;
    for (const u of adminUsers) {
      if (u.department !== oldName) continue;
      u.department = dept.name;
      u.businessUnit = buNameOf(dept.businessUnitId);
    }
  } else {
    for (const u of adminUsers) if (u.businessUnit === oldName) u.businessUnit = unit.name;
  }

  if (body.status === 'inactive') {
    for (const u of adminUsers) {
      if (kind === 'teams' && u.team === unit.name) u.team = '';
      else if (kind === 'departments' && u.department === unit.name) Object.assign(u, { department: '', team: '' });
      else if (kind === 'business-units' && u.businessUnit === unit.name) Object.assign(u, { businessUnit: '', department: '', team: '' });
    }
    // The teams under it lose their managers too, or the manager would still count as a member.
    const deptIds = kind === 'departments' ? [unit.id] : kind === 'business-units' ? departments.filter((d) => d.businessUnitId === unit.id).map((d) => d.id) : [];
    for (const t of teams) if ((kind === 'teams' && t.id === unit.id) || deptIds.includes(t.departmentId)) delete t.managerId;
  }
  res.json(unit);
});

const findByEmail = (email: string) => adminUsers.find((u) => u.email.toLowerCase() === email.trim().toLowerCase());
/** Someone already set up: active, with a membership. Anyone else with a past record can be brought back. */
const isCurrentMember = (u: AdminUser) => u.status === 'active' && u.membership.length > 0;
const isPrivateOfficeBuilding = (id: unknown) => workLocations.some((l) => l.id === id && l.privateOffice);

/** Add User, step 1: is this email new, already a member, or a past record to fill the form from? */
// POST so the email travels in the body, not the URL (and server logs).
app.post('/api/admin/users/lookup', (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email : '';
  const user = email ? findByEmail(email) : undefined;
  if (!user) return res.json({ match: 'none', user: null });
  res.json({ match: isCurrentMember(user) ? 'exists' : 'returning', user });
});

/**
 * Adds a user, or brings back a past record with the same email (inactive, or without a membership)
 * with the details from the form. Either way they end up active; the key card is activated when both
 * hot stamps are given.
 */
app.post('/api/admin/users', (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  const email = text(body.email);
  const name = [text(body.firstName), text(body.lastName)].filter(Boolean).join(' ');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: 'A valid email is required.' });
  if (!name) return res.status(400).json({ error: 'A name is required.' });
  if (text(body.phone).replace(/\D/g, '').length < 10) return res.status(400).json({ error: 'A valid phone number is required.' });
  const tags: MembershipTag[] = Array.isArray(body.membership) ? (body.membership as MembershipTag[]) : [];
  if (!MEMBERSHIPS.some((m) => sameTags(m, tags))) return res.status(400).json({ error: 'Membership must be PO + ATLAS, or AA.' });
  if (!isPrivateOfficeBuilding(body.homeLocationId)) return res.status(400).json({ error: 'The home location must be a building with your private office.' });
  if (body.avatar !== undefined && !isAvatar(body.avatar)) return res.status(400).json({ error: 'That photo can’t be used.' });

  const role = text(body.role) || 'Employee';
  const left = text(body.leftHotStamp);
  const right = text(body.rightHotStamp);
  const details = {
    name,
    phone: text(body.phone),
    role,
    team: text(body.team),
    department: text(body.department),
    businessUnit: text(body.businessUnit),
    accessLevel: accessLevelName(text(body.accessLevel)) ?? 'Level 1',
    membership: tags,
    homeLocationId: body.homeLocationId as string,
    keyCard: { leftHotStamp: left, rightHotStamp: right, status: (left && right ? 'active' : 'inactive') as UserStatus },
    status: 'active' as UserStatus,
    ...(body.avatar ? { avatar: body.avatar as string } : {}),
  };

  const structure = orgMismatch(details.businessUnit, details.department, details.team);
  if (structure) return res.status(400).json({ error: structure });

  const past = findByEmail(email);
  if (past && isCurrentMember(past)) return res.status(409).json({ error: 'This user already exists.' });
  if (past) {
    Object.assign(past, details);
    if (!past.associatedLocationIds.includes(details.homeLocationId)) past.associatedLocationIds.unshift(details.homeLocationId);
    return res.json(past);
  }

  const n = nextAdminUserNumber();
  const defaults = adminUserDefaults(n, role, details.department, 'active');
  const user: AdminUser = {
    id: `AU-${n}`,
    code: `WE-${String(n).padStart(6, '0')}`,
    email,
    ...defaults,
    ...details,
    designation: defaults.designation,
    associatedLocationIds: [details.homeLocationId],
  };
  adminUsers.push(user);
  res.status(201).json(user);
});

const USER_STATUSES: UserStatus[] = ['active', 'inactive'];
const isText = (v: unknown): v is string => typeof v === 'string';
const isLocationList = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((id) => workLocations.some((l) => l.id === id));
/** A photo from the panel arrives as a small JPEG/PNG data URL; existing photos are file names. */
const isAvatar = (v: unknown) =>
  isText(v) && (/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(v) ? v.length < 300_000 : /^[\w-]+\.(png|jpe?g|webp)$/.test(v));

/**
 * Edits from the user details panel, or archive (inactive) / restore (active) from the row menu.
 * Only the fields sent change; name, email, phone and ID come from the HR record and stay put.
 */
app.patch('/api/admin/users/:id', (req, res) => {
  const user = adminUsers.find((u) => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  const body = (req.body ?? {}) as Record<string, unknown>;
  const has = (key: string) => body[key] !== undefined;

  if (has('status') && !USER_STATUSES.includes(body.status as UserStatus)) return res.status(400).json({ error: 'Status must be active or inactive.' });
  for (const key of ['designation', 'role', 'team', 'department', 'businessUnit', 'accessLevel'] as const) {
    if (has(key) && !isText(body[key])) return res.status(400).json({ error: `${key} must be text.` });
  }
  if (has('role') && !(body.role as string).trim()) return res.status(400).json({ error: 'A role is required.' });
  // Keeping an archived level is fine; moving to one isn't.
  if (has('accessLevel') && (body.accessLevel as string).trim() !== user.accessLevel && !accessLevelName(body.accessLevel as string))
    return res.status(400).json({ error: 'Pick one of the access levels from Access Control.' });
  if (has('businessUnit') || has('department') || has('team')) {
    const pick = (key: 'businessUnit' | 'department' | 'team') => (has(key) ? (body[key] as string).trim() : user[key]);
    const structure = orgMismatch(pick('businessUnit'), pick('department'), pick('team'));
    if (structure) return res.status(400).json({ error: structure });
  }
  if (has('homeLocationId') && !isPrivateOfficeBuilding(body.homeLocationId)) return res.status(400).json({ error: 'The home location must be a building with your private office.' });
  if (has('membership') && !(Array.isArray(body.membership) && MEMBERSHIPS.some((m) => sameTags(m, body.membership as MembershipTag[]))))
    return res.status(400).json({ error: 'Membership must be PO + ATLAS, or AA.' });
  for (const key of ['associatedLocationIds', 'coworkingLocationIds'] as const) {
    if (has(key) && !isLocationList(body[key])) return res.status(400).json({ error: 'Unknown location.' });
  }
  if (has('avatar') && !isAvatar(body.avatar)) return res.status(400).json({ error: 'That photo can’t be used.' });
  const card = body.keyCard as Partial<AdminUser['keyCard']> | undefined;
  if (card !== undefined && !(isText(card.leftHotStamp) && isText(card.rightHotStamp) && USER_STATUSES.includes(card.status as UserStatus)))
    return res.status(400).json({ error: 'The key card needs both hot stamps and a status.' });

  if (has('status')) user.status = body.status as UserStatus;
  for (const key of ['designation', 'role', 'team', 'department', 'businessUnit', 'accessLevel'] as const) {
    if (has(key)) user[key] = (body[key] as string).trim();
  }
  if (has('accessLevel')) user.accessLevel = accessLevelName(body.accessLevel as string) ?? user.accessLevel;
  if (has('homeLocationId')) user.homeLocationId = body.homeLocationId as string;
  if (has('membership')) user.membership = body.membership as MembershipTag[];
  if (has('associatedLocationIds')) user.associatedLocationIds = [...new Set(body.associatedLocationIds as string[])];
  if (has('coworkingLocationIds')) user.coworkingLocationIds = [...new Set(body.coworkingLocationIds as string[])];
  if (has('avatar')) user.avatar = body.avatar as string;
  if (card) user.keyCard = { leftHotStamp: card.leftHotStamp!.trim(), rightHotStamp: card.rightHotStamp!.trim(), status: card.status! };
  res.json(user);
});

/** Bulk Action on All Users: makes every user listed active or inactive, all or none. */
app.post('/api/admin/users/status', (req, res) => {
  const { ids, status } = (req.body ?? {}) as { ids?: unknown; status?: unknown };
  if (!USER_STATUSES.includes(status as UserStatus)) return res.status(400).json({ error: 'Status must be active or inactive.' });
  if (!Array.isArray(ids) || ids.length === 0 || !ids.every((id) => typeof id === 'string'))
    return res.status(400).json({ error: 'Pick at least one user.' });
  const picked = [...new Set(ids as string[])].map((id) => adminUsers.find((u) => u.id === id));
  if (picked.some((u) => !u)) return res.status(404).json({ error: 'Some of those users no longer exist. Refresh and try again.' });
  for (const u of picked) u!.status = status as UserStatus;
  res.json({ users: picked });
});

// ---------- Admin: bulk upload (Upload Users wizard) ----------
const BULK_ROLES = ['Employee', 'Manager', 'Admin', 'Super Admin'];
const BULK_MAX_ROWS = 1000;
/** Pace of the background job, so a few dozen rows take long enough to watch. */
const BULK_STEP_MS = 350;
const bulkJobs = new Map<string, BulkUploadJob>();
let bulkJobSeq = 1;

/** A unit's stored name for a name in any case ("engineering" → "Engineering"). */
const canonical = (list: { name: string }[], name: string) => list.find((u) => sameName(u.name, name))?.name ?? name;

/** Adds or updates one user from a bulk row; returns what happened, or the reason it couldn't. */
function applyBulkRow(row: BulkUserRow): 'created' | 'updated' | 'unchanged' | { error: string } {
  const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  const email = text(row.email);
  const name = text(row.name);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: 'A valid email is required.' };
  if (!name) return { error: 'A name is required.' };
  const role = BULK_ROLES.find((r) => sameName(r, text(row.role)));
  if (!role) return { error: `Role must be one of ${BULK_ROLES.join(', ')}.` };
  const tags: MembershipTag[] = Array.isArray(row.membership) ? row.membership : [];
  if (!MEMBERSHIPS.some((m) => sameTags(m, tags))) return { error: 'Membership must be PO + ATLAS, or AA.' };
  if (!USER_STATUSES.includes(row.status)) return { error: 'Status must be active or inactive.' };
  // Optional: left out, existing people keep theirs and new people get their role's usual level.
  const accessLevel = text(row.accessLevel) ? accessLevelName(text(row.accessLevel)) : undefined;
  if (text(row.accessLevel) && !accessLevel) return { error: `Access level must be one of ${activeAccessLevels().map((a) => a.name).join(', ')}.` };
  const businessUnit = canonical(businessUnits, text(row.businessUnit));
  const department = canonical(departments, text(row.department));
  const team = canonical(teams, text(row.team));
  const structure = orgMismatch(businessUnit, department, team);
  if (structure) return { error: structure };

  const details = { name, role, team, department, businessUnit, membership: tags, status: row.status, ...(accessLevel ? { accessLevel } : {}) };
  const existing = findByEmail(email);
  if (existing) {
    const same =
      existing.name === name &&
      existing.role === role &&
      (!accessLevel || existing.accessLevel === accessLevel) &&
      existing.team === team &&
      existing.department === department &&
      existing.businessUnit === businessUnit &&
      existing.status === row.status &&
      sameTags(existing.membership, tags);
    if (same) return 'unchanged';
    Object.assign(existing, details);
    return 'updated';
  }

  const n = nextAdminUserNumber();
  const defaults = adminUserDefaults(n, role, department, row.status);
  adminUsers.push({
    id: `AU-${n}`,
    code: `WE-${String(n).padStart(6, '0')}`,
    email,
    ...defaults,
    ...details,
    // Not in the sheet: added later from the user's details panel.
    phone: '',
    keyCard: { leftHotStamp: '', rightHotStamp: '', status: 'inactive' },
  });
  return 'created';
}

/** Starts adding/updating the rows in the background; poll GET …/bulk/:id for progress. */
app.post('/api/admin/users/bulk', (req, res) => {
  const rows = req.body?.rows as BulkUserRow[] | undefined;
  if (!Array.isArray(rows) || rows.length === 0) return res.status(400).json({ error: 'There are no users to upload.' });
  if (rows.length > BULK_MAX_ROWS) return res.status(400).json({ error: `Upload up to ${BULK_MAX_ROWS} users at a time.` });

  const job: BulkUploadJob = {
    id: `BU-${bulkJobSeq++}`,
    status: 'running',
    total: rows.length,
    processed: 0,
    created: 0,
    updated: 0,
    unchanged: 0,
    failed: [],
    startedAt: new Date().toISOString(),
  };
  bulkJobs.set(job.id, job);

  const step = () => {
    const row = rows[job.processed];
    const result = applyBulkRow(row);
    if (typeof result === 'object') job.failed.push({ email: String(row?.email ?? ''), name: String(row?.name ?? ''), error: result.error });
    else job[result]++;
    job.processed++;
    if (job.processed < job.total) setTimeout(step, BULK_STEP_MS);
    else {
      job.status = 'done';
      job.finishedAt = new Date().toISOString();
    }
  };
  setTimeout(step, BULK_STEP_MS);
  res.status(202).json(job);
});

app.get('/api/admin/users/bulk/:id', (req, res) => {
  const job = bulkJobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Upload not found.' });
  res.json(job);
});

// ---------- Admin: spaces, buildings and space types ----------
const SPACE_STATUSES: SpaceStatus[] = ['active', 'inactive'];
const MAX_SPACE_CAPACITY = 10000;
/** 1st, 2nd, 3rd, 4th … for error messages. */
const floorName = (n: number) => {
  const v = n % 100;
  return `${n}${v >= 11 && v <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th')} floor`;
};
const isWhole = (v: unknown, min: number, max: number): v is number => Number.isInteger(v) && (v as number) >= min && (v as number) <= max;
const isTimeZone = (v: unknown): v is string => {
  if (typeof v !== 'string' || !v) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: v });
    return true;
  } catch {
    return false;
  }
};

function spaceView(s: AdminSpace): AdminSpaceView {
  const b = adminBuildings.find((x) => x.id === s.buildingId);
  const seats = s.seatMapId ? (seatsByFloor[s.seatMapId] ?? []) : [];
  return {
    ...s,
    building: b?.name ?? '',
    city: b?.city ?? '',
    state: b?.state ?? '',
    area: b?.area ?? '',
    timeZone: b?.timeZone ?? '',
    booked: seats.filter((seat) => seat.status !== 'available' || !!seat.assignment).length,
  };
}
const spaceOrder = (a: AdminSpace, b: AdminSpace) => {
  const ba = adminBuildings.findIndex((x) => x.id === a.buildingId);
  const bb = adminBuildings.findIndex((x) => x.id === b.buildingId);
  return ba - bb || a.floor - b.floor || a.number - b.number;
};

/** A floor plan as sent: null to remove it, or an image with its file name and size. */
function floorMapProblem(v: unknown): string | null {
  if (v === null) return null;
  const m = v as Record<string, unknown> | undefined;
  if (!m || typeof m.name !== 'string' || !m.name.trim() || m.name.length > 200) return 'The floor map needs a file name.';
  if (typeof m.size !== 'number' || !(m.size >= 0)) return 'The floor map’s size is missing.';
  if (typeof m.url !== 'string' || !(m.url.startsWith('data:image/') || /^\/[\w/.-]+\.(jpe?g|png|webp|gif|svg)$/i.test(m.url)))
    return 'The floor map must be an image.';
  return null;
}

function bookingProblem(v: unknown): string | null {
  const b = v as Partial<SpaceBookingSettings> | undefined;
  if (!b || typeof b !== 'object') return 'Booking settings are missing.';
  if (!isWhole(b.multiDayLimit, 0, 365)) return 'The multiple day booking limit must be between 0 and 365 days.';
  if (!isWhole(b.futureLimitDays, 0, 365)) return 'Future bookings can be limited to between 0 and 365 days.';
  if (typeof b.instructions !== 'string' || b.instructions.length > 2000) return 'Keep the reservation instructions under 2000 characters.';
  if (typeof b.restricted !== 'boolean') return 'restricted must be true or false.';
  if (!Array.isArray(b.restrictDays) || !b.restrictDays.every((d) => isWhole(d, 0, 5))) return 'Choose days from Monday to Saturday.';
  if (b.restricted) {
    if (!isDateKey(b.restrictFrom) || !isDateKey(b.restrictUntil)) return 'Choose the start and end dates for restricted bookings.';
    if (b.restrictFrom > b.restrictUntil) return 'The end date must be on or after the start date.';
    if (b.restrictDays.length === 0) return 'Choose at least one day of the week.';
  } else if ((b.restrictFrom && !isDateKey(b.restrictFrom)) || (b.restrictUntil && !isDateKey(b.restrictUntil))) {
    return 'Those dates aren’t valid.';
  }
  return null;
}

/** Another space already on that floor of that building, if any. */
const spaceOnFloor = (buildingId: string, floor: number, except?: string) =>
  adminSpaces.find((s) => s.buildingId === buildingId && s.floor === floor && s.id !== except);

app.get('/api/admin/spaces', (_req, res) => {
  res.json({ spaces: [...adminSpaces].sort(spaceOrder).map(spaceView) });
});

app.post('/api/admin/spaces', (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const building = adminBuildings.find((b) => b.id === body.buildingId);
  if (!building) return res.status(400).json({ error: 'Choose a building.' });
  if (building.status !== 'active') return res.status(409).json({ error: `${building.name} is archived. Restore the building first.` });
  if (!isWhole(body.floor, 1, building.floors)) return res.status(400).json({ error: `Choose a floor from 1 to ${building.floors}.` });
  if (typeof body.leasedArea !== 'number' || !(body.leasedArea > 0 && body.leasedArea <= 10_000_000))
    return res.status(400).json({ error: 'Enter the leasing area in square feet.' });
  if (!isWhole(body.capacity, 1, MAX_SPACE_CAPACITY)) return res.status(400).json({ error: 'Total space capacity must be between 1 and 10,000.' });
  if (body.floorMap !== undefined) {
    const problem = floorMapProblem(body.floorMap);
    if (problem) return res.status(400).json({ error: problem });
  }
  const taken = spaceOnFloor(building.id, body.floor as number);
  if (taken)
    return res.status(409).json({
      error:
        taken.status === 'active'
          ? `${building.name} already has a space on the ${floorName(taken.floor)}.`
          : `${building.name} has an archived space on the ${floorName(taken.floor)}. Restore that one instead.`,
    });
  const number = nextSpaceNumber();
  const created: AdminSpace = {
    id: `sp-${number}`,
    number,
    buildingId: building.id,
    floor: body.floor as number,
    officeNo: '',
    capacity: body.capacity as number,
    leasedArea: Math.round(body.leasedArea as number),
    floorId: typeof body.floorId === 'string' && /^[\w-]{1,64}$/.test(body.floorId) ? body.floorId : randomUUID(),
    floorMap: (body.floorMap as AdminSpace['floorMap'] | undefined) ?? null,
    status: 'active',
    booking: defaultSpaceBooking(),
  };
  adminSpaces.push(created);
  res.status(201).json(spaceView(created));
});

/** Edit a space (building, floor, capacity, floor map, booking settings), archive it or restore it. */
app.patch('/api/admin/spaces/:id', (req, res) => {
  const space = adminSpaces.find((s) => s.id === req.params.id);
  if (!space) return res.status(404).json({ error: 'Space not found.' });
  const body = (req.body ?? {}) as Record<string, unknown>;
  const buildingId = (body.buildingId as string | undefined) ?? space.buildingId;
  const building = adminBuildings.find((b) => b.id === buildingId);
  if (!building) return res.status(400).json({ error: 'Choose a building.' });
  const status = (body.status as SpaceStatus | undefined) ?? space.status;
  if (!SPACE_STATUSES.includes(status)) return res.status(400).json({ error: 'Status must be active or inactive.' });
  if (building.status !== 'active' && (buildingId !== space.buildingId || (status === 'active' && space.status !== 'active')))
    return res.status(409).json({ error: `${building.name} is archived. Restore the building first.` });
  const floor = (body.floor as number | undefined) ?? space.floor;
  if (!isWhole(floor, 1, building.floors)) return res.status(400).json({ error: `${building.name} has floors 1 to ${building.floors}.` });
  if (floor !== space.floor || buildingId !== space.buildingId) {
    if (spaceOnFloor(buildingId, floor, space.id)) return res.status(409).json({ error: `${building.name} already has a space on the ${floorName(floor)}.` });
  }
  if (body.capacity !== undefined && !isWhole(body.capacity, 1, MAX_SPACE_CAPACITY))
    return res.status(400).json({ error: 'Total spaces must be between 1 and 10,000.' });
  if (body.floorMap !== undefined) {
    const problem = floorMapProblem(body.floorMap);
    if (problem) return res.status(400).json({ error: problem });
  }
  if (body.booking !== undefined) {
    const problem = bookingProblem(body.booking);
    if (problem) return res.status(400).json({ error: problem });
  }
  space.buildingId = buildingId;
  space.floor = floor;
  space.status = status;
  if (body.capacity !== undefined) space.capacity = body.capacity as number;
  if (body.floorMap !== undefined) space.floorMap = body.floorMap as AdminSpace['floorMap'];
  if (body.booking !== undefined) {
    const b = body.booking as SpaceBookingSettings;
    space.booking = {
      multiDayLimit: b.multiDayLimit,
      futureLimitDays: b.futureLimitDays,
      instructions: b.instructions.trim(),
      restricted: b.restricted,
      restrictFrom: b.restrictFrom,
      restrictUntil: b.restrictUntil,
      restrictDays: [...new Set(b.restrictDays)].sort(),
    };
  }
  res.json(spaceView(space));
});

/** Checks the building fields present in `body`; with `whole`, the required ones must be there. */
function buildingProblem(body: Record<string, unknown>, whole: boolean, except?: string): string | null {
  const has = (k: string) => body[k] !== undefined;
  if (whole || has('name')) {
    if (typeof body.name !== 'string' || !body.name.trim()) return 'Give the building a name.';
    if (body.name.trim().length > 80) return 'Keep the building name under 80 characters.';
    if (adminBuildings.some((b) => b.id !== except && sameName(b.name, body.name as string))) return `There’s already a building called ${body.name.trim()}.`;
  }
  for (const [k, noun] of [['address', 'address'], ['city', 'city'], ['state', 'state']] as const)
    if ((whole || has(k)) && (typeof body[k] !== 'string' || !(body[k] as string).trim())) return `Add the building’s ${noun}.`;
  if (has('area') && typeof body.area !== 'string') return 'The area must be text.';
  if ((whole || has('timeZone')) && !isTimeZone(body.timeZone)) return 'Choose a time zone.';
  if ((whole || has('floors')) && !isWhole(body.floors, 1, 200)) return 'A building has between 1 and 200 floors.';
  if ((whole || has('leasedArea')) && !isWhole(body.leasedArea, 1, 10_000_000)) return 'Enter the leased area in square feet.';
  return null;
}

app.get('/api/admin/buildings', (_req, res) => {
  res.json({ buildings: [...adminBuildings].sort((a, b) => a.number - b.number) });
});

/** Adds a building, and the work location users and events pick it by. */
app.post('/api/admin/buildings', (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const problem = buildingProblem(body, true);
  if (problem) return res.status(400).json({ error: problem });
  const name = (body.name as string).trim();
  const slug = name.toLowerCase().replace(/^wework\s+/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'building';
  let id = `loc-${slug}`;
  for (let n = 2; workLocations.some((l) => l.id === id); n++) id = `loc-${slug}-${n}`;
  const created: AdminBuilding = {
    id,
    number: nextBuildingNumber(),
    name,
    address: (body.address as string).trim(),
    city: (body.city as string).trim(),
    state: (body.state as string).trim(),
    area: typeof body.area === 'string' ? body.area.trim() : '',
    timeZone: body.timeZone as string,
    floors: body.floors as number,
    leasedArea: body.leasedArea as number,
    status: 'active',
  };
  adminBuildings.push(created);
  workLocations.push({ id, name: created.name, address: created.address, city: created.city, code: nextLocationCode(created.city), privateOffice: true });
  res.status(201).json(created);
});

/** Edit a building, or archive / restore it. Archiving it archives its spaces too. */
app.patch('/api/admin/buildings/:id', (req, res) => {
  const building = adminBuildings.find((b) => b.id === req.params.id);
  if (!building) return res.status(404).json({ error: 'Building not found.' });
  const body = (req.body ?? {}) as Record<string, unknown>;
  const problem = buildingProblem(body, false, building.id);
  if (problem) return res.status(400).json({ error: problem });
  if (body.status !== undefined && !SPACE_STATUSES.includes(body.status as SpaceStatus))
    return res.status(400).json({ error: 'Status must be active or inactive.' });
  const highest = Math.max(0, ...adminSpaces.filter((s) => s.buildingId === building.id).map((s) => s.floor));
  if (body.floors !== undefined && (body.floors as number) < highest)
    return res.status(409).json({ error: `${building.name} has a space on the ${floorName(highest)}, so it needs at least ${highest} floors.` });
  for (const k of ['name', 'address', 'city', 'state', 'area'] as const) if (typeof body[k] === 'string') building[k] = (body[k] as string).trim();
  if (body.timeZone !== undefined) building.timeZone = body.timeZone as string;
  if (body.floors !== undefined) building.floors = body.floors as number;
  if (body.leasedArea !== undefined) building.leasedArea = body.leasedArea as number;
  if (body.status !== undefined) {
    building.status = body.status as SpaceStatus;
    if (building.status === 'inactive') for (const s of adminSpaces) if (s.buildingId === building.id) s.status = 'inactive';
  }
  // Users and events pick the building by its work location.
  const loc = workLocations.find((l) => l.id === building.id);
  if (loc) Object.assign(loc, { name: building.name, address: building.address, city: building.city });
  res.json(building);
});

const SPACE_BOOKING_KINDS = ['full-day', 'time-duration'];
function spaceTypeProblem(body: Record<string, unknown>, whole: boolean, except?: string): string | null {
  if (whole || body.name !== undefined) {
    if (typeof body.name !== 'string' || !body.name.trim()) return 'Give the space type a name.';
    if (body.name.trim().length > 80) return 'Keep the name under 80 characters.';
    if (spaceTypes.some((t) => t.id !== except && sameName(t.name, body.name as string))) return `There’s already a space type called ${body.name.trim()}.`;
  }
  if ((whole || body.booking !== undefined) && !SPACE_BOOKING_KINDS.includes(body.booking as string)) return 'Choose Full Day or Time duration.';
  return null;
}

// ---------- Admin → Spaces → Space Map: desks, permanent seats, moving and adding desks ----------
const DEFAULT_SEAT_TYPE = 'Desk & Chair';
const MAX_SEAT_NOTES = 200;

/** The space and the desks on its mapped floor, or why it has none. */
function seatMapOf(spaceId: string): { space: AdminSpace; seats: Seat[]; floor?: (typeof floors)[number] } | { status: number; error: string } {
  const space = adminSpaces.find((s) => s.id === spaceId);
  if (!space) return { status: 404, error: 'Space not found.' };
  const seats = space.seatMapId ? seatsByFloor[space.seatMapId] : undefined;
  if (!seats) return { status: 404, error: 'This space’s desks haven’t been mapped yet.' };
  return { space, seats, floor: floors.find((f) => f.id === space.seatMapId) };
}

/** A desk with the person it's kept for, by name, email and department. */
function adminSeat(seat: Seat): AdminSeat {
  const a = seat.assignment;
  const user = a ? adminUsers.find((u) => u.id === a.userId) : undefined;
  return {
    id: seat.id,
    label: seat.label,
    x: seat.x,
    y: seat.y,
    zone: seat.zone,
    spaceType: seat.spaceType ?? DEFAULT_SEAT_TYPE,
    notes: seat.notes ?? '',
    assignment:
      a && user
        ? { ...a, name: user.name, email: user.email, team: user.department || user.team || user.businessUnit, avatar: user.avatar }
        : null,
  };
}

const seatMapView = (space: AdminSpace, seats: Seat[]): AdminSeatMap => ({ seats: seats.map(adminSeat), limit: space.capacity });

/** The next label for a type: its letters and one past the highest number using them ("D61", "M1"). */
function nextSeatLabel(seats: Seat[], spaceType: string): string {
  const prefix = seatPrefix(spaceType);
  const used = seats.map((s) => /^([a-z]+)(\d+)$/i.exec(s.label)).filter((m) => m && m[1].toUpperCase() === prefix).map((m) => Number(m![2]));
  return `${prefix}${Math.max(0, ...used) + 1}`;
}
/** Meeting rooms and phone booths stay open to everyone; desks, cabins and the rest can be kept for one person. */
const canKeepFor = (spaceType: string) => !['M', 'FB'].includes(seatPrefix(spaceType));

const isPercent = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100;
const isSpaceType = (v: unknown, current?: string): v is string => typeof v === 'string' && (v === current || spaceTypes.some((t) => t.name === v));
const isNote = (v: unknown): v is string => v === undefined || (typeof v === 'string' && v.length <= MAX_SEAT_NOTES);

app.get('/api/admin/spaces/:id/seats', (req, res) => {
  const map = seatMapOf(req.params.id);
  if ('error' in map) return res.status(map.status).json({ error: map.error });
  res.json(seatMapView(map.space, map.seats));
});

/** Keeps a desk for one person from a date. One permanent seat each; inactive users get none; the desk's type stays as it is. */
app.put('/api/admin/spaces/:id/seats/:seatId/assignment', (req, res) => {
  const map = seatMapOf(req.params.id);
  if ('error' in map) return res.status(map.status).json({ error: map.error });
  const seat = map.seats.find((s) => s.id === req.params.seatId);
  if (!seat) return res.status(404).json({ error: 'Seat not found.' });
  const body = (req.body ?? {}) as Record<string, unknown>;
  const user = adminUsers.find((u) => u.id === body.userId);
  if (!user) return res.status(400).json({ error: 'Choose who the seat is for.' });
  if (user.status !== 'active') return res.status(409).json({ error: `${user.name} is inactive. Restore them before giving them a seat.` });
  if (!isDateKey(body.effectiveFrom) || Number.isNaN(Date.parse(body.effectiveFrom)))
    return res.status(400).json({ error: 'Choose the date the seat is theirs from.' });
  if (!canKeepFor(seat.spaceType ?? DEFAULT_SEAT_TYPE))
    return res.status(409).json({ error: `${seat.label} is a ${seatPrefix(seat.spaceType!) === 'M' ? 'meeting room' : 'phone booth'}, open for everyone to book.` });
  if (!isNote(body.notes)) return res.status(400).json({ error: `Notes can run to ${MAX_SEAT_NOTES} characters.` });
  for (const list of Object.values(seatsByFloor)) {
    const held = list.find((s) => s.id !== seat.id && s.assignment?.userId === user.id);
    if (held) return res.status(409).json({ error: `${user.name} already has ${held.label} (${held.zone}) as their permanent seat. Free that seat first.` });
  }
  seat.assignment = { userId: user.id, effectiveFrom: body.effectiveFrom, notes: ((body.notes as string | undefined) ?? '').trim() };
  res.json(adminSeat(seat));
});

/**
 * Changes a free desk's type and note. A new type renumbers it within that type (D12 becoming a
 * meeting room is M1); a permanent seat keeps its type until it's freed.
 */
app.patch('/api/admin/spaces/:id/seats/:seatId', (req, res) => {
  const map = seatMapOf(req.params.id);
  if ('error' in map) return res.status(map.status).json({ error: map.error });
  const seat = map.seats.find((s) => s.id === req.params.seatId);
  if (!seat) return res.status(404).json({ error: 'Seat not found.' });
  const body = (req.body ?? {}) as Record<string, unknown>;
  const current = seat.spaceType ?? DEFAULT_SEAT_TYPE;
  const spaceType = body.spaceType === undefined ? current : body.spaceType;
  if (!isSpaceType(spaceType, current)) return res.status(400).json({ error: 'Choose a space type.' });
  if (!isNote(body.notes)) return res.status(400).json({ error: `Notes can run to ${MAX_SEAT_NOTES} characters.` });
  if (spaceType !== current && seat.assignment)
    return res.status(409).json({ error: `${seat.label} is someone's permanent seat. Free it before changing its type.` });
  if (seatPrefix(spaceType) !== seatPrefix(current)) seat.label = nextSeatLabel(map.seats, spaceType);
  seat.spaceType = spaceType;
  if (body.notes !== undefined) seat.notes = (body.notes as string).trim();
  res.json(adminSeat(seat));
});

/** Frees a permanent seat: it goes back to being booked by anyone. */
app.delete('/api/admin/spaces/:id/seats/:seatId/assignment', (req, res) => {
  const map = seatMapOf(req.params.id);
  if ('error' in map) return res.status(map.status).json({ error: map.error });
  const seat = map.seats.find((s) => s.id === req.params.seatId);
  if (!seat) return res.status(404).json({ error: 'Seat not found.' });
  seat.assignment = null;
  res.json(adminSeat(seat));
});

/** Saves edit mode: desks moved on the plan and new desks, up to the space's total spaces. */
app.put('/api/admin/spaces/:id/seats', (req, res) => {
  const map = seatMapOf(req.params.id);
  if ('error' in map) return res.status(map.status).json({ error: map.error });
  const { space, seats, floor } = map;
  const body = (req.body ?? {}) as { moves?: unknown; added?: unknown };
  if (!Array.isArray(body.moves) || !Array.isArray(body.added)) return res.status(400).json({ error: 'Send the desks moved and the desks added.' });
  const moves = body.moves as { id?: unknown; x?: unknown; y?: unknown }[];
  const added = body.added as { x?: unknown; y?: unknown; zone?: unknown; spaceType?: unknown; notes?: unknown }[];
  for (const m of moves) {
    if (!seats.some((s) => s.id === m.id)) return res.status(404).json({ error: 'One of the desks moved is no longer on this floor.' });
    if (!isPercent(m.x) || !isPercent(m.y)) return res.status(400).json({ error: 'Desks have to stay on the floor plan.' });
  }
  if (seats.length + added.length > space.capacity)
    return res.status(409).json({ error: `This space takes up to ${space.capacity} desks. Raise its total spaces to add more.` });
  const zones = floor?.zones ?? [...new Set(seats.map((s) => s.zone))];
  for (const a of added) {
    if (!isPercent(a.x) || !isPercent(a.y)) return res.status(400).json({ error: 'New desks have to go on the floor plan.' });
    if (typeof a.zone !== 'string' || !zones.includes(a.zone)) return res.status(400).json({ error: 'Choose a zone for each new desk.' });
    if (!isSpaceType(a.spaceType)) return res.status(400).json({ error: 'Choose a space type for each new desk.' });
    if (!isNote(a.notes)) return res.status(400).json({ error: `Notes can run to ${MAX_SEAT_NOTES} characters.` });
  }
  const round = (n: number) => Math.round(n * 1000) / 1000;
  for (const m of moves) {
    const seat = seats.find((s) => s.id === m.id)!;
    seat.x = round(m.x as number);
    seat.y = round(m.y as number);
  }
  let seq = Math.max(0, ...Object.values(seatsByFloor).flat().map((s) => Number(/^S-(\d+)$/.exec(s.id)?.[1] ?? 0)));
  for (const a of added) {
    seats.push({
      id: `S-${String(++seq).padStart(3, '0')}`,
      label: nextSeatLabel(seats, a.spaceType as string),
      x: round(a.x as number),
      y: round(a.y as number),
      zone: a.zone as string,
      status: 'available',
      spaceType: a.spaceType as string,
      notes: ((a.notes as string | undefined) ?? '').trim(),
      assignment: null,
    });
  }
  res.json(seatMapView(space, seats));
});

// ---------- Admin → Spaces → Space Zones: rectangles on the plan, each for a business unit, department or team ----------
/** Every space starts without zones. */
const zonesBySpace: Record<string, SpaceZone[]> = {};
/**
 * Each save bumps its space's version. A save must name the version it started from, so one admin's
 * save can't silently wipe zones another admin saved in the meantime.
 */
const zoneVersions: Record<string, number> = {};
/** Zone ids are never reused, even after every zone is deleted. */
let zoneSeq = 0;

/**
 * Zones are kept in a file beside the server, so they outlast a restart (the rest of the demo data
 * is seeded afresh each time). It sits outside src, so writing it doesn't restart the watcher.
 */
const ZONES_FILE = path.join(__dirname, '..', 'data', 'space-zones.json');
try {
  const saved = JSON.parse(fs.readFileSync(ZONES_FILE, 'utf8')) as { zones?: Record<string, SpaceZone[]>; versions?: Record<string, number>; seq?: number };
  // Zones saved before a zone could be for several units had one unitId.
  for (const [spaceId, list] of Object.entries(saved.zones ?? {}))
    zonesBySpace[spaceId] = list.map(({ unitId, ...z }: SpaceZone & { unitId?: string }) => ({ ...z, unitIds: z.unitIds ?? (unitId ? [unitId] : []) }));
  Object.assign(zoneVersions, saved.versions ?? {});
  zoneSeq = saved.seq ?? 0;
} catch {
  // No zones saved yet.
}
function storeZones() {
  try {
    fs.mkdirSync(path.dirname(ZONES_FILE), { recursive: true });
    fs.writeFileSync(ZONES_FILE, JSON.stringify({ zones: zonesBySpace, versions: zoneVersions, seq: zoneSeq }, null, 2));
  } catch (err) {
    console.error('[server] Couldn’t write the zones file:', err);
  }
}

/**
 * The zone's business units, departments or teams that still hold it, in the order they were picked:
 * an archived one no longer does, and a zone left with none is open to all.
 */
function activeZoneUnits(zone: SpaceZone) {
  const units = zoneUnits(zone.level);
  return zone.unitIds.map((id) => units.find((u) => u.id === id)).filter((u) => u !== undefined && u.status === 'active') as (typeof units)[number][];
}

/** "Platform", "Platform and Design", "Platform, Design and Data". */
const andList = (names: string[]) => (names.length < 2 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`);

/**
 * Whether someone in the directory (Admin → Users) may book the zone's seats: they're in one of its
 * teams (or lead it), departments or business units. Inactive people can't.
 */
function inZoneUnit(user: AdminUser | undefined, zone: SpaceZone) {
  const units = activeZoneUnits(zone);
  if (units.length === 0) return true;
  if (!user || user.status !== 'active') return false;
  return units.some((unit) => {
    if (zone.level === 'team') return sameName(user.team, unit.name) || (unit as (typeof teams)[number]).managerId === user.id;
    if (zone.level === 'department') return sameName(user.department, unit.name);
    return sameName(user.businessUnit, unit.name);
  });
}

/** A member who books, as the directory knows them (matched by email). */
const directoryEntry = (memberId: string) => {
  const member = members.find((m) => m.id === memberId);
  return member ? adminUsers.find((u) => sameName(u.email, member.email)) : undefined;
};

/** The zones on a booking floor: those drawn on the space mapped to it. Zones whose unit was archived are open again. */
const floorZones = (floorId: string) =>
  adminSpaces.filter((s) => s.seatMapId === floorId).flatMap((s) => (zonesBySpace[s.id] ?? []).filter((z) => activeZoneUnits(z).length > 0));

/** The zone a desk is in, if any. */
const seatZone = (floorId: string, seat: Seat) => floorZones(floorId).find((z) => inZone(seat, z));

/**
 * The zones on a floor as members see them: where each one is, who it's for, its desks, and which
 * members may book them. Desks outside every zone are open to all.
 */
app.get('/api/floors/:id/zones', (req, res) => {
  const seats = seatsByFloor[req.params.id];
  if (!seats) return res.status(404).json({ error: 'Floor not found' });
  res.json(
    floorZones(req.params.id).map((z) => ({
      id: z.id,
      name: z.name,
      color: z.color,
      x: z.x,
      y: z.y,
      w: z.w,
      h: z.h,
      level: z.level,
      unitNames: activeZoneUnits(z).map((u) => u.name),
      seatIds: seats.filter((s) => inZone(s, z)).map((s) => s.id),
      memberIds: members.filter((m) => inZoneUnit(directoryEntry(m.id), z)).map((m) => m.id),
    })),
  );
});
const ZONE_COLORS: ZoneColor[] = ['blue', 'green', 'orange', 'purple', 'pink', 'teal', 'yellow', 'red'];
const ZONE_LEVELS: ZoneLevel[] = ['business-unit', 'department', 'team'];
const ZONE_LEVEL_NOUN: Record<ZoneLevel, string> = { 'business-unit': 'business unit', department: 'department', team: 'team' };
const MAX_ZONE_NAME = 40;
/** The smallest zone, in percent of the plan's sides. */
const MIN_ZONE_SIDE = 1;
/** Zones may touch; sharing less than this (rounding) isn't an overlap. Matches the client. */
const ZONE_EPS = 0.01;

/** A desk belongs to the zone its centre is in; the right and bottom edges belong to the next zone. */
const inZone = (p: { x: number; y: number }, z: SpaceZone) => p.x >= z.x && p.x < z.x + z.w && p.y >= z.y && p.y < z.y + z.h;
const zonesOverlap = (a: SpaceZone, b: SpaceZone) =>
  Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > ZONE_EPS && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > ZONE_EPS;
/** A booking still to come: on today or later, or a repeating one that runs past today. */
const upcoming = (b: Booking) => b.date >= todayKey() || (!!b.recurrence && b.recurrence.endDate >= todayKey());

/** The desks of upcoming bookings on the floor that the zone's teams (departments, business units) made in the zone. */
function zoneBookings(floorId: string, seats: Seat[], zone: SpaceZone) {
  const inside = new Set(seats.filter((s) => inZone(s, zone)).map((s) => s.id));
  const theirs = (a: BookingAssignment) => inside.has(a.seatId) && inZoneUnit(directoryEntry(a.memberId), zone);
  return bookings.filter((b) => b.floorId === floorId && upcoming(b)).map((b) => ({ booking: b, desks: b.assignments.filter(theirs) })).filter((x) => x.desks.length > 0);
}

/**
 * A zone is being deleted: its teams' upcoming bookings in it are cancelled. A booking that also has
 * desks outside the zone keeps those; desks nobody else has booked are free again. Returns how many
 * bookings were touched.
 */
function cancelZoneBookings(floorId: string, seats: Seat[], zone: SpaceZone) {
  const found = zoneBookings(floorId, seats, zone);
  for (const { booking, desks } of found) {
    booking.assignments = booking.assignments.filter((a) => !desks.includes(a));
    if (booking.assignments.length === 0) {
      bookings.splice(bookings.indexOf(booking), 1);
      cancelledFloorBookings.push({ ...booking, assignments: desks });
    } else {
      // Some of its desks were outside the zone: those stay booked, the rest are listed as cancelled.
      cancelledFloorBookings.push({ ...booking, id: `${booking.id}-C${cancelledFloorSeq++}`, assignments: desks });
    }
    freeSeats(floorId, desks.map((a) => a.seatId));
  }
  return found.length;
}

const zoneView = (zone: SpaceZone, seats: Seat[], floorId: string): SpaceZoneView => ({
  ...zone,
  unitNames: zone.unitIds.map((id) => zoneUnits(zone.level).find((u) => u.id === id)?.name).filter((n): n is string => !!n),
  seatIds: seats.filter((s) => inZone(s, zone)).map((s) => s.id),
  upcomingBookings: zoneBookings(floorId, seats, zone).length,
});
const zoneUnits = (level: ZoneLevel) => (level === 'business-unit' ? businessUnits : level === 'department' ? departments : teams);

app.get('/api/admin/spaces/:id/zones', (req, res) => {
  const map = seatMapOf(req.params.id);
  if ('error' in map) return res.status(map.status).json({ error: map.error });
  const floorId = map.space.seatMapId!;
  res.json({ zones: (zonesBySpace[map.space.id] ?? []).map((z) => zoneView(z, map.seats, floorId)), version: zoneVersions[map.space.id] ?? 0 });
});

/**
 * Saves the map's zones together, replacing what was there: each one named (uniquely on the floor),
 * coloured, inside the plan, clear of the others, and for one or more active business units, departments or teams.
 */
app.put('/api/admin/spaces/:id/zones', (req, res) => {
  const map = seatMapOf(req.params.id);
  if ('error' in map) return res.status(map.status).json({ error: map.error });
  const body = (req.body ?? {}) as { zones?: unknown; version?: unknown };
  if (!Array.isArray(body.zones)) return res.status(400).json({ error: 'Send the zones on the map.' });
  const version = zoneVersions[map.space.id] ?? 0;
  if (body.version !== version)
    return res.status(409).json({ error: 'Someone else changed the zones on this floor while you were editing. Close and reopen the space to see their changes.' });
  const before = zonesBySpace[map.space.id] ?? [];
  const round = (n: number) => Math.round(n * 1000) / 1000;
  const names = new Set<string>();
  const next: SpaceZone[] = [];
  for (const raw of body.zones as Record<string, unknown>[]) {
    const name = typeof raw.name === 'string' ? raw.name.trim() : '';
    if (!name) return res.status(400).json({ error: 'Give each zone a name.' });
    if (name.length > MAX_ZONE_NAME) return res.status(400).json({ error: `Zone names can run to ${MAX_ZONE_NAME} characters.` });
    if (names.has(name.toLowerCase())) return res.status(409).json({ error: `There’s already a zone called ${name} on this floor.` });
    names.add(name.toLowerCase());
    if (!ZONE_COLORS.includes(raw.color as ZoneColor)) return res.status(400).json({ error: `Choose a colour for ${name}.` });
    const { x, y, w, h } = raw;
    if (!isPercent(x) || !isPercent(y) || !isPercent(w) || !isPercent(h) || x + w > 100 + ZONE_EPS || y + h > 100 + ZONE_EPS)
      return res.status(400).json({ error: `${name} has to stay on the floor plan.` });
    if (w < MIN_ZONE_SIDE || h < MIN_ZONE_SIDE) return res.status(400).json({ error: `${name} is too small. Draw it a little bigger.` });
    const level = raw.level as ZoneLevel;
    if (!ZONE_LEVELS.includes(level)) return res.status(400).json({ error: `Choose who ${name} is for.` });
    const kept = before.find((z) => z.id === raw.id);
    const ids = Array.isArray(raw.unitIds) ? [...new Set(raw.unitIds)] : [];
    if (ids.length === 0) return res.status(400).json({ error: `Choose at least one ${ZONE_LEVEL_NOUN[level]} ${name} is for.` });
    const unitIds: string[] = [];
    for (const id of ids) {
      const unit = zoneUnits(level).find((u) => u.id === id);
      // An archived unit can stay on a zone that already had it, but can't be newly chosen.
      if (!unit || (unit.status !== 'active' && !(kept && kept.level === level && kept.unitIds.includes(unit.id))))
        return res.status(400).json({ error: `One of the ${ZONE_LEVEL_NOUN[level]}s chosen for ${name} no longer exists or was archived. Choose again.` });
      unitIds.push(unit.id);
    }
    const zone: SpaceZone = {
      id: kept ? kept.id : `zn-${++zoneSeq}`,
      name,
      color: raw.color as ZoneColor,
      x: round(x),
      y: round(y),
      w: round(Math.min(w, 100 - x)),
      h: round(Math.min(h, 100 - y)),
      level,
      unitIds,
    };
    const clash = next.find((z) => zonesOverlap(z, zone));
    if (clash) return res.status(409).json({ error: `${name} overlaps ${clash.name}. Zones can’t overlap.` });
    next.push(zone);
  }
  // Deleted zones: their teams' upcoming bookings in them are cancelled.
  const floorId = map.space.seatMapId!;
  const cancelledBookings = before.filter((z) => !next.some((n) => n.id === z.id)).reduce((n, z) => n + cancelZoneBookings(floorId, map.seats, z), 0);
  zonesBySpace[map.space.id] = next;
  zoneVersions[map.space.id] = version + 1;
  storeZones();
  res.json({ zones: next.map((z) => zoneView(z, map.seats, floorId)), version: version + 1, cancelledBookings });
});

app.get('/api/admin/space-types', (_req, res) => {
  res.json({ types: [...spaceTypes].sort((a, b) => a.number - b.number) });
});

app.post('/api/admin/space-types', (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const problem = spaceTypeProblem(body, true);
  if (problem) return res.status(400).json({ error: problem });
  const number = nextSpaceTypeNumber();
  const created: SpaceType = { id: `st-${number}`, number, name: (body.name as string).trim(), booking: body.booking as SpaceType['booking'] };
  spaceTypes.push(created);
  res.status(201).json(created);
});

app.patch('/api/admin/space-types/:id', (req, res) => {
  const type = spaceTypes.find((t) => t.id === req.params.id);
  if (!type) return res.status(404).json({ error: 'Space type not found.' });
  const body = (req.body ?? {}) as Record<string, unknown>;
  const problem = spaceTypeProblem(body, false, type.id);
  if (problem) return res.status(400).json({ error: problem });
  if (typeof body.name === 'string') type.name = body.name.trim();
  if (body.booking !== undefined) type.booking = body.booking as SpaceType['booking'];
  res.json(type);
});

app.delete('/api/admin/space-types/:id', (req, res) => {
  const i = spaceTypes.findIndex((t) => t.id === req.params.id);
  if (i < 0) return res.status(404).json({ error: 'Space type not found.' });
  const [removed] = spaceTypes.splice(i, 1);
  res.json(removed);
});

// ---------- Admin: roles ----------
const PERMISSION_KEYS = new Set([...WORKSPACE_PERMISSIONS, ...SYSTEM_PERMISSIONS]);

/** Checks the role fields present in `body`; with `whole`, every field must be there. */
function roleProblem(body: Record<string, unknown>, whole: boolean, except?: string): string | null {
  if (whole || body.name !== undefined) {
    if (typeof body.name !== 'string' || !body.name.trim()) return 'Give the role a name.';
    if (body.name.trim().length > 60) return 'Keep the role name under 60 characters.';
    if (adminRoles.some((r) => r.id !== except && sameName(r.name, body.name as string))) return `There’s already a role called ${body.name.trim()}.`;
  }
  if ((whole || body.description !== undefined) && (typeof body.description !== 'string' || body.description.length > 300))
    return 'Keep the description under 300 characters.';
  if (whole || body.permissions !== undefined) {
    if (!Array.isArray(body.permissions) || !body.permissions.every((k) => typeof k === 'string' && PERMISSION_KEYS.has(k))) return 'One of the permissions isn’t recognised.';
  }
  if (body.status !== undefined && body.status !== 'active' && body.status !== 'inactive') return 'Status must be active or inactive.';
  return null;
}
/** Permissions in the order the page lists them, without repeats. */
const orderedPermissions = (keys: string[]) => [...WORKSPACE_PERMISSIONS, ...SYSTEM_PERMISSIONS].filter((k) => keys.includes(k));

app.get('/api/admin/roles', (_req, res) => {
  res.json({ roles: [...adminRoles].sort((a, b) => a.number - b.number) });
});

app.post('/api/admin/roles', (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const problem = roleProblem(body, true);
  if (problem) return res.status(400).json({ error: problem });
  const number = nextRoleNumber();
  const created: AdminRole = {
    id: `RL-${number}`,
    number,
    name: (body.name as string).trim(),
    description: (body.description as string).trim(),
    status: 'active',
    permissions: orderedPermissions(body.permissions as string[]),
  };
  adminRoles.push(created);
  res.status(201).json(created);
});

/** Rename a role (its users follow), change its description or permissions, or archive / restore it. */
app.patch('/api/admin/roles/:id', (req, res) => {
  const role = adminRoles.find((r) => r.id === req.params.id);
  if (!role) return res.status(404).json({ error: 'Role not found.' });
  const body = (req.body ?? {}) as Record<string, unknown>;
  const problem = roleProblem(body, false, role.id);
  if (problem) return res.status(400).json({ error: problem });
  if (typeof body.name === 'string' && body.name.trim() !== role.name) {
    const name = body.name.trim();
    for (const u of adminUsers) if (u.role === role.name) u.role = name;
    role.name = name;
  }
  if (typeof body.description === 'string') role.description = body.description.trim();
  if (body.permissions !== undefined) role.permissions = orderedPermissions(body.permissions as string[]);
  if (body.status !== undefined) role.status = body.status as AdminRole['status'];
  res.json(role);
});

// ---------- Admin → Access Control ----------
/** What's wrong with a new access level (whole) or a change to one, if anything. */
function accessLevelProblem(body: Record<string, unknown>, whole: boolean, except?: string): string | null {
  if (whole || body.name !== undefined) {
    if (typeof body.name !== 'string' || !body.name.trim()) return 'Give the access level a name.';
    if (body.name.trim().length > 60) return 'Keep the name under 60 characters.';
    if (adminAccessLevels.some((a) => a.id !== except && sameName(a.name, body.name as string))) return `There’s already an access level called ${body.name.trim()}.`;
  }
  if ((whole || body.description !== undefined) && (typeof body.description !== 'string' || body.description.length > 300))
    return 'Keep the description under 300 characters.';
  if ((whole || body.officeLocationIds !== undefined) && !(isLocationList(body.officeLocationIds) && (body.officeLocationIds as string[]).every(isPrivateOfficeBuilding)))
    return 'One of the company office locations isn’t recognised.';
  if ((whole || body.coworkingLocationIds !== undefined) && !isLocationList(body.coworkingLocationIds)) return 'One of the co-working locations isn’t recognised.';
  if ((whole || body.globalAccess !== undefined) && typeof body.globalAccess !== 'boolean') return 'Global access must be on or off.';
  if (body.status !== undefined && body.status !== 'active' && body.status !== 'inactive') return 'Status must be active or inactive.';
  return null;
}
/** Location ids in the order the locations are listed, without repeats. */
const orderedLocations = (ids: string[]) => workLocations.map((l) => l.id).filter((id) => ids.includes(id));

app.get('/api/admin/access-levels', (_req, res) => {
  res.json({ accessLevels: [...adminAccessLevels].sort((a, b) => a.number - b.number) });
});

app.post('/api/admin/access-levels', (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const problem = accessLevelProblem(body, true);
  if (problem) return res.status(400).json({ error: problem });
  const number = nextAccessLevelNumber();
  const created: AdminAccessLevel = {
    id: `AL-${number}`,
    number,
    name: (body.name as string).trim(),
    description: (body.description as string).trim(),
    status: 'active',
    officeLocationIds: orderedLocations(body.officeLocationIds as string[]),
    coworkingLocationIds: orderedLocations(body.coworkingLocationIds as string[]),
    globalAccess: body.globalAccess as boolean,
  };
  adminAccessLevels.push(created);
  res.status(201).json(created);
});

/** Rename an access level (its users follow), change what it opens, or archive / restore it. */
app.patch('/api/admin/access-levels/:id', (req, res) => {
  const level = adminAccessLevels.find((a) => a.id === req.params.id);
  if (!level) return res.status(404).json({ error: 'Access level not found.' });
  const body = (req.body ?? {}) as Record<string, unknown>;
  const problem = accessLevelProblem(body, false, level.id);
  if (problem) return res.status(400).json({ error: problem });
  if (typeof body.name === 'string' && body.name.trim() !== level.name) {
    const name = body.name.trim();
    for (const u of adminUsers) if (u.accessLevel === level.name) u.accessLevel = name;
    level.name = name;
  }
  if (typeof body.description === 'string') level.description = body.description.trim();
  if (body.officeLocationIds !== undefined) level.officeLocationIds = orderedLocations(body.officeLocationIds as string[]);
  if (body.coworkingLocationIds !== undefined) level.coworkingLocationIds = orderedLocations(body.coworkingLocationIds as string[]);
  if (body.globalAccess !== undefined) level.globalAccess = body.globalAccess as boolean;
  if (body.status !== undefined) level.status = body.status as AdminAccessLevel['status'];
  res.json(level);
});

// ---------- Admin → Company Settings ----------
const isTime = (v: unknown): v is string => typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
/** "09:00" → "9:00 AM" */
function clockLabel(time: string) {
  const [h, m] = time.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

app.get('/api/admin/company', (_req, res) => {
  res.json(companySettings);
});

/** Rename the company, change its domain or logo, or turn workspace services on or off for everyone. */
app.patch('/api/admin/company', (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  if (body.name !== undefined && (typeof body.name !== 'string' || !body.name.trim() || body.name.trim().length > 80))
    return res.status(400).json({ error: 'Give the company a name, under 80 characters.' });
  if (body.domain !== undefined && (typeof body.domain !== 'string' || !/^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/i.test(body.domain.trim())))
    return res.status(400).json({ error: 'Enter the company’s domain, like company.com.' });
  if (body.logo !== undefined && body.logo !== '' && !(typeof body.logo === 'string' && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(body.logo) && body.logo.length < 500_000))
    return res.status(400).json({ error: 'That logo can’t be used. Try a PNG, JPG or SVG under 2 MB.' });
  const services = body.services as Record<string, unknown> | undefined;
  if (services !== undefined && (typeof services !== 'object' || services === null || !Object.entries(services).every(([k, v]) => WORKSPACE_PERMISSIONS.includes(k) && typeof v === 'boolean')))
    return res.status(400).json({ error: 'One of the services isn’t recognised.' });

  if (typeof body.name === 'string') companySettings.name = body.name.trim();
  if (typeof body.domain === 'string') companySettings.domain = body.domain.trim().toLowerCase();
  if (body.logo === '') delete companySettings.logo;
  else if (typeof body.logo === 'string') companySettings.logo = body.logo;
  if (services) Object.assign(companySettings.services, services);
  res.json(companySettings);
});

// ---------- Admin → Company Settings → Co-working Permissions ----------
/** WeWork's centres outside India: one switch for all of them. */
const GLOBAL_CENTRES = 120;
/** Hyderabad starts turned off, and the centres abroad, as in the design. */
const coworkingPermissions: Omit<CoworkingPermissions, 'globalCentres'> = {
  disabledLocationIds: workLocations.filter((l) => l.city === 'Hyderabad').map((l) => l.id),
  global: false,
};
const coworkingView = (): CoworkingPermissions => ({ ...coworkingPermissions, globalCentres: GLOBAL_CENTRES });

app.get('/api/admin/coworking', (_req, res) => {
  res.json(coworkingView());
});

/** Saves which buildings are turned off for everyone, and whether the centres abroad are allowed. */
app.put('/api/admin/coworking', (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const ids = body.disabledLocationIds;
  if (!Array.isArray(ids) || !ids.every((id) => workLocations.some((l) => l.id === id)))
    return res.status(400).json({ error: 'One of the locations isn’t recognised. Refresh and try again.' });
  if (typeof body.global !== 'boolean') return res.status(400).json({ error: 'Say whether global locations are allowed.' });
  coworkingPermissions.disabledLocationIds = workLocations.map((l) => l.id).filter((id) => ids.includes(id));
  coworkingPermissions.global = body.global;
  res.json(coworkingView());
});

/** What's wrong with a new shift (whole) or a change to one, if anything. */
function shiftProblem(body: Record<string, unknown>, whole: boolean, shift?: CompanyShift): string | null {
  if (whole || body.name !== undefined) {
    if (typeof body.name !== 'string' || !body.name.trim()) return 'Give the shift a name.';
    if (body.name.trim().length > 40) return 'Keep the shift name under 40 characters.';
    if (companyShifts.some((s) => s.id !== shift?.id && sameName(s.name, body.name as string))) return `There’s already a shift called ${body.name.trim()}.`;
  }
  if ((whole || body.startTime !== undefined) && !isTime(body.startTime)) return 'Pick a start time.';
  if ((whole || body.endTime !== undefined) && !isTime(body.endTime)) return 'Pick an end time.';
  const start = (body.startTime ?? shift?.startTime) as string;
  const end = (body.endTime ?? shift?.endTime) as string;
  if (start === end) return 'The shift has to end at a different time than it starts.';
  if (body.status !== undefined && body.status !== 'active' && body.status !== 'inactive') return 'Status must be active or inactive.';
  return null;
}

app.get('/api/admin/shifts', (_req, res) => {
  res.json({ shifts: [...companyShifts].sort((a, b) => a.number - b.number) });
});

app.post('/api/admin/shifts', (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const problem = shiftProblem(body, true);
  if (problem) return res.status(400).json({ error: problem });
  const number = nextCompanyShiftNumber();
  const created: CompanyShift = {
    id: `shift-${number}`,
    number,
    name: (body.name as string).trim(),
    startTime: body.startTime as string,
    endTime: body.endTime as string,
    status: 'active',
  };
  companyShifts.push(created);
  res.status(201).json(created);
});

/** Rename a shift, change its timings, or turn it on (active) or off (inactive). */
app.patch('/api/admin/shifts/:id', (req, res) => {
  const shift = companyShifts.find((s) => s.id === req.params.id);
  if (!shift) return res.status(404).json({ error: 'Shift not found.' });
  const body = (req.body ?? {}) as Record<string, unknown>;
  const problem = shiftProblem(body, false, shift);
  if (problem) return res.status(400).json({ error: problem });
  if (typeof body.name === 'string') shift.name = body.name.trim();
  if (isTime(body.startTime)) shift.startTime = body.startTime;
  if (isTime(body.endTime)) shift.endTime = body.endTime;
  if (body.status !== undefined) shift.status = body.status as CompanyShift['status'];
  res.json(shift);
});

/** Deletes a shift and cancels every booking made for it. */
app.delete('/api/admin/shifts/:id', (req, res) => {
  const index = companyShifts.findIndex((s) => s.id === req.params.id);
  if (index < 0) return res.status(404).json({ error: 'Shift not found.' });
  const [removed] = companyShifts.splice(index, 1);
  let cancelled = 0;
  for (let i = bookings.length - 1; i >= 0; i--) {
    if (bookings[i].shift === removed.id) {
      const [booking] = bookings.splice(i, 1);
      cancelledFloorBookings.push(booking);
      // Its seats are free again.
      freeSeats(booking.floorId, booking.assignments.map((a) => a.seatId));
      cancelled++;
    }
  }
  res.json({ shift: removed, cancelledBookings: cancelled });
});

// ---------- Admin → Credits ----------
const MAX_OVERAGE = 1_000_000;
const isCredits = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= MAX_OVERAGE;
/** Every active team has an overage record, new ones starting at nothing used and no limit of their own. */
function overageTeams() {
  for (const t of teams) if (t.status === 'active' && !teamOverage.some((o) => o.teamId === t.id)) teamOverage.push({ teamId: t.id, used: 0, limit: null });
  const active = new Set(teams.filter((t) => t.status === 'active').map((t) => t.id));
  return teamOverage.filter((o) => active.has(o.teamId));
}
/** What teams have carved out of the company pool, leaving one team out (the one being changed). */
const allocatedOverage = (except?: string) => overageTeams().reduce((n, o) => n + (o.teamId !== except && o.limit !== null ? o.limit : 0), 0);

function creditOverview() {
  const list = overageTeams();
  return {
    ...creditCycle,
    overageUsed: list.reduce((n, o) => n + o.used, 0),
    overage: overageSettings,
    teams: list,
  };
}

app.get('/api/admin/credits/overview', (_req, res) => {
  res.json(creditOverview());
});

/** Turn overage limits on (the company pool) or off (unlimited), or change the pool's size. */
app.patch('/api/admin/credits/overage', (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  if (body.enabled !== undefined && typeof body.enabled !== 'boolean') return res.status(400).json({ error: 'Overage limits must be on or off.' });
  if (body.limit !== undefined) {
    if (!isCredits(body.limit) || body.limit < 1) return res.status(400).json({ error: 'Enter the overage limit in whole credits.' });
    const allocated = allocatedOverage();
    if (body.limit < allocated)
      return res.status(409).json({ error: `Teams already have ${allocated} credits of overage between them. Keep the limit at ${allocated} or more, or lower their limits first.` });
  }
  if (typeof body.enabled === 'boolean') overageSettings.enabled = body.enabled;
  if (isCredits(body.limit)) overageSettings.limit = body.limit;
  res.json(creditOverview());
});

/** Give a team its own overage limit within the company pool, change it, or (null) put it back on the free pool. */
app.put('/api/admin/credits/overage/teams/:teamId', (req, res) => {
  const team = teams.find((t) => t.id === req.params.teamId && t.status === 'active');
  if (!team) return res.status(404).json({ error: 'Team not found.' });
  if (!overageSettings.enabled) return res.status(409).json({ error: 'Turn on Overage Credit Management first.' });
  const limit = (req.body ?? {}).limit as unknown;
  if (limit !== null && !isCredits(limit)) return res.status(400).json({ error: 'Enter the team’s limit in whole credits.' });
  if (typeof limit === 'number') {
    const room = overageSettings.limit - allocatedOverage(team.id);
    if (limit > room)
      return res.status(409).json({ error: room > 0 ? `Only ${room} credits of the company’s overage limit are left to allocate.` : 'The company’s overage limit is fully allocated. Raise it first.' });
  }
  const record = overageTeams().find((o) => o.teamId === team.id)!;
  record.limit = limit as number | null;
  res.json(creditOverview());
});

app.listen(PORT, () => {
  console.log(`[server] Workplace API listening on http://localhost:${PORT}`);
});
