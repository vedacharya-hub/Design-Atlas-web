import styles from './SubscriptionTab.module.css';
import { Button } from '../../../components/ui/Button';
import type { Subscription } from '../../../api/types';
import { formatFull, fromISODate } from '../../../utils/date';

interface Props {
  subscription: Subscription;
}

export function SubscriptionTab({ subscription }: Props) {
  return (
    <div className={styles.card}>
      <div className={styles.head}>
        <div>
          <h3 className={styles.planName}>{subscription.planName}</h3>
          <span className={[styles.status, subscription.status === 'active' ? styles.active : styles.expired].join(' ')}>
            {subscription.status === 'active' ? 'Active' : 'Expired'}
          </span>
        </div>
        <Button variant="secondary">Manage subscription</Button>
      </div>

      <div className={styles.rows}>
        <div className={styles.row}>
          <span className={styles.rowLabel}>Billing cycle</span>
          <span className={styles.rowValue}>{subscription.billingCycle}</span>
        </div>
        <div className={styles.row}>
          <span className={styles.rowLabel}>Price</span>
          <span className={styles.rowValue}>{subscription.price}</span>
        </div>
        <div className={styles.row}>
          <span className={styles.rowLabel}>Renews on</span>
          <span className={styles.rowValue}>{formatFull(fromISODate(subscription.renewsOn))}</span>
        </div>
      </div>
    </div>
  );
}
