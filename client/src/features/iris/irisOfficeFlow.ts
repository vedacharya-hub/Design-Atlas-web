/* Private office booking through Iris, at the building chosen in the home page search: pick one or
   more days on the calendar → the offices free on all of them (Figma 4963:165644 cards) → Summary
   with a "Book office" CTA → the booked Summary and a happy message. Afterwards a day can be
   rescheduled (stacked list when there are several, then "previous → new" on the calendar) or the
   whole booking cancelled. */
import { officeApi, OfficeApiError } from '../../api/officeApi';
import type { OfficeBooking, PrivateOffice } from '../../api/types';
import { asset } from '../home/asset';
import { SELECTED_BUILDING } from '../home/selectedBuilding';
import { bookingWindow, parseDate, readDates } from './irisDeskFlow';
import {
  addDays,
  bookingGreetingText,
  dateKey,
  formatBookingDates,
  formatDay,
  formatDays,
  say,
  type CardHeader,
  type IrisContext,
  type IrisInput,
  type IrisItem,
  type IrisTurn,
  type OfficeFlow,
  type SummaryRow,
} from './irisShared';

export const OFFICE_TOPIC = /private office|\bbook (an? )?office\b|\bcabin\b/;
export const CANCEL_ALL_TOPIC = /cancel all/;
export const AFTER_OFFICE_CHIPS = ['Reschedule booking', 'Cancel all bookings', 'Book a desk'];

const OFFICE_HOURS = '9:00 AM - 8:00 PM (All Day)';
// Messages about something else end the office flow and are answered on their own.
const LEAVE_FLOW = /meeting|\broom\b|desk|seat|nearby|attendance|happening|going on|event|upcoming|help/;
const STOP = /^(stop|never ?mind|forget it)\b/;
const YES = /^(yes|yep|yeah|sure|ok(ay)?|confirm|book( it| office)?|reschedule|go ahead)\b/;
const YES_CANCEL = /^(yes|yep|yeah|sure|ok(ay)?|confirm|cancel( all| it| booking)?|go ahead)\b/;
const NO = /^(no|nope|not now|keep|stop|never ?mind|forget it)\b/;

export const officeHeader = (office: PrivateOffice): CardHeader => ({ photo: asset(office.photo), badge: 'PRIVATE OFFICE' });

const credits = (n: number) => `${n} Credit${n === 1 ? '' : 's'}`;

function when(dates: string[], now: Date) {
  if (dates.length === 1) {
    if (dates[0] === dateKey(now)) return 'today';
    if (dates[0] === dateKey(addDays(now, 1))) return 'tomorrow';
    return `on ${formatDay(dates[0])}`;
  }
  return dates.length === 2 ? 'on both days' : `on all ${dates.length} days`;
}

function bookingRows(office: PrivateOffice, dates: string[], reference?: string): SummaryRow[] {
  return [
    ...(reference ? [{ label: 'Booking ID', value: reference }] : []),
    { label: 'Floor', value: office.floorLabel },
    { label: 'Capacity', value: `${office.capacity} Seater` },
    { label: `Private Office X ${dates.length}`, value: credits(office.creditsPerDay * dates.length) },
    { label: dates.length === 1 ? 'Date' : 'Dates', value: formatBookingDates(dates) },
    { label: 'Time', value: OFFICE_HOURS },
  ];
}

/** The summary card once booked: Booking ID added, no buttons. */
function bookedCard(bookings: OfficeBooking[]): IrisItem {
  const office = bookings[0].office;
  return {
    kind: 'summary',
    headline: office.name,
    header: officeHeader(office),
    title: 'Summary',
    rows: bookingRows(office, bookings.map((b) => b.date), bookings[0].reference),
  };
}

/** The booking greeting (Figma 9961:239996) with a send-off for the team. */
function happyMessage(dates: string[], ctx: IrisContext): IrisItem {
  return say(`${bookingGreetingText('your private office', dates, ctx.now)} Have a great day with your team!`);
}

function askForDates(ctx: IrisContext, lead: string): IrisTurn {
  return {
    items: [say(lead), { kind: 'calendar', ...bookingWindow(ctx), multiple: true }],
    chips: ['Today', 'Tomorrow'],
    flow: { kind: 'office', step: 'date' },
  };
}

export function startOfficeFlow(ctx: IrisContext): IrisTurn {
  return askForDates(
    ctx,
    `Sure ${ctx.firstName}! Let's book a private office at ${SELECTED_BUILDING.label}, the building from your home search. Pick one or more days, then tap Apply.`,
  );
}

