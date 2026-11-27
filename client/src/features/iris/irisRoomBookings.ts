/* Changing a meeting-room booking through Iris. Pick the meeting (when there are several), then:
   - reschedule: a new start time from the room's free 30-minute slots that day, shown as a stacked
     radio list — same room, date and duration — confirmed on a summary card;
   - cancel: a summary card asking to confirm, then the booking is cancelled. */
import { meetingRoomApi, RoomApiError } from '../../api/meetingRoomApi';
import type { MeetingRoom, RoomBooking } from '../../api/types';
import { asset } from '../home/asset';
import {
  addDays,
  bookingGreeting,
  dateKey,
  formatBookingDates,
  formatDay,
  formatDuration,
  formatRange,
  formatTime,
  parseTime,
  say,
  type CardHeader,
  type IrisContext,
  type IrisInput,
  type IrisItem,
  type IrisTurn,
  type RoomBookingFlow,
  type SummaryRow,
} from './irisShared';

export const ROOM_RESCHEDULE_TOPIC = /reschedul.*\b(meeting|room)|\b(meeting|room)\b.*reschedul|(move|change) (my |the )?(meeting|room)/;
export const ROOM_CANCEL_TOPIC = /cancel.*\b(meeting|room)\b|\b(meeting|room)\b.*\bcancel/;
export const AFTER_ROOM_BOOKING_CHIPS = ['Reschedule meeting', 'Cancel meeting', 'Upcoming Bookings'];

const YES = /^(yes|yep|yeah|sure|ok(ay)?|confirm|reschedule|go ahead)\b/;
const NO = /^(no|nope|not now|keep|stop|never ?mind|forget it)\b/;

export const roomHeader = (room: MeetingRoom): CardHeader => ({ photo: asset(room.photo), badge: 'MEETING ROOM' });

const minutesOf = (now: Date) => now.getHours() * 60 + now.getMinutes();

function dayWord(date: string, now: Date) {
  if (date === dateKey(now)) return 'today';
  if (date === dateKey(addDays(now, 1))) return 'tomorrow';
  return `on ${formatDay(date)}`;
}

/** The member's room bookings that haven't started yet, soonest first. */
async function upcomingRoomBookings(ctx: IrisContext) {
  const { bookings, rooms } = await meetingRoomApi.getBookings();
  const today = dateKey(ctx.now);
  const upcoming = bookings
    .filter((b) => b.date > today || (b.date === today && b.start > minutesOf(ctx.now)))
    .sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start);
  return { upcoming, rooms };
}

export async function hasUpcomingRoomBookings(ctx: IrisContext) {
  return (await upcomingRoomBookings(ctx)).upcoming.length > 0;
}

function bookingRows(booking: RoomBooking, room: MeetingRoom, start = booking.start): SummaryRow[] {
  const duration = booking.end - booking.start;
  return [
    { label: 'Booking ID', value: booking.id },
    { label: 'Floor', value: room.floorLabel },
    { label: 'Date', value: formatBookingDates([booking.date]) },
    { label: 'Time', value: formatRange(start, start + duration) },
    { label: 'Duration', value: formatDuration(duration) },
    { label: 'Guests', value: String(booking.guests) },
    { label: 'Credits', value: `${booking.credits} Credit${booking.credits === 1 ? '' : 's'}` },
  ];
}

/** The summary card once the meeting has moved: Booking ID and details, no buttons. */
function bookedCard(booking: RoomBooking, room: MeetingRoom): IrisItem {
  return { kind: 'summary', headline: room.name, header: roomHeader(room), title: 'Summary', rows: bookingRows(booking, room) };
}

/**
 * Works out which meeting the user means: the one just booked (`hint`), the only upcoming one, or
 * asks with the stacked list when there are several.
 */
