import styles from './BrandSwitch.module.css';

interface Props {
  checked: boolean;
  /** Some of what it covers is on and some off: a light track, the thumb halfway. Clicking turns it all on. */
  mixed?: boolean;
  /** Can't be changed (and reads as off): a faded track, no pointer. */
  disabled?: boolean;
  /** Without it the switch only shows the setting. */
  onChange?: (checked: boolean) => void;
  /** Names the setting for screen readers. */
  label?: string;
  labelledBy?: string;
  describedBy?: string;
}

/** The design system's "Switch", medium: 37 × 20, #3659f5 when on, #454545 when off. */
export function BrandSwitch({ checked, mixed = false, disabled = false, onChange, label, labelledBy, describedBy }: Props) {
  const on = checked && !mixed && !disabled;
  const className = [styles.switch, on ? styles.on : '', mixed && !disabled ? styles.mixed : '', disabled ? styles.disabled : ''].join(' ').trim();
  const state = disabled ? 'off, restricted' : mixed ? 'some on' : checked ? 'on' : 'off';
  if (!onChange || disabled)
    return (
      <span className={className} role="img" aria-label={label ? `${label}: ${state}` : undefined} aria-hidden={label ? undefined : true}>
        <span className={styles.thumb} />
      </span>
    );
  return (
    <button
      type="button"
      role="switch"
      aria-checked={mixed ? 'mixed' : checked}
      aria-label={label}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      className={[className, styles.button].join(' ')}
      onClick={() => onChange(mixed ? true : !checked)}
    >
      <span className={styles.thumb} />
    </button>
  );
}
