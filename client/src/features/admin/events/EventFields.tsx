import { useId, useRef, type ReactNode } from 'react';
import styles from './EventFields.module.css';
import { clock, longDate, parseTime, timeValue } from './eventShared';

/** A text input (Figma "Field": the label trimmed to its letters, 12px above a 40px input). */
export function TextInput({
  label,
  value,
  placeholder,
  maxLength,
  onChange,
}: {
  label: ReactNode;
  value: string;
  placeholder?: string;
  maxLength?: number;
  onChange: (value: string) => void;
}) {
  return (
    <label className={styles.field}>
      <span className={styles.label}>{label}</span>
      <input className={styles.input} value={value} placeholder={placeholder} maxLength={maxLength} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

/** A 200px description box with its character limit in the bottom corner. */
export function TextArea({
  label,
  value,
  placeholder,
  maxLength,
  onChange,
}: {
  label: ReactNode;
  value: string;
  placeholder?: string;
  maxLength: number;
  onChange: (value: string) => void;
}) {
  return (
    <label className={[styles.field, styles.fieldArea].join(' ')}>
      <span className={styles.label}>{label}</span>
      <span className={styles.areaBox}>
        <textarea className={styles.area} value={value} placeholder={placeholder} maxLength={maxLength} onChange={(e) => onChange(e.target.value)} />
        <span className={styles.areaCount} aria-live="polite">
          {value.length > maxLength * 0.9 ? `${value.length} / ${maxLength} characters` : `(Max ${maxLength} Characters)`}
        </span>
      </span>
    </label>
  );
}

/**
 * A native select dressed as the design's: `card` is the "Service-card" look (a soft shadow, the
 * label 4px above, an optional leading icon), otherwise the plain 40px field.
 */
export function SelectBox({
  label,
  value,
  choices,
  icon,
  card,
  loose,
  placeholder,
  onChange,
}: {
  label: ReactNode;
  value: string;
  choices: { value: string; label: string }[];
  icon?: string;
  card?: boolean;
  /** The label 12px above, as in the filters. */
  loose?: boolean;
  /** An empty first choice ("All"). */
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className={[styles.field, card ? styles.fieldCard : '', loose ? styles.fieldLoose : ''].join(' ').trim()}>
      <span className={card ? styles.cardLabel : styles.label}>{label}</span>
      <span className={[card ? styles.card : styles.input, styles.selectBox].join(' ')}>
        {icon && <img src={icon} alt="" width={20} height={20} />}
        <select className={styles.select} value={value} onChange={(e) => onChange(e.target.value)}>
          {placeholder !== undefined && <option value="">{placeholder}</option>}
          {choices.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
        <img className={styles.chevron} src="/admin/events/chevron-down.svg" alt="" width={20} height={20} />
      </span>
    </label>
  );
}

/**
 * A date or time in the "Service-card" look: the value ("16th Sep, 2026", "6:00 PM") or "Select",
 * and the calendar or clock. The browser's own picker opens over it.
 */
export function PickerField({
  label,
  type,
  value,
  min,
  max,
  icon,
  loose,
  small,
  invalid,
  help,
  onChange,
}: {
  label: ReactNode;
  type: 'date' | 'time';
  /** YYYY-MM-DD, or minutes after midnight; empty when unset. */
  value: string | number | null;
  min?: string;
  max?: string;
  icon?: string;
  /** The label 12px above, as in the filters. */
  loose?: boolean;
  /** A 12px caps label 6px above, as in a space's restricted dates. */
  small?: boolean;
  invalid?: boolean;
  help?: string;
  onChange: (value: string | number | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const helpId = useId();
  const empty = value === null || value === '';
  const shown = empty ? 'Select' : type === 'date' ? longDate(String(value)) : clock(Number(value), true);
  const raw = empty ? '' : type === 'date' ? String(value) : timeValue(Number(value));

  return (
    <label className={[styles.field, styles.fieldCard, loose ? styles.fieldLoose : '', small ? styles.fieldSmall : ''].join(' ').trim()}>
      <span className={small ? styles.smallLabel : styles.cardLabel}>{label}</span>
      <span className={[styles.card, styles.picker, invalid ? styles.cardInvalid : ''].join(' ').trim()}>
        <span className={empty ? styles.pickerEmpty : styles.pickerValue}>{shown}</span>
        <img src={icon ?? (type === 'date' ? '/admin/events/calendar.svg' : '/admin/events/clock.svg')} alt="" width={20} height={20} />
        <input
          ref={inputRef}
          className={styles.pickerInput}
          type={type}
          value={raw}
          min={min}
          max={max}
          aria-invalid={invalid || undefined}
          aria-describedby={help ? helpId : undefined}
          onClick={() => inputRef.current?.showPicker?.()}
          onChange={(e) => onChange(e.target.value ? (type === 'date' ? e.target.value : parseTime(e.target.value)) : null)}
        />
      </span>
      {help && (
        <span id={helpId} className={styles.help}>
          {help}
        </span>
      )}
    </label>
  );
}

/** A setting with its note and a purple switch, in a bordered row. */
export function ToggleRow({
  title,
  description,
  checked,
  disabled,
  onChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  const id = useId();
  return (
    <div className={styles.toggleRow}>
      <span className={styles.toggleText}>
        <span id={`${id}-title`} className={styles.toggleTitle}>
          {title}
        </span>
        <span id={`${id}-note`} className={styles.toggleNote}>
          {description}
        </span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-note`}
        disabled={disabled}
        className={[styles.switch, checked ? styles.switchOn : ''].join(' ').trim()}
        onClick={() => onChange(!checked)}
      >
        <span className={styles.switchThumb} />
      </button>
    </div>
  );
}
