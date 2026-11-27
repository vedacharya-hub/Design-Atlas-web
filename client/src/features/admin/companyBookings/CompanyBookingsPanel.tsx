import { useEffect, useMemo, useRef, useState } from 'react';
import mb from '../../myBookings/MyBookingsPage.module.css';
import ui from '../AdminControls.module.css';
import usersStyles from '../users/UsersPanel.module.css';
import styles from './CompanyBookingsPanel.module.css';
import { adminApi } from '../../../api/adminApi';
import type { MyBooking } from '../../../api/types';
import { AdminPanelHeader } from '../AdminPanelHeader';
import { ConfirmPhraseDialog } from '../ConfirmPhraseDialog';
import { useToast } from '../Toaster';
import { downloadCsv, useDismiss } from '../users/useRowMenu';
import { BookingDetailsPanel } from '../../myBookings/BookingDetailsPanel';
import { dayOfMonth, monthLabel, statusOf, weekday, type BookingStatus } from '../../myBookings/myBookingsShared';
import { CompanyBookingRow, STATUS_TEXT, bookingDates, bookingHours } from './CompanyBookingRow';
import {
  CompanyBookingsFilterPanel,
  NO_BOOKING_FILTERS,
  countBookingFilters,
  matchesBookingFilters,
  type CompanyBookingFilters,
} from './CompanyBookingsFilterPanel';

/** What an admin may cancel: a desk or desks in the office, or a meeting room, that hasn't ended. Matches the server. */
const CANCELLABLE: MyBooking['kind'][] = ['office-desk', 'team-desks', 'meeting-room'];
const canCancel = (b: MyBooking, status: BookingStatus) => CANCELLABLE.includes(b.kind) && (status === 'active' || status === 'ongoing');

const STATUS_ORDER: Record<BookingStatus, number> = { ongoing: 0, active: 1, completed: 2, cancelled: 3 };

const KIND_NOUN: Record<MyBooking['kind'], string> = {
  'meeting-room': 'meeting room',
  'shared-desk': 'shared desk',
  'office-desk': 'desk',
  'team-desks': 'team desks',
  'private-office': 'private office',
};

/**
 * Admin → Company Bookings (Figma 10124:215973): everyone's bookings across the product lines, newest
 * first, by month and then by day. Search and filters narrow them; the eye opens a booking's details,
 * from where an admin can cancel an office desk, team desks or meeting room booking that hasn't ended.
 * The rest are view only.
 */
