import { useEffect, useRef, useState, type FormEvent } from 'react';
// The Add New Team dialog's shell, the form fields; this dialog's rules last.
import shell from '../users/AddOrgUnitDialog.module.css';
import fields from '../users/UserFormFields.module.css';
import styles from './ShiftDialog.module.css';
import { adminApi } from '../../../api/adminApi';
import type { CompanyShift } from '../../../api/types';
import { TextField } from '../users/UserFormFields';
import { useToast } from '../Toaster';
import { shiftClock } from './companyShared';

/** Create / Save spins at least this long, so a fast save doesn't flicker past it. */
const MIN_SAVING_MS = 600;
/** How long the success message stays before the dialog closes itself. */
const SUCCESS_MS = 2000;

interface Props {
  /** The shift to edit; without it, a new one. */
  shift?: CompanyShift;
  onClose: () => void;
  onSaved: (shift: CompanyShift) => void;
}

/**
 * Add New Shift (Figma 3145:640716): the name, then the start and end times side by side. Create
 * spins while it saves, then "Shift created successfully!" (3145:641023) stands in for the form for
 * two seconds. The pencil on a shift opens the same form to edit it.
 */
export function ShiftDialog({ shift, onClose, onSaved }: Props) {
  const toast = useToast();
  const [name, setName] = useState(shift?.name ?? '');
  const [startTime, setStartTime] = useState(shift?.startTime ?? '09:00');
  const [endTime, setEndTime] = useState(shift?.endTime ?? '17:00');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<{ shift: CompanyShift; height: number } | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const editing = !!shift;
  const sameTimes = startTime === endTime;
  const unchanged = editing && name.trim() === shift.name && startTime === shift.startTime && endTime === shift.endTime;

  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const savedRef = useRef(saved);
  savedRef.current = saved;

  useEffect(() => {
    if (!saved) return;
    const timer = setTimeout(() => onSavedRef.current(saved.shift), SUCCESS_MS);
    return () => clearTimeout(timer);
  }, [saved]);

  // Escape closes; during the success message it just closes it sooner.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if (savedRef.current) onSavedRef.current(savedRef.current.shift);
      else onCloseRef.current();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || sameTimes || saving) return;
    if (unchanged) return onClose();
    setSaving(true);
    setError('');
    try {
      const payload = { name: trimmed, startTime, endTime };
      const [next] = await Promise.all([
        shift ? adminApi.updateCompanyShift(shift.id, payload) : adminApi.createCompanyShift(payload),
        new Promise((r) => setTimeout(r, MIN_SAVING_MS)),
      ]);
      setSaved({ shift: next, height: dialogRef.current?.offsetHeight ?? 0 });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong. Please try again.';
      setError(message);
      setSaving(false);
      toast({ tone: 'error', title: `Couldn’t ${editing ? 'save' : 'add'} ${trimmed}`, description: message });
    }
  }

  if (saved) {
    return (
      <div className={shell.backdrop} onMouseDown={() => onSaved(saved.shift)}>
        <div
          className={[shell.dialog, styles.dialog].join(' ')}
          style={{ height: saved.height || undefined }}
          role="dialog"
          aria-modal="true"
          aria-label={editing ? 'Shift saved' : 'Shift created'}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className={shell.success} role="status">
            <span className={shell.successBadge}>
              <img src="/admin/user/success-check.svg" alt="" width={40} height={40} />
            </span>
            <p className={shell.successText}>{editing ? 'Shift updated successfully!' : 'Shift created successfully!'}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={shell.backdrop}>
      <div ref={dialogRef} className={[shell.dialog, styles.dialog].join(' ')} role="dialog" aria-modal="true" aria-labelledby="shift-dialog-title">
        <header className={[shell.head, styles.head].join(' ')}>
          <div className={shell.headText}>
            <h2 id="shift-dialog-title" className={shell.title}>
              {editing ? 'Edit Shift' : 'Add New Shift'}
            </h2>
            <p className={shell.subtitle}>{editing ? 'Change its name or timings' : 'Create shifts for all your spaces'}</p>
          </div>
          <button type="button" className={[shell.close, styles.close].join(' ')} aria-label="Close" onClick={onClose}>
            <img src="/admin/user/close.svg" alt="" width={24} height={24} />
          </button>
        </header>

        <form id="shift-form" className={[shell.body, styles.body].join(' ')} onSubmit={(e) => void submit(e)} noValidate>
          <TextField label="Shift Name" value={name} placeholder="e.g. Morning Shift" onChange={setName} />
          <div className={styles.times}>
            <TimeField label="Start Time" value={startTime} onChange={setStartTime} />
            <TimeField label="End Time" value={endTime} invalid={sameTimes} onChange={setEndTime} />
          </div>
          {sameTimes && <p className={styles.help}>The shift has to end at a different time than it starts.</p>}
          {!sameTimes && endTime < startTime && <p className={styles.hint}>Runs past midnight, ending the next day.</p>}
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
          <button type="submit" form="shift-form" className={shell.primary} disabled={!name.trim() || sameTimes || saving} aria-busy={saving}>
            {saving ? (editing ? 'Saving…' : 'Creating…') : editing ? 'Save' : 'Create'}
            {saving ? <span className={shell.spinner} aria-hidden="true" /> : <img src="/admin/user/check-white.svg" alt="" width={20} height={20} />}
          </button>
        </footer>
      </div>
    </div>
  );
}

/** A time in the form's input look ("9:00 AM" and a clock); the browser's own picker opens over it. */
function TimeField({ label, value, invalid, onChange }: { label: string; value: string; invalid?: boolean; onChange: (value: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <label className={fields.field}>
      <span className={fields.label}>{label}</span>
      <span className={[fields.input, styles.time, invalid ? fields.inputInvalid : ''].join(' ').trim()}>
        <span className={styles.timeValue}>{shiftClock(value, true)}</span>
        <img src="/admin/company/clock.svg" alt="" width={20} height={20} />
        <input
          ref={inputRef}
          className={styles.timeInput}
          type="time"
          value={value}
          required
          aria-invalid={invalid || undefined}
          onClick={() => inputRef.current?.showPicker?.()}
          onChange={(e) => e.target.value && onChange(e.target.value)}
        />
      </span>
    </label>
  );
}
