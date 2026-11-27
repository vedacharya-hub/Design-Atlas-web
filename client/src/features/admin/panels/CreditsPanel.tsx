import { useState } from 'react';
import styles from './Panels.module.css';
import { AdminPanelHeader } from '../AdminPanelHeader';
import { CreditsTab } from '../tabs/CreditsTab';
import { CreditAllocationTab } from '../tabs/CreditAllocationTab';
import { OverageManagementTab } from '../tabs/OverageManagementTab';

type CreditTab = 'credits' | 'allocation' | 'overage';

const CREDIT_TABS: { value: CreditTab; label: string }[] = [
  { value: 'credits', label: 'Credits' },
  { value: 'allocation', label: 'Credit Allocation' },
  { value: 'overage', label: 'Overage Management' },
];

/** Admin → Settings → Credits: the company's credits, how they're allocated and overage rules. */
export function CreditsPanel() {
  const [tab, setTab] = useState<CreditTab>('credits');
  return (
    <>
      <AdminPanelHeader title="Credits" description="Manage company credits, allocation and overage" />
      <div className={styles.tabsRow} role="tablist">
        {CREDIT_TABS.map((t) => (
          <button
            key={t.value}
            role="tab"
            aria-selected={tab === t.value}
            className={[styles.tabBtn, tab === t.value ? styles.tabBtnActive : ''].join(' ').trim()}
            onClick={() => setTab(t.value)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className={styles.body}>
        {tab === 'credits' && <CreditsTab />}
        {tab === 'allocation' && <CreditAllocationTab />}
        {tab === 'overage' && <OverageManagementTab />}
      </div>
    </>
  );
}
