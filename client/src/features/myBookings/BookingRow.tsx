import type { ReactNode } from 'react';
import styles from './MyBookingsPage.module.css';
import type { BookingPerson, MyBooking } from '../../api/types';
import { PEOPLE_LABEL, avatarUrl, canInvite, formatDates, formatHours, initials, plural, statusLabel, type BookingStatus } from './myBookingsShared';

const asset = (file: string) => `/home/${file}`;

/** A 20px icon and a value: "16 September, 2026", "6 Credits", "Ved Acharya"… */
function Line({ icon, children, tone }: { icon: string; children: ReactNode; tone?: 'credits' | 'creditsSoft' }) {
  return (
    <span className={[styles.line, tone ? styles[`line_${tone}`] : ''].join(' ').trim()}>
      <img src={`/bookings/${icon}.svg`} alt="" width={20} height={20} />
      {children}
    </span>
  );
}

/** Overlapping 40px photos (or initials), at most three, then how many more. */
export function PeopleStack({ people, max = 3, children }: { people: BookingPerson[]; max?: number; children?: ReactNode }) {
  const shown = people.slice(0, max);
  const rest = people.length - shown.length;
  return (
    <span className={styles.stack}>
      {shown.map((p) => {
        const src = avatarUrl(p);
        return (
          <span key={p.id} className={styles.face} title={p.guest ? `${p.name} (guest)` : p.name} style={src ? undefined : { background: p.guest ? '#9aa4b2' : p.avatarColor ?? '#697586' }}>
            {src ? <img src={src} alt="" /> : initials(p.name)}
          </span>
        );
      })}
      {rest > 0 && (
        <span className={[styles.face, styles.faceMore].join(' ')} title={people.slice(max).map((p) => p.name).join(', ')}>
          {rest}+
        </span>
      )}
      {children}
    </span>
  );
}

interface Props {
  booking: MyBooking;
  status: BookingStatus;
  onInvite: () => void;
  onView: () => void;
}

/**
 * One booking (Figma 1445:45965 and its siblings): photo, name and tags, when it's booked for, then
 * credits, who booked it and the people on it as the product line has them, and the status. A
 * meeting room or private office you booked that hasn't started can invite a guest from here.
 */
export function BookingRow({ booking: b, status, onInvite, onView }: Props) {
  const peopleLabel = PEOPLE_LABEL[b.kind];
  const multiDay = b.dates.length > 1;
  const days = <Line icon="coupon">{plural(b.dates.length, 'Day')}</Line>;
  const credits = b.credits !== undefined && <Line icon="coin" tone={b.kind === 'private-office' ? 'creditsSoft' : 'credits'}>{plural(b.credits, 'Credit')}</Line>;
  const bookedBy = <Line icon="user">{b.createdBy.name}</Line>;
  const dateLine = <Line icon="calendar">{formatDates(b.dates)}</Line>;
  const hoursLine = <Line icon="clock">{formatHours(b)}</Line>;
  const invitable = canInvite(b, status);

  return (
    <div className={[styles.row, styles[`row_${b.kind}`], status === 'cancelled' ? styles.rowCancelled : ''].join(' ').trim()}>
      <div className={styles.rowMain}>
        <div className={styles.thumb}>
          {b.photo ? <img src={asset(b.photo)} alt="" /> : <span className={styles.thumbArt} aria-hidden="true" />}
          <span className={[styles.badge, styles.badgeSpace].join(' ')}>{b.space === 'office' ? 'OFFICE' : 'WEWORK'}</span>
        </div>

        <div className={styles.info}>
          <p className={styles.title} title={b.title}>
            {b.title}
          </p>
          <p className={styles.location} title={b.location}>
            {b.location}
          </p>
          <span className={styles.tags}>
            <span className={[styles.badge, styles.badgeTag].join(' ')}>{b.reference}</span>
            <span className={[styles.badge, styles.badgeTag].join(' ')}>{b.tag}</span>
          </span>
        </div>

        <div className={[styles.col, styles.colWhen].join(' ')}>
          <span className={styles.colLabel}>Booked for</span>
          {/* Private offices lead with the hours, as in the design. */}
          {b.kind === 'private-office' ? (
            <>
              {hoursLine}
              {dateLine}
            </>
          ) : (
            <>
              {dateLine}
              {hoursLine}
            </>
          )}
        </div>

        {(b.kind === 'meeting-room' || b.kind === 'shared-desk') && (
          <div className={[styles.col, styles.colSide].join(' ')}>
            <span className={[styles.colLabel, styles.colLabelBlank].join(' ')} aria-hidden="true">
              at
            </span>
            {credits}
            {b.kind === 'shared-desk' && multiDay && days}
          </div>
        )}

        {(b.kind === 'office-desk' || b.kind === 'team-desks' || b.kind === 'private-office') && (
          <div className={[styles.col, styles.colSide].join(' ')}>
            <span className={styles.colLabel}>Booked by</span>
            {bookedBy}
            {b.kind === 'office-desk' && days}
            {b.kind === 'private-office' && credits}
          </div>
        )}

        {peopleLabel && (
          <div className={styles.people}>
            <span className={styles.colLabel}>{peopleLabel}</span>
            <PeopleStack people={b.people}>
              {invitable && b.kind === 'meeting-room' && (
                <button type="button" className={styles.guestBtn} onClick={onInvite}>
                  <img src="/bookings/add-white.svg" alt="" width={18} height={18} />
                  Guest
                </button>
              )}
              {invitable && b.kind === 'private-office' && (
                <button type="button" className={[styles.face, styles.faceAdd].join(' ')} aria-label={`Invite a guest to ${b.title}`} onClick={onInvite}>
                  <img src="/bookings/add-white.svg" alt="" width={18} height={18} />
                </button>
              )}
            </PeopleStack>
          </div>
        )}
      </div>

      <div className={styles.rowEnd}>
        <span className={[styles.badge, styles[`status_${status}`]].join(' ')}>{statusLabel(b, status)}</span>
        <button type="button" className={styles.view} aria-label={`View ${b.title} booking`} onClick={onView}>
          <img src="/bookings/eye.svg" alt="" width={20} height={20} />
        </button>
      </div>
    </div>
  );
}
