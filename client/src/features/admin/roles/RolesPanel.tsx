import { useEffect, useMemo, useState } from 'react';
// Shared controls, the Users table's tags and badges, the Spaces tables; this page's rules last.
import ui from '../AdminControls.module.css';
import users from '../users/UsersPanel.module.css';
import tables from '../spaces/SpacesPanel.module.css';
import styles from './RolesPanel.module.css';
import { adminApi } from '../../../api/adminApi';
import type { AdminRole, AdminUser } from '../../../api/types';
import { AdminPanelHeader } from '../AdminPanelHeader';
import { AdminModal } from '../AdminModal';
import { useToast } from '../Toaster';
import { AddRoleDialog } from './AddRoleDialog';
import { RoleDetailsPanel } from './RoleDetailsPanel';
import { PERMISSION_COUNT, ROLE_STATUS_LABEL, roleCode, roleMembers } from './rolesShared';
import { useRestrictedServices } from '../company/companyShared';

/** Admin → Roles (Figma 1607:200614): each role, how many permissions and users it has, its status. */
export function RolesPanel() {
  const toast = useToast();
  const [roles, setRoles] = useState<AdminRole[] | null>(null);
  const [people, setPeople] = useState<AdminUser[]>([]);
  const [loadError, setLoadError] = useState('');
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [archiving, setArchiving] = useState<AdminRole | null>(null);
  const restricted = useRestrictedServices();

  useEffect(() => {
    Promise.all([adminApi.getRoles(), adminApi.getUsers()])
      .then(([r, u]) => {
        setRoles(r);
        setPeople(u);
      })
      .catch(() => setLoadError('Couldn’t load roles. Please try again.'));
  }, []);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (roles ?? []).filter((r) => !q || `${r.name} ${roleCode(r)} ${r.description}`.toLowerCase().includes(q));
  }, [roles, query]);
  const open = roles?.find((r) => r.id === openId);

  const replace = (next: AdminRole) => setRoles((list) => (list ?? []).map((r) => (r.id === next.id ? next : r)));
  /** Renames and moves change who holds which role. */
  const reloadUsers = () => adminApi.getUsers().then(setPeople).catch(() => undefined);

  async function setStatus(r: AdminRole, status: AdminRole['status']) {
    try {
      replace(await adminApi.updateRole(r.id, { status }));
      toast(
        status === 'inactive'
          ? { title: `${r.name} was archived!`, description: <>It can’t be given to anyone new</> }
          : { title: `${r.name} was restored!`, description: <>It can be given to users again</> },
      );
      setArchiving(null);
    } catch (err) {
      toast({ tone: 'error', title: `Couldn’t ${status === 'inactive' ? 'archive' : 'restore'} ${r.name}`, description: err instanceof Error ? err.message : 'Please try again.' });
    }
  }

  return (
    <>
      <AdminPanelHeader title="Roles" description="Decide what each role can book and manage">
        <label className={[ui.search, styles.search].join(' ')}>
          <span className={ui.srOnly}>Search roles</span>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by role" />
          <img src="/admin/search.svg" alt="" width={20} height={20} />
        </label>
        <button type="button" className={[ui.btn, ui.btnPrimary].join(' ')} disabled={!roles} onClick={() => setAdding(true)}>
          Add Role
          <img src="/admin/add.svg" alt="" width={20} height={20} />
        </button>
      </AdminPanelHeader>

      <div className={tables.table} role="table" aria-label="Roles">
        <div className={[tables.headRow, styles.cols].join(' ')} role="row">
          {['ID', 'ROLE', 'PERMISSIONS', 'USERS', 'STATUS'].map((h) => (
            <span key={h} role="columnheader">
              {h}
            </span>
          ))}
          <span role="columnheader" className={ui.srOnly}>
            Actions
          </span>
        </div>

        {roles === null && !loadError && <p className={ui.empty}>Loading roles…</p>}
        {loadError && <p className={ui.empty}>{loadError}</p>}
        {roles !== null && shown.length === 0 && <p className={ui.empty}>{roles.length === 0 ? 'No roles yet. Add one.' : 'No roles match your search.'}</p>}

        {shown.map((r) => {
          const active = r.status === 'active';
          return (
            <div
              key={r.id}
              className={[tables.row, tables.rowLink, styles.cols, active ? '' : users.rowInactive].join(' ').trim()}
              role="row"
              tabIndex={0}
              aria-label={r.name}
              onClick={() => setOpenId(r.id)}
              onKeyDown={(e) => {
                if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault();
                  setOpenId(r.id);
                }
              }}
            >
              <span role="cell">
                <span className={users.code}>{roleCode(r)}</span>
              </span>
              <span role="cell" className={[tables.strong, tables.nowrap].join(' ')} title={r.name}>
                {r.name}
              </span>
{(() => {
                // What the role can actually use: its permissions less the ones the company turned off.
                const locked = r.permissions.filter((k) => restricted.includes(k)).length;
                return (
                  <span role="cell" className={tables.cell} title={locked ? `${locked} restricted by admin in Company Settings` : undefined}>
                    {r.permissions.length - locked}/{PERMISSION_COUNT}
                    {locked > 0 && <span className={styles.locked}> · {locked} restricted</span>}
                  </span>
                );
              })()}
              <span role="cell" className={tables.cell}>
                {roleMembers(r, people).length}
              </span>
              <span role="cell">
                <span className={[ui.badge, users[`status_${r.status}`]].join(' ')}>{ROLE_STATUS_LABEL[r.status]}</span>
              </span>
              <span role="cell" className={tables.actions}>
                <button
                  type="button"
                  className={ui.iconBtn}
                  aria-label={`View ${r.name}`}
                  title="View"
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpenId(r.id);
                  }}
                >
                  <img src="/admin/eye.svg" alt="" width={20} height={20} />
                </button>
                <button
                  type="button"
                  className={[ui.iconBtn, active ? '' : ui.iconBtnOn].join(' ').trim()}
                  aria-label={`${active ? 'Archive' : 'Restore'} ${r.name}`}
                  title={active ? 'Archive' : 'Restore'}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (active) setArchiving(r);
                    else void setStatus(r, 'active');
                  }}
                >
                  <img src="/admin/archive.svg" alt="" width={20} height={20} />
                </button>
              </span>
            </div>
          );
        })}
      </div>

      {adding && roles && (
        <AddRoleDialog
          onClose={() => setAdding(false)}
          onCreated={(created) => {
            setRoles((list) => [...(list ?? []), created]);
            setAdding(false);
          }}
        />
      )}

      {open && (
        <RoleDetailsPanel
          key={open.id}
          role={open}
          roles={roles ?? []}
          users={people}
          onClose={() => setOpenId(null)}
          onChange={(next) => {
            replace(next);
            void reloadUsers();
          }}
          onUsersChange={reloadUsers}
        />
      )}

      {archiving && (
        <AdminModal
          title="Archive role?"
          width={440}
          onClose={() => setArchiving(null)}
          footer={
            <>
              <button type="button" className={[ui.btn, ui.btnSecondary].join(' ')} onClick={() => setArchiving(null)}>
                Cancel
              </button>
              <button type="button" className={[ui.btn, ui.btnDanger].join(' ')} onClick={() => void setStatus(archiving, 'inactive')}>
                Archive
              </button>
            </>
          }
        >
          <p className={ui.confirm}>
            {archiving.name} can’t be given to anyone new.
            {roleMembers(archiving, people).length > 0 &&
              ` The ${roleMembers(archiving, people).length} ${roleMembers(archiving, people).length === 1 ? 'user who has it keeps' : 'users who have it keep'} it until you change their role.`}{' '}
            You can restore it any time.
          </p>
        </AdminModal>
      )}
    </>
  );
}
