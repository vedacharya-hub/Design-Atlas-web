/* The booking API, run in the page so Iris works without the server: the routes Iris and the desk
   booking page call (members, meeting rooms, events, desks, private offices, floor seats), ported
   from server/src/index.ts and backed by the server's own seed data. Bookings are kept in this
   browser, so they're still there after a reload. */
import {
  floors,
  shifts,
  members,
  bookings,
  seatsByFloor,
  meetingRooms,
  roomDailyBusy,
  roomBookings,
  ROOM_HOURS,
  buildingEvents,
  desks,
  deskBookings,
  favouriteDesks,
  privateOffices,
  officeBookings,
} from '../../server/src/data/seed';
import type { Booking, BookingAssignment, DeskBooking, DeskOption, FilterOptions, OfficeBooking, RecurrenceRule, RoomBooking, SeatStatus } from '../src/api/types';

/** Fired on `window` after any booking changes. */
export const IRIS_DATA_EVENT = 'iris:data';

type Body = Record<string, unknown>;
interface Request {
  params: Record<string, string>;
  query: Record<string, string>;
  body: Body;
}
interface Reply {
  status: number;
  body?: unknown;
}
type Handler = (req: Request) => Reply;

const routes: { method: string; pattern: RegExp; keys: string[]; handler: Handler }[] = [];
function route(method: string, path: string, handler: Handler) {
  const keys: string[] = [];
  const pattern = new RegExp(`^${path.replace(/:(\w+)/g, (_, key: string) => (keys.push(key), '([^/]+)'))}$`);
  routes.push({ method, pattern, keys, handler });
}
const ok = (body: unknown, status = 200): Reply => ({ status, body });
const fail = (status: number, error: string, extra: Body = {}): Reply => ({ status, body: { error, ...extra } });

// Desk and office booking records without the joined desk/office (as the server stores them).
type StoredDesk = Omit<DeskBooking, 'desk'>;
type StoredOffice = Omit<OfficeBooking, 'office'>;

const CURRENT_MEMBER = members.find((m) => m.isCurrentUser)?.id ?? 'u-001';
const pad = (n: number) => String(n).padStart(2, '0');
const isDateKey = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const minutesNow = () => {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
};

/** The next free number after the highest one in use ("MR-0004" → 5). */
function nextNumber(ids: string[], from = 1) {
  return Math.max(from - 1, ...ids.map((id) => Number(id.replace(/\D/g, '')) || 0)) + 1;
}
const nextId = (prefix: string, ids: string[]) => `${prefix}-${String(nextNumber(ids)).padStart(4, '0')}`;
const nextReference = () => String(nextNumber([...deskBookings, ...cancelledDeskBookings, ...officeBookings].map((b) => b.reference), 104735421));

// ---------- members, filters, floors (desk booking page) ----------
route('GET', '/api/members', ({ query }) => {
  const q = query.query?.toLowerCase().trim();
  const filtered = q ? members.filter((m) => m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q)) : members;
  return ok([...filtered].sort((a, b) => Number(!!b.isCurrentUser) - Number(!!a.isCurrentUser)));
});

route('GET', '/api/filters', () => {
  const options: FilterOptions = {
    buildings: [...new Set(floors.map((f) => f.building))],
    floors: floors.map((f) => ({ id: f.id, label: f.floorLabel, building: f.building })),
    offices: floors.map((f) => ({ floorId: f.id, officeNo: f.officeNo })),
    shifts,
  };
  return ok(options);
});

route('GET', '/api/floors/:id', ({ params }) => {
  const floor = floors.find((f) => f.id === params.id);
  return floor ? ok(floor) : fail(404, 'Floor not found');
});

route('GET', '/api/floors/:id/seats', ({ params, query }) => {
  const seats = seatsByFloor[params.id];
  if (!seats) return fail(404, 'Floor not found');
  return ok(query.zone && query.zone !== 'all' ? seats.filter((s) => s.zone === query.zone) : seats);
});

