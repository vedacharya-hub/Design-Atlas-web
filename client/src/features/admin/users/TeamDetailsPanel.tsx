import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
// Shared controls, the user table, then the side panel shell; this panel's own rules last.
import ui from '../AdminControls.module.css';
import table from './UsersPanel.module.css';
import panel from './UserDetailsPanel.module.css';
import fieldStyles from './UserFormFields.module.css';
import styles from './TeamDetailsPanel.module.css';
import { adminApi } from '../../../api/adminApi';
import type { AdminUser, OrgChart, Team, UserStatus } from '../../../api/types';
import { useToast } from '../Toaster';
import { SelectField, TextField, UserSelectField } from './UserFormFields';
import { StatusSelect, pageList } from './UserDetailsPanel';
import { STATUS_LABEL, avatarSrc, teamMembers } from './userShared';
import { useRowMenu } from './useRowMenu';
import { RowMenu } from './RowMenu';
import { ArchiveTeamDialog } from './ArchiveTeamDialog';

type TeamTab = 'general' | 'members';

/** Members per page (Figma 1588:123241). */
const PAGE_SIZE = 8;
/** Room for the member row menu (three items). */
const ROW_MENU_HEIGHT = 140;

interface Draft {
  name: string;
  businessUnitId: string;
  departmentId: string;
  managerId: string;
  status: UserStatus;
}

interface Props {
  teamId: string;
  org: OrgChart;
  users: AdminUser[];
  startEditing?: boolean;
  onClose: () => void;
  /** After a save or a member change: reload the structure and the directory. */
  onChanged: () => Promise<void>;
  /** "View details" on a member: their user panel takes over. */
  onOpenUser: (userId: string) => void;
}

/**
 * Team Details (Figma 1588:123061 General, 1588:123241 Team Members) and its edit view
 * (1588:123907), in the same right-hand panel as user details.
 */
