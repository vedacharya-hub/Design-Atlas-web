import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
// The side panel shell; this panel's rules last.
import panel from '../users/UserDetailsPanel.module.css';
import styles from './RoleDetailsPanel.module.css';
import { adminApi } from '../../../api/adminApi';
import type { AdminRole, AdminRoleUpdate, AdminUser } from '../../../api/types';
import { useToast } from '../Toaster';
import { SaveButton, type SaveStatus } from '../users/SaveButton';
import { StatusSelect } from '../users/UserDetailsPanel';
import { TextField } from '../users/UserFormFields';
import { MembersSection } from '../MembersSection';
import { PermissionGroups } from './PermissionGroups';
import { ROLE_STATUS_LABEL, roleCode, roleMembers } from './rolesShared';
import { SERVICE_GROUPS, useRestrictedServices } from '../company/companyShared';

/** Saving spins at least this long, then "Saved" holds this long before the details come back. */
const MIN_SAVING_MS = 500;
const SAVED_HOLD_MS = 1000;
const PAGE_SIZE = 6;

type Tab = 'general' | 'permissions';

interface Draft {
  name: string;
  status: AdminRole['status'];
  permissions: string[];
}

interface Props {
  role: AdminRole;
  roles: AdminRole[];
  users: AdminUser[];
  onClose: () => void;
  /** After a save; the page reloads users too, as a rename moves them. */
  onChange: (role: AdminRole) => void;
  /** After a member was moved to another role. */
  onUsersChange: () => Promise<void>;
}

/**
 * Role Details from the right (Figma 3120:194062 General, 3120:194910 Permissions). The pencil
 * opens the edit view (3124:196388, 3124:196131): the role's name, its status and its permissions
 * change; its ID doesn't, so the edit view leaves it out.
 */
