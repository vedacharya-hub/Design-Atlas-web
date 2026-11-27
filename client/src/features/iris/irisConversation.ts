/* Iris conversation router. Meeting rooms (time → duration → guests → pick a room, and
   irisRoomBookings to reschedule or cancel), desks (irisDeskFlow) and private offices
   (irisOfficeFlow) are guided flows backed by the API; events come from
   the building programme; everything else is a short scripted answer until a real AI backend
   replaces it. */
import { meetingRoomApi, RoomApiError } from '../../api/meetingRoomApi';
import { eventsApi } from '../../api/eventsApi';
import type { MeetingRoom } from '../../api/types';
import { SELECTED_BUILDING } from '../home/selectedBuilding';
import {
  bookingGreeting,
  dateKey,
  formatDuration,
  formatRange,
  formatTime,
  parseTime,
  say,
  type IrisContext,
  type IrisFlow,
  type IrisInput,
  type IrisItem,
  type IrisTurn,
  type RoomFlow,
} from './irisShared';
import {
  CANCEL_TOPIC,
  DESK_TOPIC,
  RESCHEDULE_TOPIC,
  continueDeskFlow,
  startCancel,
  startDeskFlow,
  startReschedule,
  upcomingDeskLines,
} from './irisDeskFlow';
import {
  AFTER_ROOM_BOOKING_CHIPS,
  ROOM_CANCEL_TOPIC,
  ROOM_RESCHEDULE_TOPIC,
  continueRoomBooking,
  hasUpcomingRoomBookings,
  startRoomCancel,
  startRoomReschedule,
} from './irisRoomBookings';
import {
  CANCEL_ALL_TOPIC,
  OFFICE_TOPIC,
  continueOfficeFlow,
  hasUpcomingOfficeBookings,
  startOfficeCancelAll,
  startOfficeFlow,
  startOfficeReschedule,
  upcomingOfficeLines,
} from './irisOfficeFlow';

type SearchFlow = RoomFlow & { start: number; duration: number; guests: number };

const BUILDING = SELECTED_BUILDING.name;
// Matches the server's room hours; the shortest booking is 30 minutes.
const OPEN = 8 * 60;
const CLOSE = 22 * 60;
const MIN_DURATION = 30;
const MAX_TIME_CHIPS = 8;
const DURATIONS = [
  { label: '30 min', minutes: 30 },
  { label: '1 hr', minutes: 60 },
  { label: '1:30 hrs', minutes: 90 },
  { label: '2 hrs', minutes: 120 },
];
const GUESTS = ['3+', '4+', '5+', '6+', '8+'];
const STARTERS = ['Book a desk', 'Book a Meeting room', 'Book a private office'];

/** Bookable days start today; once today's last slot has passed, the flow moves to tomorrow. */
function bookingDay(now: Date) {
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  // Suggestions run hourly, starting one hour after the current hour.
  const first = Math.max(OPEN, Math.floor(nowMinutes / 60) * 60 + 60);
  if (first <= CLOSE - MIN_DURATION) {
    return { date: dateKey(now), day: 'today' as const, earliest: Math.max(OPEN, nowMinutes), first };
  }
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return { date: dateKey(tomorrow), day: 'tomorrow' as const, earliest: OPEN, first: OPEN };
}

function timeChips(first: number, skip?: number) {
  const chips: string[] = [];
  for (let t = first; t <= CLOSE - MIN_DURATION && chips.length < MAX_TIME_CHIPS; t += 60) {
    if (t !== skip) chips.push(formatTime(t));
  }
  return chips;
}

function durationChips(start: number) {
  return DURATIONS.filter((d) => start + d.minutes <= CLOSE).map((d) => d.label);
}

/** "1:30 hrs", "90 min", "1.5 hours", "2" → minutes. */
function parseDuration(text: string): number | null {
  const t = text.toLowerCase().trim();
  const chip = DURATIONS.find((d) => d.label.toLowerCase() === t);
  if (chip) return chip.minutes;
  const hm = t.match(/^(\d{1,2}):(\d{2})/);
  if (hm) return Number(hm[1]) * 60 + Number(hm[2]);
  const hours = t.match(/(\d+(?:\.\d+)?)\s*(h|hr|hrs|hour|hours)\b/);
  const mins = t.match(/(\d+)\s*(m|min|mins|minute|minutes)\b/);
  if (hours || mins) return Math.round(Number(hours?.[1] ?? 0) * 60) + Number(mins?.[1] ?? 0);
  const bare = t.match(/^(\d+(?:\.\d+)?)$/);
  if (bare) return Number(bare[1]) <= 4 ? Math.round(Number(bare[1]) * 60) : Number(bare[1]);
  return null;
}

function parseGuests(text: string): number | null {
  const m = text.match(/(\d{1,2})/);
  const n = m ? Number(m[1]) : NaN;
  return n >= 1 && n <= 50 ? n : null;
}

