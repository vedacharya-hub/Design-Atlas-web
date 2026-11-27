import { useEffect, useState } from 'react';
import { adminApi } from '../../../api/adminApi';
import type { CompanySettings, CompanyShift } from '../../../api/types';
import { clock, parseTime } from '../events/eventShared';

export interface ServiceCard {
  /** The role permission it controls. */
  key: string;
  title: string;
  description: string;
  /** Drawn on #f8fafc, as the design pairs Desk Selection with “Sit Anywhere”. */
  shaded?: boolean;
}
export interface ServiceGroup {
  id: string;
  title: string;
  /** Names one of its services in a sentence or on a card: “Atlas Service”. */
  label: string;
  /** Shown on the (i) beside the title. */
  info: string;
  /** Cards a row at a time. */
  rows: ServiceCard[][];
}

/** The services on General Info & Permissions (Figma 7991:258087): every one is also a role permission. */
export const SERVICE_GROUPS: ServiceGroup[] = [
  {
    id: 'atlas',
    title: 'ATLAS SERVICES',
    label: 'Atlas Service',
    info: 'What anyone at the company can use in Atlas. Turn one off and it’s off for every role and everyone who holds it, whatever the role says.',
    rows: [
      [
        { key: 'private-offices', title: 'Private Office Tab', description: 'Allow users to Book Private offices' },
        { key: 'meeting-rooms', title: 'Meeting Room Booking', description: 'Book meeting rooms across available locations' },
      ],
      [
        { key: 'desk-selection', title: 'Desk Selection', description: 'Allow all users to select a desk while booking', shaded: true },
        { key: 'sit-anywhere', title: '“Sit Anywhere” Access', description: 'Allow all users to sit at any desk within office', shaded: true },
        { key: 'all-zones', title: 'Booking for All Zones', description: 'Allow all users to book in all zones' },
      ],
    ],
  },
  {
    id: 'coworking',
    title: 'CO-WORKING SERVICES',
    label: 'Co-working Service',
    info: 'What anyone at the company can book at other WeWork buildings. Turn one off and it’s off for every role and everyone who holds it.',
    rows: [
      [
        { key: 'shared-desks', title: 'Shared desk Booking', description: 'Allow all users to book desk to other weworks' },
        { key: 'shared-meeting-rooms', title: 'Shared Meeting Room Booking', description: 'Book meeting rooms across available locations' },
        { key: 'shared-private-offices', title: 'Shared Private Office', description: 'Allow users to Book Private offices' },
      ],
    ],
  },
];

/** The services the company has turned off. */
export const restrictedServices = (company: Pick<CompanySettings, 'services'> | null) =>
  company ? Object.entries(company.services).filter(([, on]) => !on).map(([key]) => key) : [];

/**
 * The role permissions the company has turned off in Company Settings: roles show them as
 * restricted, and nobody who holds the role can use them.
 */
export function useRestrictedServices() {
  const [keys, setKeys] = useState<string[]>([]);
  useEffect(() => {
    let live = true;
    adminApi
      .getCompany()
      .then((c) => {
        if (live) setKeys(restrictedServices(c));
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  return keys;
}

export const RESTRICTED_TIP = 'Restricted by admin: turned off for the whole company in Company Settings';

/** "#SFT01" */
export const shiftCode = (s: Pick<CompanyShift, 'number'>) => `#SFT${String(s.number).padStart(2, '0')}`;

/** "09:00" → "9:00AM", or "9:00 AM" with `spaced`. */
export const shiftClock = (time: string, spaced = false) => clock(parseTime(time) ?? 0, spaced);
/** "9:00AM - 5:00PM" */
export const shiftTimings = (s: Pick<CompanyShift, 'startTime' | 'endTime'>, spaced = false) => `${shiftClock(s.startTime, spaced)} - ${shiftClock(s.endTime, spaced)}`;

export const SHIFT_STATUS_LABEL: Record<CompanyShift['status'], string> = { active: 'ACTIVE', inactive: 'INACTIVE' };

/** A logo fitted (not cropped) into a 240px square PNG, transparent around it. */
export function readLogo(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (file.size > 2 * 1024 * 1024) return reject(new Error('Choose a logo under 2 MB.'));
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const size = 240;
      const scale = Math.min(size / (img.naturalWidth || size), size / (img.naturalHeight || size));
      const w = Math.max(1, Math.round((img.naturalWidth || size) * scale));
      const h = Math.max(1, Math.round((img.naturalHeight || size) * scale));
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      canvas.getContext('2d')!.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('That file isn’t an image we can use.'));
    };
    img.src = url;
  });
}
