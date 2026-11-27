import { useEffect, useMemo, useRef, useState } from 'react';
import styles from './UsersFilterPanel.module.css';
import type { AdminUser, OrgChart, UserStatus } from '../../../api/types';
import { MEMBERSHIPS } from './userShared';
import { SelectField } from './UserFormFields';

export interface UserFilters {
  businessUnit: string;
  department: string;
  team: string;
  status: '' | UserStatus;
  /** A MEMBERSHIPS key. */
  membership: string;
}

export const NO_FILTERS: UserFilters = { businessUnit: '', department: '', team: '', status: '', membership: '' };

/** How many filters are set (the count on the Filter button). */
export const countFilters = (f: UserFilters) => Object.values(f).filter(Boolean).length;

export function matchesFilters(u: AdminUser, f: UserFilters, membershipOf: (u: AdminUser) => string) {
  return (
    (!f.businessUnit || u.businessUnit === f.businessUnit) &&
    (!f.department || u.department === f.department) &&
    (!f.team || u.team === f.team) &&
    (!f.status || u.status === f.status) &&
    (!f.membership || membershipOf(u) === f.membership)
  );
}

/** Same as the panel's slide-out; a timer rather than animationend, which a hidden tab never fires. */
const CLOSE_MS = 240;

const STATUS_CHOICES: { value: UserFilters['status']; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
];
const MEMBERSHIP_CHOICES = [{ value: '', label: 'All' }, ...MEMBERSHIPS.map((m) => ({ value: m.key, label: m.label }))];

interface Props {
  org: OrgChart | null;
  users: AdminUser[];
  value: UserFilters;
  onApply: (filters: UserFilters) => void;
  onClose: () => void;
}

/**
 * Filters for All Users (Figma 8825:279955): a 490px panel from the right with business unit,
 * department and team (each narrowed by the one above), status and membership. Save applies them
 * and the panel slides back out; closing it any other way leaves the filters as they were.
 */