async function withMeeting(
  intent: 'reschedule' | 'cancel',
  ctx: IrisContext,
  run: (booking: RoomBooking, room: MeetingRoom) => IrisTurn | Promise<IrisTurn>,
  hint?: RoomBooking,
): Promise<IrisTurn> {
  const { upcoming, rooms } = await upcomingRoomBookings(ctx);
  const roomOf = (b: RoomBooking) => rooms.find((r) => r.id === b.roomId)!;
  const hinted = hint && upcoming.find((b) => b.id === hint.id);
  if (hinted) return run(hinted, roomOf(hinted));
  if (upcoming.length === 0) {
    return { items: [say("You don't have any upcoming meeting room bookings.")], chips: ['Book a Meeting room'], flow: null };
  }
  if (upcoming.length === 1) return run(upcoming[0], roomOf(upcoming[0]));
  return {
    items: [
      say(intent === 'reschedule' ? 'Sure! Which meeting would you like to move?' : 'Sure. Which meeting would you like to cancel?'),
      { kind: 'roomBookingPicker', purpose: intent, bookings: upcoming, rooms },
    ],
    flow: { kind: 'roomBooking', step: 'pickBooking', intent, candidates: upcoming },
  };
}

/** The room's free starts that day for the same duration, as a stacked list. */
async function offerSlots(booking: RoomBooking, ctx: IrisContext, lead?: string): Promise<IrisTurn> {
  const { booking: current, room, slots } = await meetingRoomApi.getRescheduleSlots(booking.id);
  const duration = formatDuration(current.end - current.start);
  const day = dayWord(current.date, ctx.now);
  if (slots.length === 0) {
    return {
      items: [say(`${room.name} has no other free ${duration} slot ${day}, so your meeting stays at ${formatRange(current.start, current.end)}.`)],
      chips: AFTER_ROOM_BOOKING_CHIPS,
      flow: { kind: 'roomBooking', step: 'booked', booking: current },
    };
  }
  return {
    items: [
      say(lead ?? `You have ${room.name} ${day}, ${formatRange(current.start, current.end)}. It stays ${duration} long; pick a new start time.`),
      { kind: 'roomSlots', booking: current, room, slots },
    ],
    flow: { kind: 'roomBooking', step: 'pickSlot', intent: 'reschedule', booking: current, room, slots },
  };
}

function proposeSlot(flow: RoomBookingFlow, start: number): IrisTurn {
  const booking = flow.booking!;
  const room = flow.room!;
  return {
    items: [
      say(`${room.name} is free at ${formatTime(start)}. Here's the change:`),
      {
        kind: 'summary',
        headline: room.name,
        header: roomHeader(room),
        title: 'Reschedule Meeting',
        change: { from: formatTime(booking.start), to: formatTime(start) },
        rows: bookingRows(booking, room, start),
        secondary: { label: 'Keep current time', action: { type: 'dismiss' } },
        primary: { label: 'Reschedule', action: { type: 'confirm' } },
      },
    ],
    flow: { ...flow, step: 'confirm', newStart: start },
  };
}

/** The meeting's details with Keep booking / Cancel booking, like the desk cancellation. */
function askCancel(booking: RoomBooking, room: MeetingRoom): IrisTurn {
  return {
    items: [
      say('Are you sure you want to cancel this meeting?'),
      {
        kind: 'summary',
        headline: room.name,
        header: roomHeader(room),
        title: 'Cancel Meeting',
        rows: bookingRows(booking, room),
        secondary: { label: 'Keep booking', action: { type: 'dismiss' } },
        primary: { label: 'Cancel booking', action: { type: 'confirm' } },
        tone: 'danger',
      },
    ],
    flow: { kind: 'roomBooking', step: 'cancelConfirm', intent: 'cancel', booking, room },
  };
}

export const startRoomReschedule = (ctx: IrisContext, hint?: RoomBooking) =>
  withMeeting('reschedule', ctx, (booking) => offerSlots(booking, ctx), hint);

export const startRoomCancel = (ctx: IrisContext, hint?: RoomBooking) => withMeeting('cancel', ctx, askCancel, hint);

