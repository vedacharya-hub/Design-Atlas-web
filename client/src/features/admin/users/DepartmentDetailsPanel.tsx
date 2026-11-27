import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
// Shared controls, the user table, then the side panel shell; this panel's own rules last.
import ui from '../AdminControls.module.css';
import table from './UsersPanel.module.css';
import panel from './UserDetailsPanel.module.css';
import styles from './OrgUnitPanel.module.css';
import { adminApi } from '../../../api/adminApi';
import type { AdminUser, OrgChart, Team, UserStatus } from '../../../api/types';
import { useToast } from '../Toaster';
import { SelectField, TextField } from './UserFormFields';
import { StatusSelect } from './UserDetailsPanel';
import { STATUS_LABEL, teamMembers } from './userShared';
import { useRowMenu } from './useRowMenu';
import { RowMenu } from './RowMenu';
import { ArchiveTeamDialog } from './ArchiveTeamDialog';

/** Room for the team row menu (two items). */
const ROW_MENU_HEIGHT = 106;

interface Draft {
  name: string;
  businessUnitId: string;
  status: UserStatus;
}

interface Props {
  departmentId: string;
  org: OrgChart;
  users: AdminUser[];
  onClose: () => void;
  /** After a save or a team change: reload the structure and the directory. */
  onChanged: () => Promise<void>;
  /** "View details" on a team: its panel takes over. */
  onOpenTeam: (teamId: string) => void;
}

/**
 * Department Details (Figma 1588:131829) and its edit view (1588:132059), in the same right-hand
 * panel as user and team details: the department's ID and business unit, then its teams. Editing
 * changes the name, the business unit and the status.
 */
