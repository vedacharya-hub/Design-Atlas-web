/* Types and helpers shared by the Iris conversation flows and the chat UI. */
import type { BuildingEvent, Desk, DeskBooking, DeskOption, MeetingRoom, OfficeBooking, PrivateOffice, RoomBooking } from '../../api/types';

export interface SummaryRow {
  label: string;
  value: string;
}

/** Everything Iris can put in the thread besides plain text is interactive or a card rail. */
export type IrisItem =
  | { kind: 'text'; text: string }
  | { kind: 'rooms'; title: string; subtitle: string; rooms: MeetingRoom[] }
  | { kind: 'events'; title: string; subtitle: string; events: BuildingEvent[]; date: string }
  /** The member's office (Figma 9946:235737), shown above the booking calendar. */
  | { kind: 'office' }
  /**
   * Date picker (Figma 9946:235600). `multiple` allows several days; `current` marks the booking
   * being rescheduled and shows "previous → new" above it; `anchored` points it at the office card.
   */
  | { kind: 'calendar'; min: string; max: string; multiple: boolean; current?: string; anchored?: boolean }
  /** Four recommended desks, followed by a "Choose seats manually" card. */
  | { kind: 'desks'; dates: string[]; options: DeskOption[] }
  /**
   * "Choose date for reschedule / cancellation" (Figma 9961:239853): one radio row per booked day;
   * days already cancelled from the same booking are listed with a CANCELLED badge.
   */
  | { kind: 'bookingPicker'; purpose: 'reschedule' | 'cancel'; bookings: DeskBooking[]; cancelled: DeskBooking[] }
  /** Same stacked radio list for meeting-room bookings: which meeting to reschedule or cancel. */
  | { kind: 'roomBookingPicker'; purpose: 'reschedule' | 'cancel'; bookings: RoomBooking[]; rooms: MeetingRoom[] }
  /**
   * New start time for a meeting-room booking: the room's free 30-minute starts that day for the
   * same duration, with the current slot marked CURRENT.
   */
  | { kind: 'roomSlots'; booking: RoomBooking; room: MeetingRoom; slots: number[] }
  /** Private offices free on the chosen dates (Figma 4963:165644 cards), each with a Book button. */
  | { kind: 'offices'; title: string; subtitle: string; dates: string[]; offices: PrivateOffice[] }
  /** Which day of a private office booking to reschedule: the stacked radio list. */
  | { kind: 'officeBookingPicker'; bookings: OfficeBooking[] }
  /**
   * Desk header + serif title + label/value rows: the Summary with Change Seat / Book desk before
   * booking (Figma 9961:239115), the same card with the Booking ID and no buttons once booked
   * (9961:239950), and the reschedule / cancel confirmations.
   */
  | {
      kind: 'summary';
      /** Header line, e.g. "Office Desk - D12". */
      headline: string;
      /** Header photo and badge; the member's office (with its logo) when absent. */
      header?: CardHeader;
      title: string;
      rows: SummaryRow[];
      change?: { from: string; to: string };
      /** Right-hand CTA; a card without buttons is a record of a finished booking. */
      primary?: SummaryButton;
      /** Left-hand button. */
      secondary?: SummaryButton;
      tone?: 'danger';
    };

export interface CardHeader {
  photo: string;
  badge: string;
}

export interface SummaryButton {
  label: string;
  action: IrisAction;
}

/** What a button in the thread did, so Iris doesn't have to re-read it from the bubble text. */
export type IrisAction =
  | { type: 'selectRoom'; roomId: string }
  | { type: 'selectOffice'; officeId: string }
  | { type: 'pickDates'; dates: string[] }
  | { type: 'pickDesk'; deskId: string }
  | { type: 'pickBooking'; bookingId: string }
  /** A new start time (minutes from midnight) from the meeting-room slot list. */
  | { type: 'pickSlot'; start: number }
  | { type: 'confirm' }
  | { type: 'dismiss' };

export interface IrisInput {
  text: string;
  action?: IrisAction;
}

