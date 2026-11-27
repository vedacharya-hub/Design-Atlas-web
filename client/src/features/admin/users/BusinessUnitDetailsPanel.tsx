import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
// Shared controls, the user table, then the side panel shell; the org unit panels' own rules last.
import ui from '../AdminControls.module.css';
import table from './UsersPanel.module.css';
import panel from './UserDetailsPanel.module.css';
import styles from './OrgUnitPanel.module.css';
import { adminApi } from '../../../api/adminApi';
import type { AdminUser, Department, OrgChart, UserStatus } from '../../../api/types';
import { useToast } from '../Toaster';
import { TextField } from './UserFormFields';
import { StatusSelect } from './UserDetailsPanel';
import { STATUS_LABEL } from './userShared';
import { useRowMenu } from './useRowMenu';
import { RowMenu } from './RowMenu';

/** Room for the department row menu (two items). */
const ROW_MENU_HEIGHT = 106;

interface Draft {
  name: string;
  status: UserStatus;
}

interface Props {
  businessUnitId: string;
  org: OrgChart;
  users: AdminUser[];
  onClose: () => void;
  /** After a save or a department change: reload the structure and the directory. */
  onChanged: () => Promise<void>;
  /** "View details" on a department: its panel takes over. */
  onOpenDepartment: (departmentId: string) => void;
}

/**
 * Business Unit Details (Figma 1588:134995) and its edit view (1588:135204), in the same right-hand
 * panel as the other details: the business unit's departments. Editing changes its name and status.
 */
