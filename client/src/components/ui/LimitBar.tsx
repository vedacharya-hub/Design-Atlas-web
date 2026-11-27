import styles from './LimitBar.module.css';

interface Props {
  label: string;
  used: number;
  limit: number;
  color: string;
  formatValue?: (n: number) => string;
}

const defaultFormat = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 2 });

export function LimitBar({ label, used, limit, color, formatValue = defaultFormat }: Props) {
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const labelInsideFill = pct >= 15;

  return (
    <div className={styles.root}>
      <div className={styles.track}>
        <div className={styles.fill} style={{ width: `${pct}%`, background: color }} />
        <span
          className={[styles.pctLabel, labelInsideFill ? styles.pctLabelInside : styles.pctLabelOutside].join(' ')}
          style={{ left: `${pct}%` }}
        >
          {pct}%
        </span>
      </div>
      <div className={styles.meta}>
        <span className={styles.label}>{label}</span>
        <span className={styles.value}>
          {formatValue(used)} / {formatValue(limit)}
        </span>
      </div>
    </div>
  );
}
