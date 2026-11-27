import { useEffect, useRef, useState } from 'react';
import styles from '../users/UsersFilterPanel.module.css';
import type { MyBooking, MyBookingKind } from '../../../api/types';
import { SelectField } from '../users/UserFormFields';
import { RadioGroup } from '../users/UsersFilterPanel';
import type { BookingStatus } from '../../myBookings/myBookingsShared';

export type BookingType = '' | 'meeting-room' | 'office-desk' | 'shared-desk' | 'private-office';

export interface CompanyBookingFilters {
  type: BookingType;
  /** A member's id: bookings they made. */
  bookedBy: string;
  status: '' | 'active' | 'completed' | 'cancelled';
  space: '' | MyBooking['space'];
}

export const NO_BOOKING_FILTERS: CompanyBookingFilters = { type: '', bookedBy: '', status: '', space: '' };

/** How many filters are set (the count on the Filter button). */
export const countBookingFilters = (f: CompanyBookingFilters) => Object.values(f).filter(Boolean).length;

/** Office desks include team desks (several desks on one day). */
const TYPE_KINDS: Record<Exclude<BookingType, ''>, MyBookingKind[]> = {
  'meeting-room': ['meeting-room'],
  'office-desk': ['office-desk', 'team-desks'],
  'shared-desk': ['shared-desk'],
  'private-office': ['private-office'],
};

export const matchesBookingFilters = (b: MyBooking, status: BookingStatus, f: CompanyBookingFilters) =>
  (!f.type || TYPE_KINDS[f.type].includes(b.kind)) &&
  (!f.bookedBy || b.createdBy.id === f.bookedBy) &&
  (!f.space || b.space === f.space) &&
  // Active covers ones under way.
  (!f.status || (f.status === 'active' ? status === 'active' || status === 'ongoing' : status === f.status));

const TYPE_CHOICES = [
  { value: 'meeting-room', label: 'Meeting rooms' },
  { value: 'office-desk', label: 'Office desks' },
  { value: 'shared-desk', label: 'Shared desks' },
  { value: 'private-office', label: 'Private offices (BPO)' },
];
const STATUS_CHOICES = [
  { value: '', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];
const SPACE_CHOICES = [
  { value: '', label: 'All' },
  { value: 'office', label: 'Office' },
  { value: 'wework', label: 'WeWork spaces' },
];

/** Same as the panel's slide-out; a timer rather than animationend, which a hidden tab never fires. */
const CLOSE_MS = 240;

interface Props {
  bookings: MyBooking[];
  value: CompanyBookingFilters;
  onApply: (filters: CompanyBookingFilters) => void;
  onClose: () => void;
}

/**
 * Filters for Company Bookings, in the same 490px panel as the Users and Spaces filters: the type of
 * booking, who booked it, its status and where it is. Save applies them; closing any other way
 * leaves them as they were.
 */
export function CompanyBookingsFilterPanel({ bookings, value, onApply, onClose }: Props) {
  const [draft, setDraft] = useState<CompanyBookingFilters>(value);
  const [closing, setClosing] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const closingRef = useRef(false);
  const set = (patch: Partial<CompanyBookingFilters>) => setDraft((d) => ({ ...d, ...patch }));

  function close(apply?: CompanyBookingFilters) {
    if (closingRef.current) return;
    closingRef.current = true;
    if (apply) onApply(apply);
    setClosing(true);
    setTimeout(onClose, CLOSE_MS);
  }

  useEffect(() => {
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) close();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Everyone who has booked something, by name.
  const bookers = [...new Map(bookings.map((b) => [b.createdBy.id, b.createdBy.name])).entries()]
    .sort((a, b) => a[1].localeCompare(b[1]))
    .map(([id, name]) => ({ value: id, label: name }));

  return (
    <>
      <div className={[styles.backdrop, closing ? styles.backdropOut : ''].join(' ').trim()} onMouseDown={() => close()} />
      <div
        ref={panelRef}
        className={[styles.panel, closing ? styles.panelOut : ''].join(' ').trim()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="company-bookings-filter-title"
        tabIndex={-1}
      >
        <header className={styles.head}>
          <h2 id="company-bookings-filter-title" className={styles.title}>
            Filters
          </h2>
          <button type="button" className={styles.close} aria-label="Close filters" onClick={() => close()}>
            <img src="/admin/user/close.svg" alt="" width={24} height={24} />
          </button>
        </header>

        <div className={styles.body}>
          <SelectField label="Booking Type" placeholder="All" value={draft.type} choices={TYPE_CHOICES} onChange={(v) => set({ type: v as BookingType })} />
          <SelectField label="Booked By" placeholder="Anyone" value={draft.bookedBy} choices={bookers} onChange={(bookedBy) => set({ bookedBy })} />
          <RadioGroup
            label="Status"
            name="company-bookings-status"
            value={draft.status}
            choices={STATUS_CHOICES}
            onChange={(v) => set({ status: v as CompanyBookingFilters['status'] })}
          />
          <RadioGroup
            label="Space"
            name="company-bookings-space"
            value={draft.space}
            choices={SPACE_CHOICES}
            onChange={(v) => set({ space: v as CompanyBookingFilters['space'] })}
          />
        </div>

        <footer className={styles.foot}>
          <button type="button" className={styles.secondary} disabled={countBookingFilters(draft) === 0} onClick={() => setDraft(NO_BOOKING_FILTERS)}>
            Clear all
          </button>
          <button type="button" className={styles.primary} onClick={() => close(draft)}>
            Save
            <img src="/admin/user/check-white.svg" alt="" width={20} height={20} />
          </button>
        </footer>
      </div>
    </>
  );
}
