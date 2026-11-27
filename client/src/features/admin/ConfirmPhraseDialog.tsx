import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import styles from './ConfirmPhraseDialog.module.css';

interface Props {
  /** White glyph on the red badge, 24 × 24. */
  icon: string;
  title: ReactNode;
  /** What happens, under the title. */
  note: ReactNode;
  /** A call-out under the note for what else goes with it (bookings cancelled). */
  warning?: ReactNode;
  /** The card for what's being acted on: its name, and a detail on the right. */
  item: { name: string; meta?: string };
  /** Typed (any case) to unlock the action. */
  phrase: string;
  placeholder?: string;
  /** The action button, and what it reads while the action runs. */
  confirmLabel: string;
  busyLabel: string;
  /** The button that backs out ("Cancel"). */
  cancelLabel?: string;
  onCancel: () => void;
  /** Runs the action: true when it went through (the dialog is then closed), false to stay open. */
  onConfirm: () => Promise<boolean>;
}

/**
 * The type-to-confirm dialog behind every destructive admin action (Archive team, Delete shift, Turn
 * off a service): a red badge, what will happen, the item's card, and the action unlocks only once
 * the phrase is typed.
 */
export function ConfirmPhraseDialog({ icon, title, note, warning, item, phrase, placeholder = phrase, confirmLabel, busyLabel, cancelLabel = 'Cancel', onCancel, onConfirm }: Props) {
  const id = useId();
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const cancelRef = useRef(onCancel);
  cancelRef.current = onCancel;
  const busyRef = useRef(false);
  busyRef.current = busy;

  const matches = typed.trim().toLowerCase() === phrase.trim().toLowerCase();

  // Start on the field, hand focus back on close. Escape cancels, claimed before the panel
  // underneath sees it.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      e.preventDefault();
      if (!busyRef.current) cancelRef.current();
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      if (opener?.isConnected) opener.focus();
    };
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!matches || busy) return;
    setBusy(true);
    if (!(await onConfirm())) setBusy(false);
  }

  return (
    <div className={styles.backdrop} onMouseDown={() => !busy && onCancel()}>
      <form
        className={styles.dialog}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        aria-describedby={warning ? `${id}-note ${id}-warning` : `${id}-note`}
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={(e) => void submit(e)}
        noValidate
      >
        <div className={styles.content}>
          <div className={styles.head}>
            <span className={styles.badge}>
              <img src={icon} alt="" width={24} height={24} />
            </span>
            <div className={styles.headText}>
              <h2 id={`${id}-title`} className={styles.title}>
                {title}
              </h2>
              <p id={`${id}-note`} className={styles.note}>
                {note}
              </p>
            </div>
          </div>

          {warning && (
            <p id={`${id}-warning`} className={styles.warning}>
              {warning}
            </p>
          )}

          <div className={styles.item}>
            <span className={styles.itemName}>{item.name}</span>
            {item.meta && <span className={styles.itemMeta}>{item.meta}</span>}
          </div>

          <label className={styles.field}>
            <span className={styles.label}>
              Type “<strong>{phrase}</strong>” to Confirm
            </span>
            <input
              ref={inputRef}
              className={styles.input}
              value={typed}
              placeholder={placeholder}
              autoComplete="off"
              spellCheck={false}
              disabled={busy}
              onChange={(e) => setTyped(e.target.value)}
            />
          </label>
        </div>

        <div className={styles.actions}>
          <button type="button" className={styles.cancel} disabled={busy} onClick={onCancel}>
            {cancelLabel}
          </button>
          <button type="submit" className={styles.confirm} disabled={!matches || busy}>
            {busy ? busyLabel : confirmLabel}
          </button>
        </div>
      </form>
    </div>
  );
}