export interface RoomFlow {
  kind: 'room';
  step: 'time' | 'duration' | 'guests' | 'select';
  date: string;
  day: 'today' | 'tomorrow';
  start?: number;
  duration?: number;
  guests?: number;
  /** Rooms offered in the last search, for matching the user's pick. */
  rooms?: MeetingRoom[];
}

export interface DeskFlow {
  kind: 'desk';
  step:
    | 'date'
    | 'desk'
    | 'confirm'
    | 'booked'
    | 'pickBooking'
    | 'rescheduleDate'
    | 'rescheduleConfirm'
    | 'cancelConfirm';
  /** Booking flow: chosen dates (still to book), the desks offered for them and the desk picked. */
  dates?: string[];
  options?: DeskOption[];
  freeDesks?: Desk[];
  desk?: Desk;
  /** The days just booked (or found already booked), for follow-up reschedule/cancel. */
  bookings?: DeskBooking[];
  /** Reschedule/cancel target. */
  booking?: DeskBooking;
  newDate?: string;
  newDesk?: Desk;
  /** When several bookings could be meant, which ones and what for. */
  candidates?: DeskBooking[];
  intent?: 'reschedule' | 'cancel';
}

/**
 * Changing a meeting-room booking: moving it to another start time (same room, date and duration)
 * or cancelling it.
 */
export interface RoomBookingFlow {
  kind: 'roomBooking';
  /**
   * `booked`: a room was just booked or moved, so "reschedule" / "cancel" mean that booking.
   * `confirm` confirms a new time; `cancelConfirm` a cancellation.
   */
  step: 'pickBooking' | 'pickSlot' | 'confirm' | 'cancelConfirm' | 'booked';
  intent?: 'reschedule' | 'cancel';
  candidates?: RoomBooking[];
  booking?: RoomBooking;
  room?: MeetingRoom;
  slots?: number[];
  newStart?: number;
}

/** Booking a private office by the day, then rescheduling a day or cancelling the booking. */
export interface OfficeFlow {
  kind: 'office';
  step: 'date' | 'office' | 'confirm' | 'booked' | 'pickBooking' | 'rescheduleDate' | 'rescheduleConfirm' | 'cancelConfirm';
  /** Booking: the chosen dates, the offices free on all of them and the one picked. */
  dates?: string[];
  offices?: PrivateOffice[];
  office?: PrivateOffice;
  /** Just booked (for follow-ups), offered for rescheduling, or about to be cancelled. */
  bookings?: OfficeBooking[];
  booking?: OfficeBooking;
  newDate?: string;
}

export type IrisFlow = RoomFlow | DeskFlow | RoomBookingFlow | OfficeFlow;

export interface IrisTurn {
  items: IrisItem[];
  chips?: string[];
  flow: IrisFlow | null;
  /** Set when this turn confirmed a room booking, so the chosen card can show as booked. */
  bookedRoomId?: string;
  /** Leave the chat for an app page (Iris closes), e.g. the full desk booking flow. */
  navigate?: 'deskBooking';
}

export interface IrisContext {
  firstName: string;
  now: Date;
}

export const say = (text: string): IrisItem => ({ kind: 'text', text });

