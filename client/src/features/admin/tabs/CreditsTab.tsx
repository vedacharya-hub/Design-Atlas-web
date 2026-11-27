import { useEffect, useState } from 'react';
import styles from './CreditsTab.module.css';
import { LimitBar } from '../../../components/ui/LimitBar';
import { adminApi } from '../../../api/adminApi';
import type { CompanyCredits } from '../../../api/types';

const formatNumber = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 2 });

export function CreditsTab() {
  const [credits, setCredits] = useState<CompanyCredits | null>(null);

  useEffect(() => {
    adminApi.getCredits().then(setCredits);
  }, []);

  if (!credits) return null;

  return (
    <div className={styles.card}>
      <h3 className={styles.cardTitle}>Credits</h3>
      <p className={styles.cardSub}>
        Your credit allotment is used first — once it runs out, usage draws from the overage allotment.
      </p>

      <div className={styles.bars}>
        <LimitBar
          label="Credit Allotment"
          used={credits.creditAllotmentUsed}
          limit={credits.creditAllotment}
          color="var(--limit-primary)"
        />
        <LimitBar
          label="Overage Allotment"
          used={credits.overageUsed}
          limit={credits.overageAllotment}
          color="var(--limit-secondary)"
        />
      </div>

      <div className={styles.statsRow}>
        <div className={styles.stat}>
          <span className={styles.statValue}>{formatNumber(credits.avgMonthlyUsage)}</span>
          <span className={styles.statLabel}>Avg. Monthly Usage</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statValue}>{formatNumber(credits.todayUsage)}</span>
          <span className={styles.statLabel}>Today's Usage</span>
        </div>
      </div>
    </div>
  );
}
