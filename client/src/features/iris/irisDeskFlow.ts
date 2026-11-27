/* Desk booking through Iris for the 100-desk Google office at the preselected building:
   office card + multi-select calendar → Apply → four desks (favourite / recently booked first, then
   nearby) plus "Choose seats manually" (hands off to the full desk booking page) → Summary with a
   "Book desk" CTA → the same card with the Booking ID, and a greeting. Reschedule / cancel pick the
   day from a radio list when there are several, then reschedule shows "previous → new" on the calendar. */
import { deskApi, DeskApiError } from '../../api/deskApi';
import type { Desk, DeskBooking } from '../../api/types';
import { SELECTED_OFFICE } from '../home/selectedBuilding';
import {
  addDays,
  bookingGreeting,
  dateKey,
  deskHeadline,
  formatBookingDates,
  formatDay,
  say,
  type DeskFlow,
  type IrisContext,
  type IrisInput,
  type IrisItem,
  type IrisTurn,
  type SummaryRow,
} from './irisShared';

const BOOKING_WINDOW_DAYS = 60;
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const AFTER_BOOKING_CHIPS = ['Reschedule booking', 'Cancel booking', 'Book a Meeting room'];
const DESK_HOURS = '9:00 AM - 8:00 PM (All Day)';

// Messages about something else entirely end the desk flow and are answered on their own.
const LEAVE_FLOW = /meeting|room|private office|nearby|attendance|happening|going on|event|upcoming|help/;
const STOP = /^(stop|never ?mind|forget it|cancel)\b/;
const YES = /^(yes|yep|yeah|sure|ok(ay)?|confirm|book( it| desk)?|go ahead)\b/;
const NO = /^(no|nope|not now|keep)\b/;
const MANUAL = /manual|myself|full (floor|list)|all (desks|seats)|choose seats?/;

export const DESK_TOPIC = /desk|seat/;
export const RESCHEDULE_TOPIC = /reschedul|move my (desk|booking)/;
export const CANCEL_TOPIC = /cancel (my |the )?(desk|booking)|cancel booking/;

/** The rows of the Figma summary card (9961:239115); the Booking ID only exists once booked. */
function bookingRows(deskId: string, dates: string[], reference?: string): SummaryRow[] {
  return [
    ...(reference ? [{ label: 'Booking ID', value: reference }] : []),
    { label: 'Office ID', value: SELECTED_OFFICE.id },
    { label: `Office Desk X ${dates.length}`, value: '0 Credits' },
    { label: dates.length === 1 ? 'Date' : 'Dates', value: formatBookingDates(dates) },
    { label: 'Time', value: DESK_HOURS },
    { label: 'Desk', value: deskId },
  ];
}

/** The summary card again once booked (Figma 9961:239950): Booking ID added, no buttons. */
function bookedCard(bookings: DeskBooking[]): IrisItem {
  return {
    kind: 'summary',
    headline: deskHeadline(bookings[0].deskId),
    title: 'Summary',
    rows: bookingRows(bookings[0].deskId, bookings.map((b) => b.date), bookings[0].reference),
  };
}
const listJoin = (items: string[]) =>
  items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;

export function bookingWindow(ctx: IrisContext) {
  return { min: dateKey(ctx.now), max: dateKey(addDays(ctx.now, BOOKING_WINDOW_DAYS)) };
}

