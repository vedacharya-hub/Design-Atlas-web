import { useMemo, useRef, useState, type CSSProperties } from 'react';
// Shared controls first, then the Users table styles, so this tab's own rules win.
import ui from '../AdminControls.module.css';
import styles from './UsersPanel.module.css';
import orgStyles from './OrgUnitsTab.module.css';
import { adminApi } from '../../../api/adminApi';
import { useToast } from '../Toaster';
import { AddOrgUnitDialog } from './AddOrgUnitDialog';
import { ArchiveTeamDialog } from './ArchiveTeamDialog';
import { TeamDetailsPanel } from './TeamDetailsPanel';
import { DepartmentDetailsPanel } from './DepartmentDetailsPanel';
import { BusinessUnitDetailsPanel } from './BusinessUnitDetailsPanel';
import { STATUSES, STATUS_LABEL, teamMembers } from './userShared';
import { downloadCsv, useDismiss, useRowMenu } from './useRowMenu';
import { RowMenu } from './RowMenu';
import type { AdminUser, OrgChart, OrgKind, UserStatus } from '../../../api/types';

export type OrgTab = 'teams' | 'departments' | 'businessUnits';

/** Narrows a tab to what sits under one unit, after drilling down from the level above. */
export interface OrgScope {
  field: 'businessUnit' | 'department' | 'team';
  value: string;
}
export const SCOPE_LABEL: Record<OrgScope['field'], string> = { businessUnit: 'Business Unit', department: 'Department', team: 'Team' };

const API_KIND: Record<OrgTab, OrgKind> = { teams: 'teams', departments: 'departments', businessUnits: 'business-units' };

/** One table per level (Figma 1578:126972 Teams, 1578:127078 Department, 1578:127166 Business Unit). */
const CONFIG: Record<
  OrgTab,
  {
    title: string;
    noun: string;
    add: string;
    search: string;
    searchWidth: number;
    columns: [string, number][];
    /** The row menu's link to the level below, narrowed to the row. */
    drill?: string;
    parent?: OrgScope['field'];
  }
> = {
  teams: {
    title: 'Teams',
    noun: 'team',
    add: 'Add Team',
    search: 'Search by team, department or BU',
    searchWidth: 273,
    columns: [['ID', 120], ['TEAM', 148], ['MEMBERS', 148], ['DEPARTMENT', 148], ['BUSINESS UNIT', 148], ['STATUS', 100]],
    parent: 'department',
  },
  departments: {
    title: 'Department',
    noun: 'department',
    add: 'Add Department',
    search: 'Search by department or BU',
    searchWidth: 236,
    columns: [['ID', 120], ['DEPARTMENT', 148], ['TEAMS', 148], ['BUSINESS UNIT', 148], ['STATUS', 148]],
    drill: 'View teams',
    parent: 'businessUnit',
  },
  businessUnits: {
    title: 'Business Unit',
    noun: 'business unit',
    add: 'Add Business Unit',
    search: 'Search by BU',
    searchWidth: 240,
    columns: [['ID', 120], ['BUSINESS UNIT', 180], ['DEPARTMENTS', 180], ['STATUS', 100]],
    drill: 'View departments',
  },
};

/** A unit as a table row, whichever level it's from. */
interface OrgRow {
  id: string;
  code: string;
  name: string;
  status: UserStatus;
  /** Members of a team, teams of a department, departments of a business unit. */
  count: number;
  department: string;
  businessUnit: string;
}

/** Room for the row menu: two items, or three with the link to the level below. */
const ROW_MENU_HEIGHT = 106;
const ROW_MENU_HEIGHT_DRILL = 140;

interface Props {
  kind: OrgTab;
  org: OrgChart | null;
  users: AdminUser[];
  loadError: string;
  scope: OrgScope | null;
  onClearScope: () => void;
  /** A row was opened: show the level below, narrowed to it. */
  onDrill: (kind: OrgTab, name: string) => void;
  onOrgChange: (org: OrgChart) => void;
  /** Reload the structure and the directory (after a team edit carries through to its members). */
  onRefresh: () => Promise<void>;
  /** Open a user's details panel (from a team's member list). */
  onOpenUser: (userId: string) => void;
}

/**
 * Teams, Department and Business Unit under Admin → Users: the same sub-header (search, filter, ⋯,
 * add) and table for each level of Business Unit → Department → Team → users. Opening a row shows
 * its details in a panel from the right; a department's or business unit's row menu can also move
 * one level down, narrowed to it.
 */
