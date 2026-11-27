import { useEffect, useMemo, useRef, useState, type HTMLInputTypeAttribute, type ReactNode } from 'react';
import type { AdminUser } from '../../../api/types';
import { avatarSrc } from './userShared';
import styles from './UserFormFields.module.css';

export type Choice = string | { value: string; label: string };

interface TextFieldProps {
  label: string;
  value: string;
  onChange?: (value: string) => void;
  onBlur?: () => void;
  /** Shown, not editable (from the HR record): greyed out. */
  locked?: boolean;
  /** Why a locked field can't be changed, on hover. */
  lockedTitle?: string;
  /** Not editable, but drawn like any other field (an ID). */
  readOnly?: boolean;
  /** The key card's 12px grey caps label. */
  small?: boolean;
  type?: HTMLInputTypeAttribute;
  placeholder?: string;
  autoComplete?: string;
  required?: boolean;
  /** Red border; pair it with `help` to say why. */
  invalid?: boolean;
  /** A line under the input (Figma "Help Text"). */
  help?: ReactNode;
  helpTone?: 'error' | 'success' | 'neutral';
}

/** "Field" from the design system: label above a 40px input. */
export function TextField({
  label,
  value,
  onChange,
  onBlur,
  locked,
  lockedTitle = 'Comes from the HR record',
  readOnly,
  small,
  type = 'text',
  placeholder,
  autoComplete,
  required,
  invalid,
  help,
  helpTone = 'neutral',
}: TextFieldProps) {
  return (
    <label className={styles.field}>
      <span className={small ? styles.labelSmall : styles.label}>{label}</span>
      <input
        className={[styles.input, locked ? styles.inputLocked : '', invalid ? styles.inputInvalid : ''].join(' ').trim()}
        type={type}
        value={value}
        placeholder={placeholder}
        autoComplete={autoComplete}
        readOnly={locked || readOnly}
        aria-readonly={locked || readOnly || undefined}
        aria-required={required || undefined}
        aria-invalid={invalid || undefined}
        title={locked ? lockedTitle : undefined}
        onChange={(e) => onChange?.(e.target.value)}
        onBlur={onBlur}
      />
      {help && (
        <span className={[styles.help, styles[`help_${helpTone}`]].join(' ')} role={helpTone === 'error' ? 'alert' : 'status'}>
          {help}
        </span>
      )}
    </label>
  );
}

/** A native select dressed as the design's input with a chevron. */
export function SelectField({
  label,
  value,
  choices,
  onChange,
  required,
  wide,
  placeholder = 'Select',
}: {
  label: string;
  value: string;
  choices: Choice[];
  onChange: (value: string) => void;
  /** Required selects only offer "Select" until something is picked. */
  required?: boolean;
  wide?: boolean;
  /** The empty choice ("All" in filters). */
  placeholder?: string;
}) {
  const list = choices.map((c) => (typeof c === 'string' ? { value: c, label: c } : c));
  // Keep a value that isn't in the list (set elsewhere) selectable.
  if (value && !list.some((c) => c.value === value)) list.unshift({ value, label: value });
  return (
    <label className={[styles.field, wide ? styles.fieldWide : ''].join(' ').trim()}>
      <span className={styles.label}>{label}</span>
      <span className={styles.selectWrap}>
        <select className={styles.input} value={value} aria-required={required || undefined} onChange={(e) => onChange(e.target.value)}>
          {(!required || !value) && (
            <option value="" disabled={required}>
              {placeholder}
            </option>
          )}
          {list.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
        <img className={styles.chevron} src="/admin/user/chevron-down.svg" alt="" width={20} height={20} />
      </span>
    </label>
  );
}


/**
 * Picks a person (a team's manager): the field shows their photo and name, and opens a searchable
 * list of the directory. Escape closes the list without closing the panel or dialog around it.
 */
export function UserSelectField({
  label,
  value,
  users,
  onChange,
  wide,
}: {
  label: string;
  /** The chosen user's id, or "" for nobody. */
  value: string;
  users: AdminUser[];
  onChange: (userId: string) => void;
  wide?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const chosen = users.find((u) => u.id === value);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const active = users.filter((u) => u.status === 'active' || u.id === value);
    return q ? active.filter((u) => `${u.name} ${u.email}`.toLowerCase().includes(q)) : active;
  }, [users, query, value]);

  function pick(id: string) {
    onChange(id);
    setOpen(false);
    setQuery('');
  }

  return (
    <div className={[styles.field, wide ? styles.fieldWide : '', styles.userSelect].join(' ').trim()} ref={ref}>
      <span className={styles.label}>{label}</span>
      <button
        type="button"
        className={[styles.input, styles.userButton].join(' ')}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${label}: ${chosen?.name ?? 'none'}`}
        onClick={() => setOpen((o) => !o)}
      >
        {chosen ? (
          <>
            <img className={styles.userAvatar} src={avatarSrc(chosen)} alt="" width={20} height={20} />
            <span className={styles.userName}>{chosen.name}</span>
          </>
        ) : (
          <span className={styles.userName}>Select</span>
        )}
        <img src="/admin/user/chevron-down.svg" alt="" width={20} height={20} />
      </button>
      {open && (
        <div className={styles.userMenu} role="listbox" aria-label={label}>
          <input className={styles.userSearch} value={query} autoFocus placeholder="Search people" onChange={(e) => setQuery(e.target.value)} />
          <div className={styles.userOptions}>
            {value && (
              <button type="button" role="option" aria-selected={false} className={[styles.userOption, styles.userNone].join(' ')} onClick={() => pick('')}>
                No manager
              </button>
            )}
            {shown.length === 0 && <p className={styles.userEmpty}>No one matches “{query.trim()}”.</p>}
            {shown.map((u) => (
              <button key={u.id} type="button" role="option" aria-selected={u.id === value} className={styles.userOption} onClick={() => pick(u.id)}>
                <img className={styles.userOptionAvatar} src={avatarSrc(u)} alt="" width={28} height={28} />
                <span className={styles.userOptionText}>
                  <span className={styles.userOptionName}>{u.name}</span>
                  <span className={styles.userOptionEmail}>{u.email}</span>
                </span>
                {u.id === value && <img src="/admin/user/check.svg" alt="" width={20} height={20} />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
