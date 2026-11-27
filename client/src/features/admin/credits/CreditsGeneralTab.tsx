import styles from './CreditsGeneralTab.module.css';
import type { CreditOverview } from '../../../api/types';
import { UsageBar } from './UsageBar';
import { credits, daysLeft, daysLeftText } from './creditShared';

interface Props {
  overview: CreditOverview;
  /** Opens Credit Overage Allocation, to set an overage limit. */
  onSetLimit: () => void;
}

/**
 * Credits → General (Figma 1607:206217): this cycle's totals in five cards, then how much of the
 * allotment is used and how much overage has been booked past it (billed at the end of the cycle).
 */
export function CreditsGeneralTab({ overview: o, onSetLimit }: Props) {
  const totalUsed = o.allotmentUsed + o.overageUsed;
  const available = Math.max(0, o.allotment - o.allotmentUsed);
  const left = daysLeft(o);
  const stats = [
    { label: 'TOTAL ALLOCATED', value: o.allotment, note: 'Credits the company gets every 30 days' },
    { label: 'TOTAL USED CREDITS', value: totalUsed, note: 'This cycle, overage included' },
    { label: 'AVAILABLE CREDITS', value: available, note: 'Left of this cycle’s allotment' },
    { label: 'OVERAGES', value: o.overageUsed, note: 'Booked past the allotment; billed at the end of the cycle' },
    { label: 'AVG MONTHLY USAGE', value: o.avgMonthlyUsage, note: 'Across recent cycles' },
  ];

  return (
    <div className={styles.general}>
      <dl className={styles.stats}>
        {stats.map((s) => (
          <div key={s.label} className={styles.stat} title={s.note}>
            <dt className={styles.statLabel}>{s.label}</dt>
            <dd className={styles.statValue}>{credits(s.value)}</dd>
          </div>
        ))}
      </dl>

      <div className={styles.bars}>
        <section className={styles.usage} aria-labelledby="credit-usage-title">
          <h3 id="credit-usage-title" className={styles.usageTitle}>
            Credit Usage
          </h3>
          <UsageBar
            label="Credit usage"
            total={o.allotment}
            segments={[{ key: 'used', value: o.allotmentUsed, color: '#3659f5', title: `${credits(o.allotmentUsed)} of ${credits(o.allotment)} credits used` }]}
          />
          <div className={styles.foot}>
            <p className={styles.count}>
              <strong>{credits(o.allotmentUsed)}</strong>/{credits(o.allotment)} Used
            </p>
            <p className={styles.meta}>
              Next Allotment : <strong>{daysLeftText(left)}</strong>
            </p>
          </div>
        </section>

        <section className={styles.usage} aria-labelledby="overage-usage-title">
          <h3 id="overage-usage-title" className={styles.usageTitle}>
            Overage Credit Usage
          </h3>
          {o.overage.enabled ? (
            <UsageBar
              label="Overage credit usage"
              total={o.overage.limit}
              segments={[{ key: 'overage', value: o.overageUsed, color: '#d70000', title: `${credits(o.overageUsed)} of ${credits(o.overage.limit)} overage credits used` }]}
            />
          ) : (
            // No limit: nothing to fill against.
            <UsageBar label="Overage credit usage, no limit" total={0} segments={[]} />
          )}
          <div className={styles.foot}>
            <p className={styles.count}>
              <strong>{credits(o.overageUsed)}</strong>
              {o.overage.enabled ? `/${credits(o.overage.limit)} Used` : ' Used · no limit'}
            </p>
            {o.overage.enabled ? (
              <p className={styles.meta}>*Will be billed in your upcoming cycle</p>
            ) : (
              <button type="button" className={styles.link} onClick={onSetLimit}>
                Set an overage limit
              </button>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