route('GET', '/api/bookings', () => ok(bookings));

route('POST', '/api/bookings', ({ body }) => {
  const { floorId, shift, date, mode, assignments, recurrence } = body as {
    floorId?: string;
    shift?: string;
    date?: string;
    mode?: 'self' | 'others';
    assignments?: BookingAssignment[];
    recurrence?: RecurrenceRule;
  };
  if (!floorId || !shift || !date || !mode || !Array.isArray(assignments) || assignments.length === 0) {
    return fail(400, 'Missing required booking fields.');
  }
  if (mode === 'others' && recurrence) return fail(400, 'Recurring bookings support a single person only.');
  const seats = seatsByFloor[floorId];
  if (!seats) return fail(404, 'Floor not found');
  const unavailable = assignments.filter((a) => {
    const seat = seats.find((s) => s.id === a.seatId);
    return !seat || seat.status === 'unavailable';
  });
  if (unavailable.length > 0) {
    return fail(409, 'One or more selected seats are no longer available.', { seatIds: unavailable.map((a) => a.seatId) });
  }
  for (const a of assignments) seats.find((s) => s.id === a.seatId)!.status = 'unavailable';
  const booking: Booking = {
    id: nextId('B', bookings.map((b) => b.id)),
    floorId,
    shift,
    date,
    mode,
    assignments,
    recurrence,
    createdAt: new Date().toISOString(),
  };
  bookings.push(booking);
  return ok(booking, 201);
});

// ---------- meeting rooms ----------
interface RoomSlot {
  date: string;
  start: number;
  end: number;
  guests: number;
}

function parseRoomSlot(input: Body): RoomSlot | string {
  const date = String(input.date ?? '');
  const start = Number(input.start);
  const duration = Number(input.duration);
  const guests = Number(input.guests);
  if (!isDateKey(date)) return 'A date (YYYY-MM-DD) is required.';
  if (!Number.isInteger(start) || !Number.isInteger(duration) || duration <= 0) return 'A start time and duration are required.';
  if (!Number.isInteger(guests) || guests < 1) return 'Number of guests is required.';
  const end = start + duration;
  if (start < ROOM_HOURS.open || end > ROOM_HOURS.close) return 'Meeting rooms are open 8:00 AM - 10:00 PM.';
  return { date, start, end, guests };
}

function isRoomFree(roomId: string, slot: RoomSlot, ignoreBookingId?: string) {
  const overlaps = (s: number, e: number) => s < slot.end && slot.start < e;
  return (
    !(roomDailyBusy[roomId] ?? []).some(([s, e]) => overlaps(s, e)) &&
    !roomBookings.some((b) => b.id !== ignoreBookingId && b.roomId === roomId && b.date === slot.date && overlaps(b.start, b.end))
  );
}

const ROOM_SLOT_STEP = 30;

route('GET', '/api/meeting-rooms/availability', ({ query }) => {
  const slot = parseRoomSlot(query);
  if (typeof slot === 'string') return fail(400, slot);
  const rooms = meetingRooms
    .filter((r) => r.capacity >= slot.guests && isRoomFree(r.id, slot))
    .sort((a, b) => a.capacity - b.capacity || a.creditsPerHour - b.creditsPerHour);
  return ok({ ...slot, rooms });
});

route('GET', '/api/meeting-rooms/bookings', () => ok({ bookings: roomBookings, rooms: meetingRooms }));

route('GET', '/api/meeting-rooms/bookings/:id/slots', ({ params }) => {
  const booking = roomBookings.find((b) => b.id === params.id);
  if (!booking) return fail(404, 'Booking not found.');
  const room = meetingRooms.find((r) => r.id === booking.roomId)!;
  const duration = booking.end - booking.start;
  const earliest = booking.date === todayKey() ? Math.ceil(minutesNow() / ROOM_SLOT_STEP) * ROOM_SLOT_STEP : ROOM_HOURS.open;
  const slots: number[] = [];
  for (let start = Math.max(ROOM_HOURS.open, earliest); start + duration <= ROOM_HOURS.close; start += ROOM_SLOT_STEP) {
    const slot = { date: booking.date, start, end: start + duration, guests: booking.guests };
    if (start !== booking.start && isRoomFree(room.id, slot, booking.id)) slots.push(start);
  }
  return ok({ booking, room, slots });
});