async function offerOffices(dates: string[], ctx: IrisContext, lead: IrisItem[] = []): Promise<IrisTurn> {
  const offices = await officeApi.getAvailability(dates);
  const day = when(dates, ctx.now);
  if (offices.length === 0) {
    const turn = askForDates(ctx, `No private office is free ${day} at ${SELECTED_BUILDING.name}. Try other days?`);
    return { ...turn, items: [...lead, ...turn.items] };
  }
  return {
    items: [
      ...lead,
      say(`${offices.length === 1 ? 'One private office is' : `${offices.length} private offices are`} free ${day} at ${SELECTED_BUILDING.name}. Pick the one that suits your team.`),
      { kind: 'offices', title: 'Private Offices Available', subtitle: `${SELECTED_BUILDING.label} · ${formatDays(dates)}`, dates, offices },
    ],
    chips: ['Pick other dates'],
    flow: { kind: 'office', step: 'office', dates, offices },
  };
}

function summaryTurn(office: PrivateOffice, flow: OfficeFlow): IrisTurn {
  return {
    items: [
      say(`Here's your booking summary for ${office.name}.`),
      {
        kind: 'summary',
        headline: office.name,
        header: officeHeader(office),
        title: 'Summary',
        rows: bookingRows(office, flow.dates ?? []),
        secondary: { label: 'Change Office', action: { type: 'dismiss' } },
        primary: { label: 'Book office', action: { type: 'confirm' } },
      },
    ],
    flow: { ...flow, step: 'confirm', office },
  };
}

async function bookOffice(flow: OfficeFlow, ctx: IrisContext): Promise<IrisTurn> {
  const office = flow.office!;
  const dates = flow.dates ?? [];
  try {
    const bookings = await officeApi.book(office.id, dates);
    return {
      items: [bookedCard(bookings), happyMessage(dates, ctx)],
      chips: AFTER_OFFICE_CHIPS,
      flow: { kind: 'office', step: 'booked', bookings },
    };
  } catch (err) {
    if (err instanceof OfficeApiError && err.status === 409) {
      return offerOffices(dates, ctx, [say(`Sorry, ${err.message} Here's what's free now.`)]);
    }
    throw err;
  }
}

/** Upcoming private office days: the hinted booking's days when given (and still there), else all. */
async function upcomingOfficeBookings(ctx: IrisContext, hint?: OfficeBooking[]) {
  const today = dateKey(ctx.now);
  const current = (await officeApi.getBookings()).filter((b) => b.date >= today);
  const groups = new Set((hint ?? []).map((b) => b.groupId));
  const hinted = current.filter((b) => groups.has(b.groupId));
  return hinted.length ? hinted : current;
}

export async function hasUpcomingOfficeBookings(ctx: IrisContext) {
  return (await upcomingOfficeBookings(ctx)).length > 0;
}

const noBookings: IrisTurn = {
  items: [say("You don't have any upcoming private office bookings.")],
  chips: ['Book a private office', 'Book a desk'],
  flow: null,
};

function askRescheduleDate(booking: OfficeBooking, ctx: IrisContext, lead?: string): IrisTurn {
  return {
    items: [
      say(lead ?? `You're booked into ${booking.office.name} on ${formatDay(booking.date)}. Pick the new date and tap Apply.`),
      { kind: 'calendar', ...bookingWindow(ctx), multiple: false, current: booking.date },
    ],
    flow: { kind: 'office', step: 'rescheduleDate', booking },
  };
}

export async function startOfficeReschedule(ctx: IrisContext, hint?: OfficeBooking[]): Promise<IrisTurn> {
  const upcoming = await upcomingOfficeBookings(ctx, hint);
  if (upcoming.length === 0) return noBookings;
  if (upcoming.length === 1) return askRescheduleDate(upcoming[0], ctx);
  return {
    items: [say('Sure! Which day would you like to move?'), { kind: 'officeBookingPicker', bookings: upcoming }],
    flow: { kind: 'office', step: 'pickBooking', bookings: upcoming },
  };
}

