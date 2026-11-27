import { useEffect, useMemo, useRef, useState } from 'react';
import styles from './MyBookingsPage.module.css';
import { NavBar } from '../booking/NavBar';
import { bookingApi } from '../../api/bookingApi';
import { myBookingsApi } from '../../api/myBookingsApi';
import type { Member, MyBooking, MyBookingKind } from '../../api/types';
import { useToast } from '../admin/Toaster';
import { BookingRow } from './BookingRow';
import { InviteGuestDialog } from './InviteGuestDialog';
import { BookingDetailsPanel } from './BookingDetailsPanel';
import { dateFromKey, dayOfMonth, monthLabel, statusOf, weekday, type BookingStatus } from './myBookingsShared';

type TypeFilter = 'all' | 'meeting-room' | 'shared-desk' | 'office-desk' | 'private-office';
type PeriodFilter = 'this-month' | 'upcoming' | 'last-month' | 'last-3-months' | 'all';
type StatusFilter = 'all' | 'active' | 'completed' | 'cancelled';
type SpaceFilter = 'all' | 'office' | 'wework';
type Owner = 'mine' | 'forMe';

const TYPES: { value: TypeFilter; label: string }[] = [
  { value: 'all', label: 'All types' },
  { value: 'meeting-room', label: 'Meeting rooms' },
  { value: 'shared-desk', label: 'Shared desks' },
  { value: 'office-desk', label: 'Office desks' },
  { value: 'private-office', label: 'Private offices (BPO)' },
];
const PERIODS: { value: PeriodFilter; label: string }[] = [
  { value: 'this-month', label: 'This Month' },
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'last-month', label: 'Last Month' },
  { value: 'last-3-months', label: 'Last 3 Months' },
  { value: 'all', label: 'All Time' },
];
const STATUSES: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All Bookings' },
  { value: 'active', label: 'Active' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];
const SPACES: { value: SpaceFilter; label: string }[] = [
  { value: 'all', label: 'All Spaces' },
  { value: 'office', label: 'Private Office Bookings' },
  { value: 'wework', label: 'WeWork Spaces' },
];

/** Office desks include team desks (several desks on one day). */
const TYPE_KINDS: Record<Exclude<TypeFilter, 'all'>, MyBookingKind[]> = {
  'meeting-room': ['meeting-room'],
  'shared-desk': ['shared-desk'],
  'office-desk': ['office-desk', 'team-desks'],
  'private-office': ['private-office'],
};
const STATUS_ORDER: Record<BookingStatus, number> = { ongoing: 0, active: 1, completed: 2, cancelled: 3 };

