import { useEffect, useRef, useState, type ReactNode } from 'react';
import styles from './Dropdown.module.css';
import { ChevronDown } from './icons';

export interface DropdownOption {
  value: string;
  label: string;
}

interface Props {
  options: DropdownOption[];
  value: string;
  onChange: (value: string) => void;
  /** Optional leading icon rendered inside the trigger. */
  icon?: ReactNode;
  placeholder?: string;
  /** Pill style is used in the filter bar; plain style inside cards. */
  variant?: 'pill' | 'plain';
}

export function Dropdown({ options, value, onChange, icon, placeholder, variant = 'pill' }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  return (
    <div className={styles.root} ref={ref}>
      <button
        type="button"
        className={[styles.trigger, variant === 'pill' ? styles.pill : styles.plain].join(' ')}
        onClick={() => setOpen((o) => !o)}
      >
        {icon && <span className={styles.icon}>{icon}</span>}
        <span className={styles.label}>{selected?.label ?? placeholder ?? 'Select'}</span>
        <ChevronDown className={styles.caret} />
      </button>
      {open && (
        <ul className={styles.menu} role="listbox">
          {options.map((o) => (
            <li key={o.value}>
              <button
                role="option"
                aria-selected={o.value === value}
                className={[styles.option, o.value === value ? styles.optionActive : ''].join(' ')}
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
              >
                {o.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
