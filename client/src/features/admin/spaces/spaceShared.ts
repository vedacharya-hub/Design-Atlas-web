import type { AdminBuilding, AdminSpace, SpaceBookingKind, SpaceType } from '../../../api/types';
import { ordinal } from '../events/eventShared';

/** "#WE-000021" */
export const spaceCode = (s: Pick<AdminSpace, 'number'>) => `#WE-${String(s.number).padStart(6, '0')}`;
/** "#WE-01" */
export const buildingCode = (b: Pick<AdminBuilding, 'number'>) => `#WE-${String(b.number).padStart(2, '0')}`;
/** "#ST-01" */
export const typeCode = (t: Pick<SpaceType, 'number'>) => `#ST-${String(t.number).padStart(2, '0')}`;

/** "6th Floor" */
export const floorLabel = (floor: number) => `${ordinal(floor)} Floor`;

/** "022 - 026, 6th Floor", or just the floor when it has no office numbers. */
export const spacePlace = (s: Pick<AdminSpace, 'officeNo' | 'floor'>) => (s.officeNo ? `${s.officeNo}, ${floorLabel(s.floor)}` : floorLabel(s.floor));

/** "12,044" */
export const sqft = (n: number) => n.toLocaleString('en-IN');

export const BOOKING_KIND_LABEL: Record<SpaceBookingKind, string> = {
  'full-day': 'Full Day',
  'time-duration': 'Time duration',
};

/** Restricted bookings pick from Monday (0) to Saturday (5). */
export const WEEKDAYS = [
  { letter: 'M', name: 'Monday' },
  { letter: 'T', name: 'Tuesday' },
  { letter: 'W', name: 'Wednesday' },
  { letter: 'T', name: 'Thursday' },
  { letter: 'F', name: 'Friday' },
  { letter: 'S', name: 'Saturday' },
];

/** Time zones offered for a building; a building may already have another. */
export const TIME_ZONES = ['Asia/Kolkata', 'Asia/Dubai', 'Asia/Singapore', 'Europe/London', 'America/New_York'];

/** "24.2 MB", "860 KB" */
export function fileSize(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** "PNG" from "Wework-design.png", for the file icon. */
export const fileKind = (name: string) => (/\.([a-z0-9]+)$/i.exec(name)?.[1] ?? 'IMG').toUpperCase().slice(0, 4);

/** Floor plans this size or smaller are kept as they are; bigger ones are scaled down. */
const KEEP_AS_IS_BYTES = 4 * 1024 * 1024;
const MAX_MAP_SIDE = 2400;

/**
 * A floor plan image as a data URL. Large files are redrawn at most 2400px on their long side as
 * a JPEG, so the save stays small enough to send.
 */
export function readFloorMap(file: File): Promise<string> {
  const asDataUrl = () =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error('That file couldn’t be read.'));
      reader.readAsDataURL(file);
    });
  if (file.size <= KEEP_AS_IS_BYTES || file.type === 'image/svg+xml') return asDataUrl();
  return asDataUrl().then(
    (src) =>
      new Promise<string>((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          const scale = Math.min(1, MAX_MAP_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
          const canvas = document.createElement('canvas');
          canvas.width = Math.round(img.naturalWidth * scale);
          canvas.height = Math.round(img.naturalHeight * scale);
          const ctx = canvas.getContext('2d');
          if (!ctx) return reject(new Error('That image couldn’t be read.'));
          ctx.fillStyle = '#fff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/jpeg', 0.85));
        };
        img.onerror = () => reject(new Error('That file isn’t an image we can show.'));
        img.src = src;
      }),
  );
}

/** Floor plans can be PNG, JPG, WebP or SVG. */
export const FLOOR_MAP_ACCEPT = 'image/png,image/jpeg,image/webp,image/svg+xml';
export const isFloorMapFile = (file: File) => FLOOR_MAP_ACCEPT.split(',').includes(file.type);