export function DepartmentDetailsPanel({ departmentId, org, users, onClose, onChanged, onOpenTeam }: Props) {
  const dept = org.departments.find((d) => d.id === departmentId);
  const toast = useToast();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [closing, setClosing] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Escape backs out of editing first, then closes. Menus and dialogs inside claim it before this.
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

  // The department went away (e.g. the data was reloaded without it).
  if (!dept) return null;

  const bu = org.businessUnits.find((b) => b.id === dept.businessUnitId);
  const editing = draft !== null;
  const close = () => setClosing(true);
  const set = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  const buChoices = org.businessUnits.filter((b) => b.status === 'active' || b.id === dept.businessUnitId);

  async function save(e?: FormEvent) {
    e?.preventDefault();
    if (!draft || !dept || saving) return;
    const name = draft.name.trim();
    if (!name) return toast({ tone: 'error', title: 'The department needs a name', description: 'Add a department name, then save again.' });
    if (!draft.businessUnitId) return toast({ tone: 'error', title: 'Choose a business unit', description: 'A department sits inside a business unit. Pick one, then save again.' });
    const archived = dept.status === 'active' && draft.status === 'inactive';
    setSaving(true);
    try {
      await adminApi.updateOrgUnit('departments', dept.id, { name, businessUnitId: draft.businessUnitId, status: draft.status });
      await onChanged();
      setDraft(null);
      toast(
        archived
          ? { title: `${name} was archived!`, description: <>The <strong>{name}</strong> department is now inactive</> }
          : { title: `${name} was updated!`, description: <>Saved your changes to the <strong>{name}</strong> Department</> },
      );
    } catch (err) {
      toast({ tone: 'error', title: `Couldn’t save ${dept.name}`, description: err instanceof Error ? err.message : 'Something went wrong. Please try again.' });
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
        aria-label={editing ? `Edit ${dept.name}` : `${dept.name} department`}
        tabIndex={-1}
        onAnimationEnd={(e) => {
          if (closing && e.target === e.currentTarget) onClose();
        }}
      >
        <header className={panel.head}>
          <div className={panel.headText}>
            <h2 className={panel.headTitle}>Department Details</h2>
            <p className={panel.headSub}>{bu?.name ?? 'No business unit'}</p>
          </div>
          {editing ? (
            <button type="submit" form="department-edit" className={panel.saveBtn} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
              <img src="/admin/user/check.svg" alt="" width={24} height={24} />
            </button>
          ) : (
            <div className={panel.headActions}>
              <button
                type="button"
                className={panel.editBtn}
                aria-label="Edit department details"
                onClick={() => setDraft({ name: dept.name, businessUnitId: dept.businessUnitId, status: dept.status })}
              >
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
              <h3 className={styles.name}>{draft?.name.trim() || dept.name}</h3>
              {editing ? (
                <StatusSelect value={draft.status} label="Department status" onChange={(status) => set({ status })} />
              ) : (
                <span className={[panel.status, panel[`status_${dept.status}`]].join(' ')}>{STATUS_LABEL[dept.status]}</span>
              )}
            </div>
          </section>

          {editing ? (
            // Name and business unit, one above the other; the ID isn't edited.
            <form id="department-edit" className={styles.form} onSubmit={(e) => void save(e)} noValidate>
              <TextField label="Department Name" value={draft.name} onChange={(name) => set({ name })} />
              <SelectField
                required
                label="Business Unit"
                value={draft.businessUnitId}
                choices={buChoices.map((b) => ({ value: b.id, label: b.name }))}
                onChange={(businessUnitId) => set({ businessUnitId })}
              />
            </form>
          ) : (
            <dl className={[panel.grid, styles.details].join(' ')}>
              <div className={panel.item}>
                <dt className={panel.label}>DEPARTMENT ID</dt>
                <dd className={panel.value}>#{dept.code}</dd>
              </div>
              <div className={panel.item}>
                <dt className={panel.label}>BUSINESS UNIT</dt>
                <dd className={panel.value}>{bu?.name ?? '-'}</dd>
              </div>
            </dl>
          )}

          <TeamsSection teams={org.teams.filter((t) => t.departmentId === dept.id)} users={users} onChanged={onChanged} onOpenTeam={onOpenTeam} />
        </div>
      </div>
    </>
  );
}

/** The department's teams: search, the count, and a table with each team's ⋯ menu. */
function TeamsSection({
  teams,
  users,
  onChanged,
  onOpenTeam,
}: {
  teams: Team[];
  users: AdminUser[];
  onChanged: () => Promise<void>;
  onOpenTeam: (teamId: string) => void;
}) {
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [archiving, setArchiving] = useState<Team | null>(null);
  const rowMenu = useRowMenu(ROW_MENU_HEIGHT);

  const count = (t: Team) => teamMembers(t, users).length;
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? teams.filter((t) => `${t.name} ${t.code}`.toLowerCase().includes(q)) : teams;
  }, [teams, query]);

  /** Archives or restores a team; true when it went through. */
  async function setStatus(t: Team, status: UserStatus): Promise<boolean> {
    try {
      await adminApi.setOrgStatus('teams', t.id, status);
      await onChanged().catch(() => undefined);
      toast(
        status === 'inactive'
          ? { title: `${t.name} was archived!`, description: <>The <strong>{t.name}</strong> team is now inactive</> }
          : { title: `${t.name} was restored!`, description: <>The <strong>{t.name}</strong> team is active again</> },
      );
      return true;
    } catch (err) {
      toast({ tone: 'error', title: `Couldn’t update ${t.name}`, description: err instanceof Error ? err.message : 'Please try again.' });
      return false;
    }
  }

  return (
    <section className={styles.units} aria-labelledby="department-teams">
      <h3 id="department-teams" className={styles.unitsTitle}>
        Teams
      </h3>
      <div className={styles.unitsBar}>
        <label className={panel.search}>
          <span className={panel.srOnly}>Search teams</span>
          <input value={query} placeholder="Search Teams" onChange={(e) => setQuery(e.target.value)} />
          <img src="/admin/search.svg" alt="" width={20} height={20} />
        </label>
        <span className={styles.unitCount}>
          {teams.length} {teams.length === 1 ? 'Team' : 'Teams'}
        </span>
      </div>

      <div className={styles.card}>
        <div role="table" aria-label="Teams in this department">
          <div className={[styles.headRow, styles.teamCols].join(' ')} role="row">
            <span role="columnheader">ID</span>
            <span role="columnheader">TEAM</span>
            <span role="columnheader">MEMBERS</span>
            <span role="columnheader">STATUS</span>
            <span role="columnheader" className={panel.srOnly}>
              Actions
            </span>
          </div>
          {shown.length === 0 && <p className={styles.empty}>{teams.length === 0 ? 'No teams in this department yet.' : `No teams match “${query.trim()}”.`}</p>}
          {shown.map((t) => (
            <div key={t.id} className={[styles.row, styles.teamCols, t.status === 'inactive' ? table.rowInactive : ''].join(' ').trim()} role="row">
              <span role="cell">
                <span className={table.code}>#{t.code}</span>
              </span>
              <span role="cell" className={styles.unitName} title={t.name}>
                {t.name}
              </span>
              <span role="cell" className={styles.members}>
                {count(t)}
              </span>
              <span role="cell">
                <span className={[ui.badge, table[`status_${t.status}`]].join(' ')}>{STATUS_LABEL[t.status]}</span>
              </span>
              <span role="cell" className={styles.actions}>
                <div className={ui.filterWrap} ref={rowMenu.menu?.id === t.id ? rowMenu.ref : undefined}>
                  <button
                    type="button"
                    className={ui.iconBtn}
                    aria-label={`More actions for ${t.name}`}
                    aria-haspopup="menu"
                    aria-expanded={rowMenu.menu?.id === t.id}
                    onClick={(e) => rowMenu.open(t.id, e.currentTarget)}
                  >
                    <img src="/admin/more.svg" alt="" width={20} height={20} />
                  </button>
                  {rowMenu.menu?.id === t.id && (
                    <RowMenu state={rowMenu} className={table.menu}>
                      <button
                        type="button"
                        role="menuitem"
                        className={table.menuItem}
                        onClick={() => {
                          rowMenu.close();
                          onOpenTeam(t.id);
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
                          // Archiving a team asks first, as on the Teams tab.
                          if (t.status === 'active') setArchiving(t);
                          else void setStatus(t, 'active');
                        }}
                      >
                        {t.status === 'active' ? 'Archive team' : 'Restore team'}
                      </button>
                    </RowMenu>
                  )}
                </div>
              </span>
            </div>
          ))}
        </div>
      </div>

      {archiving && (
        <ArchiveTeamDialog
          teamName={archiving.name}
          memberCount={count(archiving)}
          onCancel={() => setArchiving(null)}
          onConfirm={async () => {
            const done = await setStatus(archiving, 'inactive');
            if (done) setArchiving(null);
            return done;
          }}
        />
      )}
    </section>
  );
}
