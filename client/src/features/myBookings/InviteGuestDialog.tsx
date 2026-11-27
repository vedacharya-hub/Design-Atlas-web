import { useEffect, useState, type FormEvent } from 'react';
import styles from './InviteGuestDialog.module.css';
import type { MyBooking } from '../../api/types';
import { myBookingsApi } from '../../api/myBookingsApi';
import { TextField } from '../admin/users/UserFormFields';
import { useToast } from '../admin/Toaster';
import { formatDates, formatHours } from './myBookingsShared';

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

interface Props {
  booking: MyBooking;
  onClose: () => void;
  onInvited: (booking: MyBooking, guestName: string) => void;
}

/** Invite a guest to a meeting room or private office that hasn't started: their name and email. */
export function InviteGuestDialog({ booking, onClose, onInvited }: Props) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [touched, setTouched] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const emailBad = touched && !!email.trim() && !EMAIL.test(email.trim());
  const ready = !!name.trim() && EMAIL.test(email.trim());

  async function submit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (!ready || sending) return;
    setSending(true);
    setError('');
    try {
      const next = await myBookingsApi.inviteGuest(booking.id, { name: name.trim(), email: email.trim() });
      onInvited(next, name.trim());
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Please try again.';
      setError(message);
      setSending(false);
      toast({ tone: 'error', title: 'Couldn’t invite the guest', description: message });
    }
  }

  return (
    <div className={styles.backdrop} onMouseDown={onClose}>
      <div className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="invite-guest-title" onMouseDown={(e) => e.stopPropagation()}>
        <header className={styles.head}>
          <div className={styles.headText}>
            <h2 id="invite-guest-title" className={styles.title}>
              Invite a Guest
            </h2>
            <p className={styles.subtitle}>
              {booking.title} • {formatDates(booking.dates)}
            </p>
          </div>
          <button type="button" className={styles.close} aria-label="Close" onClick={onClose}>
            <img src="/admin/user/close.svg" alt="" width={24} height={24} />
          </button>
        </header>

        <form id="invite-guest" className={styles.body} onSubmit={submit} noValidate>
          <p className={styles.note}>
            They’ll get an email with the booking and a visitor pass for {booking.location}, {formatHours(booking)}.
          </p>
          <TextField label="Guest Name" value={name} placeholder="e.g. Ritika Sen" autoComplete="off" onChange={setName} />
          <TextField
            label="Email"
            type="email"
            value={email}
            placeholder="name@company.com"
            autoComplete="off"
            invalid={emailBad}
            help={emailBad ? 'Enter a valid email address.' : undefined}
            helpTone="error"
            onChange={setEmail}
            onBlur={() => setTouched(true)}
          />
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
        </form>

        <footer className={styles.foot}>
          <button type="button" className={styles.secondary} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="invite-guest" className={styles.primary} disabled={!ready || sending}>
            {sending ? 'Inviting…' : 'Send invite'}
            <img src="/admin/user/check-white.svg" alt="" width={20} height={20} />
          </button>
        </footer>
      </div>
    </div>
  );
}