// Anything that should leave the booking flow and be answered on its own.
const OTHER_TOPIC = /meeting|room|desk|office|nearby|booking|attendance|happening|going on|event|cancel|stop|help/;
// "What's happening at the office today?", "any events today", "what's on" …
const EVENTS_TOPIC = /happening|going on|what'?s on|\bevents?\b/;

function startRoomFlow(ctx: IrisContext): IrisTurn {
  const { date, day, first } = bookingDay(ctx.now);
  const intro =
    day === 'today'
      ? `Sure ${ctx.firstName}! Let's find you a meeting room at ${BUILDING} for today.`
      : `Meeting rooms at ${BUILDING} are closed for the rest of today, ${ctx.firstName}. I can book one for tomorrow instead.`;
  return {
    items: [say(intro), say('What time should the meeting start?')],
    chips: timeChips(first),
    flow: { kind: 'room', step: 'time', date, day },
  };
}

async function searchRooms(flow: SearchFlow, ctx: IrisContext, lead: IrisItem[] = []): Promise<IrisTurn> {
  const { start, duration, guests, day } = flow;
  const end = start + duration;
  const { rooms } = await meetingRoomApi.getAvailability({ date: flow.date, start, duration, guests });
  const range = formatRange(start, end);
  if (rooms.length === 0) {
    const { first } = bookingDay(ctx.now);
    return {
      items: [...lead, say(`No rooms for ${guests}+ people are free ${day}, ${range}. Want to try another time?`)],
      chips: timeChips(day === 'today' ? first : OPEN, start),
      flow: { ...flow, step: 'time', rooms: undefined },
    };
  }
  const label = day === 'today' ? 'Today' : 'Tomorrow';
  return {
    items: [
      ...lead,
      say(`Great! ${rooms.length === 1 ? 'One room is' : `${rooms.length} rooms are`} free ${day}, ${range} for ${guests}+ people.`),
      { kind: 'rooms', title: 'Meeting Rooms Available', subtitle: `WeWork ${BUILDING} · ${label}, ${range}`, rooms },
      say('Select a meeting room you prefer.'),
    ],
    flow: { ...flow, step: 'select', rooms },
  };
}

async function bookRoom(room: MeetingRoom, flow: SearchFlow, ctx: IrisContext): Promise<IrisTurn> {
  const { start, duration, guests, day } = flow;
  try {
    const { booking } = await meetingRoomApi.book({ roomId: room.id, date: flow.date, start, duration, guests });
    const credits = `${booking.credits} credit${booking.credits === 1 ? '' : 's'}`;
    return {
      items: [
        say(`Done! ${room.name} on the ${room.floorLabel} is booked for ${day}, ${formatRange(booking.start, booking.end)}. This uses ${credits}.`),
        bookingGreeting('your meeting', [flow.date], ctx.now, ` at ${formatTime(booking.start)}`),
      ],
      chips: AFTER_ROOM_BOOKING_CHIPS,
      // "Reschedule meeting" / "Cancel meeting" next mean this booking.
      flow: { kind: 'roomBooking', step: 'booked', booking },
      bookedRoomId: room.id,
    };
  } catch (err) {
    if (err instanceof RoomApiError && err.status === 409) {
      return searchRooms(flow, ctx, [say(`Sorry, ${room.name} was just taken. Here's what's still free.`)]);
    }
    throw err;
  }
}

/** Advances the booking flow; returns null when the message is about something else. */
async function continueRoomFlow(input: IrisInput, flow: RoomFlow, ctx: IrisContext): Promise<IrisTurn | null> {
  const text = input.text.trim();
  const lower = text.toLowerCase();

  if (flow.step === 'select') {
    const rooms = flow.rooms ?? [];
    const roomId = input.action?.type === 'selectRoom' ? input.action.roomId : undefined;
    const room = rooms.find((r) => r.id === roomId) ?? rooms.find((r) => lower.includes(r.name.toLowerCase()));
    if (room) return bookRoom(room, flow as SearchFlow, ctx);
    if (roomId) return { items: [say('Please pick one of the rooms above.')], flow };
    return null;
  }

  if (flow.step === 'time') {
    const start = parseTime(text);
    const { earliest, first } = bookingDay(ctx.now);
    const valid = start !== null && start >= (flow.day === 'today' ? earliest : OPEN) && start <= CLOSE - MIN_DURATION;
    if (!valid) {
      if (OTHER_TOPIC.test(lower)) return null;
      return {
        items: [say(`Please pick a start time between ${formatTime(flow.day === 'today' ? first : OPEN)} and ${formatTime(CLOSE - MIN_DURATION)}.`)],
        chips: timeChips(flow.day === 'today' ? first : OPEN),
        flow,
      };
    }
    const next = { ...flow, start };
    if (next.duration && next.guests && start + next.duration <= CLOSE) {
      return searchRooms(next as SearchFlow, ctx);
    }
    return {
      items: [say(`${formatTime(start)} it is. How long do you need the room for?`)],
      chips: durationChips(start),
      flow: { ...next, step: 'duration', duration: undefined },
    };
  }

  if (flow.step === 'duration') {
    const duration = parseDuration(text);
    const start = flow.start ?? OPEN;
    if (duration === null || duration < MIN_DURATION || start + duration > CLOSE) {
      if (OTHER_TOPIC.test(lower)) return null;
      const why = duration !== null && start + duration > CLOSE ? ' Rooms close at 10:00 PM.' : '';
      return { items: [say(`How long do you need the room for?${why}`)], chips: durationChips(start), flow };
    }
    return {
      items: [say(`Got it, ${formatDuration(duration)}. How many guests will be joining?`)],
      chips: GUESTS,
      flow: { ...flow, step: 'guests', duration },
    };
  }

  // step === 'guests'
  const guests = parseGuests(text);
  if (guests === null) {
    if (OTHER_TOPIC.test(lower)) return null;
    return { items: [say('How many guests will be joining?')], chips: GUESTS, flow };
  }
  return searchRooms({ ...flow, guests } as SearchFlow, ctx);
}