export function TeamDetailsPanel({ teamId, org, users, startEditing = false, onClose, onChanged, onOpenUser }: Props) {
  const team = org.teams.find((t) => t.id === teamId);
  const toast = useToast();
  const [tab, setTab] = useState<TeamTab>('general');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  // Saving would archive the team: waiting on the confirmation.
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [closing, setClosing] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const startedEditing = useRef(false);

  const dept = team ? org.departments.find((d) => d.id === team.departmentId) : undefined;
  const bu = dept ? org.businessUnits.find((b) => b.id === dept.businessUnitId) : undefined;
  const members = useMemo(() => (team ? teamMembers(team, users) : []), [team, users]);
  const manager = team?.managerId ? users.find((u) => u.id === team.managerId) : undefined;

  function startEdit() {
    if (!team) return;
    setDraft({ name: team.name, businessUnitId: dept?.businessUnitId ?? '', departmentId: team.departmentId, managerId: team.managerId ?? '', status: team.status });
  }

  useEffect(() => {
    if (startEditing && !startedEditing.current) {
      startedEditing.current = true;
      startEdit();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startEditing]);

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

  // The team went away (e.g. the data was reloaded without it).
  if (!team) return null;

  const close = () => setClosing(true);
  const editing = draft !== null;
  const set = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d));

  /** Save checks the edit, and asks first when it would archive the team. */
  function save(e?: FormEvent) {
    e?.preventDefault();
    if (!draft || !team || saving) return;
    if (!draft.name.trim()) return toast({ tone: 'error', title: 'The team needs a name', description: 'Add a team name, then save again.' });
    if (!draft.departmentId) return toast({ tone: 'error', title: 'Choose a department', description: 'A team sits inside a department. Pick one, then save again.' });
    if (team.status === 'active' && draft.status === 'inactive') return setConfirmArchive(true);
    void commit();
  }

  /** Sends the edit; true when it went through. */
  async function commit(): Promise<boolean> {
    if (!draft || !team) return false;
    const name = draft.name.trim();
    const archived = team.status === 'active' && draft.status === 'inactive';
    setSaving(true);
    try {
      await adminApi.updateOrgUnit('teams', team.id, {
        name,
        departmentId: draft.departmentId,
        managerId: draft.managerId || null,
        status: draft.status,
      });
      await onChanged();
      setDraft(null);
      toast(
        archived
          ? { title: `${name} was archived!`, description: <>The <strong>{name}</strong> team is now inactive</> }
          : { title: `${name} was updated!`, description: <>Saved your changes to the <strong>{name}</strong> Team</> },
      );
      return true;
    } catch (err) {
      toast({ tone: 'error', title: `Couldn’t save ${team.name}`, description: err instanceof Error ? err.message : 'Something went wrong. Please try again.' });
      return false;
    } finally {
      setSaving(false);
    }
  }

  const activeBus = org.businessUnits.filter((b) => b.status === 'active');
  const deptChoices = draft
    ? org.departments.filter((d) => (d.status === 'active' || d.id === draft.departmentId) && (!draft.businessUnitId || d.businessUnitId === draft.businessUnitId))
    : [];

  return (
    <>
      <div className={[panel.backdrop, closing ? panel.backdropOut : ''].join(' ').trim()} onMouseDown={close} />
      <div
        ref={panelRef}
        className={[panel.panel, closing ? panel.panelOut : ''].join(' ').trim()}
        role="dialog"
        aria-modal="true"
        aria-label={editing ? `Edit ${team.name}` : `${team.name} team`}
        tabIndex={-1}
        onAnimationEnd={(e) => {
          if (closing && e.target === e.currentTarget) onClose();
        }}
      >
        <header className={panel.head}>
          <div className={panel.headText}>
            <h2 className={panel.headTitle}>Team Details</h2>
            <p className={panel.headSub}>{[bu?.name, dept?.name].filter(Boolean).join(' • ')}</p>
          </div>
          {editing ? (
            <button type="submit" form="team-edit" className={panel.saveBtn} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
              <img src="/admin/user/check.svg" alt="" width={24} height={24} />
            </button>
          ) : (
            <div className={panel.headActions}>
              <button
                type="button"
                className={panel.editBtn}
                aria-label="Edit team details"
                onClick={() => {
                  setTab('general');
                  startEdit();
                }}
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
              <h3 className={styles.teamName}>{draft?.name.trim() || team.name}</h3>
              {editing ? (
                <StatusSelect value={draft.status} label="Team status" onChange={(status) => set({ status })} />
              ) : (
                <span className={[panel.status, panel[`status_${team.status}`]].join(' ')}>{STATUS_LABEL[team.status]}</span>
              )}
            </div>
            <div className={[panel.tabs, styles.tabs].join(' ')} role="tablist" aria-label="Team details">
              <button type="button" role="tab" aria-selected={tab === 'general'} className={[panel.tab, panel.tab_general, tab === 'general' ? panel.tabActive : ''].join(' ')} onClick={() => setTab('general')}>
                General
              </button>
              <button type="button" role="tab" aria-selected={tab === 'members'} className={[panel.tab, styles.tabMembers, tab === 'members' ? panel.tabActive : ''].join(' ')} onClick={() => setTab('members')}>
                Team Members
              </button>
            </div>
          </section>

          {tab === 'general' && !draft && (
            <div className={panel.content}>
              <dl className={panel.grid}>
                <Item label="TEAM ID" value={`#${team.code}`} />
                <Item label="DEPARTMENT" value={dept?.name ?? '-'} />
                <Item label="BUSINESS UNIT" value={bu?.name ?? '-'} />
                <Item label="TOTAL MEMBERS" value={String(members.length)} />
                <div className={panel.item}>
                  <dt className={panel.label}>MANAGER</dt>
                  <dd className={styles.managerValue}>
                    {manager ? (
                      <span className={table.user}>
                        <img className={table.avatar} src={avatarSrc(manager)} alt="" width={40} height={40} />
                        <span className={table.userText}>
                          <span className={table.name}>{manager.name}</span>
                          <span className={table.email}>{manager.email}</span>
                        </span>
                      </span>
                    ) : (
                      <span className={panel.value}>-</span>
                    )}
                  </dd>
                </div>
              </dl>
            </div>
          )}

          {tab === 'general' && draft && (
            <form id="team-edit" className={[panel.content, styles.form].join(' ')} onSubmit={(e) => void save(e)} noValidate>
              <div className={panel.formGrid}>
                <TextField label="Team ID" value={`#${team.code}`} readOnly />
                <TextField label="Team Name" value={draft.name} onChange={(name) => set({ name })} />
                <SelectField
                  required
                  label="Business Unit"
                  value={draft.businessUnitId}
                  choices={activeBus.map((b) => ({ value: b.id, label: b.name }))}
                  onChange={(businessUnitId) => {
                    const current = org.departments.find((d) => d.id === draft.departmentId);
                    set({ businessUnitId, departmentId: current?.businessUnitId === businessUnitId ? draft.departmentId : '' });
                  }}
                />
                <SelectField
                  required
                  label="Department"
                  value={draft.departmentId}
                  choices={deptChoices.map((d) => ({ value: d.id, label: d.name }))}
                  onChange={(departmentId) => {
                    const next = org.departments.find((d) => d.id === departmentId);
                    set({ departmentId, businessUnitId: next?.businessUnitId ?? draft.businessUnitId });
                  }}
                />
                <UserSelectField label="Manager" value={draft.managerId} users={users} onChange={(managerId) => set({ managerId })} />
                <div className={fieldStyles.field}>
                  <span className={fieldStyles.label}>Total Members</span>
                  <span className={styles.plainValue}>{members.length}</span>
                </div>
              </div>
            </form>
          )}

          {tab === 'members' && (
            <MembersTab
              team={team}
              members={members}
              onOpenUser={onOpenUser}
              onChanged={onChanged}
            />
          )}
        </div>
      </div>

      {confirmArchive && (
        <ArchiveTeamDialog
          teamName={team.name}
          memberCount={members.length}
          onCancel={() => setConfirmArchive(false)}
          onConfirm={async () => {
            const done = await commit();
            if (done) setConfirmArchive(false);
            return done;
          }}
        />
      )}
    </>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div className={panel.item}>
      <dt className={panel.label}>{label}</dt>
      <dd className={panel.value}>{value}</dd>
    </div>
  );
}

/** Team Members: search, the member count, and a paged table with each member's ⋯ menu. */
function MembersTab({
  team,
  members,
  onOpenUser,
  onChanged,
}: {
  team: Team;
  members: AdminUser[];
  onOpenUser: (userId: string) => void;
  onChanged: () => Promise<void>;
}) {
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const rowMenu = useRowMenu(ROW_MENU_HEIGHT);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? members.filter((u) => `${u.name} ${u.email} ${u.code}`.toLowerCase().includes(q)) : members;
  }, [members, query]);
  const pages = Math.max(1, Math.ceil(shown.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const rows = shown.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  async function makeManager(u: AdminUser) {
    try {
      await adminApi.updateOrgUnit('teams', team.id, { managerId: u.id });
      await onChanged();
      toast({ title: `${u.name} is now the manager!`, description: <><strong>{u.name}</strong> now leads the {team.name} Team</> });
    } catch (err) {
      toast({ tone: 'error', title: `Couldn’t make ${u.name} the manager`, description: err instanceof Error ? err.message : 'Please try again.' });
    }
  }

  /** Takes them out of the team (and off as manager, if they were). */
  async function remove(u: AdminUser) {
    try {
      if (u.team === team.name) await adminApi.updateUser(u.id, { team: '' });
      if (team.managerId === u.id) await adminApi.updateOrgUnit('teams', team.id, { managerId: null });
      await onChanged();
      toast({ title: `${u.name} was removed!`, description: <>Removed <strong>{u.name}</strong> from the {team.name} Team</> });
    } catch (err) {
      toast({ tone: 'error', title: `Couldn’t remove ${u.name}`, description: err instanceof Error ? err.message : 'Please try again.' });
    }
  }

  return (
    <div className={styles.members}>
      <div className={styles.membersBar}>
        <label className={panel.search}>
          <span className={panel.srOnly}>Search members</span>
          <input
            value={query}
            placeholder="Search Members"
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
          />
          <img src="/admin/search.svg" alt="" width={20} height={20} />
        </label>
        <span className={styles.memberCount}>
          {members.length} {members.length === 1 ? 'Member' : 'Members'}
        </span>
      </div>

      <div className={styles.card}>
        <div className={styles.table} role="table" aria-label={`${team.name} members`}>
          <div className={styles.headRow} role="row">
            <span role="columnheader">ID</span>
            <span role="columnheader">USER</span>
            <span role="columnheader">ROLE</span>
            <span role="columnheader">STATUS</span>
            <span role="columnheader" className={panel.srOnly}>
              Actions
            </span>
          </div>
          {rows.length === 0 && <p className={styles.empty}>{members.length === 0 ? 'No one is in this team yet.' : `No members match “${query.trim()}”.`}</p>}
          {rows.map((u) => {
            const isManager = team.managerId === u.id;
            return (
              <div key={u.id} className={[styles.row, u.status === 'inactive' ? table.rowInactive : ''].join(' ').trim()} role="row">
                <span role="cell">
                  <span className={table.code}>#{u.code}</span>
                </span>
                <span role="cell" className={table.user}>
                  <img className={table.avatar} src={avatarSrc(u)} alt="" width={40} height={40} />
                  <span className={table.userText}>
                    <span className={table.name}>{u.name}</span>
                    <span className={table.email} title={u.email}>
                      {u.email}
                    </span>
                  </span>
                </span>
                <span role="cell" className={table.cell}>
                  {isManager ? 'Manager' : u.role}
                </span>
                <span role="cell">
                  <span className={[ui.badge, table[`status_${u.status}`]].join(' ')}>{STATUS_LABEL[u.status]}</span>
                </span>
                <span role="cell" className={styles.actions}>
                  <div className={ui.filterWrap} ref={rowMenu.menu?.id === u.id ? rowMenu.ref : undefined}>
                    <button
                      type="button"
                      className={ui.iconBtn}
                      aria-label={`More actions for ${u.name}`}
                      aria-haspopup="menu"
                      aria-expanded={rowMenu.menu?.id === u.id}
                      onClick={(e) => rowMenu.open(u.id, e.currentTarget)}
                    >
                      <img src="/admin/more.svg" alt="" width={20} height={20} />
                    </button>
                    {rowMenu.menu?.id === u.id && (
                      <RowMenu state={rowMenu} className={[table.menu, styles.menu].join(' ')}>
                        <button
                          type="button"
                          role="menuitem"
                          className={table.menuItem}
                          onClick={() => {
                            rowMenu.close();
                            onOpenUser(u.id);
                          }}
                        >
                          View details
                        </button>
                        {!isManager && (
                          <button
                            type="button"
                            role="menuitem"
                            className={table.menuItem}
                            onClick={() => {
                              rowMenu.close();
                              void makeManager(u);
                            }}
                          >
                            Make team manager
                          </button>
                        )}
                        <button
                          type="button"
                          role="menuitem"
                          className={[table.menuItem, table.menuItemDanger].join(' ')}
                          onClick={() => {
                            rowMenu.close();
                            void remove(u);
                          }}
                        >
                          Remove from team
                        </button>
                      </RowMenu>
                    )}
                  </div>
                </span>
              </div>
            );
          })}
        </div>

        {pages > 1 && (
          <nav className={[panel.pagination, styles.pagination].join(' ')} aria-label="Pages">
            <button type="button" className={panel.pageStep} disabled={current === 1} onClick={() => setPage(current - 1)}>
              <img src="/admin/user/arrow-left.svg" alt="" width={20} height={20} />
              Previous
            </button>
            <span className={panel.pageNumbers}>
              {pageList(current, pages).map((p, i) =>
                p === 'gap' ? (
                  <span key={`gap-${i}`} className={panel.pageNumber} aria-hidden="true">
                    ...
                  </span>
                ) : (
                  <button
                    key={p}
                    type="button"
                    className={[panel.pageNumber, p === current ? panel.pageNumberOn : ''].join(' ').trim()}
                    aria-label={`Page ${p}`}
                    aria-current={p === current ? 'page' : undefined}
                    onClick={() => setPage(p)}
                  >
                    {p}
                  </button>
                ),
              )}
            </span>
            <button type="button" className={panel.pageStep} disabled={current === pages} onClick={() => setPage(current + 1)}>
              Next
              <img src="/admin/user/arrow-forward.svg" alt="" width={20} height={20} />
            </button>
          </nav>
        )}
      </div>
    </div>
  );
}
