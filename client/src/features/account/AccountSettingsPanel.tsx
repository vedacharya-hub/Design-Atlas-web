import { useEffect, useState } from 'react';
import styles from './AccountSettingsPanel.module.css';
import { Tabs } from '../../components/ui/Tabs';
import { Avatar } from '../../components/ui/Avatar';
import { Close, VerifiedBadge } from '../../components/ui/icons';
import { accountApi } from '../../api/accountApi';
import type { AccountDetails, Member } from '../../api/types';
import { GeneralTab } from './tabs/GeneralTab';
import { ProfileTab } from './tabs/ProfileTab';
import { SubscriptionTab } from './tabs/SubscriptionTab';
import { LoyaltyTab } from './tabs/LoyaltyTab';

interface Props {
  user: Member;
  onClose: () => void;
}

const TABS = [
  { value: 'general', label: 'General' },
  { value: 'profile', label: 'Profile' },
  { value: 'subscription', label: 'Subscription' },
  { value: 'loyalty', label: 'Loyalty' },
];

const ACCOUNT_TYPE_LABEL: Record<AccountDetails['accountType'], string> = {
  'on-demand': 'On Demand account',
  'private-office': 'Private Office account',
};

export function AccountSettingsPanel({ user, onClose }: Props) {
  const [tab, setTab] = useState('general');
  const [details, setDetails] = useState<AccountDetails | null>(null);

  useEffect(() => {
    accountApi.getAccountDetails(user.id).then(setDetails);
  }, [user.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className={styles.overlay} onMouseDown={onClose}>
      <aside
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="account-settings-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className={styles.banner}>
          <button className={styles.closeBtn} aria-label="Close" onClick={onClose}>
            <Close />
          </button>
        </div>

        <div className={styles.identity}>
          <div className={styles.avatarWrap}>
            <Avatar name={user.name} color={user.avatarColor} size={96} />
          </div>
          <div className={styles.identityText}>
            <div className={styles.nameRow}>
              <h2 id="account-settings-title" className={styles.name}>{user.name}</h2>
              {details?.kyc.verified && <VerifiedBadge className={styles.verifiedIcon} />}
            </div>
            <div className={styles.email}>{user.email}</div>
          </div>
          {details && (
            <span className={styles.accountTypePill}>{ACCOUNT_TYPE_LABEL[details.accountType]}</span>
          )}
        </div>

        <div className={styles.tabsRow}>
          <Tabs items={TABS} value={tab} onChange={setTab} />
        </div>

        <div className={styles.body}>
          {!details ? (
            <div className={styles.loading}>Loading account details…</div>
          ) : tab === 'general' ? (
            <GeneralTab details={details} onNavigateTab={setTab} />
          ) : tab === 'profile' ? (
            <ProfileTab user={user} details={details} onNavigateTab={setTab} />
          ) : tab === 'subscription' ? (
            <SubscriptionTab subscription={details.subscription} />
          ) : (
            <LoyaltyTab loyalty={details.loyalty} />
          )}
        </div>
      </aside>
    </div>
  );
}