async function proposeReschedule(booking: OfficeBooking, newDate: string, ctx: IrisContext): Promise<IrisTurn> {
  const office = booking.office;
  if (newDate === booking.date) return askRescheduleDate(booking, ctx, `You're already booked on ${formatDay(newDate)}. Pick a different day.`);
  const sameBooking = (await officeApi.getBookings()).some((b) => b.groupId === booking.groupId && b.date === newDate);
  if (sameBooking) return askRescheduleDate(booking, ctx, `You already have ${office.name} on ${formatDay(newDate)}. Pick another day.`);
  const free = await officeApi.getAvailability([newDate]);
  if (!free.some((o) => o.id === office.id)) {
    return askRescheduleDate(booking, ctx, `${office.name} isn't free on ${formatDay(newDate)}. Pick another day.`);
  }
  return {
    items: [
      say(`${office.name} is free on ${formatDay(newDate)}. Here's the change:`),
      {
        kind: 'summary',
        headline: office.name,
        header: officeHeader(office),
        title: 'Reschedule Booking',
        change: { from: formatDay(booking.date), to: formatDay(newDate) },
        rows: bookingRows(office, [newDate], booking.reference),
        secondary: { label: 'Keep current date', action: { type: 'dismiss' } },
        primary: { label: 'Reschedule', action: { type: 'confirm' } },
      },
    ],
    flow: { kind: 'office', step: 'rescheduleConfirm', booking, newDate },
  };
}

/** "Cancel all bookings": every day of the booking (or of all upcoming office bookings), confirmed first. */
export async function startOfficeCancelAll(ctx: IrisContext, hint?: OfficeBooking[]): Promise<IrisTurn> {
  const upcoming = await upcomingOfficeBookings(ctx, hint);
  if (upcoming.length === 0) return noBookings;
  const offices = [...new Map(upcoming.map((b) => [b.office.id, b.office])).values()];
  const references = new Set(upcoming.map((b) => b.reference));
  const many = upcoming.length > 1;
  const rows: SummaryRow[] = [
    ...(references.size === 1 ? [{ label: 'Booking ID', value: upcoming[0].reference }] : []),
    ...(offices.length > 1 ? [{ label: 'Offices', value: offices.map((o) => o.name).join(', ') }] : [{ label: 'Floor', value: offices[0].floorLabel }]),
    { label: many ? 'Dates' : 'Date', value: formatBookingDates(upcoming.map((b) => b.date)) },
    { label: 'Credits', value: credits(upcoming.reduce((sum, b) => sum + b.credits, 0)) },
  ];
  return {
    items: [
      say(many ? `Are you sure you want to cancel all ${upcoming.length} days?` : 'Are you sure you want to cancel this booking?'),
      {
        kind: 'summary',
        headline: offices.length === 1 ? offices[0].name : 'Private Offices',
        header: officeHeader(offices[0]),
        title: many ? 'Cancel All Bookings' : 'Cancel Booking',
        rows,
        secondary: { label: 'Keep booking', action: { type: 'dismiss' } },
        primary: { label: many ? 'Cancel all' : 'Cancel booking', action: { type: 'confirm' } },
        tone: 'danger',
      },
    ],
    flow: { kind: 'office', step: 'cancelConfirm', bookings: upcoming },
  };
}

