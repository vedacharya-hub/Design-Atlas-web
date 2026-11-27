import styles from './UsageBar.module.css';

export interface UsageSegment {
  key: string;
  value: number;
  color: string;
  /** Shown on hover, e.g. "Engineering: 100 credits". */
  title?: string;
}

interface Props {
  segments: UsageSegment[];
  /** What the segments are a share of. */
  total: number;
  /** Names the bar for screen readers. */
  label: string;
  /** Narrower segments leave their percentage out. */
  minLabelPercent?: number;
}

/**
 * A 30px usage bar (Figma 1607:206217, 5414:242598): a filled segment per share with its percentage
 * inside, a tick where they end, and hatching for what's left.
 */
export function UsageBar({ segments, total, label, minLabelPercent = 7 }: Props) {
  const shares = segments
    .filter((s) => s.value > 0)
    .map((s) => ({ ...s, percent: total > 0 ? Math.min(100, (s.value / total) * 100) : 0 }));
  // Rounded, so shares that add up to 99.99% still fill the bar.
  const filled = Math.min(100, Math.round(shares.reduce((n, s) => n + s.percent, 0) * 100) / 100);
  return (
    <div className={styles.bar} role="img" aria-label={`${label}: ${Math.round(filled)}%`}>
      {shares.map((s) => (
        <span key={s.key} className={styles.segment} style={{ flexBasis: `${s.percent}%`, background: s.color }} title={s.title}>
          {s.percent >= minLabelPercent && <span className={styles.percent}>{Math.round(s.percent)}%</span>}
        </span>
      ))}
      {filled < 99.5 && (
        <>
          {filled > 0 && <img className={styles.tick} src="/admin/credits/tick.svg" alt="" width={2} height={22} />}
          <span className={styles.rest} />
        </>
      )}
    </div>
  );
}