/** Everything on the preselected building's programme today (or tomorrow, if asked). */
async function buildingEventsToday(text: string, ctx: IrisContext): Promise<IrisTurn> {
  const tomorrow = /tomorrow/.test(text.toLowerCase());
  const day = tomorrow ? new Date(ctx.now.getFullYear(), ctx.now.getMonth(), ctx.now.getDate() + 1) : ctx.now;
  const date = dateKey(day);
  const dayWord = tomorrow ? 'tomorrow' : 'today';
  const events = await eventsApi.getEvents(BUILDING, date);
  if (events.length === 0) {
    return {
      items: [say(`There's nothing scheduled at ${SELECTED_BUILDING.label} ${dayWord}.`)],
      chips: ['Book a Meeting room', 'Upcoming Bookings'],
      flow: null,
    };
  }

  const nowMinutes = ctx.now.getHours() * 60 + ctx.now.getMinutes();
  const live = tomorrow ? 0 : events.filter((e) => e.start <= nowMinutes && nowMinutes < e.end).length;
  const ended = tomorrow ? 0 : events.filter((e) => e.end <= nowMinutes).length;
  const count = `${events.length} event${events.length === 1 ? '' : 's'}`;
  let summary = `Here's what's happening at ${SELECTED_BUILDING.label} ${dayWord}: ${count}`;
  if (live) summary += `, ${live} on right now`;
  summary += '.';
  if (ended === events.length) summary = `${SELECTED_BUILDING.label} had ${count} ${dayWord}; they've all wrapped up.`;

  const dateLabel = `${day.toLocaleDateString('en-IN', { weekday: 'short' })} ${day.getDate()} ${day.toLocaleDateString('en-IN', { month: 'short' })}`;
  return {
    items: [
      say(summary),
      { kind: 'events', title: `Events at ${BUILDING}`, subtitle: `${tomorrow ? 'Tomorrow' : 'Today'} · ${dateLabel} · ${count}`, events, date },
    ],
    chips: tomorrow ? ['Book a Meeting room'] : ["What's happening tomorrow?", 'Book a Meeting room'],
    flow: null,
  };
}

/** Upcoming meeting-room and desk bookings, soonest first. */
async function upcomingBookings(ctx: IrisContext): Promise<IrisTurn> {
  const today = dateKey(ctx.now);
  const [{ bookings, rooms }, desks, offices] = await Promise.all([meetingRoomApi.getBookings(), upcomingDeskLines(ctx), upcomingOfficeLines(ctx)]);
  const upcoming = bookings.filter((b) => b.date >= today).sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start);
  if (upcoming.length === 0 && desks.length === 0 && offices.length === 0) {
    return { items: [say('You have no upcoming bookings. Want me to book something?')], chips: ['Book a desk', 'Book a Meeting room', 'Book a private office'], flow: null };
  }
  const tomorrow = dateKey(new Date(ctx.now.getFullYear(), ctx.now.getMonth(), ctx.now.getDate() + 1));
  const dayLabel = (date: string) => {
    if (date === today) return 'today';
    if (date === tomorrow) return 'tomorrow';
    const [y, m, d] = date.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
  };
  const lines = [
    ...upcoming.map((b) => {
      const room = rooms.find((r) => r.id === b.roomId);
      return { date: b.date, text: `${room?.name ?? b.roomId}, ${dayLabel(b.date)} ${formatRange(b.start, b.end)}` };
    }),
    ...desks,
    ...offices,
  ].sort((a, b) => a.date.localeCompare(b.date));
  const chips = ['Reschedule booking', 'Cancel booking', ...(desks.length ? [] : ['Book a desk'])];
  return {
    items: [say(`Here's what you have coming up: ${lines.map((l) => l.text).join('; ')}.`)],
    chips: [...chips, 'Book a Meeting room'],
    flow: null,
  };
}