export function UsersFilterPanel({ org, users, value, onApply, onClose }: Props) {
  const [draft, setDraft] = useState<UserFilters>(value);
  const [closing, setClosing] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const closingRef = useRef(false);

  function close(apply?: UserFilters) {
    if (closingRef.current) return;
    closingRef.current = true;
    // Filter straight away, so the table is already updated as the panel slides off.
    if (apply) onApply(apply);
    setClosing(true);
    setTimeout(onClose, CLOSE_MS);
  }

  useEffect(() => {
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) close();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // Units that are active, or that someone in the directory still belongs to.
  const units = useMemo(() => {
    const used = (field: 'businessUnit' | 'department' | 'team') => new Set(users.map((u) => u[field]).filter(Boolean));
    const keep = <T extends { name: string; status: UserStatus }>(list: T[], inUse: Set<string>) =>
      list.filter((x) => x.status === 'active' || inUse.has(x.name)).sort((a, b) => a.name.localeCompare(b.name));
    return {
      businessUnits: keep(org?.businessUnits ?? [], used('businessUnit')),
      departments: keep(org?.departments ?? [], used('department')),
      teams: keep(org?.teams ?? [], used('team')),
    };
  }, [org, users]);

  const bu = units.businessUnits.find((b) => b.name === draft.businessUnit);
  const dept = units.departments.find((d) => d.name === draft.department);
  const deptChoices = units.departments.filter((d) => !bu || d.businessUnitId === bu.id).map((d) => d.name);
  const teamChoices = units.teams
    .filter((t) => (dept ? t.departmentId === dept.id : !bu || units.departments.some((d) => d.id === t.departmentId && d.businessUnitId === bu.id)))
    .map((t) => t.name);

  /** A business unit keeps only the department and team inside it; a department or team brings the levels above. */
  function pick(field: 'businessUnit' | 'department' | 'team', name: string) {
    if (field === 'businessUnit') {
      const nextBu = units.businessUnits.find((b) => b.name === name);
      const keepDept = !!dept && (!nextBu || dept.businessUnitId === nextBu.id);
      const team = units.teams.find((t) => t.name === draft.team);
      const keepTeam = keepDept && !!team;
      return setDraft((d) => ({ ...d, businessUnit: name, department: keepDept ? d.department : '', team: keepTeam ? d.team : '' }));
    }
    if (field === 'department') {
      const nextDept = units.departments.find((d) => d.name === name);
      const parent = nextDept && units.businessUnits.find((b) => b.id === nextDept.businessUnitId);
      const team = units.teams.find((t) => t.name === draft.team);
      const keepTeam = !!team && (!nextDept || team.departmentId === nextDept.id);
      return setDraft((d) => ({ ...d, department: name, businessUnit: parent?.name ?? d.businessUnit, team: keepTeam ? d.team : '' }));
    }
    const team = units.teams.find((t) => t.name === name);
    const teamDept = team && units.departments.find((d) => d.id === team.departmentId);
    const parent = teamDept && units.businessUnits.find((b) => b.id === teamDept.businessUnitId);
    setDraft((d) => ({ ...d, team: name, department: teamDept?.name ?? d.department, businessUnit: parent?.name ?? d.businessUnit }));
  }

  return (
    <>
      <div className={[styles.backdrop, closing ? styles.backdropOut : ''].join(' ').trim()} onMouseDown={() => close()} />
      <div
        ref={panelRef}
        className={[styles.panel, closing ? styles.panelOut : ''].join(' ').trim()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="users-filter-title"
        tabIndex={-1}
      >
        <header className={styles.head}>
          <h2 id="users-filter-title" className={styles.title}>
            Filters
          </h2>
          <button type="button" className={styles.close} aria-label="Close filters" onClick={() => close()}>
            <img src="/admin/user/close.svg" alt="" width={24} height={24} />
          </button>
        </header>

        <div className={styles.body}>
          <SelectField label="Business Unit" placeholder="All" value={draft.businessUnit} choices={units.businessUnits.map((b) => b.name)} onChange={(v) => pick('businessUnit', v)} />
          <SelectField label="Department" placeholder="All" value={draft.department} choices={deptChoices} onChange={(v) => pick('department', v)} />
          <SelectField label="Team" placeholder="All" value={draft.team} choices={teamChoices} onChange={(v) => pick('team', v)} />
          <RadioGroup label="Status" name="users-filter-status" value={draft.status} choices={STATUS_CHOICES} onChange={(v) => setDraft((d) => ({ ...d, status: v as UserFilters['status'] }))} />
          <RadioGroup label="Membership" name="users-filter-membership" value={draft.membership} choices={MEMBERSHIP_CHOICES} onChange={(v) => setDraft((d) => ({ ...d, membership: v }))} />
        </div>

        <footer className={styles.foot}>
          <button type="button" className={styles.secondary} disabled={countFilters(draft) === 0} onClick={() => setDraft(NO_FILTERS)}>
            Clear all
          </button>
          <button type="button" className={styles.primary} onClick={() => close(draft)}>
            Save
            <img src="/admin/user/check-white.svg" alt="" width={20} height={20} />
          </button>
        </footer>
      </div>
    </>
  );
}

/** A row of radios: a 16px ring, filled with a 12px dot when picked, then the label 4px after. */
export function RadioGroup({
  label,
  name,
  value,
  choices,
  onChange,
}: {
  label: string;
  name: string;
  value: string;
  choices: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <div className={styles.radios} role="radiogroup" aria-labelledby={`${name}-label`}>
      <p id={`${name}-label`} className={styles.radiosLabel}>
        {label}
      </p>
      <div className={styles.radioRow}>
        {choices.map((c) => (
          <label key={c.value || 'all'} className={styles.radio}>
            <input type="radio" name={name} value={c.value} checked={value === c.value} onChange={() => onChange(c.value)} />
            <span className={styles.radioMark} aria-hidden="true" />
            {c.label}
          </label>
        ))}
      </div>
    </div>
  );
}