/** "3:30 PM" from minutes since midnight. */
export function formatTime(minutes: number) {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

export function formatRange(start: number, end: number) {
  return `${formatTime(start)} – ${formatTime(end)}`;
}

/** "1 hr 30 min" */
export function formatDuration(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const hours = h ? `${h} hr${h > 1 ? 's' : ''}` : '';
  return [hours, m ? `${m} min` : ''].filter(Boolean).join(' ');
}

/** "4", "4pm", "4:30 PM", "at 16:00" → minutes from midnight. Bare hours 1–7 read as PM. */
export function parseTime(text: string): number | null {
  const m = text.toLowerCase().trim().replace(/^at\s+/, '').match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  if (min > 59 || h > 23) return null;
  if (m[3]) {
    if (h < 1 || h > 12) return null;
    h = (h % 12) + (m[3] === 'pm' ? 12 : 0);
  } else if (h >= 1 && h <= 7) {
    h += 12;
  }
  return h * 60 + min;
}

/** Header line of the desk booking cards: "Office Desk - D12". */
export const deskHeadline = (deskId: string) => `Office Desk - ${deskId}`;

export function dateKey(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fromDateKey(key: string) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(d: Date, days: number) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
}

/** "Thu, 22 Oct" */
export function formatDay(key: string) {
  const d = fromDateKey(key);
  return `${d.toLocaleDateString('en-IN', { weekday: 'short' })}, ${d.getDate()} ${d.toLocaleDateString('en-IN', { month: 'short' })}`;
}

/** "Thu, 22 Oct" for one date; "Thu 22, Fri 23 & Mon 26 Oct" for several in one month. */
export function formatDays(keys: string[]) {
  const sorted = [...keys].sort();
  if (sorted.length === 1) return formatDay(sorted[0]);
  const ds = sorted.map(fromDateKey);
  const month = (d: Date) => d.toLocaleDateString('en-IN', { month: 'short' });
  const weekday = (d: Date) => d.toLocaleDateString('en-IN', { weekday: 'short' });
  const sameMonth = ds.every((d) => d.getMonth() === ds[0].getMonth() && d.getFullYear() === ds[0].getFullYear());
  const parts = ds.map((d) => (sameMonth ? `${weekday(d)} ${d.getDate()}` : `${weekday(d)} ${d.getDate()} ${month(d)}`));
  const joined = `${parts.slice(0, -1).join(', ')} & ${parts[parts.length - 1]}`;
  return sameMonth ? `${joined} ${month(ds[0])}` : joined;
}

export const dayCount = (n: number) => `${n} day${n === 1 ? '' : 's'}`;

/** "Wed, Sep 16, 2026" for one date; "Oct 22, 23 & 26, 2026" for several in one month. */
export function formatBookingDates(keys: string[]) {
  const ds = [...keys].sort().map(fromDateKey);
  const mon = (d: Date) => d.toLocaleDateString('en-US', { month: 'short' });
  if (ds.length === 1) {
    const d = ds[0];
    return `${d.toLocaleDateString('en-US', { weekday: 'short' })}, ${mon(d)} ${d.getDate()}, ${d.getFullYear()}`;
  }
  const sameMonth = ds.every((d) => d.getMonth() === ds[0].getMonth() && d.getFullYear() === ds[0].getFullYear());
  if (sameMonth) {
    const days = ds.map((d) => d.getDate());
    return `${mon(ds[0])} ${days.slice(0, -1).join(', ')} & ${days[days.length - 1]}, ${ds[0].getFullYear()}`;
  }
  return ds.map((d) => `${mon(d)} ${d.getDate()}`).join(', ') + `, ${ds[ds.length - 1].getFullYear()}`;
}

/** "Thursday, 22 October 2026" */
export function formatDayLong(key: string) {
  const d = fromDateKey(key);
  return `${d.toLocaleDateString('en-IN', { weekday: 'long' })}, ${d.getDate()} ${d.toLocaleDateString('en-IN', { month: 'long' })} ${d.getFullYear()}`;
}

/**
 * Sign-off after every successful booking (Figma 9961:239996), e.g. "You are all set for office
 * tomorrow✌️." `what` is "office" or "your meeting"; `detail` adds e.g. " at 3:00 PM".
 */
export function bookingGreeting(what: string, dates: string[], now: Date, detail = ''): IrisItem {
  return say(bookingGreetingText(what, dates, now, detail));
}

export function bookingGreetingText(what: string, dates: string[], now: Date, detail = '') {
  const sorted = [...dates].sort();
  const ahead = (key: string) => Math.round((fromDateKey(key).getTime() - fromDateKey(dateKey(now)).getTime()) / 86_400_000);
  const one = (key: string) => {
    const days = ahead(key);
    if (days === 0) return 'today';
    if (days === 1) return 'tomorrow';
    if (days > 1 && days < 7) return `on ${fromDateKey(key).toLocaleDateString('en-IN', { weekday: 'long' })}`;
    return `on ${formatDay(key)}`;
  };
  const when = sorted.length === 1 ? one(sorted[0]) : `on ${formatDays(sorted)}`;
  return `You are all set for ${what} ${when}${detail}✌️.`;
}
