import { useEffect, useMemo, useRef, useState } from 'react';
// Shared controls first, so this panel's own rules win.
import ui from '../AdminControls.module.css';
import styles from './UsersPanel.module.css';
import { adminApi } from '../../../api/adminApi';
import { AdminPanelHeader } from '../AdminPanelHeader';
import { useToast } from '../Toaster';
import { UserDetailsPanel } from './UserDetailsPanel';
import { AddUserDialog } from './AddUserDialog';
import { OrgUnitsTab, SCOPE_LABEL, type OrgScope, type OrgTab } from './OrgUnitsTab';
import { STATUS_LABEL, avatarSrc, dash, membershipKey, orgChoices } from './userShared';
import { downloadCsv, useDismiss, useRowMenu } from './useRowMenu';
import { RowMenu } from './RowMenu';
import { LicenceCount } from './LicenceCount';
import { ConfirmPhraseDialog } from '../ConfirmPhraseDialog';
import { TickBox } from './TickBox';
import { BulkUploadWizard } from './bulk/BulkUploadWizard';
import { NO_FILTERS, UsersFilterPanel, countFilters, matchesFilters, type UserFilters } from './UsersFilterPanel';
import { useBulkUploads } from './bulk/BulkUploadProvider';
import orgStyles from './OrgUnitsTab.module.css';
import type { AdminUser, CompanySettings, MembershipTag, OrgChart, UserStatus, WorkLocation } from '../../../api/types';

type UsersTab = 'all' | 'teams' | 'departments' | 'businessUnits';

const TABS: { id: UsersTab; label: string; heading: string }[] = [
  { id: 'all', label: 'All Users', heading: 'All Users' },
  { id: 'teams', label: 'Teams', heading: 'Teams' },
  { id: 'departments', label: 'Department', heading: 'Department' },
  { id: 'businessUnits', label: 'Business Unit', heading: 'Business Unit' },
];

/** Enough room for the row menu (two items). */
const ROW_MENU_HEIGHT = 106;

function StatusBadge({ user }: { user: AdminUser }) {
  return <span className={[ui.badge, styles[`status_${user.status}`]].join(' ')}>{STATUS_LABEL[user.status]}</span>;
}

function MembershipTags({ tags }: { tags: MembershipTag[] }) {
  return (
    <span className={styles.tags}>
      {tags.map((t) => (
        <span key={t} className={[ui.badge, styles.tag].join(' ')}>
          {t}
        </span>
      ))}
    </span>
  );
}

/**
 * Admin → Users. All Users (Figma 1578:126778), with a Membership column: users are active or
 * inactive; the row's ⋯ menu archives (inactive) or restores (active) them, and clicking a row opens
 * the user's details in a panel from the right, where they can be edited. Teams, Department and
 * Business Unit follow the company structure, Business Unit → Department → Team → users: opening a
 * row shows the level below, narrowed to it.
 */