/** Advances a reschedule or cancellation; returns null when the message is about something else. */
export async function continueRoomBooking(input: IrisInput, flow: RoomBookingFlow, ctx: IrisContext): Promise<IrisTurn | null> {
  const text = input.text.trim();
  const lower = text.toLowerCase();
  const action = input.action;
  const confirmed = action?.type === 'confirm' || (!action && YES.test(lower));
  const dismissed = action?.type === 'dismiss' || (!action && NO.test(lower));
  const stays = (booking: RoomBooking, message: string): IrisTurn => ({
    items: [say(message)],
    chips: AFTER_ROOM_BOOKING_CHIPS,
    flow: { kind: 'roomBooking', step: 'booked', booking },
  });

  // Switching between "reschedule" and "cancel" mid-way keeps the meeting already chosen.
  if (!action && flow.step !== 'cancelConfirm' && ROOM_CANCEL_TOPIC.test(lower)) return startRoomCancel(ctx, flow.booking);
  if (!action && flow.step !== 'pickSlot' && flow.step !== 'confirm' && ROOM_RESCHEDULE_TOPIC.test(lower)) {
    return startRoomReschedule(ctx, flow.booking);
  }

  switch (flow.step) {
    case 'booked':
      if (/desk|seat|office|cancel all/.test(lower)) return null;
      if (/reschedul|move|change/.test(lower)) return startRoomReschedule(ctx, flow.booking);
      if (/\bcancel\b/.test(lower)) return startRoomCancel(ctx, flow.booking);
      return null;

    case 'pickBooking': {
      const candidates = flow.candidates ?? [];
      const typedTime = parseTime(text);
      const target =
        (action?.type === 'pickBooking' ? candidates.find((b) => b.id === action.bookingId) : undefined) ??
        candidates.find((b) => b.start === typedTime);
      if (!target) return null;
      return flow.intent === 'cancel' ? startRoomCancel(ctx, target) : offerSlots(target, ctx);
    }

    case 'pickSlot': {
      const booking = flow.booking!;
      const start = action?.type === 'pickSlot' ? action.start : parseTime(text);
      if (start === null) {
        if (dismissed || lower === 'cancel') return stays(booking, `Okay, ${flow.room!.name} stays at ${formatRange(booking.start, booking.end)}.`);
        return null;
      }
      if (!flow.slots?.includes(start)) {
        return {
          items: [say(`${flow.room!.name} isn't free at ${formatTime(start)} for the whole meeting. Pick one of the times above.`)],
          flow,
        };
      }
      return proposeSlot(flow, start);
    }

    case 'confirm': {
      const booking = flow.booking!;
      const room = flow.room!;
      if (confirmed) {
        try {
          const { booking: moved } = await meetingRoomApi.reschedule(booking.id, flow.newStart!);
          return {
            items: [bookedCard(moved, room), bookingGreeting('your meeting', [moved.date], ctx.now, ` at ${formatTime(moved.start)}`)],
            chips: AFTER_ROOM_BOOKING_CHIPS,
            flow: { kind: 'roomBooking', step: 'booked', booking: moved },
          };
        } catch (err) {
          if (err instanceof RoomApiError && (err.status === 409 || err.status === 400)) {
            return offerSlots(booking, ctx, `Sorry, ${err.message} Here are the times still free.`);
          }
          throw err;
        }
      }
      if (dismissed) return stays(booking, `No problem, ${room.name} stays at ${formatRange(booking.start, booking.end)}.`);
      return null;
    }

    case 'cancelConfirm': {
      const booking = flow.booking!;
      const room = flow.room!;
      const when = `${dayWord(booking.date, ctx.now)}, ${formatRange(booking.start, booking.end)}`;
      if (action?.type === 'confirm' || (!action && /^(yes|yep|yeah|sure|ok(ay)?|confirm|cancel( it| booking)?|go ahead)\b/.test(lower))) {
        try {
          await meetingRoomApi.cancel(booking.id);
        } catch (err) {
          if (err instanceof RoomApiError && err.status === 404) {
            return { items: [say(`That booking for ${room.name} isn't there any more.`)], chips: ['Upcoming Bookings', 'Book a Meeting room'], flow: null };
          }
          throw err;
        }
        return {
          items: [say(`Your booking for ${room.name} ${when} has been cancelled.`)],
          chips: ['Book a Meeting room', 'Upcoming Bookings'],
          flow: null,
        };
      }
      if (dismissed) return stays(booking, `Great, ${room.name} is still booked ${when}.`);
      return null;
    }
  }
}