function generalReply(text: string, ctx: IrisContext): IrisTurn {
  const lower = text.toLowerCase();
  if (/nearby|near me|location|building/.test(lower)) {
    return {
      items: [say(`Sure ${ctx.firstName}! Based on your home location there are 3 WeWork buildings nearby`)],
      chips: ['WeWork Vaishnavi Signature', 'WeWork Prestige Central'],
      flow: null,
    };
  }
  if (/^wework /.test(lower)) {
    return {
      items: [say(`${text} has desks and meeting rooms available today. What would you like to book?`)],
      chips: ['Book a desk', 'Book a Meeting room'],
      flow: null,
    };
  }
  if (/attendance/.test(lower)) {
    return { items: [say('You have been in the office 3 days this week.')], flow: null };
  }
  return {
    items: [say('I can help you book desks and meeting rooms, find nearby WeWork spaces, or check your bookings. What would you like to do?')],
    chips: STARTERS,
    flow: null,
  };
}

/**
 * "Reschedule booking" / "Cancel booking" without saying which: the only kind booked, or ask when
 * there are both.
 */
async function chooseBooking(intent: 'reschedule' | 'cancel', lower: string, ctx: IrisContext): Promise<IrisTurn> {
  const desk = intent === 'reschedule' ? startReschedule : startCancel;
  if (DESK_TOPIC.test(lower)) return desk(ctx);
  const [rooms, desks, offices] = await Promise.all([hasUpcomingRoomBookings(ctx), upcomingDeskLines(ctx), hasUpcomingOfficeBookings(ctx)]);
  const verb = intent === 'reschedule' ? 'Reschedule' : 'Cancel';
  const kinds = [
    ...(desks.length ? [{ chip: `${verb} desk`, start: () => desk(ctx) }] : []),
    ...(rooms ? [{ chip: `${verb} meeting`, start: () => (intent === 'reschedule' ? startRoomReschedule(ctx) : startRoomCancel(ctx)) }] : []),
    ...(offices ? [{ chip: `${verb} private office`, start: () => (intent === 'reschedule' ? startOfficeReschedule(ctx) : startOfficeCancelAll(ctx)) }] : []),
  ];
  if (kinds.length > 1) return { items: [say(`Which booking would you like to ${intent}?`)], chips: kinds.map((k) => k.chip), flow: null };
  return kinds[0]?.start() ?? desk(ctx);
}

export async function respond(input: IrisInput, flow: IrisFlow | null, ctx: IrisContext): Promise<IrisTurn> {
  if (flow) {
    const turn =
      flow.kind === 'desk'
        ? await continueDeskFlow(input, flow, ctx)
        : flow.kind === 'roomBooking'
          ? await continueRoomBooking(input, flow, ctx)
          : flow.kind === 'office'
            ? await continueOfficeFlow(input, flow, ctx)
            : await continueRoomFlow(input, flow, ctx);
    if (turn) return turn;
  }
  const lower = input.text.toLowerCase();
  if (OFFICE_TOPIC.test(lower) && RESCHEDULE_TOPIC.test(lower)) return startOfficeReschedule(ctx);
  if (OFFICE_TOPIC.test(lower) && /\bcancel\b/.test(lower)) return startOfficeCancelAll(ctx);
  // "Cancel all bookings" means the private office booking when there is one.
  if (CANCEL_ALL_TOPIC.test(lower)) return (await hasUpcomingOfficeBookings(ctx)) ? startOfficeCancelAll(ctx) : chooseBooking('cancel', lower, ctx);
  if (ROOM_RESCHEDULE_TOPIC.test(lower)) return startRoomReschedule(ctx);
  if (ROOM_CANCEL_TOPIC.test(lower)) return startRoomCancel(ctx);
  if (RESCHEDULE_TOPIC.test(lower)) return chooseBooking('reschedule', lower, ctx);
  if (CANCEL_TOPIC.test(lower)) return chooseBooking('cancel', lower, ctx);
  if (EVENTS_TOPIC.test(lower)) return buildingEventsToday(input.text, ctx);
  if (/upcoming|my booking|bookings/.test(lower)) return upcomingBookings(ctx);
  if (OFFICE_TOPIC.test(lower)) return startOfficeFlow(ctx);
  if (/meeting|room/.test(lower)) return startRoomFlow(ctx);
  if (DESK_TOPIC.test(lower)) return startDeskFlow(ctx);
  return generalReply(input.text, ctx);
}
