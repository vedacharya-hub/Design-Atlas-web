/**
 * Iris AI's answers: what was asked decides which workspace data to look up (your bookings, meeting
 * rooms free now, today's events, free desks), and the answer comes back as Markdown to stream.
 */
import { myBookingsApi } from '../../api/myBookingsApi';
import { meetingRoomApi } from '../../api/meetingRoomApi';
import { eventsApi } from '../../api/eventsApi';
import { deskApi } from '../../api/deskApi';
import { SELECTED_BUILDING } from '../home/selectedBuilding';

export interface IrisAnswer {
  text: string;
  /** Where the answer came from, shown under it. */
  sources: string[];
  /** A happy moment (a thank-you): the bot celebrates. */
  celebrate?: boolean;
}

/** Something went wrong finding the answer; the message is shown to the member. */
export class IrisAnswerError extends Error {}

const pad = (n: number) => String(n).padStart(2, '0');
const dateKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromKey = (key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const dayLabel = (key: string) => fromKey(key).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' });
function clock(minutes: number) {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${((h + 11) % 12) + 1}:${pad(m)} ${h < 12 ? 'AM' : 'PM'}`;
}
const plural = (n: number, word: string) => `${n} ${n === 1 ? word : word === 'person' ? 'people' : `${word}s`}`;

/** Small pause so each step (searching, thinking) is long enough to see. */
export const pause = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new DOMException('Stopped', 'AbortError'));
    });
  });

const BOOKINGS = /\b(upcoming|my booking|bookings|booked|schedule|reservations?)\b/i;
const EVENTS = /\b(events?|happening|community|what'?s on)\b/i;
const ROOMS = /\b(meeting|room|conference)\b/i;
const DESKS = /\b(desk|seat|hot ?desk|workstation)\b/i;
const THANKS = /\b(thanks|thank you|thx|great job|awesome)\b/i;
const GREETING = /^\s*(hi|hello|hey|good (morning|afternoon|evening))\b/i;
/** Typing "fail" shows how Iris handles a failed lookup. */
const FAIL = /\bfail\b/i;

/** Looks up what the question needs. Throws IrisAnswerError when the data can't be reached. */
export async function findAnswer(prompt: string, signal: AbortSignal): Promise<IrisAnswer> {
  if (FAIL.test(prompt)) {
    await pause(600, signal);
    throw new IrisAnswerError('I couldn’t reach the workspace service just now. Please try again in a moment.');
  }
  try {
    if (THANKS.test(prompt)) return { text: 'You’re welcome! Anything else I can sort out for you today?', sources: [], celebrate: true };
    if (BOOKINGS.test(prompt)) return await upcomingBookings();
    if (EVENTS.test(prompt)) return await eventsToday();
    if (ROOMS.test(prompt)) return await roomsNow(prompt);
    if (DESKS.test(prompt)) return await freeDesks();
    if (GREETING.test(prompt)) return { text: `Hi! ${HELP}`, sources: [] };
    return { text: `I can’t help with that one yet. ${HELP}`, sources: [] };
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new IrisAnswerError('I couldn’t load your workspace data just now. Please try again in a moment.');
  }
}

const HELP = [
  'Here’s what I can do:',
  '',
  '- **Your bookings** – “What are my upcoming bookings?”',
  '- **Meeting rooms** – “Find a meeting room for 4 people”',
  '- **Desks** – “Are there free desks tomorrow?”',
  '- **Events** – “What’s happening at the office today?”',
].join('\n');

async function upcomingBookings(): Promise<IrisAnswer> {
  const today = dateKey(new Date());
  const all = await myBookingsApi.list();
  const upcoming = all
    .filter((b) => !b.cancelled && b.dates[b.dates.length - 1] >= today)
    .sort((a, b) => (a.dates[0] + String(a.start).padStart(4, '0')).localeCompare(b.dates[0] + String(b.start).padStart(4, '0')));
  if (upcoming.length === 0) return { text: 'You have no upcoming bookings. Want me to find you a desk or a meeting room?', sources: ['My Bookings'] };
  const lines = upcoming.slice(0, 5).map((b) => {
    const when = b.dates.length > 1 ? `${dayLabel(b.dates[0])} – ${dayLabel(b.dates[b.dates.length - 1])}` : dayLabel(b.dates[0]);
    const time = b.allDay ? 'All day' : `${clock(b.start)} – ${clock(b.end)}`;
    return `- **${b.title}** · ${when} · ${time}  \n  ${b.location}`;
  });
  const more = upcoming.length > 5 ? `\n\nAnd ${plural(upcoming.length - 5, 'more booking')} in **My Bookings**.` : '';
  return { text: `You have ${plural(upcoming.length, 'upcoming booking')}:\n\n${lines.join('\n')}${more}`, sources: ['My Bookings'] };
}

async function eventsToday(): Promise<IrisAnswer> {
  const events = await eventsApi.getEvents(SELECTED_BUILDING.name, dateKey(new Date()));
  if (events.length === 0) return { text: `Nothing is scheduled at ${SELECTED_BUILDING.label} today.`, sources: [`${SELECTED_BUILDING.label} events`] };
  const lines = events.map((e) => {
    const spots = e.spotsLeft != null ? ` · ${plural(e.spotsLeft, 'spot')} left` : '';
    return `- **${e.title}** · ${clock(e.start)} – ${clock(e.end)}  \n  ${e.location} · ${e.category}${spots}`;
  });
  return { text: `Here’s what’s on at ${SELECTED_BUILDING.label} today:\n\n${lines.join('\n')}`, sources: [`${SELECTED_BUILDING.label} events`] };
}

async function roomsNow(prompt: string): Promise<IrisAnswer> {
  const guests = Math.min(20, Math.max(1, Number(/(\d+)\s*(people|persons|guests|pax|of us)?/i.exec(prompt)?.[1] ?? 4)));
  const now = new Date();
  // The next half hour, within the rooms' 8 AM – 10 PM.
  let start = Math.ceil((now.getHours() * 60 + now.getMinutes() + 1) / 30) * 30;
  let day = now;
  if (start > 21 * 60) {
    day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    start = 9 * 60;
  }
  start = Math.max(8 * 60, start);
  const date = dateKey(day);
  const slot = await meetingRoomApi.getAvailability({ date, start, duration: 60, guests });
  const when = `${date === dateKey(now) ? 'today' : 'tomorrow'} at ${clock(start)}`;
  if (slot.rooms.length === 0) return { text: `No room for ${plural(guests, 'person')} is free ${when}. Try a later time in **Book Meeting Room**.`, sources: ['Meeting rooms'] };
  const lines = slot.rooms.slice(0, 4).map((r) => `- **${r.name}** · ${r.floorLabel} · seats ${r.capacity} · ${plural(r.creditsPerHour, 'credit')}/hr`);
  return {
    text: `${plural(slot.rooms.length, 'room')} for ${plural(guests, 'person')} ${slot.rooms.length === 1 ? 'is' : 'are'} free ${when} for an hour:\n\n${lines.join('\n')}\n\nBook one from **Book Meeting Room**.`,
    sources: ['Meeting rooms'],
  };
}

async function freeDesks(): Promise<IrisAnswer> {
  const now = new Date();
  const tomorrow = dateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
  const recs = await deskApi.getRecommendations([tomorrow]);
  if (recs.needed.length === 0) return { text: `You already have a desk booked for ${dayLabel(tomorrow)}.`, sources: ['Desk bookings'] };
  if (recs.freeDesks.length === 0) return { text: `Every desk is taken on ${dayLabel(tomorrow)}. Try another day in **Book Office Desk**.`, sources: ['Desk bookings'] };
  const picks = recs.freeDesks.slice(0, 3).map((d) => `- **Desk ${d.number}** · ${d.floorLabel}, ${d.zone}${d.features.length ? ` · ${d.features.join(', ')}` : ''}`);
  return {
    text: `${plural(recs.freeDesks.length, 'desk')} ${recs.freeDesks.length === 1 ? 'is' : 'are'} free on ${dayLabel(tomorrow)}. A few good ones:\n\n${picks.join('\n')}\n\nBook one from **Book Office Desk**.`,
    sources: ['Desk bookings'],
  };
}

/** Splits an answer into the small pieces it streams in: a few words at a time. */
export function chunksOf(text: string): string[] {
  return text.match(/\S+\s*|\s+/g)?.reduce<string[]>((out, word, i) => {
    if (i % 2 === 0) out.push(word);
    else out[out.length - 1] += word;
    return out;
  }, []) ?? [text];
}

// ---------- attachments ----------

/** What can be attached: documents, sheets, slides, text and images; up to 5 files of 10 MB each. */
export const ATTACH_ACCEPT = '.pdf,.doc,.docx,.xls,.xlsx,.csv,.ppt,.pptx,.txt,.md,.json,.png,.jpg,.jpeg';
export const ATTACH_MAX_FILES = 5;
export const ATTACH_MAX_BYTES = 10 * 1024 * 1024;

const extOf = (name: string) => name.split('.').pop()?.toLowerCase() ?? '';
const TEXT_EXT = new Set(['txt', 'md', 'csv', 'json']);
const KIND: Record<string, string> = {
  pdf: 'PDF',
  doc: 'Word document',
  docx: 'Word document',
  xls: 'Excel sheet',
  xlsx: 'Excel sheet',
  csv: 'CSV',
  ppt: 'PowerPoint',
  pptx: 'PowerPoint',
  txt: 'Text file',
  md: 'Markdown file',
  json: 'JSON file',
  png: 'Image',
  jpg: 'Image',
  jpeg: 'Image',
};

export const canAttach = (file: File) => ATTACH_ACCEPT.split(',').includes(`.${extOf(file.name)}`);

export function fileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Markdown-safe file name. */
const mdName = (name: string) => name.replace(/([\\`*_[\]])/g, '\\$1');

