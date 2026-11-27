import { useEffect, useRef, useState, type FormEvent } from 'react';
import shell from '../users/AddOrgUnitDialog.module.css';
import { adminApi } from '../../../api/adminApi';
import type { SpaceBookingKind, SpaceType } from '../../../api/types';
import { TextField } from '../users/UserFormFields';
import { RadioGroup } from '../users/UsersFilterPanel';
import { useToast } from '../Toaster';
import { BOOKING_KIND_LABEL } from './spaceShared';

/** Save shows its spinner at least this long, so a fast save doesn't flicker past it. */
const MIN_SAVING_MS = 600;

const KINDS = (Object.keys(BOOKING_KIND_LABEL) as SpaceBookingKind[]).map((k) => ({ value: k, label: BOOKING_KIND_LABEL[k] }));

interface Props {
  /** Edit this type; without it, add a new one. */
  type?: SpaceType;
  onClose: () => void;
  onSaved: (type: SpaceType) => void;
}

/** Add Type, or edit one, in the Add New Team dialog: the name and whether it's booked for a full day or a time duration. */
export function SpaceTypeDialog({ type, onClose, onSaved }: Props) {
  const toast = useToast();
  const [name, setName] = useState(type?.name ?? '');
  const [booking, setBooking] = useState<SpaceBookingKind>(type?.booking ?? 'full-day');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) onCloseRef.current();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    setError('');
    try {
      const [saved] = await Promise.all([
        type ? adminApi.updateSpaceType(type.id, { name: trimmed, booking }) : adminApi.createSpaceType({ name: trimmed, booking }),
        new Promise((r) => setTimeout(r, MIN_SAVING_MS)),
      ]);
      onSaved(saved);
      toast(
        type
          ? { title: `${saved.name} was updated!`, description: <>Saved your changes to <strong>{saved.name}</strong></> }
          : { title: `${saved.name} was added!`, description: <>Booked {BOOKING_KIND_LABEL[saved.booking].toLowerCase()}</> },
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong. Please try again.';
      setError(message);
      setSaving(false);
      toast({ tone: 'error', title: type ? `Couldn’t save ${type.name}` : `Couldn’t add ${trimmed}`, description: message });
    }
  }

  return (
    <div className={shell.backdrop}>
      <div className={shell.dialog} role="dialog" aria-modal="true" aria-labelledby="space-type-title">
        <header className={shell.head}>
          <div className={shell.headText}>
            <h2 id="space-type-title" className={shell.title}>
              {type ? 'Edit Space Type' : 'Add Space Type'}
            </h2>
            <p className={shell.subtitle}>{type ? 'Rename it or change how it’s booked' : 'A kind of space members can book'}</p>
          </div>
          <button type="button" className={shell.close} aria-label="Close" onClick={onClose}>
            <img src="/admin/user/close.svg" alt="" width={24} height={24} />
          </button>
        </header>

        <form id="space-type" className={shell.body} onSubmit={(e) => void submit(e)} noValidate>
          <TextField label="Space" value={name} placeholder="e.g. Desk & Chair" onChange={setName} />
          <RadioGroup label="Type" name="space-type-booking" value={booking} choices={KINDS} onChange={(v) => setBooking(v as SpaceBookingKind)} />
          {error && (
            <p className={shell.error} role="alert">
              {error}
            </p>
          )}
        </form>

        <footer className={shell.foot}>
          <button type="button" className={shell.secondary} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="space-type" className={shell.primary} disabled={!name.trim() || saving} aria-busy={saving}>
            {saving ? 'Saving…' : 'Save'}
            {saving ? <span className={shell.spinner} aria-hidden="true" /> : <img src="/admin/user/check-white.svg" alt="" width={20} height={20} />}
          </button>
        </footer>
      </div>
    </div>
  );
}
