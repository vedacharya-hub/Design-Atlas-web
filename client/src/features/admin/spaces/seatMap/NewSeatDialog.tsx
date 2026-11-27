import { useEffect, useRef, useState, type FormEvent } from 'react';
import shell from '../../users/AddOrgUnitDialog.module.css';
import styles from './SeatDialog.module.css';
import { SelectField, TextField } from '../../users/UserFormFields';
import { nextSeatLabel, seatPrefix, type MapSeat } from './seatShared';

/** Saving an edit spins at least this long. */
const MIN_SAVING_MS = 400;

interface Props {
  /** The desk being edited; without it, a new one. */
  seat?: MapSeat;
  /** The floor's desks, to number this one within its type. */
  seats: MapSeat[];
  zone: string;
  /** "WeWork Vaishnavi Signature • 2nd Floor" */
  place: string;
  types: string[];
  defaultType: string;
  onClose: () => void;
  /** Resolves once saved; a rejection shows its message and keeps the dialog open. */
  onSave: (details: { spaceType: string; notes: string; label: string }) => void | Promise<void>;
}

/**
 * New Space (Figma 3039:111570), and the same form from a free desk's edit icon: the type picks the
 * letters and the number follows on (D61, M1, FB1, C1), shown on the orb as it changes; then a note.
 * A new desk joins the map's edits; an edited one saves straight away.
 */
export function NewSeatDialog({ seat, seats, zone, place, types, defaultType, onClose, onSave }: Props) {
  const editing = !!seat;
  const [spaceType, setSpaceType] = useState(seat?.spaceType ?? defaultType);
  const [notes, setNotes] = useState(seat?.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const savingRef = useRef(saving);
  savingRef.current = saving;
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      e.preventDefault();
      if (!savingRef.current) onCloseRef.current();
    };
    document.addEventListener('keydown', onKey, true);
    formRef.current?.querySelector<HTMLElement>('select')?.focus();
    return () => document.removeEventListener('keydown', onKey, true);
  }, []);

  // The same letters keep the desk's number; new letters take the next one of that type.
  const label =
    seat && seatPrefix(spaceType) === seatPrefix(seat.spaceType)
      ? seat.label
      : nextSeatLabel(
          seats.filter((s) => s.id !== seat?.id),
          spaceType,
        );
  const unchanged = editing && spaceType === seat.spaceType && notes.trim() === seat.notes;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!spaceType || saving) return;
    if (unchanged) return onClose();
    setSaving(true);
    setError('');
    try {
      await Promise.all([onSave({ spaceType, notes: notes.trim(), label }), editing ? new Promise((r) => setTimeout(r, MIN_SAVING_MS)) : null]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      setSaving(false);
    }
  }

  return (
    <div className={shell.backdrop}>
      <div className={shell.dialog} role="dialog" aria-modal="true" aria-labelledby="seat-details-title" aria-describedby="seat-details-place">
        <header className={shell.head}>
          <div className={shell.headText}>
            <h2 id="seat-details-title" className={[shell.title, styles.title].join(' ')}>
              {editing ? 'Edit Space' : 'New Space'}
            </h2>
            <p id="seat-details-place" className={[shell.subtitle, styles.subtitle].join(' ')}>
              {place} • {zone}
            </p>
          </div>
          <button type="button" className={shell.close} aria-label="Close" disabled={saving} onClick={onClose}>
            <img src="/admin/user/close.svg" alt="" width={24} height={24} />
          </button>
        </header>

        <form ref={formRef} id="seat-details-form" className={[shell.body, styles.body].join(' ')} onSubmit={(e) => void submit(e)} noValidate>
          <div className={[styles.banner, styles.bannerNew].join(' ')}>
            <img className={styles.orb} src="/admin/spaces/map/orb.png" alt="" width={32} height={32} />
            <span className={styles.newLabel} aria-live="polite">
              {label}
            </span>
          </div>
          <SelectField required label="Space Type" value={spaceType} choices={types} onChange={setSpaceType} />
          {editing && label !== seat.label && (
            <p className={styles.renumber}>
              {seat.label} becomes {label}: each type has its own numbers.
            </p>
          )}
          <TextField label="Notes" value={notes} placeholder="Add notes" onChange={(v) => setNotes(v.slice(0, 200))} />
          {error && (
            <p className={shell.error} role="alert">
              {error}
            </p>
          )}
        </form>

        <footer className={shell.foot}>
          <button type="button" className={shell.secondary} disabled={saving} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="seat-details-form" className={shell.primary} disabled={!spaceType || saving} aria-busy={saving}>
            {saving ? 'Saving…' : 'Save'}
            {saving ? <span className={shell.spinner} aria-hidden="true" /> : <img src="/admin/user/check-white.svg" alt="" width={20} height={20} />}
          </button>
        </footer>
      </div>
    </div>
  );
}
