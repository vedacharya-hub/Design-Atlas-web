import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import styles from './UserDetailsPanel.module.css';
import { adminApi } from '../../../api/adminApi';
import type { AdminUser, AdminUserUpdate, UserStatus, WorkLocation } from '../../../api/types';
import { MEMBERSHIPS, STATUSES, STATUS_LABEL, avatarSrc, dash, fitOrg, membershipKey, membershipLabel, readPhoto, splitName, type OrgChoices } from './userShared';
import { SelectField, TextField } from './UserFormFields';
import { useToast, type ToastInput } from '../Toaster';
import { useDismiss, useRowMenu } from './useRowMenu';
import { RowMenu } from './RowMenu';
import { SaveButton, type SaveStatus } from './SaveButton';
import { useRoleChoices } from '../roles/rolesShared';
import { useAccessLevelChoices } from '../accessControl/accessShared';

type PanelTab = 'general' | 'associated' | 'coworking';

const TABS: { id: PanelTab; label: string }[] = [
  { id: 'general', label: 'General' },
  { id: 'associated', label: 'Associated locations' },
  { id: 'coworking', label: 'Co-Working' },
];

/** Fields the edit view can change; the rest come from the HR record. */
const EDITABLE = [
  'status',
  'avatar',
  'designation',
  'role',
  'team',
  'department',
  'businessUnit',
  'accessLevel',
  'homeLocationId',
  'membership',
  'associatedLocationIds',
  'coworkingLocationIds',
  'keyCard',
] as const satisfies readonly (keyof AdminUserUpdate)[];

/** Rows per page in the location tables (Figma 1584:150638). */
const PAGE_SIZE = 8;
/** Room for the location row menu (two items). */
const ROW_MENU_HEIGHT = 96;
/** "Saving…" shows at least this long, so a fast save doesn't flicker past it. */
const MIN_SAVING_MS = 500;
/** How long "Saved" holds before the panel goes back to the details. */
const SAVED_HOLD_MS = 1000;

interface Props {
  user: AdminUser;
  locations: WorkLocation[];
  /** Business unit → department → team choices. */
  org: OrgChoices;
  /** Open straight into the edit view ("Edit details" in the row menu). */
  startEditing?: boolean;
  onClose: () => void;
  /** After a save, with the saved user and the confirmation toast to show. */
  onSaved: (user: AdminUser, toast: ToastInput) => void;
}

/** Page buttons for `pages` pages: all of them up to 7, otherwise the ends and the current page with gaps. */
export function pageList(page: number, pages: number): (number | 'gap')[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  if (page <= 3 || page >= pages - 2) return [1, 2, 3, 'gap', pages - 2, pages - 1, pages];
  return [1, 'gap', page - 1, page, page + 1, 'gap', pages];
}

/**
 * User details (Figma 1584:148102 General, 1584:149941 Associated locations, 1584:150638 Co-Working)
 * and its edit view (1584:150879), in a panel that slides in from the right over a dimmed page.
 */