export function OrgUnitsTab({ kind, org, users, loadError, scope, onClearScope, onDrill, onOrgChange, onRefresh, onOpenUser }: Props) {
  const config = CONFIG[kind];
  const toast = useToast();
  // The team whose details panel is open.
  const [teamPanel, setTeamPanel] = useState<string | null>(null);
  // The team waiting on the archive confirmation.
  const [archiving, setArchiving] = useState<OrgRow | null>(null);
  // The department or business unit whose details panel is open.
  const [deptPanel, setDeptPanel] = useState<string | null>(null);
  const [buPanel, setBuPanel] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [statuses, setStatuses] = useState<Set<UserStatus>>(new Set());
  const [parents, setParents] = useState<Set<string>>(new Set());
  const [filterOpen, setFilterOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLDivElement>(null);
  const rowMenu = useRowMenu(config.drill ? ROW_MENU_HEIGHT_DRILL : ROW_MENU_HEIGHT);
  useDismiss(filterOpen, filterRef, () => setFilterOpen(false));
  useDismiss(moreOpen, moreRef, () => setMoreOpen(false));

  const rows = useMemo<OrgRow[]>(() => {
    if (!org) return [];
    const buName = (id: string) => org.businessUnits.find((b) => b.id === id)?.name ?? '';
    if (kind === 'teams') {
      return org.teams.map((t) => {
        const dep = org.departments.find((d) => d.id === t.departmentId);
        return {
          ...t,
          count: teamMembers(t, users).length,
          department: dep?.name ?? '',
          businessUnit: dep ? buName(dep.businessUnitId) : '',
        };
      });
    }
    if (kind === 'departments') {
      return org.departments.map((d) => ({
        ...d,
        count: org.teams.filter((t) => t.departmentId === d.id).length,
        department: d.name,
        businessUnit: buName(d.businessUnitId),
      }));
    }
    return org.businessUnits.map((b) => ({
      ...b,
      count: org.departments.filter((d) => d.businessUnitId === b.id).length,
      department: '',
      businessUnit: b.name,
    }));
  }, [org, users, kind]);

  // What the parent filter offers: the departments (Teams) or business units (Department) in use.
  const parentChoices = useMemo(() => {
    if (!config.parent) return [];
    return [...new Set(rows.map((r) => r[config.parent as 'department' | 'businessUnit']).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  }, [rows, config.parent]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (scope && r[scope.field as 'department' | 'businessUnit'] !== scope.value) return false;
      if (statuses.size && !statuses.has(r.status)) return false;
      if (parents.size && config.parent && !parents.has(r[config.parent as 'department' | 'businessUnit'])) return false;
      if (!q) return true;
      return [r.code, r.name, r.department, r.businessUnit].some((v) => v.toLowerCase().includes(q));
    });
  }, [rows, query, statuses, parents, scope, config.parent]);

  const filterCount = statuses.size + parents.size;
  const gridStyle = { '--org-cols': config.columns.map(([, w]) => `${w}px`).join(' ') } as CSSProperties;

  function toggle<T>(set: Set<T>, value: T) {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  }

  /** Archives or restores a row; true when it went through. */
  async function setStatus(row: OrgRow, status: UserStatus): Promise<boolean> {
    if (!org) return false;
    try {
      const next = await adminApi.setOrgStatus(API_KIND[kind], row.id, status);
      const swap = <T extends { id: string }>(list: T[]) => list.map((u) => (u.id === next.id ? { ...u, ...next } : u));
      onOrgChange({
        businessUnits: kind === 'businessUnits' ? swap(org.businessUnits) : org.businessUnits,
        departments: kind === 'departments' ? swap(org.departments) : org.departments,
        teams: kind === 'teams' ? swap(org.teams) : org.teams,
      });
      // Archiving lets its people go (and the levels below it): reload the directory to show it.
      // The archive went through either way, so a failed reload doesn't fail it.
      if (status === 'inactive') await onRefresh().catch(() => undefined);
      toast(
        status === 'inactive'
          ? { title: `${row.name} was archived!`, description: <>The <strong>{row.name}</strong> {config.noun} is now inactive</> }
          : { title: `${row.name} was restored!`, description: <>The <strong>{row.name}</strong> {config.noun} is active again</> },
      );
      return true;
    } catch (err) {
      toast({ tone: 'error', title: `Couldn’t update ${row.name}`, description: err instanceof Error ? err.message : 'Please try again.' });
      return false;
    }
  }

  /** Opens the row's details panel. */
  function open(row: OrgRow) {
    if (kind === 'teams') setTeamPanel(row.id);
    else if (kind === 'departments') setDeptPanel(row.id);
    else setBuPanel(row.id);
  }

  function exportCsv() {
    const header = config.columns.map(([label]) => label);
    downloadCsv(
      `${kind}.csv`,
      header,
      shown.map((r) => {
        const count = String(r.count);
        if (kind === 'teams') return [`#${r.code}`, r.name, count, r.department, r.businessUnit, STATUS_LABEL[r.status]];
        if (kind === 'departments') return [`#${r.code}`, r.name, count, r.businessUnit, STATUS_LABEL[r.status]];
        return [`#${r.code}`, r.name, count, STATUS_LABEL[r.status]];
      }),
    );
    setMoreOpen(false);
  }

  const emptyText = scope
    ? `No ${config.noun === 'business unit' ? 'business units' : `${config.noun}s`} in ${scope.value} match your search or filters.`
    : `No ${config.noun === 'business unit' ? 'business units' : `${config.noun}s`} match your search or filters.`;

  return (
    <>
      <div className={styles.subHeader}>
        <div className={styles.subText}>
          <div className={orgStyles.titleRow}>
            <h2 className={styles.subTitle}>{config.title}</h2>
            {scope && (
              <span className={orgStyles.scope}>
                {SCOPE_LABEL[scope.field]}: {scope.value}
                <button type="button" className={orgStyles.scopeClear} aria-label={`Show all ${config.noun}s`} onClick={onClearScope}>
                  <img src="/admin/user/chip-close.svg" alt="" width={16} height={16} />
                </button>
              </span>
            )}
          </div>
          <p className={styles.subDescription}>Private offices and sittings at WeWork</p>
        </div>
        <div className={styles.controls}>
          <label className={[ui.search, styles.search].join(' ')} style={{ width: config.searchWidth }}>
            <span className={ui.srOnly}>{config.search}</span>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={config.search} />
            <img src="/admin/search.svg" alt="" width={20} height={20} />
          </label>

          <div className={ui.filterWrap} ref={filterRef}>
            <button
              type="button"
              className={[ui.btn, ui.btnSecondary, filterCount ? ui.btnSecondaryOn : ''].join(' ').trim()}
              aria-expanded={filterOpen}
              aria-haspopup="true"
              onClick={() => setFilterOpen((o) => !o)}
            >
              <img src="/admin/filter.svg" alt="" width={24} height={24} />
              Filter
              {filterCount > 0 && <span className={ui.filterCount}>{filterCount}</span>}
            </button>
            {filterOpen && (
              <div className={ui.filterMenu} role="group" aria-label={`Filter ${config.noun}s`}>
                <span className={ui.filterTitle}>Status</span>
                {STATUSES.map((s) => (
                  <label key={s} className={ui.filterOption}>
                    <input type="checkbox" checked={statuses.has(s)} onChange={() => setStatuses((p) => toggle(p, s))} />
                    <span className={[ui.badge, styles[`status_${s}`]].join(' ')}>{STATUS_LABEL[s]}</span>
                  </label>
                ))}
                {config.parent && parentChoices.length > 0 && (
                  <>
                    <span className={ui.filterTitle}>{SCOPE_LABEL[config.parent]}</span>
                    {parentChoices.map((p) => (
                      <label key={p} className={ui.filterOption}>
                        <input type="checkbox" checked={parents.has(p)} onChange={() => setParents((prev) => toggle(prev, p))} />
                        <span className={orgStyles.filterLabel}>{p}</span>
                      </label>
                    ))}
                  </>
                )}
                <button
                  type="button"
                  className={ui.filterClear}
                  disabled={filterCount === 0}
                  onClick={() => {
                    setStatuses(new Set());
                    setParents(new Set());
                  }}
                >
                  Clear filters
                </button>
              </div>
            )}
          </div>

          <div className={ui.filterWrap} ref={moreRef}>
            <button type="button" className={ui.iconBtn} aria-label="More options" aria-expanded={moreOpen} aria-haspopup="menu" onClick={() => setMoreOpen((o) => !o)}>
              <img src="/admin/more.svg" alt="" width={20} height={20} />
            </button>
            {moreOpen && (
              <div className={styles.menu} role="menu">
                <button type="button" role="menuitem" className={styles.menuItem} onClick={exportCsv}>
                  Export as CSV
                </button>
              </div>
            )}
          </div>

          <button type="button" className={[ui.btn, ui.btnPrimary, styles.addBtn].join(' ')} onClick={() => setAdding(true)} disabled={!org}>
            {config.add}
            <img src="/admin/add.svg" alt="" width={20} height={20} />
          </button>
        </div>
      </div>

      <div className={[styles.table, orgStyles.table].join(' ')} role="table" aria-label={config.title} style={gridStyle}>
        <div className={styles.headRow} role="row">
          <div className={orgStyles.cols} role="presentation">
            {config.columns.map(([label]) => (
              <span key={label} role="columnheader">
                {label}
              </span>
            ))}
          </div>
          <span role="columnheader" className={[styles.actions, orgStyles.actions].join(' ')}>
            <span className={ui.srOnly}>Actions</span>
          </span>
        </div>

        {!org && !loadError && <p className={ui.empty}>Loading…</p>}
        {loadError && <p className={ui.empty}>{loadError}</p>}
        {org && shown.length === 0 && <p className={ui.empty}>{emptyText}</p>}

        {shown.map((r) => (
          <div
            key={r.id}
            className={[styles.row, r.status === 'inactive' ? styles.rowInactive : ''].join(' ').trim()}
            role="row"
            tabIndex={0}
            aria-label={`${r.name}, view details`}
            onClick={() => open(r)}
            onKeyDown={(e) => {
              if (e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return;
              e.preventDefault();
              open(r);
            }}
          >
            <div className={orgStyles.cols} role="presentation">
              <span role="cell">
                <span className={styles.code}>#{r.code}</span>
              </span>
              <span role="cell" className={orgStyles.name} title={r.name}>
                {r.name}
              </span>
              <span role="cell" className={styles.cell}>
                {r.count}
              </span>
              {kind === 'teams' && (
                <span role="cell" className={styles.cell} title={r.department}>
                  {r.department || '-'}
                </span>
              )}
              {kind !== 'businessUnits' && (
                <span role="cell" className={styles.cell} title={r.businessUnit}>
                  {r.businessUnit || '-'}
                </span>
              )}
              <span role="cell">
                <span className={[ui.badge, styles[`status_${r.status}`]].join(' ')}>{STATUS_LABEL[r.status]}</span>
              </span>
            </div>
            {/* The ⋯ menu acts on its own; clicks here don't open the row. */}
            <span role="cell" className={[styles.actions, orgStyles.actions].join(' ')} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
              <div className={ui.filterWrap} ref={rowMenu.menu?.id === r.id ? rowMenu.ref : undefined}>
                <button
                  type="button"
                  className={ui.iconBtn}
                  aria-label={`More actions for ${r.name}`}
                  aria-haspopup="menu"
                  aria-expanded={rowMenu.menu?.id === r.id}
                  onClick={(e) => rowMenu.open(r.id, e.currentTarget)}
                >
                  <img src="/admin/more.svg" alt="" width={20} height={20} />
                </button>
                {rowMenu.menu?.id === r.id && (
                  <RowMenu state={rowMenu} className={styles.menu}>
                    <button
                      type="button"
                      role="menuitem"
                      className={styles.menuItem}
                      onClick={() => {
                        rowMenu.close();
                        open(r);
                      }}
                    >
                      View details
                    </button>
                    {config.drill && (
                      <button
                        type="button"
                        role="menuitem"
                        className={styles.menuItem}
                        onClick={() => {
                          rowMenu.close();
                          onDrill(kind, r.name);
                        }}
                      >
                        {config.drill}
                      </button>
                    )}
                    <button
                      type="button"
                      role="menuitem"
                      className={styles.menuItem}
                      onClick={() => {
                        rowMenu.close();
                        // A team asks first; restoring, and the other levels, go straight through.
                        if (kind === 'teams' && r.status === 'active') setArchiving(r);
                        else void setStatus(r, r.status === 'active' ? 'inactive' : 'active');
                      }}
                    >
                      {r.status === 'active' ? `Archive ${config.noun}` : `Restore ${config.noun}`}
                    </button>
                  </RowMenu>
                )}
              </div>
            </span>
          </div>
        ))}
      </div>

      {adding && org && (
        <AddOrgUnitDialog
          kind={kind}
          org={org}
          users={users}
          scope={scope}
          onClose={() => setAdding(false)}
          onCreated={(next) => {
            onOrgChange(next);
            setAdding(false);
          }}
        />
      )}

      {archiving && (
        <ArchiveTeamDialog
          teamName={archiving.name}
          memberCount={archiving.count}
          onCancel={() => setArchiving(null)}
          onConfirm={async () => {
            const done = await setStatus(archiving, 'inactive');
            if (done) setArchiving(null);
            return done;
          }}
        />
      )}

      {buPanel && org && (
        <BusinessUnitDetailsPanel
          key={buPanel}
          businessUnitId={buPanel}
          org={org}
          users={users}
          onClose={() => setBuPanel(null)}
          onChanged={onRefresh}
          onOpenDepartment={(id) => {
            setBuPanel(null);
            setDeptPanel(id);
          }}
        />
      )}

      {deptPanel && org && (
        <DepartmentDetailsPanel
          key={deptPanel}
          departmentId={deptPanel}
          org={org}
          users={users}
          onClose={() => setDeptPanel(null)}
          onChanged={onRefresh}
          onOpenTeam={(id) => {
            setDeptPanel(null);
            setTeamPanel(id);
          }}
        />
      )}

      {teamPanel && org && (
        <TeamDetailsPanel
          key={teamPanel}
          teamId={teamPanel}
          org={org}
          users={users}
          onClose={() => setTeamPanel(null)}
          onChanged={onRefresh}
          onOpenUser={(id) => {
            setTeamPanel(null);
            onOpenUser(id);
          }}
        />
      )}
    </>
  );
}
