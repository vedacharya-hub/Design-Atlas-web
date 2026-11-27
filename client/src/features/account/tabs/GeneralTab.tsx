import styles from './GeneralTab.module.css';
import { Button } from '../../../components/ui/Button';
import { Coin, Ticket } from '../../../components/ui/icons';
import type { AccountDetails } from '../../../api/types';

interface Props {
  details: AccountDetails;
  onNavigateTab: (tab: string) => void;
}

export function GeneralTab({ details, onNavigateTab }: Props) {
  const { loyalty, passes } = details;

  return (
    <div className={styles.root}>
      <div className={styles.loyaltyBanner}>
        <div>
          {loyalty.isMember ? (
            <>
              <h3 className={styles.bannerTitle}>You're a {loyalty.tier} loyalty member</h3>
              <p className={styles.bannerSub}>Enjoy discounts on day passes, bundles and more.</p>
            </>
          ) : (
            <>
              <h3 className={styles.bannerTitle}>Join the World of WeWork</h3>
              <p className={styles.bannerSub}>Unlock discounts and exclusive perks with our loyalty program.</p>
            </>
          )}
        </div>
        <Button variant={loyalty.isMember ? 'secondary' : 'primary'} onClick={() => onNavigateTab('loyalty')}>
          {loyalty.isMember ? 'View details' : 'Join now'}
        </Button>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHead}>
          <h3 className={styles.sectionTitle}>OD passes</h3>
          <Button variant="ghost">Buy more</Button>
        </div>
        <div className={styles.cards}>
          <div className={styles.card}>
            <Coin className={styles.cardIcon} />
            <span className={styles.cardValue}>{passes.credits}</span>
            <span className={styles.cardLabel}>Credits</span>
          </div>
          <div className={styles.card}>
            <Ticket className={styles.cardIcon} />
            <span className={styles.cardValue}>{passes.bundles}</span>
            <span className={styles.cardLabel}>Bundles</span>
          </div>
        </div>
      </div>
    </div>
  );
}
