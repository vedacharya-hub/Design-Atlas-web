import { useEffect, useRef, useState } from 'react';
import styles from './BookingDetailsPanel.module.css';
import type { MyBooking } from '../../api/types';
import { PEOPLE_LABEL, avatarUrl, canInvite, formatDates, formatHours, initials, plural, statusLabel, type BookingStatus } from './myBookingsShared';

/** As the side panels slide out; a timer, since a hidden tab never fires animationend. */
const CLOSE_MS = 240;

const KIND_LABEL: Record<MyBooking['kind'], string> = {
  'meeting-room': 'Meeting room',
  'shared-desk': 'Shared desk',
  'office-desk': 'Office desk',
  'team-desks': 'Team desks',
  'private-office': 'Bookable private office',
};

interface Props {
  booking: MyBooking;
  status: BookingStatus;
  /** Invite a guest (My Bookings); without it, there's no invite button. */
  onInvite?: () => void;
  /** Cancel the booking (Admin → Company Bookings, for ones an admin may cancel). */
  onCancelBooking?: () => void;
  onClose: () => void;
}

/**
 * A booking's details from the row's eye button: where and when, credits, who booked it and who's
 * on it. My Bookings can invite a guest from here; Company Bookings can cancel it.
 */
export function BookingDetailsPanel({ booking: b, status, onInvite, onCancelBooking, onClose }: Props) {
  const [closing, setClosing] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const closingRef = useRef(false);

  function close() {
    if (closingRef.current) return;
    closingRef.current = true;
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
  }, []);

  const peopleLabel = PEOPLE_LABEL[b.kind] ?? 'Booked for';
  const invitable = !!onInvite && canInvite(b, status);

  return (
    <>
      <div className={[styles.backdrop, closing ? styles.backdropOut : ''].join(' ').trim()} onMouseDown={close} />
      <div ref={panelRef} className={[styles.panel, closing ? styles.panelOut : ''].join(' ').trim()} role="dialog" aria-modal="true" aria-labelledby="booking-details-title" tabIndex={-1}>
        <header className={styles.head}>
          <div className={styles.headText}>
            <h2 id="booking-details-title" className={styles.headTitle}>
              Booking Details
            </h2>
            <p className={styles.headSub}>
              {KIND_LABEL[b.kind]} • {b.reference}
            </p>
          </div>
          <button type="button" className={styles.close} aria-label="Close booking details" onClick={close}>
            <img src="/admin/user/close.svg" alt="" width={24} height={24} />
          </button>
        </header>

        <div className={styles.body}>
          <div className={[styles.photo, status === 'cancelled' ? styles.photoCancelled : ''].join(' ').trim()}>
            {b.photo ? <img src={`/home/${b.photo}`} alt="" /> : <span className={styles.photoArt} aria-hidden="true" />}
          </div>

          <div className={styles.titleRow}>
            <div>
              <p className={styles.title}>{b.title}</p>
              <p className={styles.location}>{b.location}</p>
            </div>
            <span className={[styles.badge, styles[`status_${status}`]].join(' ')}>{statusLabel(b, status)}</span>
          </div>

          <dl className={styles.facts}>
            <div>
              <dt>Booked for</dt>
              <dd>
                <span className={styles.fact}>
                  <img src="/bookings/calendar.svg" alt="" width={20} height={20} />
                  {formatDates(b.dates)}
                </span>
                <span className={styles.fact}>
                  <img src="/bookings/clock.svg" alt="" width={20} height={20} />
                  {formatHours(b)}
                </span>
                {b.dates.length > 1 && (
                  <span className={styles.fact}>
                    <img src="/bookings/coupon.svg" alt="" width={20} height={20} />
                    {plural(b.dates.length, 'Day')}
                  </span>
                )}
              </dd>
            </div>
            {b.credits !== undefined && (
              <div>
                <dt>Credits</dt>
                <dd>
                  <span className={[styles.fact, styles.credits].join(' ')}>
                    <img src="/bookings/coin.svg" alt="" width={20} height={20} />
                    {plural(b.credits, 'Credit')}
                  </span>
                </dd>
              </div>
            )}
            <div>
              <dt>Booked by</dt>
              <dd>
                <span className={styles.fact}>
                  <img src="/bookings/user.svg" alt="" width={20} height={20} />
                  {b.createdBy.name}
                  {b.createdByMe && <span className={styles.you}>You</span>}
                </span>
              </dd>
            </div>
          </dl>

          <section className={styles.people} aria-labelledby="booking-people">
            <h3 id="booking-people" className={styles.peopleTitle}>
              {peopleLabel}
              <span className={styles.count}>{b.people.length}</span>
            </h3>
            <ul className={styles.peopleList}>
              {b.people.map((p) => {
                const src = avatarUrl(p);
                return (
                  <li key={p.id} className={styles.person}>
                    <span className={styles.face} style={src ? undefined : { background: p.guest ? '#9aa4b2' : p.avatarColor ?? '#697586' }}>
                      {src ? <img src={src} alt="" /> : initials(p.name)}
                    </span>
                    <span className={styles.personText}>
                      <span className={styles.personName}>{p.name}</span>
                      {p.email && <span className={styles.personEmail}>{p.email}</span>}
                    </span>
                    {p.guest ? <span className={styles.tag}>Guest</span> : p.id === b.createdBy.id && <span className={styles.tag}>Booked it</span>}
                  </li>
                );
              })}
            </ul>
          </section>
        </div>

        <footer className={styles.foot}>
          <button type="button" className={styles.secondary} onClick={close}>
            Close
          </button>
          {onCancelBooking && (
            <button type="button" className={styles.danger} onClick={onCancelBooking}>
              Cancel booking
            </button>
          )}
          {invitable && (
            <button type="button" className={styles.primary} onClick={onInvite}>
              <img src="/bookings/add-white.svg" alt="" width={18} height={18} />
              Invite guest
            </button>
          )}
        </footer>
      </div>
    </>
  );
}
