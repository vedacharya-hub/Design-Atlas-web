import type { AdminEvent, AdminEventStatus } from '../../../api/types';

export const STATUS_LABEL: Record<AdminEventStatus, string> = {
  active: 'ACTIVE',
  scheduled: 'SCHEDULED',
  archived: 'ARCHIVED',
  completed: 'COMPLETED',
};

/** "#001" */
export const eventCode = (e: Pick<AdminEvent, 'number'>) => `#${String(e.number).padStart(3, '0')}`;

/** Up to this many photos per event. */
export const MAX_IMAGES = 6;

const pad = (n: number) => String(n).padStart(2, '0');

export function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function dateFromKey(key: string) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** 1st, 2nd, 3rd, 4th … 21st */
export function ordinal(n: number) {
  const v = n % 100;
  const suffix = v >= 11 && v <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th');
  return `${n}${suffix}`;
}

/** Minutes after midnight as "12:30PM", or "12:30 PM" with `spaced`. */
export function clock(minutes: number, spaced = false) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h % 12 || 12}:${pad(m)}${spaced ? ' ' : ''}${h < 12 ? 'AM' : 'PM'}`;
}

/** "HH:MM" for an <input type="time">, and back. */
export const timeValue = (minutes: number) => `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
export function parseTime(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

const month = (d: Date, style: 'short' | 'long') => d.toLocaleDateString('en-US', { month: style });

/** "12 Mar, 2026" */
export function shortDate(key: string) {
  const d = dateFromKey(key);
  return `${d.getDate()} ${month(d, 'short')}, ${d.getFullYear()}`;
}

/** "16th Sep, 2026" */
export function longDate(key: string) {
  const d = dateFromKey(key);
  return `${ordinal(d.getDate())} ${month(d, 'short')}, ${d.getFullYear()}`;
}

/** "Tuesday, 24th September" */
export function fullDay(key: string) {
  const d = dateFromKey(key);
  return `${d.toLocaleDateString('en-US', { weekday: 'long' })}, ${ordinal(d.getDate())} ${month(d, 'long')}`;
}

/** The photo's date chip: "TUE", 24, "SEP". */
export function dateChip(key: string) {
  const d = dateFromKey(key);
  return { weekday: d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase(), day: d.getDate(), month: month(d, 'short').toUpperCase() };
}

/** "WeWork Vaishnavi Signature" → "Vaishnavi Signature", as the list shows buildings. */
export const shortBuilding = (name: string) => name.replace(/^WeWork\s+/i, '');

/**
 * A photo as a JPEG data URL, at most 1600px wide, so a handful fit in one save. `onProgress` gets
 * 0–1 while the file is read.
 */
export function readEventImage(file: File, onProgress?: (fraction: number) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) return reject(new Error(`${file.name} isn’t an image.`));
    const reader = new FileReader();
    reader.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(e.loaded / e.total);
    };
    reader.onerror = () => reject(new Error(`Couldn’t read ${file.name}.`));
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, 1600 / img.width);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      img.onerror = () => reject(new Error(`${file.name} isn’t an image we can use.`));
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}