export function BusinessUnitDetailsPanel({ businessUnitId, org, users, onClose, onChanged, onOpenDepartment }: Props) {
  const bu = org.businessUnits.find((b) => b.id === businessUnitId);
  const toast = useToast();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [closing, setClosing] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Escape backs out of editing first, then closes. Menus inside claim it before this.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if (draft) setDraft(null);
      else setClosing(true);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [draft]);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panelRef.current?.focus();
    return () => {
      document.body.style.overflow = overflow;
      opener?.focus?.();
    };
  }, []);

  // The business unit went away (e.g. the data was reloaded without it).
  if (!bu) return null;

  const people = users.filter((u) => u.businessUnit === bu.name).length;
  const editing = draft !== null;
  const close = () => setClosing(true);
  const set = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d));

  async function save(e?: FormEvent) {
    e?.preventDefault();
    if (!draft || !bu || saving) return;
    const name = draft.name.trim();
    if (!name) return toast({ tone: 'error', title: 'The business unit needs a name', description: 'Add a business unit name, then save again.' });
    const archived = bu.status === 'active' && draft.status === 'inactive';
    setSaving(true);
    try {
      await adminApi.updateOrgUnit('business-units', bu.id, { name, status: draft.status });
      await onChanged();
      setDraft(null);
      toast(
        archived
          ? { title: `${name} was archived!`, description: <>The <strong>{name}</strong> business unit is now inactive</> }
          : { title: `${name} was updated!`, description: <>Saved your changes to the <strong>{name}</strong> Business Unit</> },
      );
    } catch (err) {
      toast({ tone: 'error', title: `Couldn’t save ${bu.name}`, description: err instanceof Error ? err.message : 'Something went wrong. Please try again.' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className={[panel.backdrop, closing ? panel.backdropOut : ''].join(' ').trim()} onMouseDown={close} />
      <div
        ref={panelRef}
        className={[panel.panel, styles.panel, closing ? panel.panelOut : ''].join(' ')}
        role="dialog"
        aria-modal="true"
        aria-label={editing ? `Edit ${bu.name}` : `${bu.name} business unit`}
        tabIndex={-1}
        onAnimationEnd={(e) => {
          if (closing && e.target === e.currentTarget) onClose();
        }}
      >
        <header className={panel.head}>
          <div className={panel.headText}>
            <h2 className={panel.headTitle}>Business Unit Details</h2>
            <p className={panel.headSub}>
              {people} {people === 1 ? 'person' : 'people'} in this business unit
            </p>
          </div>
          {editing ? (
            <button type="submit" form="business-unit-edit" className={panel.saveBtn} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
              <img src="/admin/user/check.svg" alt="" width={24} height={24} />
            </button>
          ) : (
            <div className={panel.headActions}>
              <button type="button" className={panel.editBtn} aria-label="Edit business unit details" onClick={() => setDraft({ name: bu.name, status: bu.status })}>
                <img src="/admin/user/edit-24.svg" alt="" width={24} height={24} />
              </button>
              <button type="button" className={panel.closeBtn} aria-label="Close" onClick={close}>
                <img src="/admin/user/close.svg" alt="" width={24} height={24} />
              </button>
            </div>
          )}
        </header>

        <div className={panel.body}>
          <section className={[panel.hero, styles.hero].join(' ')}>
            <div className={panel.strip} aria-hidden="true" />
            <div className={styles.heroRow}>
              <h3 className={styles.name}>{draft?.name.trim() || bu.name}</h3>
              {editing ? (
                <StatusSelect value={draft.status} label="Business unit status" onChange={(status) => set({ status })} />
              ) : (
                <span className={[panel.status, panel[`status_${bu.status}`]].join(' ')}>{STATUS_LABEL[bu.status]}</span>
              )}
            </div>
          </section>

          {editing && (
            // Only the name is edited; the ID isn't shown.
            <form id="business-unit-edit" className={styles.form} onSubmit={(e) => void save(e)} noValidate>
              <TextField label="Business Unit Name" value={draft.name} onChange={(name) => set({ name })} />
            </form>
          )}

          <DepartmentsSection
            departments={org.departments.filter((d) => d.businessUnitId === bu.id)}
            afterForm={editing}
            onChanged={onChanged}
            onOpenDepartment={onOpenDepartment}
          />
        </div>
      </div>
    </>
  );
}

/** The business unit's departments: search, the count, and a table with each department's ⋯ menu. */
function DepartmentsSection({
  departments,
  afterForm,
  onChanged,
  onOpenDepartment,
}: {
  departments: Department[];
  /** Under the edit form, behind a rule; otherwise straight under the band. */
  afterForm: boolean;
  onChanged: () => Promise<void>;
  onOpenDepartment: (departmentId: string) => void;
}) {
  const toast = useToast();
  const [query, setQuery] = useState('');
  const rowMenu = useRowMenu(ROW_MENU_HEIGHT);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? departments.filter((d) => `${d.name} ${d.code}`.toLowerCase().includes(q)) : departments;
  }, [departments, query]);

  async function setStatus(d: Department, status: UserStatus) {
    try {
      await adminApi.setOrgStatus('departments', d.id, status);
      await onChanged().catch(() => undefined);
      toast(
        status === 'inactive'
          ? { title: `${d.name} was archived!`, description: <>The <strong>{d.name}</strong> department is now inactive</> }
          : { title: `${d.name} was restored!`, description: <>The <strong>{d.name}</strong> department is active again</> },
      );
    } catch (err) {
      toast({ tone: 'error', title: `Couldn’t update ${d.name}`, description: err instanceof Error ? err.message : 'Please try again.' });
    }
  }

  return (
    <section className={[styles.units, afterForm ? styles.unitsAfterForm : styles.unitsBare].join(' ')} aria-labelledby="business-unit-departments">
      <h3 id="business-unit-departments" className={styles.unitsTitle}>
        Departments
      </h3>
      <div className={styles.unitsBar}>
        <label className={panel.search}>
          <span className={panel.srOnly}>Search departments</span>
          <input value={query} placeholder="Search Departments" onChange={(e) => setQuery(e.target.value)} />
          <img src="/admin/search.svg" alt="" width={20} height={20} />
        </label>
        <span className={styles.unitCount}>
          {departments.length} {departments.length === 1 ? 'Department' : 'Departments'}
        </span>
      </div>

      <div className={styles.card}>
        <div role="table" aria-label="Departments in this business unit">
          <div className={[styles.headRow, styles.departmentCols].join(' ')} role="row">
            <span role="columnheader">ID</span>
            <span role="columnheader">DEPARTMENTS</span>
            <span role="columnheader">STATUS</span>
            <span role="columnheader" className={panel.srOnly}>
              Actions
            </span>
          </div>
          {shown.length === 0 && (
            <p className={styles.empty}>{departments.length === 0 ? 'No departments in this business unit yet.' : `No departments match “${query.trim()}”.`}</p>
          )}
          {shown.map((d) => (
            <div key={d.id} className={[styles.row, styles.departmentCols, d.status === 'inactive' ? table.rowInactive : ''].join(' ').trim()} role="row">
              <span role="cell">
                <span className={table.code}>#{d.code}</span>
              </span>
              <span role="cell" className={styles.unitName} title={d.name}>
                {d.name}
              </span>
              <span role="cell">
                <span className={[ui.badge, table[`status_${d.status}`]].join(' ')}>{STATUS_LABEL[d.status]}</span>
              </span>
              <span role="cell" className={styles.actions}>
                <div className={ui.filterWrap} ref={rowMenu.menu?.id === d.id ? rowMenu.ref : undefined}>
                  <button
                    type="button"
                    className={ui.iconBtn}
                    aria-label={`More actions for ${d.name}`}
                    aria-haspopup="menu"
                    aria-expanded={rowMenu.menu?.id === d.id}
                    onClick={(e) => rowMenu.open(d.id, e.currentTarget)}
                  >
                    <img src="/admin/more.svg" alt="" width={20} height={20} />
                  </button>
                  {rowMenu.menu?.id === d.id && (
                    <RowMenu state={rowMenu} className={table.menu}>
                      <button
                        type="button"
                        role="menuitem"
                        className={table.menuItem}
                        onClick={() => {
                          rowMenu.close();
                          onOpenDepartment(d.id);
                        }}
                      >
                        View details
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        className={table.menuItem}
                        onClick={() => {
                          rowMenu.close();
                          void setStatus(d, d.status === 'active' ? 'inactive' : 'active');
                        }}
                      >
                        {d.status === 'active' ? 'Archive department' : 'Restore department'}
                      </button>
                    </RowMenu>
                  )}
                </div>
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
