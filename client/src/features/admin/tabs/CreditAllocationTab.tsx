import { useEffect, useState } from 'react';
import styles from './CreditAllocationTab.module.css';
import { Switch } from '../../../components/ui/Switch';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { Dropdown } from '../../../components/ui/Dropdown';
import { LimitBar } from '../../../components/ui/LimitBar';
import { Edit, Trash, Plus, Layers, ChevronDown, Warning } from '../../../components/ui/icons';
import { adminApi } from '../../../api/adminApi';
import type { CreditAllocationSettings, CreditGroup, OrgUnit, OrgUnitType } from '../../../api/types';

const TYPE_LABEL: Record<OrgUnitType, string> = {
  'business-unit': 'Business Unit',
  department: 'Department',
  team: 'Team',
};

const formatNumber = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 2 });

interface FormState {
  groupId?: string;
  /** True when opened from a specific row's "Allocate credits" button — target is fixed. */
  fromRow: boolean;
  orgUnitId: string;
  businessUnitId: string;
  departmentId: string;
  allocatedCredits: string;
  /** Empty string = no per-group limit; unlimited (bounded only by the shared overage pool, if any). */
  overageCap: string;
}

interface LimitsForm {
  totalCreditLimit: string;
}

export function CreditAllocationTab() {
  const [settings, setSettings] = useState<CreditAllocationSettings | null>(null);
  const [limitsForm, setLimitsForm] = useState<LimitsForm | null>(null);
  const [orgUnits, setOrgUnits] = useState<OrgUnit[]>([]);
  const [groups, setGroups] = useState<CreditGroup[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<FormState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CreditGroup | null>(null);
  const [buyAmount, setBuyAmount] = useState<string | null>(null);
  const [confirmDisable, setConfirmDisable] = useState(false);

  const refreshGroups = () => adminApi.getCreditGroups().then(setGroups);

  useEffect(() => {
    adminApi.getCreditAllocationSettings().then(setSettings);
    adminApi.getOrgUnits().then((units) => {
      setOrgUnits(units);
      setExpanded(new Set(units.filter((u) => u.type !== 'team').map((u) => u.id)));
    });
    refreshGroups();
  }, []);

  useEffect(() => {
    if (settings) setLimitsForm({ totalCreditLimit: String(settings.totalCreditLimit) });
  }, [settings]);

  const unitById = new Map(orgUnits.map((u) => [u.id, u]));
  const childrenByParent = new Map<string, OrgUnit[]>();
  for (const u of orgUnits) {
    const key = u.parentId ?? '__root__';
    childrenByParent.set(key, [...(childrenByParent.get(key) ?? []), u]);
  }
  const groupByUnit = new Map(groups.map((g) => [g.orgUnitId, g]));
  const roots = childrenByParent.get('__root__') ?? [];
  const businessUnits = orgUnits.filter((u) => u.type === 'business-unit');

  const unitPath = (unit: OrgUnit): string => {
    const parent = unit.parentId ? unitById.get(unit.parentId) : undefined;
    return parent ? `${unitPath(parent)} / ${unit.name}` : unit.name;
  };

  /** Walks up from `unit` to find the nearest ancestor with its own credit group — that group's
   *  allocation is the pool `unit` draws from. Falls back to the company-wide pool. */
  function governingPool(unit: OrgUnit): { poolSize: number; ancestorId: string | null; ancestorName: string } {
    let cur = unit.parentId ? unitById.get(unit.parentId) : undefined;
    while (cur) {
      const g = groupByUnit.get(cur.id);
      if (g) return { poolSize: g.allocatedCredits, ancestorId: cur.id, ancestorName: cur.name };
      cur = cur.parentId ? unitById.get(cur.parentId) : undefined;
    }
    return { poolSize: settings?.totalCreditLimit ?? 0, ancestorId: null, ancestorName: 'the company' };
  }

  function poolUsage(ancestorId: string | null, excludeGroupId?: string): number {
    return groups
      .filter((g) => g.id !== excludeGroupId)
      .filter((g) => {
        const u = unitById.get(g.orgUnitId);
        return u ? governingPool(u).ancestorId === ancestorId : false;
      })
      .reduce((sum, g) => sum + g.allocatedCredits, 0);
  }

  /** How much of the shared company overage pool has actually been drawn on so far. */
  function overagePoolUsage(): number {
    return groups.reduce((sum, g) => {
      const overflow = Math.max(0, g.usedCredits - g.allocatedCredits);
      return sum + (g.overageCap !== undefined ? Math.min(overflow, g.overageCap) : overflow);
    }, 0);
  }

  async function toggleEnabled(next: boolean) {
    setBusy(true);
    try {
      setSettings(await adminApi.updateCreditAllocationSettings({ enabled: next }));
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

  async function confirmDisableAllocation() {
    setConfirmDisable(false);
    await toggleEnabled(false);
  }

  async function saveLimits() {
    if (!limitsForm) return;
    const totalCreditLimit = Number(limitsForm.totalCreditLimit);
    if (!Number.isFinite(totalCreditLimit) || totalCreditLimit < 0) return;
    setBusy(true);
    try {
      setSettings(await adminApi.updateCreditAllocationSettings({ totalCreditLimit }));
    } finally {
      setBusy(false);
    }
  }

  async function confirmBuyCredits() {
    if (!settings || buyAmount === null) return;
    const amount = Number(buyAmount);
    if (!Number.isFinite(amount) || amount <= 0) return;
    setBusy(true);
    try {
      setSettings(await adminApi.updateCreditAllocationSettings({ totalCreditLimit: settings.totalCreditLimit + amount }));
      setBuyAmount(null);
    } finally {
      setBusy(false);
    }
  }

  function toggleGroupExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function openCreate(unit?: OrgUnit) {
    if (unit) {
      setForm({ fromRow: true, orgUnitId: unit.id, businessUnitId: '', departmentId: '', allocatedCredits: '', overageCap: '' });
    } else {
      setForm({ fromRow: false, orgUnitId: '', businessUnitId: '', departmentId: '', allocatedCredits: '', overageCap: '' });
    }
  }

  function openEdit(unit: OrgUnit, group: CreditGroup) {
    setForm({
      groupId: group.id,
      fromRow: true,
      orgUnitId: unit.id,
      businessUnitId: '',
      departmentId: '',
      allocatedCredits: String(group.allocatedCredits),
      overageCap: group.overageCap !== undefined ? String(group.overageCap) : '',
    });
  }

  /** Departments to drill into for a chosen Business Unit (step 2 of the create-group cascade). */
  function departmentsForBusinessUnit(buId: string) {
    return (childrenByParent.get(buId) ?? []).filter((u) => u.type === 'department');
  }

  /** Teams available to allocate to under a chosen Department (step 3) — already-allocated teams are excluded. */
  function teamsForDepartment(deptId: string) {
    return (childrenByParent.get(deptId) ?? []).filter((u) => u.type === 'team' && !groupByUnit.has(u.id));
  }

  const targetUnit = form ? unitById.get(form.orgUnitId) : undefined;
  const governing = targetUnit ? governingPool(targetUnit) : null;
  const poolRemaining = governing ? governing.poolSize - poolUsage(governing.ancestorId, form?.groupId) : null;
  const allocatedCreditsNum = form ? Number(form.allocatedCredits) : NaN;
  const overLimit = poolRemaining !== null && Number.isFinite(allocatedCreditsNum) && allocatedCreditsNum > poolRemaining;
  const hasOverageCap = !!form && form.overageCap.trim() !== '';
  const overageCapNumPreview = form ? Number(form.overageCap) : NaN;
  const overageCapInvalid = hasOverageCap && (!Number.isFinite(overageCapNumPreview) || overageCapNumPreview < 0);

  async function saveForm() {
    if (!form || !settings) return;
    const allocatedCredits = Number(form.allocatedCredits);
    if (!form.orgUnitId || !Number.isFinite(allocatedCredits) || allocatedCredits <= 0 || overLimit) return;
    const capApplies = settings.overageManagementEnabled;
    const overageCapNum = capApplies && form.overageCap.trim() !== '' ? Number(form.overageCap) : undefined;
    if (capApplies && form.overageCap.trim() !== '' && (!Number.isFinite(overageCapNum) || (overageCapNum as number) < 0)) return;
    setBusy(true);
    try {
      if (form.groupId) {
        await adminApi.updateCreditGroup(form.groupId, {
          allocatedCredits,
          overageCap: capApplies ? (overageCapNum ?? null) : null,
        });
      } else {
        await adminApi.createCreditGroup({
          orgUnitId: form.orgUnitId,
          allocatedCredits,
          ...(overageCapNum !== undefined ? { overageCap: overageCapNum } : {}),
        });
      }
      setForm(null);
      refreshGroups();
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      await adminApi.deleteCreditGroup(deleteTarget.id);
      setDeleteTarget(null);
      refreshGroups();
    } finally {
      setBusy(false);
    }
  }

  const renderBusinessUnit = (bu: OrgUnit) => {
    const group = groupByUnit.get(bu.id);
    const children = childrenByParent.get(bu.id) ?? [];
    const hasChildren = children.length > 0;
    const isOpen = expanded.has(bu.id);
    // Sum of every descendant group that draws on this BU's pool (skipping over any
    // intermediate levels with no group of their own), not just direct children.
    const subAllocated = group ? poolUsage(bu.id) : 0;

    return (
      <div key={bu.id} className={styles.buCard}>
        <div className={styles.buHeader}>
          <button
            type="button"
            className={styles.buHeaderMain}
            onClick={() => hasChildren && toggleGroupExpanded(bu.id)}
            aria-label={isOpen ? `Collapse ${bu.name}` : `Expand ${bu.name}`}
          >
            {hasChildren && (
              <ChevronDown className={[styles.chevron, isOpen ? styles.chevronOpen : ''].join(' ')} width={14} height={14} />
            )}
            <span>
              <span className={styles.buEyebrow}>Business Unit</span>
              <span className={styles.buName}>{bu.name}</span>
            </span>
          </button>

          <div className={styles.buHeaderRight}>
            {group ? (
              <>
                <span className={styles.buCredits}>{formatNumber(group.allocatedCredits)} Credits</span>
                <button type="button" className={styles.iconBtn} aria-label={`Edit ${bu.name} allocation`} onClick={() => openEdit(bu, group)}>
                  <Edit width={13} height={13} />
                </button>
                <button type="button" className={styles.iconBtn} aria-label={`Remove ${bu.name} allocation`} onClick={() => setDeleteTarget(group)}>
                  <Trash width={13} height={13} />
                </button>
              </>
            ) : (
              <Button variant="secondary" onClick={() => openCreate(bu)}>
                Allocate credits
              </Button>
            )}
          </div>
        </div>

        {group && (
          <div className={styles.buSubBar}>
            <LimitBar
              label="Allocated to sub-units"
              used={subAllocated}
              limit={group.allocatedCredits}
              color="var(--limit-secondary)"
              formatValue={formatNumber}
            />
          </div>
        )}

        {hasChildren && isOpen && <div className={styles.buBody}>{children.map((c) => renderUnit(c, 0))}</div>}
      </div>
    );
  };

  const renderUnit = (unit: OrgUnit, depth: number) => {
    const children = childrenByParent.get(unit.id) ?? [];
    const hasChildren = children.length > 0;
    const isOpen = expanded.has(unit.id);
    const group = groupByUnit.get(unit.id);
    // Sum of every descendant group that draws on THIS unit's pool (skipping over any
    // intermediate levels with no group of their own), not just direct children.
    const subAllocated = group ? poolUsage(unit.id) : 0;
    const overflow = group ? Math.max(0, group.usedCredits - group.allocatedCredits) : 0;

    return (
      <div key={unit.id}>
        <div className={styles.row} style={{ paddingLeft: depth * 24 }}>
          <div className={styles.rowMain}>
            {hasChildren ? (
              <button
                type="button"
                className={styles.chevronBtn}
                aria-label={isOpen ? `Collapse ${unit.name}` : `Expand ${unit.name}`}
                onClick={() => toggleGroupExpanded(unit.id)}
              >
                <ChevronDown className={[styles.chevron, isOpen ? styles.chevronOpen : ''].join(' ')} width={14} height={14} />
              </button>
            ) : (
              <span className={styles.chevronSpacer} />
            )}
            <span className={styles.typeBadge}>{TYPE_LABEL[unit.type]}</span>
            <span className={styles.unitName}>{unit.name}</span>
          </div>

          <div className={styles.rowBody}>
            {group ? (
              hasChildren ? (
                <LimitBar
                  label="Allocated to sub-units"
                  used={subAllocated}
                  limit={group.allocatedCredits}
                  color="var(--limit-secondary)"
                  formatValue={formatNumber}
                />
              ) : (
                <>
                  <LimitBar
                    label="Used"
                    used={Math.min(group.usedCredits, group.allocatedCredits)}
                    limit={group.allocatedCredits}
                    color="var(--limit-primary)"
                    formatValue={formatNumber}
                  />
                  {overflow > 0 && (
                    <span className={styles.overflowHint}>
                      +{formatNumber(overflow)}{' '}
                      {!settings?.overageManagementEnabled
                        ? 'over allocation (unlimited overage)'
                        : group.overageCap !== undefined
                          ? `drawn from overage (limit ${formatNumber(group.overageCap)})`
                          : 'drawn from the shared overage pool'}
                    </span>
                  )}
                </>
              )
            ) : (
              <span className={styles.noAllocation}>{unit.parentId ? 'Shares parent pool' : 'No allocation set'}</span>
            )}
          </div>

          <div className={styles.rowActions}>
            {group && settings?.overageManagementEnabled && (
              <span className={[styles.overageBadge, styles.overageAllowed].join(' ')}>
                {group.overageCap !== undefined ? `Overage limit: ${formatNumber(group.overageCap)}` : 'Overage: unlimited'}
              </span>
            )}
            {group ? (
              <>
                <button type="button" className={styles.iconBtn} aria-label={`Edit ${unit.name} allocation`} onClick={() => openEdit(unit, group)}>
                  <Edit width={13} height={13} />
                </button>
                <button type="button" className={styles.iconBtn} aria-label={`Remove ${unit.name} allocation`} onClick={() => setDeleteTarget(group)}>
                  <Trash width={13} height={13} />
                </button>
              </>
            ) : (
              <Button variant="secondary" onClick={() => openCreate(unit)}>
                Allocate credits
              </Button>
            )}
          </div>
        </div>
        {hasChildren && isOpen && children.map((c) => renderUnit(c, depth + 1))}
      </div>
    );
  };

  if (!settings || !limitsForm) return null;

  const companyPoolUsed = poolUsage(null);
  const overagePoolRemaining = settings.overageManagementEnabled ? settings.overageLimit - overagePoolUsage() : null;
  const limitsDirty = limitsForm.totalCreditLimit !== String(settings.totalCreditLimit);
  const buyAmountNum = buyAmount !== null ? Number(buyAmount) : NaN;
  const buyAmountInvalid = buyAmount !== null && (!Number.isFinite(buyAmountNum) || buyAmountNum <= 0);

  return (
    <div className={styles.root}>
      <div className={styles.configBox}>
        <div className={styles.enableRow}>
          <div>
            <div className={styles.enableTitle}>Enable Credit Allocation</div>
            <p className={styles.enableDesc}>
              Turn this on to divide your credit pool across Business Units, Departments, and Teams. Turning it
              off hides allocation without deleting anything you've set up.
            </p>
          </div>
          <Switch checked={settings.enabled} onChange={handleToggleEnabled} disabled={busy} aria-label="Enable credit allocation" />
        </div>

        <div className={[styles.configBody, settings.enabled ? styles.configBodyOpen : ''].join(' ')}>
          <div className={styles.configBodyInner}>
            <div className={styles.poolSettings}>
              <div className={styles.poolSettingsHead}>
                <span className={styles.poolSettingsTitle}>Company Credit Pool</span>
                <div className={styles.poolSettingsHeadActions}>
                  {limitsDirty && (
                    <Button variant="secondary" onClick={saveLimits} disabled={busy}>
                      Save limits
                    </Button>
                  )}
                  <Button onClick={() => setBuyAmount('')} disabled={busy}>
                    Buy Credits
                  </Button>
                </div>
              </div>
              <div className={styles.poolFields}>
                <label className={styles.field}>
                  <span>Total credit limit (monthly)</span>
                  <input
                    type="number"
                    min="0"
                    value={limitsForm.totalCreditLimit}
                    onChange={(e) => setLimitsForm({ ...limitsForm, totalCreditLimit: e.target.value })}
                  />
                </label>
              </div>

              <LimitBar
                label="Allocated to Business Units"
                used={companyPoolUsed}
                limit={settings.totalCreditLimit}
                color="var(--limit-primary)"
                formatValue={formatNumber}
              />
            </div>

            <div className={styles.treeHead}>
              <span className={styles.treeHeadTitle}>Credit Groups</span>
              <Button variant="secondary" onClick={() => openCreate()}>
                <Plus width={14} height={14} /> Create Credit Group
              </Button>
            </div>

            <div className={styles.tree}>{roots.map((r) => renderBusinessUnit(r))}</div>
          </div>
        </div>
      </div>

      {!settings.enabled && (
        <div className={styles.emptyState}>
          <Layers width={28} height={28} />
          <p>Credit allocation is turned off.</p>
          <span>Turn it on above to allot credits to Business Units, Departments, and Teams.</span>
        </div>
      )}

      {form && (
        <Modal onClose={() => setForm(null)} labelledBy="credit-group-form-title">
          <h3 id="credit-group-form-title" className={styles.formTitle}>
            {form.groupId ? 'Edit credit group' : 'Create credit group'}
          </h3>

          <label className={styles.field}>
            <span>Business Unit / Department / Team</span>
            {form.fromRow ? (
              <div className={styles.readonlyField}>{targetUnit ? unitPath(targetUnit) : ''}</div>
            ) : (
              <div className={styles.cascade}>
                <Dropdown
                  variant="plain"
                  placeholder="1. Select a Business Unit"
                  value={form.businessUnitId}
                  onChange={(v) => setForm({ ...form, businessUnitId: v, departmentId: '', orgUnitId: '' })}
                  options={businessUnits.map((u) => ({ value: u.id, label: u.name }))}
                />
                {form.businessUnitId && (
                  <Dropdown
                    variant="plain"
                    placeholder="2. Select a Department"
                    value={form.departmentId}
                    onChange={(v) => setForm({ ...form, departmentId: v, orgUnitId: '' })}
                    options={departmentsForBusinessUnit(form.businessUnitId).map((u) => ({ value: u.id, label: u.name }))}
                  />
                )}
                {form.departmentId && (
                  <Dropdown
                    variant="plain"
                    placeholder="3. Select a Team"
                    value={form.orgUnitId}
                    onChange={(v) => setForm({ ...form, orgUnitId: v })}
                    options={teamsForDepartment(form.departmentId).map((u) => ({ value: u.id, label: u.name }))}
                  />
                )}
              </div>
            )}
          </label>

          <label className={styles.field}>
            <span>Allocated credits</span>
            <input
              type="number"
              min="0"
              max={poolRemaining ?? undefined}
              value={form.allocatedCredits}
              placeholder="e.g. 80"
              disabled={!form.orgUnitId}
              onChange={(e) => setForm({ ...form, allocatedCredits: e.target.value })}
            />
            {governing && poolRemaining !== null && (
              <p className={[styles.remainingHint, overLimit ? styles.remainingHintError : ''].join(' ')}>
                Current pool limit: {formatNumber(governing.poolSize)} credits — {formatNumber(poolRemaining)} remaining in{' '}
                {governing.ancestorName}'s pool{overLimit ? ' — reduce this amount to fit' : ''}
              </p>
            )}
          </label>

          {settings.overageManagementEnabled ? (
            <>
              <label className={styles.overageRow}>
                <div>
                  <span className={styles.overageTitle}>Overage Limit</span>
                  <p className={styles.overageDesc}>
                    {hasOverageCap
                      ? 'Cap how many overage credits this team can draw from the shared company pool.'
                      : "Unlimited — this team draws from the shared overage pool with no individual limit, and stops only once that shared pool itself is exhausted."}
                  </p>
                </div>
                <Switch
                  checked={hasOverageCap}
                  onChange={(v) => setForm({ ...form, overageCap: v ? '0' : '' })}
                  aria-label="Set an overage limit"
                />
              </label>

              {overagePoolRemaining !== null && (
                <p className={styles.remainingHint}>
                  Company overage pool: {formatNumber(overagePoolRemaining)} of {formatNumber(settings.overageLimit)} credits
                  remaining
                </p>
              )}

              {hasOverageCap && (
                <label className={styles.field}>
                  <span>Overage limit for this team</span>
                  <input
                    type="number"
                    min="0"
                    value={form.overageCap}
                    placeholder="e.g. 15"
                    onChange={(e) => setForm({ ...form, overageCap: e.target.value })}
                  />
                </label>
              )}
            </>
          ) : (
            <div className={styles.overageRow}>
              <div>
                <span className={styles.overageTitle}>Overage Limit</span>
                <p className={styles.overageDesc}>
                  Unlimited — once this team's allocated credits are used up, they can continue booking with
                  overage credits.
                </p>
              </div>
            </div>
          )}

          <div className={styles.formActions}>
            <Button variant="secondary" onClick={() => setForm(null)}>
              Cancel
            </Button>
            <Button onClick={saveForm} disabled={busy || !form.orgUnitId || !Number(form.allocatedCredits) || overLimit || overageCapInvalid}>
              Save
            </Button>
          </div>
        </Modal>
      )}

      {confirmDisable && (
        <Modal onClose={() => setConfirmDisable(false)} labelledBy="disable-allocation-title">
          <div className={styles.confirmHead}>
            <span className={styles.confirmIcon}>
              <Warning width={20} height={20} />
            </span>
            <h3 id="disable-allocation-title" className={styles.formTitle}>
              Turn off Credit Allocation?
            </h3>
          </div>
          <p className={styles.confirmBody}>
            All restrictions will be removed — every member across the company will have unrestricted access to the
            shared credit pool and can use it freely, with no per-team, department, or Business Unit limits.
          </p>
          <div className={styles.formActions}>
            <Button variant="secondary" onClick={() => setConfirmDisable(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={confirmDisableAllocation} disabled={busy}>
              Turn off
            </Button>
          </div>
        </Modal>
      )}

      {deleteTarget && (
        <Modal onClose={() => setDeleteTarget(null)} labelledBy="delete-credit-group-title">
          <h3 id="delete-credit-group-title" className={styles.formTitle}>
            Remove this allocation?
          </h3>
          <p className={styles.confirmBody}>
            {unitById.get(deleteTarget.orgUnitId)?.name} will go back to drawing from its parent's pool instead of
            its own dedicated allocation.
          </p>
          <div className={styles.formActions}>
            <Button variant="secondary" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={confirmDelete} disabled={busy}>
              Remove
            </Button>
          </div>
        </Modal>
      )}

      {buyAmount !== null && (
        <Modal onClose={() => setBuyAmount(null)} labelledBy="buy-credits-title">
          <h3 id="buy-credits-title" className={styles.formTitle}>
            Buy Credits
          </h3>
          <p className={styles.confirmBody}>Add more credits to your company's monthly pool.</p>
          <label className={styles.field}>
            <span>Credits to add</span>
            <input
              type="number"
              min="1"
              autoFocus
              value={buyAmount}
              placeholder="e.g. 100"
              onChange={(e) => setBuyAmount(e.target.value)}
            />
          </label>
          <div className={styles.formActions}>
            <Button variant="secondary" onClick={() => setBuyAmount(null)}>
              Cancel
            </Button>
            <Button onClick={confirmBuyCredits} disabled={busy || buyAmountInvalid}>
              Add Credits
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