export function RoleDetailsPanel({ role, roles, users, onClose, onChange, onUsersChange }: Props) {
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('general');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [error, setError] = useState('');
  const [closing, setClosing] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const editing = draft !== null;
  const members = useMemo(() => roleMembers(role, users), [role, users]);
  // Services the company has turned off: locked here, and off for everyone with the role.
  const restricted = useRestrictedServices();
  const lockedHere = (draft?.permissions ?? role.permissions).filter((k) => restricted.includes(k));

  // Escape backs out of editing first, then closes. Menus inside claim it before this.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if (draft) cancelEdit();
      else setClosing(true);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panelRef.current?.focus();
    return () => {
      document.body.style.overflow = overflow;
      clearTimeout(savedTimer.current);
      opener?.focus?.();
    };
  }, []);

  const close = () => setClosing(true);
  const set = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  function cancelEdit() {
    clearTimeout(savedTimer.current);
    setDraft(null);
    setSaveStatus('idle');
    setError('');
  }

  /** Save → Saving… → Saved, held a moment on the edit view, then back to the details. A failure stays on "Try again". */
  async function save(e?: FormEvent) {
    e?.preventDefault();
    if (!draft || saveStatus === 'saving') return;
    const name = draft.name.trim();
    if (!name) {
      setError('Give the role a name.');
      setSaveStatus('error');
      return;
    }
    const patch: AdminRoleUpdate = {};
    if (name !== role.name) patch.name = name;
    if (draft.status !== role.status) patch.status = draft.status;
    if (draft.permissions.join() !== role.permissions.join()) patch.permissions = draft.permissions;
    if (Object.keys(patch).length === 0) return cancelEdit();
    clearTimeout(savedTimer.current);
    setSaveStatus('saving');
    setError('');
    try {
      const [next] = await Promise.all([adminApi.updateRole(role.id, patch), new Promise((r) => setTimeout(r, MIN_SAVING_MS))]);
      onChange(next);
      setSaveStatus('saved');
      toast(
        patch.status === 'inactive'
          ? { title: `${next.name} was archived!`, description: <>It can’t be given to anyone new</> }
          : { title: `${next.name} was updated!`, description: <>Saved your changes to the <strong>{next.name}</strong> role</> },
      );
      savedTimer.current = setTimeout(() => {
        // The Save button leaves with the edit view: keep focus in the panel.
        const hadFocus = (document.activeElement as HTMLButtonElement | null)?.form?.id === 'role-edit';
        setDraft(null);
        setSaveStatus('idle');
        if (hadFocus) panelRef.current?.focus();
      }, SAVED_HOLD_MS);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong. Please try again.';
      setSaveStatus('error');
      setError(message);
      toast({ tone: 'error', title: `Couldn’t save ${role.name}`, description: message });
    }
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'general', label: 'General' },
    { id: 'permissions', label: 'Permissions' },
  ];

  return (
    <>
      <div className={[panel.backdrop, closing ? panel.backdropOut : ''].join(' ').trim()} onMouseDown={close} />
      <div
        ref={panelRef}
        className={[panel.panel, styles.panel, closing ? panel.panelOut : ''].join(' ')}
        role="dialog"
        aria-modal="true"
        aria-label={editing ? `Edit ${role.name}` : `${role.name} role`}
        tabIndex={-1}
        onAnimationEnd={(e) => {
          if (closing && e.target === e.currentTarget) onClose();
        }}
      >
        <header className={panel.head}>
          <div className={panel.headText}>
            <h2 className={panel.headTitle}>Role Details</h2>
            <p className={panel.headSub} title={role.description}>
              {role.description || 'No description'}
            </p>
          </div>
          {editing ? (
            <SaveButton status={saveStatus} form="role-edit" className={panel.saveBtn} />
          ) : (
            <div className={panel.headActions}>
              <button
                type="button"
                className={panel.editBtn}
                aria-label="Edit role"
                onClick={() => {
                  setDraft({ name: role.name, status: role.status, permissions: role.permissions });
                  setError('');
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

        <form id="role-edit" className={panel.body} onSubmit={(e) => void save(e)} noValidate>
          <section className={[panel.hero, styles.hero].join(' ')}>
            <div className={panel.strip} aria-hidden="true" />
            <div className={styles.heroRow}>
              <h3 className={styles.name}>{draft?.name.trim() || role.name}</h3>
              {editing ? (
                <StatusSelect value={draft.status} label="Role status" labels={ROLE_STATUS_LABEL} onChange={(status) => set({ status })} />
              ) : (
                <span className={[panel.status, panel[`status_${role.status}`], styles.badge].join(' ')}>{ROLE_STATUS_LABEL[role.status]}</span>
              )}
            </div>
            <div className={[panel.tabs, styles.tabs].join(' ')} role="tablist" aria-label="Role details">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === t.id}
                  className={[panel.tab, styles.tab, tab === t.id ? panel.tabActive : ''].join(' ').trim()}
                  onClick={() => setTab(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </section>

          {error && (
            <p className={panel.error} role="alert">
              {error}
            </p>
          )}

          {tab === 'general' && (
            <>
              {editing ? (
                // Only the name changes here; the ID can't, so it isn't shown.
                <div className={[panel.grid, styles.details].join(' ')}>
                  <TextField label="Role Name" value={draft.name} onChange={(name) => set({ name })} />
                </div>
              ) : (
                <dl className={[panel.grid, styles.details].join(' ')}>
                  <div className={panel.item}>
                    <dt className={panel.label}>ID</dt>
                    <dd className={panel.value}>{roleCode(role)}</dd>
                  </div>
                  <div className={panel.item}>
                    <dt className={panel.label}>Role Name</dt>
                    <dd className={panel.value}>{role.name}</dd>
                  </div>
                  <div className={panel.item}>
                    <dt className={panel.label}>Total Members</dt>
                    <dd className={panel.value}>{members.length}</dd>
                  </div>
                </dl>
              )}
              <Members role={role} roles={roles} members={members} onUsersChange={onUsersChange} />
            </>
          )}

          {tab === 'permissions' && (
            <div className={styles.permissions}>
              {lockedHere.length > 0 && (
                <p className={styles.restrictedNote} role="note">
                  <img src="/admin/company/info.svg" alt="" width={20} height={20} />
                  <span>
                    {lockedHere.length === 1 ? 'One of this role’s services is' : `${lockedHere.length} of this role’s services are`} turned off for the whole company in
                    Company Settings ({lockedHere.map((k) => SERVICE_GROUPS.flatMap((g) => g.rows.flat()).find((c) => c.key === k)?.title ?? k).join(', ')}), so{' '}
                    {members.length === 1 ? 'its member can’t' : members.length ? `its ${members.length} members can’t` : 'nobody with it can'} use{' '}
                    {lockedHere.length === 1 ? 'it' : 'them'}.
                  </span>
                </p>
              )}
              <PermissionGroups value={draft?.permissions ?? role.permissions} restricted={restricted} onChange={editing ? (permissions) => set({ permissions }) : undefined} />
            </div>
          )}
        </form>
      </div>
    </>
  );
}

/** The role's members, each with a ⋯ to move them to another active role. */
function Members({ role, roles, members, onUsersChange }: { role: AdminRole; roles: AdminRole[]; members: AdminUser[]; onUsersChange: () => Promise<void> }) {
  const toast = useToast();
  const others = roles.filter((r) => r.status === 'active' && r.id !== role.id);

  async function move(u: AdminUser, toId: string) {
    const to = others.find((r) => r.id === toId);
    if (!to) return;
    try {
      await adminApi.updateUser(u.id, { role: to.name });
      await onUsersChange();
      toast({ title: `${u.name} is now ${/^[aeiou]/i.test(to.name) ? 'an' : 'a'} ${to.name}`, description: <>Moved from <strong>{role.name}</strong></> });
    } catch (err) {
      toast({ tone: 'error', title: `Couldn’t change ${u.name}’s role`, description: err instanceof Error ? err.message : 'Please try again.' });
    }
  }

  return (
    <MembersSection
      className={styles.members}
      label={`${role.name} members`}
      tableLabel={`Users with the ${role.name} role`}
      members={members}
      empty="No one has this role yet."
      moves={others.map((r) => ({ id: r.id, label: `Make ${r.name}` }))}
      onMove={move}
      pageSize={PAGE_SIZE}
    />
  );
}