export function UsersPanel() {
  const [tab, setTab] = useState<UsersTab>('all');
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<UserFilters>(NO_FILTERS);
  const [filterOpen, setFilterOpen] = useState(false);
  const filterButtonRef = useRef<HTMLButtonElement>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const rowMenu = useRowMenu(ROW_MENU_HEIGHT);
  const [adding, setAdding] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const { revision } = useBulkUploads();
  const [org, setOrg] = useState<OrgChart | null>(null);
  const [orgError, setOrgError] = useState('');
  // Where each tab is narrowed to after drilling down (e.g. Teams → Department: Engineering).
  const [scopes, setScopes] = useState<Partial<Record<UsersTab, OrgScope>>>({});
  // The user whose details panel is open, and whether it opened on the edit view.
  const [detailId, setDetailId] = useState<string | null>(null);
  const [locations, setLocations] = useState<WorkLocation[]>([]);
  /** The company's PO and ATLAS licences; the counts beside the search show how many are in use. */
  const [licences, setLicences] = useState<CompanySettings['licences'] | null>(null);
  const toast = useToast();
  const moreRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLDivElement>(null);
  // True when the columns don't fit and scroll sideways under the pinned ⋯ column.
  const [tableScrolls, setTableScrolls] = useState(false);
  /** Bulk Action (from the header ⋯): tick users, through any search or filters, then make them all active or inactive. */
  const [bulk, setBulk] = useState(false);
  const [picked, setPicked] = useState<ReadonlySet<string>>(() => new Set());
  const [bulkBusy, setBulkBusy] = useState<UserStatus | null>(null);
  const [confirmInactive, setConfirmInactive] = useState(false);

  useDismiss(moreOpen, moreRef, () => setMoreOpen(false));
  useEffect(() => {
    adminApi
      .getUsers()
      .then(setUsers)
      .catch(() => setLoadError("Couldn't load users. Please try again."));
    adminApi
      .getLocations()
      .then(setLocations)
      .catch(() => setLocations([]));
    adminApi
      .getOrg()
      .then(setOrg)
      .catch(() => setOrgError("Couldn't load the company structure. Please try again."));
    adminApi
      .getCompany()
      .then((c) => setLicences(c.licences))
      .catch(() => setLicences(null));
  }, []);

  useEffect(() => {
    const table = tableRef.current;
    if (!table) return;
    const check = () => setTableScrolls(table.scrollWidth > table.clientWidth + 1);
    check();
    const observer = new ResizeObserver(check);
    observer.observe(table);
    return () => observer.disconnect();
    // Bulk Action swaps the table out, so watch the new one when it comes back.
  }, [tab, users, bulk]);

  const userScope = scopes.all;
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (users ?? []).filter((u) => {
      if (userScope && u[userScope.field] !== userScope.value) return false;
      if (!matchesFilters(u, filters, (x) => membershipKey(x.membership))) return false;
      if (!q) return true;
      return [u.name, u.email, u.code, u.role, u.team, u.department, u.businessUnit].some((v) => v.toLowerCase().includes(q));
    });
  }, [users, query, filters, userScope]);

  const filterCount = countFilters(filters);
  // Every active user holds a licence for each of their memberships, whatever the search or filters show.
  const inUse = useMemo(() => {
    const active = (users ?? []).filter((u) => u.status === 'active');
    return { PO: active.filter((u) => u.membership.includes('PO')).length, ATLAS: active.filter((u) => u.membership.includes('ATLAS')).length };
  }, [users]);

  const orgOptions = useMemo(() => orgChoices(org), [org]);

  // Ticks stay put while the search or filters change, so a selection can be built up across several.
  const pickedUsers = useMemo(() => (users ?? []).filter((u) => picked.has(u.id)), [users, picked]);
  const shownPicked = shown.filter((u) => picked.has(u.id)).length;
  const hiddenPicked = pickedUsers.length - shownPicked;
  const allShownPicked = shown.length > 0 && shownPicked === shown.length;
  const toActivate = pickedUsers.filter((u) => u.status === 'inactive');
  const toDeactivate = pickedUsers.filter((u) => u.status === 'active');

  function togglePick(id: string) {
    setPicked((p) => {
      const next = new Set(p);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /** The header box: ticks every row shown, or unticks them if they all are. */
  function toggleAllShown() {
    setPicked((p) => {
      const next = new Set(p);
      for (const u of shown) {
        if (allShownPicked) next.delete(u.id);
        else next.add(u.id);
      }
      return next;
    });
  }

  function exitBulk() {
    setBulk(false);
    setPicked(new Set());
    setConfirmInactive(false);
  }

  /** Makes the ticked users that aren't already `status` active or inactive: true when it saved. */
  async function applyBulk(status: UserStatus): Promise<boolean> {
    const targets = status === 'active' ? toActivate : toDeactivate;
    if (!targets.length) return false;
    setBulkBusy(status);
    try {
      const saved = await adminApi.setUsersStatus(
        targets.map((u) => u.id),
        status,
      );
      const byId = new Map(saved.map((u) => [u.id, u]));
      setUsers((list) => (list ?? []).map((u) => byId.get(u.id) ?? u));
      const n = saved.length;
      const first = saved[0]?.name ?? '';
      const others = n > 1 ? <> and {n - 1} {n === 2 ? 'other' : 'others'}</> : null;
      toast(
        status === 'inactive'
          ? { title: n === 1 ? `${first} was archived!` : `${n} users were archived!`, description: <><strong>{first}</strong>{others} {n === 1 ? 'is' : 'are'} now inactive</> }
          : { title: n === 1 ? `${first} was restored!` : `${n} users were restored!`, description: <><strong>{first}</strong>{others} {n === 1 ? 'is' : 'are'} active again</> },
      );
      exitBulk();
      return true;
    } catch (err) {
      toast({ tone: 'error', title: 'Couldn’t update those users', description: err instanceof Error ? err.message : 'Please try again.' });
      return false;
    } finally {
      setBulkBusy(null);
    }
  }

  /** Opening a business unit shows its departments; a department, its teams; a team, its members. */
  function drill(kind: OrgTab, name: string) {
    const [next, scope]: [UsersTab, OrgScope] =
      kind === 'businessUnits'
        ? ['departments', { field: 'businessUnit', value: name }]
        : kind === 'departments'
          ? ['teams', { field: 'department', value: name }]
          : ['all', { field: 'team', value: name }];
    setScopes((s) => ({ ...s, [next]: scope }));
    setTab(next);
  }

  const detailUser = detailId ? (users ?? []).find((u) => u.id === detailId) : undefined;

  function replaceUser(next: AdminUser) {
    setUsers((list) => (list ?? []).map((u) => (u.id === next.id ? next : u)));
  }

  async function setStatus(user: AdminUser, status: UserStatus) {
    try {
      replaceUser(await adminApi.setUserStatus(user.id, status));
      toast(
        status === 'inactive'
          ? { title: `${user.name} was archived!`, description: <><strong>{user.name}</strong> is now inactive</> }
          : { title: `${user.name} was restored!`, description: <><strong>{user.name}</strong> is active again</> },
      );
    } catch (err) {
      toast({ tone: 'error', title: `Couldn’t update ${user.name}`, description: err instanceof Error ? err.message : 'Please try again.' });
    }
  }

  // A bulk upload running in the background: show people as they're added or changed.
  useEffect(() => {
    if (revision === 0) return;
    adminApi
      .getUsers()
      .then(setUsers)
      .catch(() => {});
  }, [revision]);

  /** Reloads the directory and the structure (a team rename or move changes its members too). */
  async function refresh() {
    const [nextUsers, nextOrg] = await Promise.all([adminApi.getUsers(), adminApi.getOrg()]);
    setUsers(nextUsers);
    setOrg(nextOrg);
  }

  /** The visible rows as CSV, downloaded in the browser. */
  function exportCsv() {
    downloadCsv(
      'users.csv',
      ['ID', 'Name', 'Email', 'Role', 'Team', 'Department', 'Business Unit', 'Membership', 'Status'],
      shown.map((u) => [`#${u.code}`, u.name, u.email, u.role, u.team, u.department, u.businessUnit, u.membership.join(' + '), STATUS_LABEL[u.status]]),
    );
    setMoreOpen(false);
  }

  const current = TABS.find((t) => t.id === tab)!;

  return (
    <>
      <AdminPanelHeader title="Users" description="Configure print settings from the document" divider>
        <div className={styles.segmented} role="tablist" aria-label="User views">
          {TABS.map((t, i) => {
            const selected = t.id === tab;
            // Dividers only sit between two unselected tabs.
            const divided = i > 0 && !selected && TABS[i - 1].id !== tab;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={selected}
                className={[styles.segment, selected ? styles.segmentActive : '', divided ? styles.segmentDivided : ''].join(' ').trim()}
                onClick={() => {
                  // Picking a tab directly shows everything; drilling down narrows it.
                  setScopes({});
                  if (t.id !== tab) exitBulk();
                  setTab(t.id);
                }}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </AdminPanelHeader>

      {tab !== 'all' ? (
        <OrgUnitsTab
          key={tab}
          kind={tab}
          org={org}
          users={users ?? []}
          loadError={orgError}
          scope={scopes[tab] ?? null}
          onClearScope={() => setScopes((s) => ({ ...s, [tab]: undefined }))}
          onDrill={drill}
          onOrgChange={setOrg}
          onRefresh={refresh}
          onOpenUser={(id) => setDetailId(id)}
        />
      ) : (
        <>
          <div className={styles.subHeader}>
            <div className={styles.subText}>
              <div className={orgStyles.titleRow}>
                <h2 className={styles.subTitle}>{current.heading}</h2>
                {userScope && (
                  <span className={orgStyles.scope}>
                    {SCOPE_LABEL[userScope.field]}: {userScope.value}
                    <button type="button" className={orgStyles.scopeClear} aria-label="Show all users" onClick={() => setScopes((s) => ({ ...s, all: undefined }))}>
                      <img src="/admin/user/chip-close.svg" alt="" width={16} height={16} />
                    </button>
                  </span>
                )}
              </div>
              <p className={styles.subDescription}>{bulk ? 'Tick users, then make them active or inactive together' : 'Private offices and sittings at WeWork'}</p>
            </div>
            <div className={styles.controls}>
              {users && licences && (
                <div className={styles.licences}>
                  <LicenceCount used={inUse.PO} total={licences.PO} unit="PO" />
                  <LicenceCount used={inUse.ATLAS} total={licences.ATLAS} unit="ATLAS" />
                </div>
              )}
              <label className={[ui.search, styles.search].join(' ')}>
                <span className={ui.srOnly}>Search users</span>
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by user, team, role" />
                <img src="/admin/search.svg" alt="" width={20} height={20} />
              </label>

              <button
                ref={filterButtonRef}
                type="button"
                className={[ui.btn, ui.btnSecondary, styles.filterBtn, filterCount ? ui.btnSecondaryOn : ''].join(' ').trim()}
                aria-haspopup="dialog"
                aria-expanded={filterOpen}
                onClick={() => setFilterOpen(true)}
              >
                <img src="/admin/filter.svg" alt="" width={24} height={24} />
                Filter
                {filterCount > 0 && <span className={ui.filterCount}>{filterCount}</span>}
              </button>

              <div className={ui.filterWrap} ref={moreRef}>
                <button type="button" className={ui.iconBtn} aria-label="More options" aria-expanded={moreOpen} aria-haspopup="menu" onClick={() => setMoreOpen((o) => !o)}>
                  <img src="/admin/more.svg" alt="" width={20} height={20} />
                </button>
                {moreOpen && (
                  <div className={styles.moreMenu} role="menu">
                    <button
                      type="button"
                      role="menuitem"
                      className={styles.moreItem}
                      disabled={!org || !users}
                      onClick={() => {
                        setMoreOpen(false);
                        setBulkOpen(true);
                      }}
                    >
                      <img src="/admin/file-excel.svg" alt="" width={20} height={20} />
                      Upload through Sheet
                    </button>
                    <button type="button" role="menuitem" className={styles.moreItem} onClick={exportCsv}>
                      <img src="/admin/download.svg" alt="" width={20} height={20} />
                      Download as CSV
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className={styles.moreItem}
                      disabled={!users}
                      onClick={() => {
                        setMoreOpen(false);
                        if (bulk) exitBulk();
                        else setBulk(true);
                      }}
                    >
                      <img src="/admin/user/bulk-select.svg" alt="" width={20} height={20} />
                      {bulk ? 'Exit Bulk Action' : 'Bulk Action'}
                    </button>
                  </div>
                )}
              </div>

              <button type="button" className={[ui.btn, ui.btnPrimary, styles.addBtn].join(' ')} onClick={() => setAdding(true)}>
                Add User
                <img src="/admin/add.svg" alt="" width={20} height={20} />
              </button>
            </div>
          </div>

          <div
            ref={tableRef}
            className={[styles.table, tableScrolls ? styles.tableScrolls : '', bulk ? styles.tableBulk : ''].join(' ').trim()}
            role="table"
            aria-label="Users"
          >
            <div className={styles.headRow} role="row">
              {bulk && (
                <span className={styles.pick} role="columnheader">
                  <TickBox
                    checked={allShownPicked}
                    mixed={shownPicked > 0 && !allShownPicked}
                    disabled={shown.length === 0}
                    label={allShownPicked ? 'Untick all users shown' : 'Tick all users shown'}
                    onChange={toggleAllShown}
                  />
                </span>
              )}
              <div className={styles.cols} role="presentation">
                {['ID', 'USER', 'ROLE', 'TEAM', 'DEPARTMENT', 'BUSINESS UNIT', 'MEMBERSHIP', 'STATUS'].map((h) => (
                  <span key={h} role="columnheader">
                    {h}
                  </span>
                ))}
              </div>
              <span role="columnheader" className={styles.actions}>
                <span className={ui.srOnly}>Actions</span>
              </span>
            </div>

            {users === null && !loadError && <p className={ui.empty}>Loading users…</p>}
            {loadError && <p className={ui.empty}>{loadError}</p>}
            {users !== null && shown.length === 0 && (
              <p className={ui.empty}>{userScope ? `No users in ${userScope.value} match your search or filters.` : 'No users match your search or filters.'}</p>
            )}

            {shown.map((u) => (
              <div
                key={u.id}
                className={[styles.row, u.status === 'inactive' ? styles.rowInactive : '', bulk && picked.has(u.id) ? styles.rowPicked : ''].join(' ').trim()}
                role="row"
                // While ticking, a click anywhere on the row ticks it; the box itself takes the keyboard.
                tabIndex={bulk ? undefined : 0}
                aria-label={bulk ? undefined : `${u.name}, open details`}
                onClick={() => (bulk ? togglePick(u.id) : setDetailId(u.id))}
                onKeyDown={(e) => {
                  if (bulk || e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return;
                  e.preventDefault();
                  setDetailId(u.id);
                }}
              >
                {bulk && (
                  <span className={styles.pick} role="cell">
                    <TickBox checked={picked.has(u.id)} label={`Tick ${u.name}`} onChange={() => togglePick(u.id)} />
                  </span>
                )}
                <div className={styles.cols} role="presentation">
                  <span role="cell">
                    <span className={styles.code}>#{u.code}</span>
                  </span>
                  <span role="cell" className={styles.user}>
                    <img className={styles.avatar} src={avatarSrc(u)} alt="" width={40} height={40} />
                    <span className={styles.userText}>
                      <span className={styles.name}>{u.name}</span>
                      <span className={styles.email} title={u.email}>
                        {u.email}
                      </span>
                    </span>
                  </span>
                  <span role="cell" className={styles.cell} title={u.role}>
                    {u.role}
                  </span>
                  <span role="cell" className={styles.cell} title={u.team || undefined}>
                    {dash(u.team)}
                  </span>
                  <span role="cell" className={styles.cell} title={u.department || undefined}>
                    {dash(u.department)}
                  </span>
                  <span role="cell" className={styles.cell} title={u.businessUnit || undefined}>
                    {dash(u.businessUnit)}
                  </span>
                  <span role="cell">
                    <MembershipTags tags={u.membership} />
                  </span>
                  <span role="cell">
                    <StatusBadge user={u} />
                  </span>
                </div>
                {/* The ⋯ menu acts on its own; clicks here don't open the row. Bulk Action leaves it out. */}
                {bulk ? (
                  <span role="cell" className={styles.actions} />
                ) : (
                  <span role="cell" className={styles.actions} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
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
                        <RowMenu state={rowMenu} className={styles.menu}>
                          <button
                            type="button"
                            role="menuitem"
                            className={styles.menuItem}
                            onClick={() => {
                              setDetailId(u.id);
                              rowMenu.close();
                            }}
                          >
                            View details
                          </button>
                          {u.status === 'active' ? (
                            <button
                              type="button"
                              role="menuitem"
                              className={styles.menuItem}
                              onClick={() => {
                                rowMenu.close();
                                void setStatus(u, 'inactive');
                              }}
                            >
                              Archive user
                            </button>
                          ) : (
                            <button
                              type="button"
                              role="menuitem"
                              className={styles.menuItem}
                              onClick={() => {
                                rowMenu.close();
                                void setStatus(u, 'active');
                              }}
                            >
                              Restore user
                            </button>
                          )}
                        </RowMenu>
                      )}
                    </div>
                  </span>
                )}
              </div>
            ))}
          </div>

          {bulk && (
            <div className={styles.bulkBar} role="region" aria-label="Bulk action">
              <p className={styles.bulkCount} aria-live="polite">
                <strong>{picked.size ? `${picked.size} selected` : 'No users selected'}</strong>
                {hiddenPicked > 0 && <> · {hiddenPicked} not shown by the search or filters</>}
              </p>
              {picked.size > 0 && (
                <button type="button" className={styles.bulkClear} disabled={!!bulkBusy} onClick={() => setPicked(new Set())}>
                  Clear
                </button>
              )}
              <span className={styles.bulkDivider} aria-hidden="true" />
              <button
                type="button"
                className={[ui.btn, ui.btnSecondary, styles.bulkBtn].join(' ')}
                disabled={!toActivate.length || !!bulkBusy}
                onClick={() => void applyBulk('active')}
              >
                {bulkBusy === 'active' ? 'Updating…' : `Make Active${toActivate.length ? ` (${toActivate.length})` : ''}`}
              </button>
              <button
                type="button"
                className={[ui.btn, ui.btnPrimary, styles.bulkBtn].join(' ')}
                disabled={!toDeactivate.length || !!bulkBusy}
                onClick={() => setConfirmInactive(true)}
              >
                Make Inactive{toDeactivate.length ? ` (${toDeactivate.length})` : ''}
              </button>
              <button type="button" className={ui.iconBtn} aria-label="Exit bulk action" disabled={!!bulkBusy} onClick={exitBulk}>
                <img src="/admin/user/close.svg" alt="" width={24} height={24} />
              </button>
            </div>
          )}
        </>
      )}

      {confirmInactive && toDeactivate.length > 0 && (
        <ConfirmPhraseDialog
          icon="/admin/user/archive-trash.svg"
          title={<>Make {toDeactivate.length === 1 ? toDeactivate[0].name : `${toDeactivate.length} users`} inactive?</>}
          note="They’ll be archived, freeing up any PO and ATLAS licences they hold. You can make them active again at any time."
          item={{
            name: toDeactivate.length > 1 ? `${toDeactivate[0].name} +${toDeactivate.length - 1} more` : toDeactivate[0].name,
            meta: `${toDeactivate.length} ${toDeactivate.length === 1 ? 'User' : 'Users'}`,
          }}
          phrase="Make Inactive"
          confirmLabel="Make Inactive"
          busyLabel="Updating…"
          onCancel={() => setConfirmInactive(false)}
          onConfirm={() => applyBulk('inactive')}
        />
      )}

      {adding && (
        <AddUserDialog
          locations={locations}
          org={orgOptions}
          onClose={() => setAdding(false)}
          onCreated={(u) => {
            // A brought-back past record replaces its row; a new user joins the end.
            const returning = (users ?? []).some((x) => x.id === u.id);
            setUsers((list) => (returning ? (list ?? []).map((x) => (x.id === u.id ? u : x)) : [...(list ?? []), u]));
            setAdding(false);
            toast({
              title: returning ? `${u.name} is back!` : `${u.name} was added!`,
              description: returning ? <>Brought back <strong>{u.name}</strong> as an active user</> : <>Added <strong>{u.name}</strong> to your organisation</>,
            });
          }}
          onViewExisting={(id) => {
            setAdding(false);
            setDetailId(id);
          }}
        />
      )}

      {filterOpen && (
        <UsersFilterPanel
          org={org}
          users={users ?? []}
          value={filters}
          onApply={setFilters}
          onClose={() => {
            setFilterOpen(false);
            filterButtonRef.current?.focus();
          }}
        />
      )}

      {bulkOpen && org && users && <BulkUploadWizard users={users} org={org} onClose={() => setBulkOpen(false)} />}

      {detailId && detailUser && (
        <UserDetailsPanel
          key={detailId}
          user={detailUser}
          locations={locations}
          org={orgOptions}
          onClose={() => setDetailId(null)}
          onSaved={(next, saved) => {
            replaceUser(next);
            toast(saved);
          }}
        />
      )}
    </>
  );
}
