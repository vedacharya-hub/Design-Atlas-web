import styles from './LicenceCount.module.css';

interface Props {
  /** Licences in use. */
  used: number;
  /** Licences the company holds. */
  total: number;
  /** The membership they're for, as the table tags it: "PO". */
  unit: string;
}

/**
 * Licences in use beside the All Users search (Figma 11487:240936): “40/50 PO” and a 50px bar that
 * fills in the brand blue as they're used up.
 */
export function LicenceCount({ used, total, unit }: Props) {
  const share = total > 0 ? Math.min(1, used / total) : 1;
  return (
    <div
      className={styles.licences}
      role="meter"
      aria-label={`${unit} licences`}
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={Math.min(used, total)}
      aria-valuetext={`${used} of ${total} ${unit} licences in use`}
    >
      <span className={styles.count} aria-hidden="true">
        <strong>{used}/</strong>
        {total} {unit}
      </span>
      <span className={styles.track} aria-hidden="true">
        <span className={styles.fill} style={{ width: `${share * 100}%` }} />
      </span>
    </div>
  );
}