/** A pill that opens a list of choices (Figma "Dropdown Main Component"). */
function FilterDropdown<T extends string>({
  label,
  value,
  options,
  placeholder,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  /** Shown instead of the first option's label while it's selected ("Type" for all types). */
  placeholder?: string;
  onChange: (value: T) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  const current = options.find((o) => o.value === value) ?? options[0];
  const shown = placeholder && current === options[0] ? placeholder : current.label;
  return (
    <div className={styles.dropdown} ref={ref}>
      <button type="button" className={[styles.dropdownBtn, current !== options[0] ? styles.dropdownBtnOn : ''].join(' ').trim()} aria-haspopup="listbox" aria-expanded={open} aria-label={`${label}: ${current.label}`} onClick={() => setOpen((o) => !o)}>
        {shown}
        <img src="/bookings/chevron.svg" alt="" width={20} height={20} className={open ? styles.chevronUp : undefined} />
      </button>
      {open && (
        <ul className={styles.dropdownMenu} role="listbox" aria-label={label}>
          {options.map((o) => (
            <li key={o.value}>
              <button
                type="button"
                role="option"
                aria-selected={o.value === value}
                className={[styles.dropdownItem, o.value === value ? styles.dropdownItemOn : ''].join(' ').trim()}
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
              >
                {o.label}
                {o.value === value && <img src="/admin/user/check.svg" alt="" width={16} height={16} />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface Props {
  active: string;
  onTabChange: (tab: string) => void;
}

/**
 * My Bookings (Figma 1445:45934): every meeting room, shared desk, office desk (one or several days,
 * or several desks on a day) and bookable private office the member has, newest first, by month and
 * then by day. Filters for type, period, status and space; Created By Me / Created For Me.
 */
export function MyBookingsPage({ active, onTabChange }: Props) {
  const toast = useToast();
  const [user, setUser] = useState<Member | null>(null);
  const [bookings, setBookings] = useState<MyBooking[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [type, setType] = useState<TypeFilter>('all');
  const [period, setPeriod] = useState<PeriodFilter>('this-month');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [space, setSpace] = useState<SpaceFilter>('all');
  const [owner, setOwner] = useState<Owner>('mine');
  const [inviting, setInviting] = useState<MyBooking | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
  const listRef = useRef<HTMLElement>(null);
  // True when the rows fit the list; otherwise they scroll sideways under a pinned status column.
  const [fits, setFits] = useState(true);

  useEffect(() => {
    bookingApi
      .getMembers()
      .then((m) => setUser(m.find((x) => x.isCurrentUser) ?? m[0] ?? null))
      .catch(() => setUser(null));
    myBookingsApi
      .list()
      .then(setBookings)
      .catch(() => setLoadError('We couldn’t load your bookings. Refresh to try again.'));
    // Statuses move on with the clock (a meeting that starts stops taking guests).
    const tick = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(tick);
  }, []);

  const months = useMemo(() => {
    if (!bookings) return [];
    const monthStart = (offset: number) => new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const within = (b: MyBooking, from: Date, to: Date) => b.dates.some((k) => dateFromKey(k) >= from && dateFromKey(k) < to);
    const shown = bookings
      .map((b) => ({ b, status: statusOf(b, now) }))
      .filter(({ b, status: s }) => {
        if (b.createdByMe !== (owner === 'mine')) return false;
        if (type !== 'all' && !TYPE_KINDS[type].includes(b.kind)) return false;
        if (space !== 'all' && b.space !== space) return false;
        if (status === 'active' && s !== 'active' && s !== 'ongoing') return false;
        if (status !== 'all' && status !== 'active' && s !== status) return false;
        if (period === 'this-month') return within(b, monthStart(0), monthStart(1));
        if (period === 'last-month') return within(b, monthStart(-1), monthStart(0));
        if (period === 'last-3-months') return within(b, monthStart(-2), monthStart(1));
        if (period === 'upcoming') return s === 'active' || s === 'ongoing';
        return true;
      })
      // Newest day first; within a day, by start time and then status.
      .sort((x, y) => y.b.dates[0].localeCompare(x.b.dates[0]) || x.b.start - y.b.start || STATUS_ORDER[x.status] - STATUS_ORDER[y.status]);

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
  }, [bookings, now, owner, type, space, status, period]);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const check = () => setFits(list.scrollWidth <= list.clientWidth + 1);
    check();
    const observer = new ResizeObserver(check);
    observer.observe(list);
    return () => observer.disconnect();
  }, [months]);

  const filtered = type !== 'all' || period !== 'this-month' || status !== 'all' || space !== 'all';
  const viewingBooking = bookings?.find((b) => b.id === viewing) ?? null;

  function replace(next: MyBooking) {
    setBookings((list) => (list ?? []).map((b) => (b.id === next.id ? next : b)));
  }

  return (
    <div className={styles.page}>
      <NavBar user={user} active={active} onSelect={onTabChange} />

      <header className={styles.header}>
        <h1 className={styles.heading}>My Bookings</h1>
        <div className={styles.controls}>
          <div className={styles.filters}>
            <FilterDropdown label="Type" value={type} options={TYPES} placeholder="Type" onChange={setType} />
            <FilterDropdown label="Period" value={period} options={PERIODS} onChange={setPeriod} />
            <FilterDropdown label="Status" value={status} options={STATUSES} onChange={setStatus} />
            <FilterDropdown label="Space" value={space} options={SPACES} onChange={setSpace} />
          </div>
          <div className={styles.tabs} role="tablist" aria-label="Whose bookings">
            {(
              [
                ['mine', 'Created By Me'],
                ['forMe', 'Created For Me'],
              ] as const
            ).map(([id, label]) => (
              <button key={id} type="button" role="tab" aria-selected={owner === id} className={[styles.tab, owner === id ? styles.tabOn : ''].join(' ').trim()} onClick={() => setOwner(id)}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main ref={listRef} className={[styles.list, fits ? styles.listFits : ''].join(' ').trim()} aria-label="Bookings">
        {loadError && <p className={styles.empty}>{loadError}</p>}
        {!loadError && bookings === null && <p className={styles.empty}>Loading your bookings…</p>}
        {bookings !== null && months.length === 0 && (
          <div className={styles.emptyBlock}>
            <p className={styles.empty}>{owner === 'forMe' ? 'Nobody has booked anything for you here.' : 'No bookings here.'}</p>
            {filtered && (
              <button
                type="button"
                className={styles.clear}
                onClick={() => {
                  setType('all');
                  setPeriod('all');
                  setStatus('all');
                  setSpace('all');
                }}
              >
                Show all bookings
              </button>
            )}
          </div>
        )}
        {months.map((m) => (
          <section key={m.month} className={styles.month} aria-label={m.month}>
            <h2 className={styles.monthLabel}>{m.month}</h2>
            {m.days.map((d) => (
              <div key={d.key} className={styles.day}>
                <div className={styles.dayDate}>
                  <span className={styles.weekday}>{weekday(d.key)}</span>
                  <span className={styles.dayNumber}>{dayOfMonth(d.key)}</span>
                </div>
                <div className={styles.dayRows}>
                  {d.items.map(({ b, status: s }) => (
                    <BookingRow key={b.id} booking={b} status={s} onInvite={() => setInviting(b)} onView={() => setViewing(b.id)} />
                  ))}
                </div>
              </div>
            ))}
          </section>
        ))}
      </main>

      {viewingBooking && (
        <BookingDetailsPanel
          booking={viewingBooking}
          status={statusOf(viewingBooking, now)}
          onInvite={() => setInviting(viewingBooking)}
          onClose={() => setViewing(null)}
        />
      )}

      {inviting && (
        <InviteGuestDialog
          booking={inviting}
          onClose={() => setInviting(null)}
          onInvited={(next, guest) => {
            replace(next);
            setInviting(null);
            toast({
              title: 'Guest invited!',
              description: (
                <>
                  <strong>{guest}</strong> is invited to {next.title}
                </>
              ),
            });
          }}
        />
      )}
    </div>
  );
}
