import { useEffect, useRef, type ReactNode } from 'react';
import styles from './AdminModal.module.css';

interface Props {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Buttons along the bottom. */
  footer: ReactNode;
  width?: number;
}

/** Centred dialog for admin actions (add, view, confirm). Escape or the backdrop closes it. */
export function AdminModal({ title, onClose, children, footer, width = 520 }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    // Start on the first field, or on the dialog itself.
    const first = dialogRef.current?.querySelector<HTMLElement>('input, textarea, select');
    (first ?? dialogRef.current)?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className={styles.backdrop} onMouseDown={onClose}>
      <div
        ref={dialogRef}
        className={styles.dialog}
        style={{ width: `min(${width}px, 100%)` }}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className={styles.head}>
          <h2 className={styles.title}>{title}</h2>
          <button type="button" className={styles.close} aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className={styles.body}>{children}</div>
        <div className={styles.footer}>{footer}</div>
      </div>
    </div>
  );
}