/** Iris's note on attached files: each one's kind and size, and a peek inside text files. */
export async function describeFiles(files: File[]): Promise<string> {
  const lines = await Promise.all(
    files.map(async (f) => {
      const ext = extOf(f.name);
      const kind = KIND[ext] ?? 'File';
      if (TEXT_EXT.has(ext) && f.size <= 512 * 1024) {
        const text = await f.text();
        const words = text.trim() ? text.trim().split(/\s+/).length : 0;
        const first = text
          .split(/\r?\n/)
          .map((l) => l.trim())
          .find(Boolean);
        const peek = first ? ` · starts “${mdName(first.slice(0, 70))}${first.length > 70 ? '…' : ''}”` : '';
        return `- **${mdName(f.name)}** · ${kind}, ${plural(words, 'word')}${peek}`;
      }
      return `- **${mdName(f.name)}** · ${kind}, ${fileSize(f.size)}`;
    }),
  );
  const opened = files.every((f) => TEXT_EXT.has(extOf(f.name)));
  const head = files.length === 1 ? 'I’ve got your file:' : `I’ve got your ${files.length} files:`;
  const tail = opened ? '' : '\n\nI can’t read inside documents yet, so tell me what you need from them and I’ll take it from there.';
  return `${head}\n\n${lines.join('\n')}${tail}`;
}
