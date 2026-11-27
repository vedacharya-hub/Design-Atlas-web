import { useEffect, useRef } from 'react';
import styles from './TickBox.module.css';

interface Props {
  checked: boolean;
  /** Some, not all, of what it stands for is ticked: a dash. */
  mixed?: boolean;
  label: string;
  disabled?: boolean;
  onChange: () => void;
}

/**
 * The design's Checkbox, Large (Figma 9156:205634): a 20px target with a 16px box, a 24% black
 * outline at 4px corners, filling black with a white tick when it's on. A real checkbox sits over it
 * for the keyboard and screen readers. Clicks on it don't reach the row underneath.
 */
export function TickBox({ checked, mixed = false, label, disabled, onChange }: Props) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = mixed;
  }, [mixed]);
  return (
    <span className={styles.tick}>
      <input
        ref={ref}
        type="checkbox"
        className={styles.input}
        checked={checked}
        disabled={disabled}
        aria-label={label}
        onClick={(e) => e.stopPropagation()}
        onChange={onChange}
      />
      <span className={styles.visual} aria-hidden="true">
        {checked && !mixed ? (
          <img src="/admin/user/checkbox-checked.svg" alt="" width={20} height={20} />
        ) : (
          <span className={[styles.box, mixed ? styles.mixed : ''].join(' ').trim()} />
        )}
      </span>
    </span>
  );
}