/** Advances the office flow; returns null when the message is about something else. */
export async function continueOfficeFlow(input: IrisInput, flow: OfficeFlow, ctx: IrisContext): Promise<IrisTurn | null> {
  const text = input.text.trim();
  const lower = text.toLowerCase();
  const action = input.action;
  const confirmed = action?.type === 'confirm' || (!action && YES.test(lower));
  const dismissed = action?.type === 'dismiss' || (!action && NO.test(lower));
  const stop = (message: string): IrisTurn => ({ items: [say(message)], chips: ['Book a private office', 'Book a desk'], flow: null });
  const stays = (bookings: OfficeBooking[], message: string): IrisTurn => ({
    items: [say(message)],
    chips: AFTER_OFFICE_CHIPS,
    flow: { kind: 'office', step: 'booked', bookings },
  });

  if (!action && LEAVE_FLOW.test(lower) && !OFFICE_TOPIC.test(lower)) return null;

  switch (flow.step) {
    case 'date': {
      if (!action && STOP.test(lower)) return stop("No problem, I've stopped the private office booking.");
      const picked = readDates(input, ctx);
      if (!picked) {
        if (OFFICE_TOPIC.test(lower)) return null;
        return askForDates(ctx, 'Pick your days on the calendar and tap Apply, or type a date like "tomorrow" or "24 Oct".');
      }
      if ('error' in picked) return askForDates(ctx, picked.error);
      return offerOffices(picked.dates, ctx);
    }

    case 'office': {
      if (!action && STOP.test(lower)) return stop("No problem, I've stopped the private office booking.");
      if (!action && /other (dates?|days?)|another (date|day)|different (dates?|days?)/.test(lower)) {
        return askForDates(ctx, 'Sure, which days work better?');
      }
      const offices = flow.offices ?? [];
      const office =
        (action?.type === 'selectOffice' ? offices.find((o) => o.id === action.officeId) : undefined) ??
        offices.find((o) => lower.includes(o.name.toLowerCase()));
      if (office) return summaryTurn(office, flow);
      const picked = readDates(input, ctx);
      if (picked && 'dates' in picked) return offerOffices(picked.dates, ctx);
      return null;
    }

    case 'confirm': {
      if (confirmed) return bookOffice(flow, ctx);
      if (dismissed || /change|another|different/.test(lower)) {
        const dates = flow.dates ?? [];
        return {
          items: [
            say('No problem, pick another office.'),
            { kind: 'offices', title: 'Private Offices Available', subtitle: `${SELECTED_BUILDING.label} · ${formatDays(dates)}`, dates, offices: flow.offices ?? [] },
          ],
          chips: ['Pick other dates'],
          flow: { ...flow, step: 'office', office: undefined },
        };
      }
      return null;
    }

    case 'booked':
      if (/reschedul|move/.test(lower)) return startOfficeReschedule(ctx, flow.bookings);
      if (/\bcancel\b/.test(lower)) return startOfficeCancelAll(ctx, flow.bookings);
      return null;

    case 'pickBooking': {
      const candidates = flow.bookings ?? [];
      const target =
        (action?.type === 'pickBooking' ? candidates.find((b) => b.id === action.bookingId) : undefined) ??
        candidates.find((b) => b.date === parseDate(text, ctx.now));
      return target ? askRescheduleDate(target, ctx) : null;
    }

    case 'rescheduleDate': {
      const booking = flow.booking!;
      if (!action && STOP.test(lower)) return stays([booking], `Okay, ${booking.office.name} on ${formatDay(booking.date)} stays as it is.`);
      const picked = readDates(input, ctx);
      if (!picked) return null;
      if ('error' in picked) return askRescheduleDate(booking, ctx, picked.error);
      return proposeReschedule(booking, picked.dates[0], ctx);
    }

    case 'rescheduleConfirm': {
      const booking = flow.booking!;
      if (confirmed) {
        try {
          const moved = await officeApi.reschedule(booking.id, flow.newDate!);
          return { items: [bookedCard([moved]), happyMessage([moved.date], ctx)], chips: AFTER_OFFICE_CHIPS, flow: { kind: 'office', step: 'booked', bookings: [moved] } };
        } catch (err) {
          if (err instanceof OfficeApiError && (err.status === 409 || err.status === 400)) return askRescheduleDate(booking, ctx, `${err.message} Pick another day.`);
          throw err;
        }
      }
      if (dismissed) return stays([booking], `No problem, ${booking.office.name} on ${formatDay(booking.date)} stays as it is.`);
      return null;
    }

    case 'cancelConfirm': {
      const bookings = flow.bookings ?? [];
      if (action?.type === 'confirm' || (!action && YES_CANCEL.test(lower))) {
        // Days already gone (404) count as cancelled.
        await Promise.all(bookings.map((b) => officeApi.cancel(b.id).catch((err) => (err instanceof OfficeApiError && err.status === 404 ? null : Promise.reject(err)))));
        const offices = [...new Set(bookings.map((b) => b.office.name))];
        const many = bookings.length > 1;
        return {
          items: [say(`Done. Your private office booking${many ? 's' : ''} for ${offices.join(' and ')} on ${formatBookingDates(bookings.map((b) => b.date))} ${many ? 'have' : 'has'} been cancelled.`)],
          chips: ['Book a private office', 'Book a desk'],
          flow: null,
        };
      }
      if (dismissed) return stays(bookings, `Great, your private office booking is still on.`);
      return null;
    }
  }
}

/** Upcoming private office days for the "Upcoming Bookings" answer. */
export async function upcomingOfficeLines(ctx: IrisContext) {
  const bookings = await upcomingOfficeBookings(ctx);
  return bookings.map((b) => ({ date: b.date, text: `${b.office.name}, ${formatDay(b.date)}` }));
}
