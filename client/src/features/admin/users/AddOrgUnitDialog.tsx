import { useEffect, useRef, useState, type FormEvent } from 'react';
import styles from './AddOrgUnitDialog.module.css';
import { adminApi } from '../../../api/adminApi';
import type { AdminUser, OrgChart } from '../../../api/types';
import { SelectField, TextField, UserSelectField } from './UserFormFields';
import { useToast } from '../Toaster';
import type { OrgScope, OrgTab } from './OrgUnitsTab';

const COPY: Record<OrgTab, { title: string; subtitle: string; nameLabel: string; placeholder: string; noun: string }> = {
  teams: { title: 'Add New Team', subtitle: 'Create a Team', nameLabel: 'Team Name', placeholder: 'e.g. App Development', noun: 'team' },
  departments: { title: 'Add New Department', subtitle: 'Create a Department', nameLabel: 'Department Name', placeholder: 'e.g. Engineering', noun: 'department' },
  businessUnits: { title: 'Add New Business Unit', subtitle: 'Create a Business Unit', nameLabel: 'Business Unit Name', placeholder: 'e.g. Digital Products', noun: 'business unit' },
};

/** Create shows its spinner at least this long, so a fast save doesn't flicker past it. */
const MIN_CREATING_MS = 600;
/** How long "Business Unit created successfully!" stays before the dialog closes itself. */
const SUCCESS_MS = 2000;

interface Props {
  kind: OrgTab;
  org: OrgChart;
  users: AdminUser[];
  /** Start under the unit the tab is narrowed to, if any. */
  scope: OrgScope | null;
  onClose: () => void;
  onCreated: (org: OrgChart) => void;
}

/**
 * Add New Team (Figma 1588:126998): a name, the department and business unit it sits in, and its
 * manager. Add Department and Add Business Unit (1588:136226) use the same dialog with the fields
 * that apply. Create spins while it saves; a new business unit then shows its success message
 * (1588:136382) for two seconds before the dialog closes.
 */