route('PATCH', '/api/meeting-rooms/bookings/:id', ({ params, body }) => {
  const booking = roomBookings.find((b) => b.id === params.id);
  if (!booking) return fail(404, 'Booking not found.');
  const room = meetingRooms.find((r) => r.id === booking.roomId)!;
  const start = Number(body.start);
  const duration = booking.end - booking.start;
  if (!Number.isInteger(start) || start < ROOM_HOURS.open || start + duration > ROOM_HOURS.close) {
    return fail(400, 'Meeting rooms are open 8:00 AM - 10:00 PM.');
  }
  if (booking.date === todayKey() && start < minutesNow()) return fail(400, 'That time has already passed.');
  const slot = { date: booking.date, start, end: start + duration, guests: booking.guests };
  if (!isRoomFree(room.id, slot, booking.id)) return fail(409, `${room.name} is no longer free at that time.`);
  booking.start = slot.start;
  booking.end = slot.end;
  return ok({ booking, room });
});

route('DELETE', '/api/meeting-rooms/bookings/:id', ({ params }) => {
  const i = roomBookings.findIndex((b) => b.id === params.id);
  if (i < 0) return fail(404, 'Booking not found.');
  const [removed] = roomBookings.splice(i, 1);
  return ok({ booking: removed, room: meetingRooms.find((r) => r.id === removed.roomId) });
});

route('POST', '/api/meeting-rooms/bookings', ({ body }) => {
  const slot = parseRoomSlot(body);
  if (typeof slot === 'string') return fail(400, slot);
  const room = meetingRooms.find((r) => r.id === body.roomId);
  if (!room) return fail(404, 'Meeting room not found.');
  if (room.capacity < slot.guests) return fail(400, `${room.name} seats up to ${room.capacity}.`);
  if (!isRoomFree(room.id, slot)) return fail(409, `${room.name} is no longer free for that time.`);
  const booking: RoomBooking = {
    id: nextId('MR', roomBookings.map((b) => b.id)),
    roomId: room.id,
    ...slot,
    credits: (room.creditsPerHour * (slot.end - slot.start)) / 60,
    createdAt: new Date().toISOString(),
  };
  roomBookings.push(booking);
  return ok({ booking, room }, 201);
});

// ---------- events ----------
route('GET', '/api/events', ({ query }) => {
  const building = (query.building ?? '').trim();
  const date = query.date ?? '';
  if (!building) return fail(400, 'A building is required.');
  if (!isDateKey(date)) return fail(400, 'A date (YYYY-MM-DD) is required.');
  const [y, m, d] = date.split('-').map(Number);
  const weekday = new Date(y, m - 1, d).getDay();
  const events = buildingEvents
    .filter((e) => e.building.toLowerCase() === building.toLowerCase() && e.days.includes(weekday))
    .sort((a, b) => a.start - b.start)
    .map(({ days: _days, ...event }) => event);
  return ok({ building, date, events });
});

// ---------- desks ----------
/** Colleagues' bookings, simulated deterministically per date (as on the server). */
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
  return !takenByOthers(deskId, date) && !deskBookings.some((b) => b.deskId === deskId && b.date === date && b.id !== ignoreBookingId);
}

const withDesk = (b: StoredDesk) => ({ ...b, desk: desks.find((d) => d.id === b.deskId)! });
const cancelledDeskBookings: StoredDesk[] = [];

function readDates(raw: unknown): string[] | null {
  const dates = [...new Set(String(raw ?? '').split(',').map((d) => d.trim()).filter(Boolean))].sort();
  return dates.length > 0 && dates.every(isDateKey) ? dates : null;
}

