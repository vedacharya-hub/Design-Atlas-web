import { useState } from 'react';
// The side panel's tabs; this page's rules last.
import panel from '../users/UserDetailsPanel.module.css';
import styles from './CompanySettingsPanel.module.css';
import { AdminPanelHeader } from '../AdminPanelHeader';
import { GeneralInfoTab } from './GeneralInfoTab';
import { ShiftManagementTab } from './ShiftManagementTab';
import { CoworkingPermissionsTab } from './CoworkingPermissionsTab';

type Tab = 'general' | 'coworking' | 'shifts';
const TABS: { id: Tab; label: string }[] = [
  { id: 'general', label: 'General Info & Permissions' },
  { id: 'coworking', label: 'Co-working Permissions' },
  { id: 'shifts', label: 'Shift Management' },
];

/**
 * Admin → Company Settings: the company's profile and the services everyone can use (Figma
 * 7991:258087), the WeWork co-working locations people may use (8413:199754) and the company's shifts
 * (3124:197371).
 */
export function CompanySettingsPanel() {
  const [tab, setTab] = useState<Tab>('general');
  return (
    <>
      <AdminPanelHeader title="Company Settings" description="Configure your work place and space settings" divider className={styles.header} />
      <div className={styles.tabs} role="tablist" aria-label="Company settings">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`company-tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls="company-tabpanel"
            className={[panel.tab, tab === t.id ? panel.tabActive : ''].join(' ').trim()}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div id="company-tabpanel" role="tabpanel" aria-labelledby={`company-tab-${tab}`}>
        {tab === 'general' && <GeneralInfoTab />}
        {tab === 'coworking' && <CoworkingPermissionsTab />}
        {tab === 'shifts' && <ShiftManagementTab />}
      </div>
    </>
  );
}
