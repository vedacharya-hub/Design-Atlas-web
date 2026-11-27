import { useEffect, useState } from 'react';
import styles from './OverageManagementTab.module.css';
import { Switch } from '../../../components/ui/Switch';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { LimitBar } from '../../../components/ui/LimitBar';
import { Info, Warning } from '../../../components/ui/icons';
import { adminApi } from '../../../api/adminApi';
import type { CreditAllocationSettings, CreditGroup } from '../../../api/types';

const MIN_OVERAGE_LIMIT = 50;

const formatNumber = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 2 });

export function OverageManagementTab() {
  const [settings, setSettings] = useState<CreditAllocationSettings | null>(null);
  const [groups, setGroups] = useState<CreditGroup[]>([]);
  const [overageLimitInput, setOverageLimitInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmDisable, setConfirmDisable] = useState(false);

  useEffect(() => {
    adminApi.getCreditAllocationSettings().then(setSettings);
    adminApi.getCreditGroups().then(setGroups);
  }, []);

  useEffect(() => {
    if (settings) setOverageLimitInput(String(settings.overageLimit));
  }, [settings]);

  async function toggleEnabled(next: boolean) {
    setBusy(true);
    try {
      setSettings(await adminApi.updateCreditAllocationSettings({ overageManagementEnabled: next }));
    } finally {
      setBusy(false);
    }
  }

  function handleToggleEnabled(next: boolean) {
    if (!next) {
      setConfirmDisable(true);
    } else {
      toggleEnabled(true);
    }
  }

  async function confirmDisableOverageManagement() {
    setConfirmDisable(false);
    await toggleEnabled(false);
  }

  const overageLimitNum = Number(overageLimitInput);
  const overageLimitTooLow = Number.isFinite(overageLimitNum) && overageLimitNum < MIN_OVERAGE_LIMIT;
  const limitDirty = !!settings && overageLimitInput !== String(settings.overageLimit);

  async function saveLimit() {
    if (!settings || overageLimitTooLow || !Number.isFinite(overageLimitNum)) return;
    setBusy(true);
    try {
      setSettings(await adminApi.updateCreditAllocationSettings({ overageLimit: overageLimitNum }));
    } finally {
      setBusy(false);
    }
  }

  if (!settings) return null;

  const overagePoolUsed = groups.reduce((sum, g) => {
    const overflow = Math.max(0, g.usedCredits - g.allocatedCredits);
    return sum + (g.overageCap !== undefined ? Math.min(overflow, g.overageCap) : overflow);
  }, 0);

  return (
    <div className={styles.root}>
      <div className={styles.configBox}>
        <div className={styles.enableRow}>
          <div>
            <div className={styles.enableTitle}>Enable Overage Management</div>
            <p className={styles.enableDesc}>
              Off by default — every team has unlimited overage. Turn this on to cap overage at a shared monthly
              company limit and control which teams can draw on it.
            </p>
          </div>
          <Switch
            checked={settings.overageManagementEnabled}
            onChange={handleToggleEnabled}
            disabled={busy}
            aria-label="Enable overage management"
          />
        </div>

        <div className={[styles.configBody, settings.overageManagementEnabled ? styles.configBodyOpen : ''].join(' ')}>
          <div className={styles.configBodyInner}>
            <div className={styles.limitRow}>
              <label className={styles.field}>
                <span>Monthly overage limit</span>
                <input
                  type="number"
                  min={MIN_OVERAGE_LIMIT}
                  value={overageLimitInput}
                  onChange={(e) => setOverageLimitInput(e.target.value)}
                />
                {overageLimitTooLow && <span className={styles.errorHint}>Must be at least {MIN_OVERAGE_LIMIT} credits.</span>}
              </label>
              {limitDirty && (
                <Button onClick={saveLimit} disabled={busy || overageLimitTooLow}>
                  Save limit
                </Button>
              )}
            </div>

            <LimitBar
              label="Overage pool used"
              used={overagePoolUsed}
              limit={settings.overageLimit}
              color="var(--limit-secondary)"
              formatValue={formatNumber}
            />

            <div className={styles.infoNote}>
              <Info width={14} height={14} />
              <span>
                This limit is set on a monthly basis and is only drawn on once your company's created credit pool
                is exhausted.
              </span>
            </div>
          </div>
        </div>
      </div>

      {!settings.overageManagementEnabled && (
        <div className={styles.emptyState}>
          <p>Overage is unlimited.</p>
          <span>Turn on Overage Management above to cap it at a shared monthly limit.</span>
        </div>
      )}

      {confirmDisable && (
        <Modal onClose={() => setConfirmDisable(false)} labelledBy="disable-overage-title">
          <div className={styles.confirmHead}>
            <span className={styles.confirmIcon}>
              <Warning width={20} height={20} />
            </span>
            <h3 id="disable-overage-title" className={styles.formTitle}>
              Turn off Overage Management?
            </h3>
          </div>
          <p className={styles.confirmBody}>
            Your overage limit will become unlimited for this month — there will be no cap. As members book past
            their allocation, overage credits will still be consumed and burned off, just without a ceiling.
          </p>
          <div className={styles.formActions}>
            <Button variant="secondary" onClick={() => setConfirmDisable(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={confirmDisableOverageManagement} disabled={busy}>
              Turn off
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