export function AddOrgUnitDialog({ kind, org, users, scope, onClose, onCreated }: Props) {
  const copy = COPY[kind];
  const toast = useToast();
  const activeBus = org.businessUnits.filter((b) => b.status === 'active');
  const activeDeps = org.departments.filter((d) => d.status === 'active');

  const scopedDept = scope?.field === 'department' ? activeDeps.find((d) => d.name === scope.value) : undefined;
  const scopedBu = scope?.field === 'businessUnit' ? activeBus.find((b) => b.name === scope.value) : undefined;
  const [name, setName] = useState('');
  const [departmentId, setDepartmentId] = useState(scopedDept?.id ?? '');
  const [businessUnitId, setBusinessUnitId] = useState(scopedDept?.businessUnitId ?? scopedBu?.id ?? '');
  const [managerId, setManagerId] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  // A new business unit: the structure to hand back once its success message has shown, and the
  // dialog's height, kept while the message stands in for the form.
  const [created, setCreated] = useState<{ org: OrgChart; height: number } | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Departments of the chosen business unit (all of them until one is chosen).
  const deptChoices = activeDeps.filter((d) => !businessUnitId || d.businessUnitId === businessUnitId).map((d) => ({ value: d.id, label: d.name }));

  // The callbacks sit in refs so a re-render of the page underneath doesn't restart the clock.
  const onCreatedRef = useRef(onCreated);
  onCreatedRef.current = onCreated;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const createdRef = useRef(created);
  createdRef.current = created;

  useEffect(() => {
    if (!created) return;
    const timer = setTimeout(() => onCreatedRef.current(created.org), SUCCESS_MS);
    return () => clearTimeout(timer);
  }, [created]);

  // Escape closes; during the success message it just closes it sooner.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if (createdRef.current) onCreatedRef.current(createdRef.current.org);
      else onCloseRef.current();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const ready = !!name.trim() && (kind === 'businessUnits' || (kind === 'teams' ? !!departmentId : !!businessUnitId));

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    if (!ready || saving) return;
    setSaving(true);
    setError('');
    const trimmed = name.trim();
    const minWait = new Promise((r) => setTimeout(r, MIN_CREATING_MS));
    try {
      if (kind === 'teams') {
        const [team] = await Promise.all([adminApi.createTeam(trimmed, departmentId, managerId || undefined), minWait]);
        const dept = org.departments.find((d) => d.id === departmentId);
        onCreated({ ...org, teams: [...org.teams, team] });
        toast({ title: `${team.name} was added!`, description: <>Created the <strong>{team.name}</strong> team in {dept?.name}</> });
      } else if (kind === 'departments') {
        const [dep] = await Promise.all([adminApi.createDepartment(trimmed, businessUnitId), minWait]);
        const bu = org.businessUnits.find((b) => b.id === businessUnitId);
        onCreated({ ...org, departments: [...org.departments, dep] });
        toast({ title: `${dep.name} was added!`, description: <>Created the <strong>{dep.name}</strong> department in {bu?.name}</> });
      } else {
        const [bu] = await Promise.all([adminApi.createBusinessUnit(trimmed), minWait]);
        // The success message stands in for the form, at the form's height, then hands the unit back.
        setCreated({ org: { ...org, businessUnits: [...org.businessUnits, bu] }, height: dialogRef.current?.offsetHeight ?? 0 });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong. Please try again.';
      setError(message);
      setSaving(false);
      toast({ tone: 'error', title: `Couldn’t add ${trimmed}`, description: message });
    }
  }

  if (created) {
    return (
      <div className={styles.backdrop} onMouseDown={() => onCreated(created.org)}>
        <div className={styles.dialog} style={{ height: created.height || undefined }} role="dialog" aria-modal="true" aria-label="Business unit created" onMouseDown={(e) => e.stopPropagation()}>
          <div className={styles.success} role="status">
            <span className={styles.successBadge}>
              <img src="/admin/user/success-check.svg" alt="" width={40} height={40} />
            </span>
            <p className={styles.successText}>Business Unit created successfully!</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.backdrop}>
      <div ref={dialogRef} className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="add-org-unit-title">
        <header className={styles.head}>
          <div className={styles.headText}>
            <h2 id="add-org-unit-title" className={styles.title}>
              {copy.title}
            </h2>
            <p className={styles.subtitle}>{copy.subtitle}</p>
          </div>
          <button type="button" className={styles.close} aria-label="Close" onClick={onClose}>
            <img src="/admin/user/close.svg" alt="" width={24} height={24} />
          </button>
        </header>

        <form id="add-org-unit" className={styles.body} onSubmit={(e) => void submit(e)} noValidate>
          <TextField label={copy.nameLabel} value={name} placeholder={copy.placeholder} onChange={setName} />
          {kind === 'teams' && (
            <SelectField
              required
              label="Department"
              value={departmentId}
              choices={deptChoices}
              onChange={(id) => {
                setDepartmentId(id);
                // A department sits in exactly one business unit.
                const dept = org.departments.find((d) => d.id === id);
                if (dept) setBusinessUnitId(dept.businessUnitId);
              }}
            />
          )}
          {kind !== 'businessUnits' && (
            <SelectField
              required
              label="Business Unit"
              value={businessUnitId}
              choices={activeBus.map((b) => ({ value: b.id, label: b.name }))}
              onChange={(id) => {
                setBusinessUnitId(id);
                const dept = org.departments.find((d) => d.id === departmentId);
                if (dept && dept.businessUnitId !== id) setDepartmentId('');
              }}
            />
          )}
          {kind === 'teams' && <UserSelectField label="Manager" value={managerId} users={users} onChange={setManagerId} />}
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
        </form>

        <footer className={styles.foot}>
          <button type="button" className={styles.secondary} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="add-org-unit" className={styles.primary} disabled={!ready || saving} aria-busy={saving}>
            {saving ? 'Creating…' : 'Create'}
            {saving ? <span className={styles.spinner} aria-hidden="true" /> : <img src="/admin/user/check-white.svg" alt="" width={20} height={20} />}
          </button>
        </footer>
      </div>
    </div>
  );
}
