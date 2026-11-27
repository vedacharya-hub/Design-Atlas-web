import { useEffect, useState } from 'react';
// The side panel's tabs, the Company Settings header and tabs; nothing of its own beyond them.
import panel from '../users/UserDetailsPanel.module.css';
import ui from '../AdminControls.module.css';
import styles from './CreditsPanel.module.css';
import { adminApi } from '../../../api/adminApi';
import type { AdminUser, CreditOverview, OrgChart } from '../../../api/types';
import { AdminPanelHeader } from '../AdminPanelHeader';
import { CreditsGeneralTab } from './CreditsGeneralTab';
import { OverageAllocationTab } from './OverageAllocationTab';

type Tab = 'general' | 'overage';
const TABS: { id: Tab; label: string }[] = [
  { id: 'general', label: 'General' },
  { id: 'overage', label: 'Credit Overage Allocation' },
];

/**
 * Admin → Credits: this cycle's credits and overage (Figma 1607:206217), and the company's overage
 * limit with each team's share of it (5876:230515, 5414:242598, 8636:304024).
 */
export function CreditsPanel() {
  const [tab, setTab] = useState<Tab>('general');
  const [overview, setOverview] = useState<CreditOverview | null>(null);
  const [org, setOrg] = useState<OrgChart | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    Promise.all([adminApi.getCreditOverview(), adminApi.getOrg(), adminApi.getUsers()])
      .then(([o, chart, people]) => {
        setOverview(o);
        setOrg(chart);
        setUsers(people);
      })
      .catch(() => setLoadError('Couldn’t load credits. Please try again.'));
  }, []);

  return (
    <>
      <AdminPanelHeader title="Credits" description="Track the company’s credits and decide how overage is shared out" divider className={styles.header} />
      <div className={styles.tabs} role="tablist" aria-label="Credits">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`credits-tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls="credits-tabpanel"
            className={[panel.tab, styles.tab, tab === t.id ? panel.tabActive : ''].join(' ').trim()}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div id="credits-tabpanel" role="tabpanel" aria-labelledby={`credits-tab-${tab}`}>
        {loadError && <p className={ui.empty}>{loadError}</p>}
        {!loadError && (!overview || !org) && <p className={ui.empty}>Loading credits…</p>}
        {overview && org && tab === 'general' && <CreditsGeneralTab overview={overview} onSetLimit={() => setTab('overage')} />}
        {overview && org && tab === 'overage' && <OverageAllocationTab overview={overview} org={org} users={users} onChange={setOverview} />}
      </div>
    </>
  );
}