export function CompanyBookingsPanel() {
  const toast = useToast();
  const [bookings, setBookings] = useState<MyBooking[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<CompanyBookingFilters>(NO_BOOKING_FILTERS);
  const [filterOpen, setFilterOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [viewing, setViewing] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<MyBooking | null>(null);
  const [now, setNow] = useState(() => new Date());
  const moreRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  // True when the rows fit the list; otherwise they scroll sideways under a pinned status column.
  const [fits, setFits] = useState(true);
  useDismiss(moreOpen, moreRef, () => setMoreOpen(false));

  useEffect(() => {
    adminApi
      .getCompanyBookings()
      .then(setBookings)
      .catch(() => setLoadError('We couldn’t load the company’s bookings. Refresh to try again.'));
    // Statuses move on with the clock.
    const tick = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(tick);
  }, []);

  const shown = useMemo(() => {
    if (!bookings) return [];
    const q = query.trim().toLowerCase();
    return (
      bookings
        .map((b) => ({ b, status: statusOf(b, now) }))
        .filter(({ b, status }) => {
          if (!matchesBookingFilters(b, status, filters)) return false;
          if (!q) return true;
          const text = [b.title, b.location, b.reference, b.tag, b.createdBy.name, ...b.people.map((p) => p.name)].join(' ').toLowerCase();
          return text.includes(q);
        })
        // Newest day first; within a day, by start time and then status.
        .sort((x, y) => y.b.dates[0].localeCompare(x.b.dates[0]) || x.b.start - y.b.start || STATUS_ORDER[x.status] - STATUS_ORDER[y.status])
    );
  }, [bookings, now, query, filters]);

  const months = useMemo(() => {
    const result: { month: string; days: { key: string; items: typeof shown }[] }[] = [];
    for (const item of shown) {
      const key = item.b.dates[0];
      const month = monthLabel(key);
      let m = result[result.length - 1];
      if (m?.month !== month) result.push((m = { month, days: [] }));
      let d = m.days[m.days.length - 1];
      if (d?.key !== key) m.days.push((d = { key, items: [] }));
      d.items.push(item);
    }
    return result;
  }, [shown]);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const check = () => setFits(list.scrollWidth <= list.clientWidth + 1);
    check();
    const observer = new ResizeObserver(check);
    observer.observe(list);
    return () => observer.disconnect();
  }, [months]);

  const filterCount = countBookingFilters(filters);
  const viewingBooking = bookings?.find((b) => b.id === viewing) ?? null;
  const viewingStatus = viewingBooking ? statusOf(viewingBooking, now) : null;

  /** The bookings shown, as CSV. */
  function exportCsv() {
    downloadCsv(
      'company-bookings.csv',
      ['Reference', 'Type', 'Space', 'Location', 'Booked for', 'Time', 'Booked by', 'People', 'Credits', 'Status'],
      shown.map(({ b, status }) => [
        b.reference,
        b.tag,
        b.title,
        b.location,
        bookingDates(b.dates),
        bookingHours(b),
        b.createdBy.name,
        b.people.map((p) => p.name).join('; '),
        b.credits === undefined ? '' : String(b.credits),
        STATUS_TEXT[status],
      ]),
    );
    setMoreOpen(false);
  }

  async function cancel(b: MyBooking) {
    try {
      setBookings(await adminApi.cancelCompanyBooking(b.id));
      setCancelling(null);
      setViewing(null);
      toast({
        title: 'Booking cancelled!',
        description: (
          <>
            <strong>{b.title}</strong> for {b.createdBy.name} on {bookingDates(b.dates)} is cancelled
          </>
        ),
      });
      return true;
    } catch (err) {
      toast({ tone: 'error', title: 'Couldn’t cancel the booking', description: err instanceof Error ? err.message : 'Something went wrong. Please try again.' });
      return false;
    }
  }

  return (
    <>
      <AdminPanelHeader title="Company Bookings" description="Configure your work spaces and space settings">
        <div className={styles.controls}>
          <label className={[ui.search, styles.search].join(' ')}>
            <span className={ui.srOnly}>Search bookings</span>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search" />
            <img src="/admin/search.svg" alt="" width={20} height={20} />
          </label>
          <button
            type="button"
            className={[ui.btn, ui.btnSecondary, filterCount ? ui.btnSecondaryOn : ''].join(' ').trim()}
            aria-haspopup="dialog"
            aria-expanded={filterOpen}
            disabled={!bookings}
            onClick={() => setFilterOpen(true)}
          >
            <img src="/admin/filter.svg" alt="" width={24} height={24} />
            Filter
            {filterCount > 0 && <span className={ui.filterCount}>{filterCount}</span>}
          </button>
          <div className={ui.filterWrap} ref={moreRef}>
            <button type="button" className={ui.iconBtn} aria-label="More options" aria-expanded={moreOpen} aria-haspopup="menu" onClick={() => setMoreOpen((o) => !o)}>
              <img src="/admin/user/more-2-fill.svg" alt="" width={20} height={20} />
            </button>
            {moreOpen && (
              <div className={usersStyles.moreMenu} role="menu">
                <button type="button" role="menuitem" className={usersStyles.moreItem} disabled={shown.length === 0} onClick={exportCsv}>
                  <img src="/admin/download.svg" alt="" width={20} height={20} />
                  Download as CSV
                </button>
              </div>
            )}
          </div>
        </div>
      </AdminPanelHeader>

      <div ref={listRef} className={[styles.list, fits ? styles.listFits : ''].join(' ').trim()} aria-label="Company bookings">
        {loadError && <p className={ui.empty}>{loadError}</p>}
        {!loadError && bookings === null && <p className={ui.empty}>Loading bookings…</p>}
        {bookings !== null && months.length === 0 && (
          <div className={mb.emptyBlock}>
            <p className={mb.empty}>{bookings.length === 0 ? 'Nobody in the company has booked anything yet.' : 'No bookings match your search or filters.'}</p>
            {(filterCount > 0 || query) && (
              <button
                type="button"
                className={mb.clear}
                onClick={() => {
                  setFilters(NO_BOOKING_FILTERS);
                  setQuery('');
                }}
              >
                Show all bookings
              </button>
            )}
          </div>
        )}
        {months.map((m) => (
          <section key={m.month} className={styles.month} aria-label={m.month}>
            <h2 className={[mb.monthLabel, styles.monthLabel].join(' ')}>{m.month}</h2>
            {m.days.map((d) => (
              <div key={d.key} className={mb.day}>
                <div className={mb.dayDate}>
                  <span className={mb.weekday}>{weekday(d.key)}</span>
                  <span className={mb.dayNumber}>{dayOfMonth(d.key)}</span>
                </div>
                <div className={mb.dayRows}>
                  {d.items.map(({ b, status }) => (
                    <CompanyBookingRow key={b.id} booking={b} status={status} onView={() => setViewing(b.id)} />
                  ))}
                </div>
              </div>
            ))}
          </section>
        ))}
      </div>

      {filterOpen && bookings && <CompanyBookingsFilterPanel bookings={bookings} value={filters} onApply={setFilters} onClose={() => setFilterOpen(false)} />}

      {viewingBooking && viewingStatus && (
        <BookingDetailsPanel
          booking={viewingBooking}
          status={viewingStatus}
          onCancelBooking={canCancel(viewingBooking, viewingStatus) ? () => setCancelling(viewingBooking) : undefined}
          onClose={() => setViewing(null)}
        />
      )}

      {cancelling && (
        <ConfirmPhraseDialog
          icon="/admin/user/archive-trash.svg"
          title={`Cancel this ${KIND_NOUN[cancelling.kind]} booking?`}
          note={
            cancelling.kind === 'meeting-room'
              ? `${cancelling.createdBy.name} and everyone on it lose the room, and it opens up for others to book. This can’t be undone.`
              : `${cancelling.kind === 'team-desks' ? 'Everyone on it loses their desk' : `${cancelling.createdBy.name} loses the desk`}${
                  cancelling.dates.length > 1 ? ' for the days still to come' : ''
                }, and it opens up for others to book. This can’t be undone.`
          }
          item={{ name: cancelling.title, meta: `${cancelling.reference} · ${bookingDates(cancelling.dates)}` }}
          phrase="Cancel"
          confirmLabel="Cancel Booking"
          busyLabel="Cancelling…"
          cancelLabel="Keep Booking"
          onCancel={() => setCancelling(null)}
          onConfirm={() => cancel(cancelling)}
        />
      )}
    </>
  );
}
