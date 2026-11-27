import { useEffect, useState } from 'react';
import styles from './Stepper.module.css';

interface Props {
  value: number;
  min: number;
  max: number;
  step: number;
  /** Names the number for screen readers, e.g. "DevOps overage limit". */
  label: string;
  onChange: (value: number) => void;
  /** Enter in the field, with the number as it settled: usually saves. */
  onEnter?: (value: number) => void;
  /** Escape in the field: usually cancels. */
  onEscape?: () => void;
  autoFocus?: boolean;
}

/**
 * The design system's Stepper, small (Figma 8523:186448): − the number + in a 32px pill. The number
 * can be typed too; it settles within min and max when the field is left.
 */
export function Stepper({ value, min, max, step, label, onChange, onEnter, onEscape, autoFocus }: Props) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);

  const clamp = (n: number) => Math.min(max, Math.max(min, n));
  const settle = () => {
    const n = Number.parseInt(text, 10);
    const next = Number.isFinite(n) ? clamp(n) : value;
    setText(String(next));
    if (next !== value) onChange(next);
    return next;
  };

  return (
    <div className={styles.stepper} role="group" aria-label={label}>
      <button type="button" className={styles.step} aria-label="Decrease" disabled={value <= min} onClick={() => onChange(clamp(value - step))}>
        <img src="/admin/credits/minus.svg" alt="" width={16} height={16} />
      </button>
      <input
        className={styles.value}
        value={text}
        inputMode="numeric"
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        // eslint-disable-next-line jsx-a11y/no-autofocus
        autoFocus={autoFocus}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, '');
          setText(digits);
          const n = Number.parseInt(digits, 10);
          if (Number.isFinite(n) && n >= min && n <= max) onChange(n);
        }}
        onBlur={settle}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            onChange(clamp(value + (e.key === 'ArrowUp' ? step : -step)));
          } else if (e.key === 'Enter') {
            e.preventDefault();
            onEnter?.(settle());
          } else if (e.key === 'Escape' && onEscape) {
            e.preventDefault();
            onEscape();
          }
        }}
      />
      <button type="button" className={styles.step} aria-label="Increase" disabled={value >= max} onClick={() => onChange(clamp(value + step))}>
        <img src="/admin/credits/plus.svg" alt="" width={16} height={16} />
      </button>
    </div>
  );
}