export function UserDetailsPanel({ user, locations, org, startEditing = false, onClose, onSaved }: Props) {
  const toast = useToast();
  const roleChoices = useRoleChoices();
  // Their own level stays a choice even if it has since been archived.
  const accessChoices = useAccessLevelChoices(user.accessLevel);
  const [tab, setTab] = useState<PanelTab>('general');
  // Present while editing: a working copy that Save sends back.
  const [draft, setDraft] = useState<AdminUser | null>(startEditing ? user : null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const savedTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [error, setError] = useState('');
  const [closing, setClosing] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const photoRef = useRef<HTMLInputElement>(null);

  const shown = draft ?? user;
  const editing = draft !== null;
  const byId = useMemo(() => new Map(locations.map((l) => [l.id, l])), [locations]);
  const home = byId.get(shown.homeLocationId);
  /** Buildings turned off for everyone in Company Settings → Co-working Permissions. */
  const [restricted, setRestricted] = useState<Set<string>>(new Set());
  useEffect(() => {
    let live = true;
    adminApi
      .getCoworking()
      .then((p) => live && setRestricted(new Set(p.disabledLocationIds)))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  const restrictedCount = shown.coworkingLocationIds.filter((id) => restricted.has(id)).length;

  const close = () => setClosing(true);

  function cancelEdit() {
    clearTimeout(savedTimer.current);
    setDraft(null);
    setSaveStatus('idle');
    setError('');
  }

  useEffect(() => () => clearTimeout(savedTimer.current), []);

  // Escape backs out of editing first, then closes the panel. Popovers inside claim it before this.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if (draft) cancelEdit();
      else setClosing(true);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [draft]);

  // Hold the page still behind the panel, and hand focus back to the row on close.
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

  const set = (patch: Partial<AdminUser>) => setDraft((d) => (d ? { ...d, ...patch } : d));

  /** Save → Saving… → Saved, held a moment on the edit view, then back to the details. A failure stays on "Try again". */
  async function save(e?: FormEvent) {
    e?.preventDefault();
    if (!draft || saveStatus === 'saving') return;
    clearTimeout(savedTimer.current);
    const patch: Record<string, unknown> = {};
    for (const key of EDITABLE) {
      if (JSON.stringify(draft[key]) !== JSON.stringify(user[key])) patch[key] = draft[key];
    }
    if (Object.keys(patch).length === 0) return cancelEdit();
    if ('role' in patch && !draft.role.trim()) return setError('Choose a role.');
    setSaveStatus('saving');
    setError('');
    try {
      const [next] = await Promise.all([adminApi.updateUser(user.id, patch as AdminUserUpdate), new Promise((r) => setTimeout(r, MIN_SAVING_MS))]);
      setDraft(next);
      setSaveStatus('saved');
      onSaved(next, { title: `${next.name} was updated!`, description: <>Saved your changes to <strong>{next.name}</strong>’s details</> });
      savedTimer.current = setTimeout(() => {
        // The Save button leaves with the edit view: keep focus in the panel.
        const hadFocus = (document.activeElement as HTMLButtonElement | null)?.form?.id === 'user-edit';
        setDraft(null);
        setSaveStatus('idle');
        if (hadFocus) panelRef.current?.focus();
      }, SAVED_HOLD_MS);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong. Please try again.';
      setSaveStatus('error');
      setError(message);
      toast({ tone: 'error', title: `Couldn’t save ${user.name}’s details`, description: message });
    }
  }

  /** Location changes go into the working copy while editing, and are saved straight away otherwise. */
  async function changeLocations(patch: Pick<AdminUserUpdate, 'homeLocationId' | 'associatedLocationIds' | 'coworkingLocationIds'>, done: ToastInput) {
    if (draft) return set(patch);
    try {
      onSaved(await adminApi.updateUser(user.id, patch), done);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong. Please try again.';
      setError(message);
      toast({ tone: 'error', title: 'Couldn’t update the locations', description: message });
    }
  }

  function pickPhoto() {
    if (!draft) setDraft(user);
    photoRef.current?.click();
  }

  async function onPhoto(file: File | undefined) {
    if (!file) return;
    try {
      const avatar = await readPhoto(file);
      setDraft((d) => ({ ...(d ?? user), avatar }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That photo can’t be used.');
    }
  }

  const [firstName, lastName] = splitName(shown.name);
  const subtitle = [home?.name, shown.floor].filter(Boolean).join(' • ');

  return (
    <>
      <div className={[styles.backdrop, closing ? styles.backdropOut : ''].join(' ').trim()} onMouseDown={close} />
      <div
        ref={panelRef}
        className={[styles.panel, closing ? styles.panelOut : ''].join(' ').trim()}
        role="dialog"
        aria-modal="true"
        aria-label={editing ? `Edit ${user.name}` : user.name}
        tabIndex={-1}
        onAnimationEnd={(e) => {
          if (closing && e.target === e.currentTarget) onClose();
        }}
      >
        <header className={styles.head}>
          <div className={styles.headText}>
            <h2 className={styles.headTitle}>{editing ? 'Edit User Details' : 'User Details'}</h2>
            <p className={styles.headSub}>{subtitle}</p>
          </div>
          {editing ? (
            <SaveButton status={saveStatus} form="user-edit" className={styles.saveBtn} />
          ) : (
            <div className={styles.headActions}>
              <button type="button" className={styles.editBtn} aria-label="Edit user details" onClick={() => setDraft(user)}>
                <img src="/admin/user/edit-24.svg" alt="" width={24} height={24} />
              </button>
              <button type="button" className={styles.closeBtn} aria-label="Close" onClick={close}>
                <img src="/admin/user/close.svg" alt="" width={24} height={24} />
              </button>
            </div>
          )}
        </header>

        <div className={styles.body}>
          <section className={styles.hero}>
            <div className={styles.strip} aria-hidden="true" />
            <div className={styles.profile}>
              <div className={styles.avatarWrap}>
                <img className={styles.avatar} src={avatarSrc(shown)} alt="" width={88} height={88} />
                <button type="button" className={styles.avatarEdit} aria-label="Change photo" onClick={pickPhoto}>
                  <img src="/admin/user/edit-16.svg" alt="" width={16} height={16} />
                </button>
                <input
                  ref={photoRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className={styles.srOnly}
                  tabIndex={-1}
                  aria-hidden="true"
                  onChange={(e) => {
                    void onPhoto(e.target.files?.[0]);
                    e.target.value = '';
                  }}
                />
              </div>
              <div className={styles.identity}>
                <div className={styles.identityText}>
                  <span className={styles.name}>{shown.name}</span>
                  <span className={styles.email}>{shown.email}</span>
                  <span className={styles.tags}>
                    <span className={styles.tag}>{shown.role.toUpperCase()}</span>
                    <span className={styles.tag}>{shown.accessLevel}</span>
                  </span>
                </div>
                {editing ? (
                  <StatusSelect value={shown.status} label="User status" onChange={(status) => set({ status })} />
                ) : (
                  <span className={[styles.status, styles[`status_${shown.status}`]].join(' ')}>{STATUS_LABEL[shown.status]}</span>
                )}
              </div>
            </div>
            <div className={styles.tabs} role="tablist" aria-label="User details">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === t.id}
                  className={[styles.tab, styles[`tab_${t.id}`], tab === t.id ? styles.tabActive : ''].join(' ')}
                  onClick={() => setTab(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </section>

          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}

          {tab === 'general' && !editing && (
            <div className={styles.content}>
              <dl className={styles.grid}>
                <Item label="EMPLOYEE ID" value={`#${shown.code}`} />
                <Item label="DESIGNATION" value={dash(shown.designation)} />
                <Item label="FIRST NAME" value={firstName} />
                <Item label="LAST NAME" value={dash(lastName)} />
                <Item label="EMAIL ID" value={shown.email} />
                <Item label="PHONE NO." value={dash(shown.phone)} />
                <Item label="DEPARTMENT" value={dash(shown.department)} />
                <Item label="TEAM" value={dash(shown.team)} />
                <Item label="BUSINESS UNIT" value={dash(shown.businessUnit)} />
                <Item label="ROLE" value={shown.role.toUpperCase()} />
                <Item label="ACCESS LEVEL" value={shown.accessLevel} />
              </dl>
              <hr className={styles.rule} />
              <dl className={styles.grid}>
                <div className={styles.block}>
                  <dt className={styles.label}>HOME LOCATION</dt>
                  <dd className={styles.place}>
                    <span className={styles.value}>{home?.name ?? '-'}</span>
                    {home && <span className={styles.address}>{home.address}</span>}
                  </dd>
                </div>
                <div className={styles.block}>
                  <dt className={styles.label}>MEMBERSHIP</dt>
                  <dd className={styles.membership}>{membershipLabel(shown.membership)}</dd>
                </div>
              </dl>
              <hr className={styles.rule} />
              <div className={styles.keySection}>
                <span className={styles.label}>KEY CARD</span>
                <div className={styles.keyRow}>
                  <div className={styles.keyCardGroup}>
                    <KeyCardArt />
                    <dl className={styles.stamps}>
                      <div>
                        <dt>LEFT HOT STAMP</dt>
                        <dd>{dash(shown.keyCard.leftHotStamp)}</dd>
                      </div>
                      <div>
                        <dt>RIGHT HOT STAMP</dt>
                        <dd>{dash(shown.keyCard.rightHotStamp)}</dd>
                      </div>
                    </dl>
                  </div>
                  <span className={[styles.statusSmall, styles[`status_${shown.keyCard.status}`]].join(' ')}>{STATUS_LABEL[shown.keyCard.status]}</span>
                </div>
              </div>
            </div>
          )}

          {tab === 'general' && draft && (
            <form id="user-edit" className={styles.content} onSubmit={(e) => void save(e)} noValidate>
              <div className={styles.formGrid}>
                <TextField label="Employee ID" value={`#${draft.code}`} locked />
                <TextField label="Designation" value={draft.designation} onChange={(designation) => set({ designation })} />
                <TextField label="First name" value={firstName} locked />
                <TextField label="Last name" value={lastName} locked />
                <TextField label="Email ID" value={draft.email} locked />
                <TextField label="Phone No." value={draft.phone} locked />
                {/* Each level only offers what sits under the one above it. */}
                <SelectField
                  wide
                  label="Business Unit"
                  value={draft.businessUnit}
                  choices={org.businessUnits}
                  onChange={(businessUnit) => set(fitOrg(org, { businessUnit, department: draft.department, team: draft.team }))}
                />
                <SelectField
                  label="Department"
                  value={draft.department}
                  choices={org.departmentsIn(draft.businessUnit)}
                  onChange={(department) => set(fitOrg(org, { businessUnit: draft.businessUnit, department, team: draft.team }))}
                />
                <SelectField label="Team" value={draft.team} choices={org.teamsIn(draft.department)} onChange={(team) => set({ team })} />
                <SelectField label="Role" value={draft.role} choices={roleChoices} required onChange={(role) => set({ role })} />
                <SelectField label="Access level" value={draft.accessLevel} choices={accessChoices} required onChange={(accessLevel) => set({ accessLevel })} />
              </div>
              <hr className={styles.rule} />
              <div className={styles.formGrid}>
                <SelectField
                  label="Home Location"
                  value={draft.homeLocationId}
                  choices={locations.filter((l) => l.privateOffice).map((l) => ({ value: l.id, label: l.name }))}
                  required
                  onChange={(homeLocationId) => set({ homeLocationId })}
                />
                <SelectField
                  label="Membership"
                  value={membershipKey(draft.membership)}
                  choices={MEMBERSHIPS.map((m) => ({ value: m.key, label: m.label }))}
                  required
                  onChange={(key) => set({ membership: MEMBERSHIPS.find((m) => m.key === key)!.tags })}
                />
              </div>
              <hr className={styles.rule} />
              <div className={styles.keySection}>
                <span className={styles.label}>KEY CARD</span>
                <div className={styles.keyRow}>
                  <div className={styles.keyCardGroup}>
                    <KeyCardArt />
                    <div className={styles.stampFields}>
                      <TextField
                        small
                        label="LEFT HOT STAMP"
                        value={draft.keyCard.leftHotStamp}
                        onChange={(leftHotStamp) => set({ keyCard: { ...draft.keyCard, leftHotStamp } })}
                      />
                      <TextField
                        small
                        label="RIGHT HOT STAMP"
                        value={draft.keyCard.rightHotStamp}
                        onChange={(rightHotStamp) => set({ keyCard: { ...draft.keyCard, rightHotStamp } })}
                      />
                    </div>
                  </div>
                  <StatusSelect
                    value={draft.keyCard.status}
                    label="Key card status"
                    up
                    onChange={(status) => set({ keyCard: { ...draft.keyCard, status } })}
                  />
                </div>
              </div>
            </form>
          )}

          {tab === 'associated' && (
            <LocationsCard
              key="associated"
              title="Locations"
              description="Buildings this user is associated with"
              ids={shown.associatedLocationIds}
              byId={byId}
              homeId={shown.homeLocationId}
              onSetHome={(l) => void changeLocations({ homeLocationId: l.id }, { title: 'Home location updated!', description: <><strong>{l.name}</strong> is now {firstName}’s home location</> })}
              onRemove={(l) =>
                void changeLocations(
                  { associatedLocationIds: shown.associatedLocationIds.filter((id) => id !== l.id) },
                  { title: `${l.name} was removed!`, description: <>Removed <strong>{l.name}</strong> from {firstName}’s locations</> },
                )
              }
            />
          )}

          {tab === 'coworking' && (
            <LocationsCard
              key="coworking"
              fill
              title="Locations"
              description={`Co-working spaces this user can work from${restrictedCount ? ` · ${restrictedCount} restricted by admin` : ''}`}
              ids={shown.coworkingLocationIds}
              byId={byId}
              restricted={restricted}
              homeId={shown.homeLocationId}
              onSetHome={(l) => void changeLocations({ homeLocationId: l.id }, { title: 'Home location updated!', description: <><strong>{l.name}</strong> is now {firstName}’s home location</> })}
              onRemove={(l) =>
                void changeLocations(
                  { coworkingLocationIds: shown.coworkingLocationIds.filter((id) => id !== l.id) },
                  { title: `${l.name} was removed!`, description: <>Removed <strong>{l.name}</strong> from {firstName}’s co-working spaces</> },
                )
              }
            />
          )}
        </div>
      </div>
    </>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.item}>
      <dt className={styles.label}>{label}</dt>
      <dd className={styles.value}>{value}</dd>
    </div>
  );
}

/** The WeWork key card: dark gradient, a fine grain and the wordmark. */
function KeyCardArt() {
  return (
    <div className={styles.keyCard} aria-hidden="true">
      <img className={styles.keyCardLogo} src="/admin/user/wework-logo.svg" alt="" width={56.4575} height={11.3119} />
    </div>
  );
}

/** The status badge with a chevron, opening a small menu of the two statuses. */
export function StatusSelect({
  value,
  label,
  onChange,
  up,
  labels = STATUS_LABEL,
}: {
  value: UserStatus;
  label: string;
  onChange: (status: UserStatus) => void;
  /** Open above the badge (the key card sits at the bottom of the panel). */
  up?: boolean;
  /** What each status is called (a role's inactive is "ARCHIVED"). */
  labels?: Record<UserStatus, string>;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(open, ref, () => setOpen(false));
  return (
    <div className={styles.statusSelect} ref={ref}>
      <button
        type="button"
        className={[styles.status, styles.statusButton, styles[`status_${value}`]].join(' ')}
        aria-label={`${label}: ${labels[value]}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {labels[value]}
        <img src="/admin/user/badge-chevron.svg" alt="" width={24} height={24} />
      </button>
      {open && (
        <div className={[styles.menu, up ? styles.menuUp : ''].join(' ').trim()} role="listbox" aria-label={label}>
          {STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              role="option"
              aria-selected={s === value}
              className={styles.menuItem}
              onClick={() => {
                onChange(s);
                setOpen(false);
              }}
            >
              <span className={[styles.statusSmall, styles[`status_${s}`]].join(' ')}>{labels[s]}</span>
              {s === value && <img src="/admin/user/check.svg" alt="" width={20} height={20} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const RESTRICTED_LOCATION_TIP = 'Turned off for the whole company in Company Settings → Co-working Permissions: they can’t use it until it’s turned back on';

/** A searchable, paged table of buildings (Associated locations / Co-Working). */
function LocationsCard({
  title,
  description,
  ids,
  byId,
  homeId,
  fill,
  restricted,
  onSetHome,
  onRemove,
}: {
  title: string;
  description: string;
  ids: string[];
  byId: Map<string, WorkLocation>;
  homeId: string;
  /** Stretch to the bottom of the panel, with the pages along the bottom (Co-Working). */
  fill?: boolean;
  /** Buildings turned off for the whole company (Co-Working): shown greyed with “Restricted”. */
  restricted?: Set<string>;
  onSetHome: (location: WorkLocation) => void;
  onRemove: (location: WorkLocation) => void;
}) {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const rowMenu = useRowMenu(ROW_MENU_HEIGHT);
  const { menu } = rowMenu;

  const all = useMemo(() => ids.map((id) => byId.get(id)).filter((l): l is WorkLocation => !!l), [ids, byId]);
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? all.filter((l) => `${l.name} ${l.address}`.toLowerCase().includes(q)) : all;
  }, [all, query]);
  const pages = Math.max(1, Math.ceil(matches.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const rows = matches.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
  const paged = pages > 1;

  return (
    <div className={[styles.locations, fill ? styles.locationsFill : ''].join(' ').trim()}>
      <div className={styles.locationsHead}>
        <div className={styles.locationsText}>
          <h3 className={styles.locationsTitle}>{title}</h3>
          <p className={styles.locationsDescription}>{description}</p>
        </div>
        <label className={styles.search}>
          <span className={styles.srOnly}>Search locations</span>
          <input
            value={query}
            placeholder="Search location, address.."
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
          />
          <img src="/admin/search.svg" alt="" width={20} height={20} />
        </label>
      </div>

      <div className={styles.locTable} role="table" aria-label={description}>
        <div className={styles.locHead} role="row">
          <span role="columnheader">LOCATION</span>
          <span role="columnheader">ADDRESS</span>
        </div>
        <div className={[styles.locRows, paged ? styles.locRowsPaged : ''].join(' ').trim()}>
          {rows.length === 0 && (
            <p className={styles.locEmpty}>{all.length === 0 ? 'No locations yet.' : `No locations match “${query.trim()}”.`}</p>
          )}
          {rows.map((l) => (
            <div
              key={l.id}
              className={[styles.locRow, menu?.id === l.id ? styles.locRowOpen : '', restricted?.has(l.id) ? styles.locRowRestricted : ''].join(' ').trim()}
              role="row"
            >
              <span role="cell" className={styles.locName}>
                {l.name}
                {restricted?.has(l.id) && (
                  <span className={styles.locRestricted} title={RESTRICTED_LOCATION_TIP}>
                    Restricted
                  </span>
                )}
              </span>
              <span role="cell" className={styles.locAddress}>
                {l.address}
              </span>
              <div role="cell" className={styles.locActions} ref={menu?.id === l.id ? rowMenu.ref : undefined}>
                <button
                  type="button"
                  className={styles.locMore}
                  aria-label={`More actions for ${l.name}`}
                  aria-haspopup="menu"
                  aria-expanded={menu?.id === l.id}
                  onClick={(e) => rowMenu.open(l.id, e.currentTarget)}
                >
                  <img src="/admin/user/more-2-fill.svg" alt="" width={20} height={20} />
                </button>
                {menu?.id === l.id && (
                  <RowMenu state={rowMenu} className={styles.menu}>
                    {/* Only buildings with the company's private office can be home. */}
                    {l.id !== homeId && l.privateOffice && (
                      <button
                        type="button"
                        role="menuitem"
                        className={styles.menuItem}
                        onClick={() => {
                          rowMenu.close();
                          onSetHome(l);
                        }}
                      >
                        Set as home location
                      </button>
                    )}
                    <button
                      type="button"
                      role="menuitem"
                      className={[styles.menuItem, styles.menuItemDanger].join(' ')}
                      onClick={() => {
                        rowMenu.close();
                        onRemove(l);
                      }}
                    >
                      Remove
                    </button>
                  </RowMenu>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {paged && (
        <nav className={styles.pagination} aria-label="Pages">
          <button type="button" className={styles.pageStep} disabled={current === 1} onClick={() => setPage(current - 1)}>
            <img src="/admin/user/arrow-left.svg" alt="" width={20} height={20} />
            Previous
          </button>
          <span className={styles.pageNumbers}>
            {pageList(current, pages).map((p, i) =>
              p === 'gap' ? (
                <span key={`gap-${i}`} className={styles.pageNumber} aria-hidden="true">
                  ...
                </span>
              ) : (
                <button
                  key={p}
                  type="button"
                  className={[styles.pageNumber, p === current ? styles.pageNumberOn : ''].join(' ').trim()}
                  aria-label={`Page ${p}`}
                  aria-current={p === current ? 'page' : undefined}
                  onClick={() => setPage(p)}
                >
                  {p}
                </button>
              ),
            )}
          </span>
          <button type="button" className={styles.pageStep} disabled={current === pages} onClick={() => setPage(current + 1)}>
            Next
            <img src="/admin/user/arrow-forward.svg" alt="" width={20} height={20} />
          </button>
        </nav>
      )}
    </div>
  );
}