route('GET', '/api/desks/recommendations', ({ query }) => {
  const dates = readDates(query.dates ?? query.date);
  if (!dates) return fail(400, 'One or more dates (YYYY-MM-DD) are required.');

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

  return ok({
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

route('GET', '/api/desks/bookings', () => {
  const mine = (list: StoredDesk[]) => list.filter((b) => b.memberId === CURRENT_MEMBER).sort((a, b) => a.date.localeCompare(b.date)).map(withDesk);
  return ok({ bookings: mine(deskBookings), cancelled: mine(cancelledDeskBookings) });
});

route('POST', '/api/desks/bookings', ({ body }) => {
  const dates = readDates(Array.isArray(body.dates) ? body.dates.join(',') : body.date);
  if (!dates || dates[0] < todayKey()) return fail(400, 'Pick today or future dates.');
  const desk = desks.find((d) => d.id === body.deskId);
  if (!desk) return fail(404, 'Desk not found.');
  const clash = deskBookings.find((b) => b.memberId === CURRENT_MEMBER && dates.includes(b.date));
  if (clash) return fail(409, `You already have ${clash.deskId} booked on ${clash.date}.`, { code: 'member-busy' });
  const takenOn = dates.filter((d) => !isDeskFree(desk.id, d));
  if (takenOn.length) return fail(409, `${desk.id} is no longer free on ${takenOn.join(', ')}.`, { code: 'desk-taken' });

  const createdAt = new Date().toISOString();
  const groupId = `DG-${Date.now().toString(36)}`;
  const reference = nextReference();
  const created: StoredDesk[] = [];
  for (const date of dates) {
    const id = nextId('DB', [...deskBookings, ...cancelledDeskBookings].map((b) => b.id));
    const booking = { id, deskId: desk.id, memberId: CURRENT_MEMBER, date, groupId, reference, createdAt };
    deskBookings.push(booking);
    created.push(booking);
  }
  return ok({ bookings: created.map(withDesk) }, 201);
});

route('PATCH', '/api/desks/bookings/:id', ({ params, body }) => {
  const booking = deskBookings.find((b) => b.id === params.id && b.memberId === CURRENT_MEMBER);
  if (!booking) return fail(404, 'Booking not found.');
  const date = body.date;
  const deskId = (body.deskId as string | undefined) ?? booking.deskId;
  if (!isDateKey(date) || date < todayKey()) return fail(400, 'Pick today or a future date.');
  if (!desks.some((d) => d.id === deskId)) return fail(404, 'Desk not found.');
  const clash = deskBookings.find((b) => b.memberId === CURRENT_MEMBER && b.date === date && b.id !== booking.id);
  if (clash) return fail(409, `You already have ${clash.deskId} booked that day.`, { code: 'member-busy' });
  if (!isDeskFree(deskId, date, booking.id)) return fail(409, `${deskId} is not free that day.`, { code: 'desk-taken' });
  booking.date = date;
  booking.deskId = deskId;
  return ok(withDesk(booking));
});

route('DELETE', '/api/desks/bookings/:id', ({ params }) => {
  const i = deskBookings.findIndex((b) => b.id === params.id && b.memberId === CURRENT_MEMBER);
  if (i < 0) return fail(404, 'Booking not found.');
  const [removed] = deskBookings.splice(i, 1);
  cancelledDeskBookings.push(removed);
  return ok(withDesk(removed));
});

// ---------- private offices ----------
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

const withOffice = (b: StoredOffice) => ({ ...b, office: privateOffices.find((o) => o.id === b.officeId)! });

route('GET', '/api/private-offices/availability', ({ query }) => {
  const dates = readDates(query.dates ?? query.date);
  if (!dates) return fail(400, 'One or more dates (YYYY-MM-DD) are required.');
  const offices = privateOffices.filter((o) => dates.every((d) => isOfficeFree(o.id, d))).sort((a, b) => a.capacity - b.capacity);
  return ok({ dates, offices });
});

route('GET', '/api/private-offices/bookings', () => {
  const mine = officeBookings.filter((b) => b.memberId === CURRENT_MEMBER).sort((a, b) => a.date.localeCompare(b.date));
  return ok({ bookings: mine.map(withOffice) });
});

route('POST', '/api/private-offices/bookings', ({ body }) => {
  const office = privateOffices.find((o) => o.id === body.officeId);
  if (!office) return fail(404, 'Private office not found.');
  const dates = readDates(Array.isArray(body.dates) ? body.dates.join(',') : '');
  if (!dates || dates[0] < todayKey()) return fail(400, 'Pick today or future dates.');
  const takenOn = dates.filter((d) => !isOfficeFree(office.id, d));
  if (takenOn.length) return fail(409, `${office.name} is no longer free on ${takenOn.join(', ')}.`);

  const createdAt = new Date().toISOString();
  const groupId = `OG-${Date.now().toString(36)}`;
  const reference = nextReference();
  const created: StoredOffice[] = [];
  for (const date of dates) {
    const id = nextId('PO', officeBookings.map((b) => b.id));
    const booking = { id, officeId: office.id, memberId: CURRENT_MEMBER, date, groupId, reference, credits: office.creditsPerDay, createdAt };
    officeBookings.push(booking);
    created.push(booking);
  }
  return ok({ bookings: created.map(withOffice) }, 201);
});

route('PATCH', '/api/private-offices/bookings/:id', ({ params, body }) => {
  const booking = officeBookings.find((b) => b.id === params.id && b.memberId === CURRENT_MEMBER);
  if (!booking) return fail(404, 'Booking not found.');
  const date = body.date;
  if (!isDateKey(date) || date < todayKey()) return fail(400, 'Pick today or a future date.');
  const office = privateOffices.find((o) => o.id === booking.officeId)!;
  const clash = officeBookings.find((b) => b.groupId === booking.groupId && b.date === date && b.id !== booking.id);
  if (clash) return fail(409, `You already have ${office.name} that day.`);
  if (!isOfficeFree(office.id, date, booking.id)) return fail(409, `${office.name} isn't free that day.`);
  booking.date = date;
  return ok(withOffice(booking));
});

route('DELETE', '/api/private-offices/bookings/:id', ({ params }) => {
  const i = officeBookings.findIndex((b) => b.id === params.id && b.memberId === CURRENT_MEMBER);
  if (i < 0) return fail(404, 'Booking not found.');
  const [removed] = officeBookings.splice(i, 1);
  return ok(withOffice(removed));
});

// ---------- kept in this browser ----------
const STORE_KEY = 'iris.demo.v1';

interface Saved {
  v: 1;
  roomBookings: RoomBooking[];
  deskBookings: StoredDesk[];
  cancelledDeskBookings: StoredDesk[];
  officeBookings: StoredOffice[];
  bookings: Booking[];
  seats: Record<string, Record<string, SeatStatus>>;
}

// Two upcoming bookings so there's something to see, reschedule and cancel from the first visit:
// the member's usual desk on the next weekday, and a meeting room tomorrow morning.
{
  const now = new Date();
  const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const weekday = new Date(tomorrow);
  while ([0, 6].includes(weekday.getDay())) weekday.setDate(weekday.getDate() + 1);
  const createdAt = now.toISOString();
  const deskId = nextId('DB', deskBookings.map((b) => b.id));
  deskBookings.push({ id: deskId, deskId: 'D12', memberId: CURRENT_MEMBER, date: dayKey(weekday), groupId: deskId, reference: nextReference(), createdAt });
  const room = meetingRooms.find((r) => r.id === 'mr-24b')!;
  roomBookings.push({ id: 'MR-0001', roomId: room.id, date: dayKey(tomorrow), start: 11 * 60, end: 12 * 60, guests: 4, credits: room.creditsPerHour, createdAt });
}

const replace = <T,>(list: T[], items: T[]) => list.splice(0, list.length, ...items);
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

// The seed as it loaded, for "Reset demo data".
const SEED = clone({ roomBookings, deskBookings, cancelledDeskBookings, officeBookings, bookings, seatsByFloor });

function snapshot(): Saved {
  const seats: Saved['seats'] = {};
  for (const [floorId, list] of Object.entries(seatsByFloor)) seats[floorId] = Object.fromEntries(list.map((s) => [s.id, s.status]));
  return { v: 1, roomBookings, deskBookings, cancelledDeskBookings, officeBookings, bookings, seats };
}

function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(snapshot()));
  } catch {
    // Storage blocked: bookings last until the page closes.
  }
}

function restore() {
  let saved: Saved | null = null;
  try {
    saved = JSON.parse(localStorage.getItem(STORE_KEY) ?? 'null') as Saved | null;
  } catch {
    saved = null;
  }
  if (saved?.v !== 1) return;
  replace(roomBookings, saved.roomBookings ?? []);
  replace(deskBookings, saved.deskBookings ?? []);
  replace(cancelledDeskBookings, saved.cancelledDeskBookings ?? []);
  replace(officeBookings, saved.officeBookings ?? []);
  replace(bookings, saved.bookings ?? []);
  for (const [floorId, statuses] of Object.entries(saved.seats ?? {})) {
    for (const seat of seatsByFloor[floorId] ?? []) seat.status = statuses[seat.id] ?? seat.status;
  }
}

/** Puts every booking back to how the demo starts. */
export function resetMockData() {
  const seed = clone(SEED);
  replace(roomBookings, seed.roomBookings);
  replace(deskBookings, seed.deskBookings);
  replace(cancelledDeskBookings, seed.cancelledDeskBookings);
  replace(officeBookings, seed.officeBookings);
  replace(bookings, seed.bookings);
  for (const [floorId, list] of Object.entries(seed.seatsByFloor)) replace(seatsByFloor[floorId], list);
  try {
    localStorage.removeItem(STORE_KEY);
  } catch {
    // Nothing stored.
  }
  window.dispatchEvent(new Event(IRIS_DATA_EVENT));
}

// ---------- fetch ----------
const LATENCY_MS = [60, 180];
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function handle(method: string, url: string, rawBody: unknown): Reply {
  // A fixed base: the page may sit at about:srcdoc or a blob: URL, where relative URLs don't resolve.
  const { pathname, searchParams } = new URL(url, 'http://iris.local');
  for (const r of routes) {
    if (r.method !== method) continue;
    const match = pathname.match(r.pattern);
    if (!match) continue;
    const params = Object.fromEntries(r.keys.map((key, i) => [key, decodeURIComponent(match[i + 1])]));
    let body: Body = {};
    if (typeof rawBody === 'string' && rawBody) body = JSON.parse(rawBody) as Body;
    return r.handler({ params, query: Object.fromEntries(searchParams), body });
  }
  return fail(404, `No route for ${method} ${pathname}`);
}

/** Answers the page's /api requests in place of the server. */
export function installMockServer() {
  restore();
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (!url.startsWith('/api/')) return realFetch(input, init);
    const method = (init?.method ?? 'GET').toUpperCase();
    await sleep(LATENCY_MS[0] + Math.random() * (LATENCY_MS[1] - LATENCY_MS[0]));
    let reply: Reply;
    try {
      reply = handle(method, url, init?.body);
    } catch (err) {
      reply = fail(500, err instanceof Error ? err.message : 'Something went wrong.');
    }
    if (method !== 'GET' && reply.status < 400) {
      save();
      window.dispatchEvent(new Event(IRIS_DATA_EVENT));
    }
    return new Response(reply.status === 204 ? null : JSON.stringify(reply.body ?? {}), {
      status: reply.status,
      headers: { 'Content-Type': 'application/json' },
    });
  };
}
