import type { ReactNode } from 'react';
import mb from '../../myBookings/MyBookingsPage.module.css';
import styles from './CompanyBookingsPanel.module.css';
import type { MyBooking } from '../../../api/types';
import { dateFromKey, formatDates, formatHours, plural, type BookingStatus } from '../../myBookings/myBookingsShared';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "16 Sep, 2026"; several days as My Bookings writes them ("14 Sep - 15 Sep, 2026"). */
export function bookingDates(keys: string[]) {
  if (keys.length > 1) return formatDates(keys);
  const d = dateFromKey(keys[0]);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}, ${d.getFullYear()}`;
}

/** "9AM", "5:30PM" */
const hour = (minutes: number) => {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, '0')}` : ''}${h < 12 ? 'AM' : 'PM'}`;
};

/** "All Day (9AM - 8PM)", or "4:00 PM - 6:00 PM (2 Hours)". */
export const bookingHours = (b: MyBooking) => (b.allDay ? `All Day (${hour(b.start)} - ${hour(b.end)})` : formatHours(b));

/** Calendar and clock are a shade darker here than in My Bookings (Figma 10095:343556, 10095:343559). */
const ICON = {
  calendar: '/admin/company-bookings/calendar.svg',
  clock: '/admin/company-bookings/clock.svg',
  desks: '/admin/company-bookings/desktop.svg',
  user: '/bookings/user.svg',
  coin: '/bookings/coin.svg',
  days: '/bookings/coupon.svg',
};

/** A 20px icon and a value: "16 Sep, 2026", "6 Credits", "Ved Acharya"… */
function Line({ icon, children, credits }: { icon: keyof typeof ICON; children: ReactNode; credits?: boolean }) {
  return (
    <span className={[mb.line, credits ? mb.line_credits : ''].join(' ').trim()}>
      <img src={ICON[icon]} alt="" width={20} height={20} />
      {children}
    </span>
  );
}

export const STATUS_TEXT: Record<BookingStatus, string> = { active: 'ACTIVE', ongoing: 'ONGOING', completed: 'COMPLETED', cancelled: 'CANCELLED' };

interface Props {
  booking: MyBooking;
  status: BookingStatus;
  onView: () => void;
}

/**
 * One booking in Company Bookings (Figma 10095:343539): the space, its place and tags; when it's
 * booked for; who booked it with the credits, days or desks the product line has; a further column
 * for private offices (days and credits) and multi-day shared desks; then the status and the eye.
 */
export function CompanyBookingRow({ booking: b, status, onView }: Props) {
  const days = <Line icon="days">{plural(b.dates.length, 'Day')}</Line>;
  const credits = b.credits !== undefined && (
    <Line icon="coin" credits>
      {plural(b.credits, 'Credit')}
    </Line>
  );
  const desks = b.desks !== undefined && <Line icon="desks">{plural(b.desks, 'Desk')}</Line>;

  // Under "Booked by": what this kind of booking is counted in.
  const second = b.kind === 'office-desk' ? days : b.kind === 'team-desks' || b.kind === 'private-office' ? desks : credits;
  // The unlabelled column beside it.
  const extra =
    b.kind === 'private-office' ? (
      <>
        {days}
        {credits}
      </>
    ) : b.kind === 'shared-desk' && b.dates.length > 1 ? (
      days
    ) : null;

  return (
    <div className={[mb.row, styles.row, status === 'cancelled' ? mb.rowCancelled : ''].join(' ').trim()}>
      <div className={styles.rowMain}>
        <div className={mb.info}>
          <p className={mb.title} title={b.title}>
            {b.title}
          </p>
          <p className={mb.location} title={b.location}>
            {b.location}
          </p>
          <span className={mb.tags}>
            <span className={[mb.badge, mb.badgeTag].join(' ')}>{b.reference}</span>
            <span className={[mb.badge, mb.badgeTag].join(' ')}>{b.tag}</span>
          </span>
        </div>

        <div className={[styles.col, styles.colWhen].join(' ')}>
          <span className={mb.colLabel}>Booked for</span>
          <Line icon="calendar">{bookingDates(b.dates)}</Line>
          <Line icon="clock">{bookingHours(b)}</Line>
        </div>

        <div className={[styles.col, styles.colSide].join(' ')}>
          <span className={mb.colLabel}>Booked by</span>
          <Line icon="user">
            <span className={styles.name} title={b.createdBy.name}>
              {b.createdBy.name}
            </span>
          </Line>
          {second}
        </div>

        {extra && (
          <div className={[styles.col, styles.colSide].join(' ')}>
            <span className={[mb.colLabel, mb.colLabelBlank].join(' ')} aria-hidden="true">
              Booked by
            </span>
            {extra}
          </div>
        )}
      </div>

      <div className={styles.rowEnd}>
        <span className={[mb.badge, mb[`status_${status}`]].join(' ')}>{STATUS_TEXT[status]}</span>
        <button type="button" className={mb.view} aria-label={`View ${b.title} booking by ${b.createdBy.name}`} onClick={onView}>
          <img src="/bookings/eye.svg" alt="" width={20} height={20} />
        </button>
      </div>
    </div>
  );
}