/** "today", "tomorrow", "friday", "next monday", "24 Oct", "Oct 24", "24/10", "2026-10-24". */
export function parseDate(text: string, now: Date): string | null {
  const t = text.toLowerCase().replace(/(\d)(st|nd|rd|th)\b/g, '$1').replace(/,/g, ' ').trim();
  if (/\btoday\b/.test(t)) return dateKey(now);
  if (/day after tomorrow/.test(t)) return dateKey(addDays(now, 2));
  if (/\btomorrow\b/.test(t)) return dateKey(addDays(now, 1));

  const weekday = WEEKDAYS.findIndex((w) => t.includes(w) || new RegExp(`\\b${w.slice(0, 3)}\\b`).test(t));
  const iso = t.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  const numeric = t.match(/\b(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?\b/);
  const dayMonth = t.match(/\b(\d{1,2})\s+([a-z]{3,})(?:\s+(\d{4}))?/);
  const monthDay = t.match(/\b([a-z]{3,})\s+(\d{1,2})(?:\s+(\d{4}))?/);

  const build = (day: number, monthIndex: number, year?: number) => {
    if (monthIndex < 0 || monthIndex > 11 || day < 1 || day > 31) return null;
    let d = new Date(year ?? now.getFullYear(), monthIndex, day);
    // "5 Jan" said in December means next year.
    if (!year && dateKey(d) < dateKey(now)) d = new Date(now.getFullYear() + 1, monthIndex, day);
    return d.getDate() === day ? dateKey(d) : null;
  };
  const month = (word: string) => MONTHS.indexOf(word.slice(0, 3));

  if (iso) return build(Number(iso[3]), Number(iso[2]) - 1, Number(iso[1]));
  if (numeric) {
    const year = numeric[3] ? Number(numeric[3].length === 2 ? `20${numeric[3]}` : numeric[3]) : undefined;
    return build(Number(numeric[1]), Number(numeric[2]) - 1, year);
  }
  if (dayMonth && month(dayMonth[2]) >= 0) return build(Number(dayMonth[1]), month(dayMonth[2]), dayMonth[3] ? Number(dayMonth[3]) : undefined);
  if (monthDay && month(monthDay[1]) >= 0) return build(Number(monthDay[2]), month(monthDay[1]), monthDay[3] ? Number(monthDay[3]) : undefined);
  if (weekday >= 0) {
    // The coming occurrence; naming today's weekday means the same day next week.
    const ahead = (weekday - now.getDay() + 7) % 7 || 7;
    return dateKey(addDays(now, ahead));
  }
  return null;
}

function parseDeskId(text: string) {
  const m = text.match(/\bd\s?-?(\d{1,3})\b/i);
  return m ? `D${Number(m[1])}` : null;
}

/** Dates from the calendar's Apply or a typed date, checked against the booking window. */
export function readDates(input: IrisInput, ctx: IrisContext): { dates: string[] } | { error: string } | null {
  const dates =
    input.action?.type === 'pickDates'
      ? input.action.dates
      : [parseDate(input.text, ctx.now)].filter((d): d is string => !!d);
  if (dates.length === 0) return null;
  const { min, max } = bookingWindow(ctx);
  const past = dates.find((d) => d < min);
  if (past) return { error: `${formatDay(past)} has already passed. Pick today or a later date.` };
  const late = dates.find((d) => d > max);
  if (late) return { error: `I can book up to ${formatDay(max)}. Pick an earlier date.` };
  return { dates: [...new Set(dates)].sort() };
}

/** Office card with the multi-select calendar hanging off it (Figma 9946:235737 + 9946:235600). */
function datePicker(ctx: IrisContext): IrisItem[] {
  return [{ kind: 'office' }, { kind: 'calendar', ...bookingWindow(ctx), multiple: true, anchored: true }];
}

function askForDates(ctx: IrisContext, lead: string): IrisTurn {
  return { items: [say(lead), ...datePicker(ctx)], chips: ['Today', 'Tomorrow'], flow: { kind: 'desk', step: 'date' } };
}

export function startDeskFlow(ctx: IrisContext): IrisTurn {
  return askForDates(ctx, `Sure ${ctx.firstName}! Let's book you a desk at your office. Pick one or more days, then tap Apply.`);
}

/** Recommendations for the dates: favourite / recently booked desks first, then nearby ones. */
async function offerDesks(dates: string[], ctx: IrisContext, lead: IrisItem[] = []): Promise<IrisTurn> {
  const rec = await deskApi.getRecommendations(dates);
  const items = [...lead];

  if (rec.existing.length > 0) {
    const held = rec.existing.map((b) => `${b.deskId} on ${formatDay(b.date)}`);
    if (rec.needed.length === 0) {
      return {
        items: [...items, say(`You already have ${listJoin(held)}.`), say('Would you like to reschedule or cancel, or pick other dates?')],
        chips: ['Reschedule booking', 'Cancel booking', 'Pick other dates'],
        flow: { kind: 'desk', step: 'booked', bookings: rec.existing },
      };
    }
    items.push(say(`You already have ${listJoin(held)}, so I've left ${rec.existing.length === 1 ? 'that day' : 'those days'} out.`));
  }

  const days = rec.needed;
  const when = days.length === 1 ? `on ${formatDay(days[0])}` : days.length === 2 ? 'on both days' : `on all ${days.length} days`;
  if (rec.options.length === 0) {
    return {
      items: [...items, say(`No single desk is free ${when}. Try fewer or different days?`), ...datePicker(ctx)],
      chips: ['Today', 'Tomorrow'],
      flow: { kind: 'desk', step: 'date' },
    };
  }

  const fav = rec.options.find((o) => o.kind === 'favourite');
  const recent = rec.options.filter((o) => o.kind === 'recent').map((o) => o.desk.id);
  const sentences: string[] = [];
  if (fav && recent.length) sentences.push(`Your favourite desk ${fav.desk.id} is free ${when}, and so ${recent.length === 1 ? 'is' : 'are'} ${listJoin(recent)}, which you booked recently.`);
  else if (fav) sentences.push(`Your favourite desk ${fav.desk.id} is free ${when}.`);
  else if (recent.length) sentences.push(`${listJoin(recent)}, which you booked recently, ${recent.length === 1 ? 'is' : 'are'} free ${when}.`);
  const missing = rec.unavailable.map((u) => `${u.deskId} (${u.kind === 'favourite' ? 'your favourite' : 'booked recently'})`);
  if (missing.length) sentences.push(`${listJoin(missing)} ${missing.length === 1 ? "isn't" : "aren't"} free ${when}.`);
  sentences.push(fav || recent.length ? 'Here are some nearby desks too.' : 'Here are the closest free desks.');

  return {
    items: [...items, say(sentences.join(' ')), { kind: 'desks', dates: days, options: rec.options }],
    chips: ['Pick other dates'],
    flow: {
      kind: 'desk',
      step: 'desk',
      dates: days,
      options: rec.options,
      freeDesks: rec.freeDesks,
    },
  };
}

function bookingSummary(desk: Desk, flow: DeskFlow): IrisTurn {
  return {
    items: [
      say(`Here's your booking summary for ${desk.id} (${desk.zone}${desk.features.length ? `, ${desk.features.join(', ').toLowerCase()}` : ''}).`),
      {
        kind: 'summary',
        headline: deskHeadline(desk.id),
        title: 'Summary',
        rows: bookingRows(desk.id, flow.dates ?? []),
        secondary: { label: 'Change Seat', action: { type: 'dismiss' } },
        primary: { label: 'Book desk', action: { type: 'confirm' } },
      },
    ],
    flow: { ...flow, step: 'confirm', desk },
  };
}

async function bookDesk(flow: DeskFlow, ctx: IrisContext): Promise<IrisTurn> {
  const desk = flow.desk!;
  const dates = flow.dates ?? [];
  try {
    const bookings = await deskApi.book(desk.id, dates);
    return {
      items: [bookedCard(bookings), bookingGreeting('office', dates, ctx.now)],
      chips: AFTER_BOOKING_CHIPS,
      flow: { kind: 'desk', step: 'booked', bookings },
    };
  } catch (err) {
    if (err instanceof DeskApiError && (err.code === 'desk-taken' || err.code === 'member-busy')) {
      return offerDesks(dates, ctx, [say(`Sorry, ${err.message} Here's what's free now.`)]);
    }
    throw err;
  }
}

/** Works out which upcoming booking the user means; with several, asks via the radio list. */
async function withTarget(
  intent: 'reschedule' | 'cancel',
  ctx: IrisContext,
  run: (booking: DeskBooking) => IrisTurn | Promise<IrisTurn>,
  hint?: DeskBooking[],
): Promise<IrisTurn> {
  const today = dateKey(ctx.now);
  // The hint (days just booked) may be stale after a cancel, so check it against the server.
  const current = (await deskApi.getBookings()).filter((b) => b.date >= today);
  const hinted = current.filter((b) => hint?.some((h) => h.id === b.id));
  const upcoming = hinted.length ? hinted : current;
  if (upcoming.length === 0) {
    return { items: [say("You don't have any upcoming desk bookings.")], chips: ['Book a desk'], flow: null };
  }
  if (upcoming.length === 1) return run(upcoming[0]);
  // Days already cancelled from the same bookings are shown too, marked CANCELLED.
  const groups = new Set(upcoming.map((b) => b.groupId));
  const cancelled = (await deskApi.getCancelled()).filter((b) => b.date >= today && groups.has(b.groupId));
  return {
    items: [
      say(intent === 'reschedule' ? 'Sure! Which day would you like to move?' : 'Sure. Which day would you like to cancel?'),
      { kind: 'bookingPicker', purpose: intent, bookings: upcoming, cancelled },
    ],
    flow: { kind: 'desk', step: 'pickBooking', intent, candidates: upcoming },
  };
}

function askRescheduleDate(booking: DeskBooking, ctx: IrisContext, lead?: string): IrisTurn {
  return {
    items: [
      say(lead ?? `Sure! You're booked at ${booking.deskId} on ${formatDay(booking.date)}. Pick the new date and tap Apply.`),
      { kind: 'calendar', ...bookingWindow(ctx), multiple: false, current: booking.date },
    ],
    flow: { kind: 'desk', step: 'rescheduleDate', booking },
  };
}

function askCancel(booking: DeskBooking): IrisTurn {
  return {
    items: [
      say('Are you sure you want to cancel this booking?'),
      {
        kind: 'summary',
        headline: deskHeadline(booking.deskId),
        title: 'Cancel Booking',
        rows: bookingRows(booking.deskId, [booking.date], booking.reference),
        secondary: { label: 'Keep booking', action: { type: 'dismiss' } },
        primary: { label: 'Cancel booking', action: { type: 'confirm' } },
        tone: 'danger',
      },
    ],
    flow: { kind: 'desk', step: 'cancelConfirm', booking },
  };
}

export const startReschedule = (ctx: IrisContext, hint?: DeskBooking[]) =>
  withTarget('reschedule', ctx, (b) => askRescheduleDate(b, ctx), hint);

export const startCancel = (ctx: IrisContext, hint?: DeskBooking[]) => withTarget('cancel', ctx, askCancel, hint);

async function proposeReschedule(booking: DeskBooking, newDate: string, ctx: IrisContext): Promise<IrisTurn> {
  if (newDate === booking.date) {
    return askRescheduleDate(booking, ctx, `You're already booked on ${formatDay(newDate)}. Pick a different day.`);
  }
  const rec = await deskApi.getRecommendations([newDate]);
  const clash = rec.existing.find((b) => b.id !== booking.id);
  if (clash) {
    return askRescheduleDate(booking, ctx, `You already have ${clash.deskId} booked on ${formatDay(newDate)}. Pick another day.`);
  }
  const sameDesk = rec.freeDesks.find((d) => d.id === booking.deskId);
  const newDesk = sameDesk ?? rec.options[0]?.desk;
  if (!newDesk) return askRescheduleDate(booking, ctx, `Every desk is taken on ${formatDay(newDate)}. Pick another day.`);

  const lead = sameDesk
    ? `${booking.deskId} is free on ${formatDay(newDate)}. Here's the change:`
    : `${booking.deskId} is taken on ${formatDay(newDate)}, so I'll move you to ${newDesk.id}, the closest free desk.`;
  return {
    items: [
      say(lead),
      {
        kind: 'summary',
        headline: deskHeadline(newDesk.id),
        title: 'Reschedule Booking',
        change: { from: formatDay(booking.date), to: formatDay(newDate) },
        rows: bookingRows(sameDesk ? newDesk.id : `${booking.deskId} → ${newDesk.id}`, [newDate], booking.reference),
        secondary: { label: 'Keep current date', action: { type: 'dismiss' } },
        primary: { label: 'Reschedule', action: { type: 'confirm' } },
      },
    ],
    flow: { kind: 'desk', step: 'rescheduleConfirm', booking, newDate, newDesk },
  };
}

/** Advances the desk flow; returns null when the message is about something else. */
export async function continueDeskFlow(input: IrisInput, flow: DeskFlow, ctx: IrisContext): Promise<IrisTurn | null> {
  const text = input.text.trim();
  const lower = text.toLowerCase();
  const action = input.action;
  const confirmed = action?.type === 'confirm' || (!action && YES.test(lower));
  const dismissed = action?.type === 'dismiss' || (!action && NO.test(lower));
  const stop = (message: string): IrisTurn => ({ items: [say(message)], chips: ['Book a desk'], flow: null });
  const stayBooked = (booking: DeskBooking, message: string): IrisTurn => ({
    items: [say(message)],
    chips: AFTER_BOOKING_CHIPS,
    flow: { kind: 'desk', step: 'booked', bookings: [booking] },
  });

  if (!action && LEAVE_FLOW.test(lower) && !DESK_TOPIC.test(lower)) return null;

  switch (flow.step) {
    case 'date': {
      if (!action && STOP.test(lower)) return stop("No problem, I've stopped the desk booking.");
      const picked = readDates(input, ctx);
      if (!picked) {
        if (DESK_TOPIC.test(lower)) return null;
        return askForDates(ctx, 'Pick your days on the calendar and tap Apply, or type a date like "tomorrow" or "24 Oct".');
      }
      if ('error' in picked) return askForDates(ctx, picked.error);
      return offerDesks(picked.dates, ctx);
    }

    case 'desk': {
      if (!action && STOP.test(lower)) return stop("No problem, I've stopped the desk booking.");
      if (!action && /other (dates?|days?)|another (date|day)|different (dates?|days?)/.test(lower)) {
        return askForDates(ctx, 'Sure, which days work better?');
      }
      if (!action && MANUAL.test(lower)) {
        return { items: [say('Opening desk booking so you can choose your seat on the floor plan.')], flow: null, navigate: 'deskBooking' };
      }
      const deskId = action?.type === 'pickDesk' ? action.deskId : parseDeskId(text);
      if (!deskId) {
        const picked = readDates(input, ctx);
        if (picked && 'dates' in picked) return offerDesks(picked.dates, ctx);
        if (DESK_TOPIC.test(lower)) return null;
        return { items: [say('Pick one of the desks above, choose seats manually, or type a desk number like D12.')], chips: ['Pick other dates'], flow };
      }
      const desk = flow.freeDesks?.find((d) => d.id === deskId);
      if (!desk) {
        const days = flow.dates ?? [];
        return {
          items: [say(`${deskId} isn't free ${days.length === 1 ? `on ${formatDay(days[0])}` : 'on all of those days'}. Pick another desk.`)],
          chips: ['Pick other dates'],
          flow,
        };
      }
      return bookingSummary(desk, flow);
    }

    case 'confirm': {
      if (confirmed) return bookDesk(flow, ctx);
      if (dismissed || /change|another (desk|seat)|different (desk|seat)/.test(lower)) {
        return {
          items: [say('No problem, pick another seat.'), { kind: 'desks', dates: flow.dates ?? [], options: flow.options ?? [] }],
          chips: ['Pick other dates'],
          flow: { ...flow, step: 'desk', desk: undefined },
        };
      }
      if (!action && STOP.test(lower)) return stop("Okay, I haven't booked anything.");
      return null;
    }

    case 'booked': {
      if (RESCHEDULE_TOPIC.test(lower) || /^reschedule$/.test(lower)) return startReschedule(ctx, flow.bookings);
      if (/cancel/.test(lower)) return startCancel(ctx, flow.bookings);
      if (/other (dates?|days?)|another (date|day)|pick (a|another) date/.test(lower)) return askForDates(ctx, 'Sure, which days would you like?');
      return null;
    }

    case 'pickBooking': {
      const candidates = flow.candidates ?? [];
      const target =
        (action?.type === 'pickBooking' ? candidates.find((b) => b.id === action.bookingId) : undefined) ??
        candidates.find((b) => lower.includes(formatDay(b.date).toLowerCase())) ??
        candidates.find((b) => b.date === parseDate(text, ctx.now));
      if (!target) return null;
      return flow.intent === 'cancel' ? askCancel(target) : askRescheduleDate(target, ctx);
    }

    case 'rescheduleDate': {
      const booking = flow.booking!;
      if (!action && STOP.test(lower)) return stayBooked(booking, `Okay, ${booking.deskId} on ${formatDay(booking.date)} stays as it is.`);
      const picked = readDates(input, ctx);
      if (!picked) {
        if (DESK_TOPIC.test(lower)) return null;
        return askRescheduleDate(booking, ctx, 'Pick the new date on the calendar and tap Apply, or type one like "Friday" or "28 Oct".');
      }
      if ('error' in picked) return askRescheduleDate(booking, ctx, picked.error);
      return proposeReschedule(booking, picked.dates[0], ctx);
    }

    case 'rescheduleConfirm': {
      const booking = flow.booking!;
      if (confirmed) {
        try {
          const updated = await deskApi.reschedule(booking.id, flow.newDate!, flow.newDesk!.id);
          return {
            items: [bookedCard([updated]), bookingGreeting('office', [updated.date], ctx.now)],
            chips: AFTER_BOOKING_CHIPS,
            flow: { kind: 'desk', step: 'booked', bookings: [updated] },
          };
        } catch (err) {
          if (err instanceof DeskApiError && err.status === 409) return askRescheduleDate(booking, ctx, `${err.message} Pick another day.`);
          throw err;
        }
      }
      if (dismissed) return stayBooked(booking, `No problem, ${booking.deskId} on ${formatDay(booking.date)} stays as it is.`);
      return null;
    }

    case 'cancelConfirm': {
      const booking = flow.booking!;
      if (confirmed) {
        await deskApi.cancel(booking.id);
        return {
          items: [say(`Your booking for ${booking.deskId} on ${formatDay(booking.date)} has been cancelled.`)],
          chips: ['Book a desk', 'Upcoming Bookings'],
          flow: null,
        };
      }
      if (dismissed) return stayBooked(booking, `Great, ${booking.deskId} on ${formatDay(booking.date)} is still booked.`);
      return null;
    }
  }
}

/** Upcoming desk bookings for the "Upcoming Bookings" answer. */
export async function upcomingDeskLines(ctx: IrisContext) {
  const today = dateKey(ctx.now);
  const bookings = (await deskApi.getBookings()).filter((b) => b.date >= today);
  return bookings.map((b) => ({ date: b.date, text: `Desk ${b.deskId}, ${formatDay(b.date)}` }));
}
