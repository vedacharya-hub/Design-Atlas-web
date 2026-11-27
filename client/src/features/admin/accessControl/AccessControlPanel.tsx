import { useEffect, useMemo, useState } from 'react';
// Shared controls, the Users table's tags and badges, the Spaces tables; this page's rules last.
import ui from '../AdminControls.module.css';
import users from '../users/UsersPanel.module.css';
import tables from '../spaces/SpacesPanel.module.css';
import styles from './AccessControlPanel.module.css';
import { adminApi } from '../../../api/adminApi';
import type { AdminAccessLevel, AdminUser, WorkLocation } from '../../../api/types';
import { AdminPanelHeader } from '../AdminPanelHeader';
import { AdminModal } from '../AdminModal';
import { useToast } from '../Toaster';
import { CreateAccessDialog } from './CreateAccessDialog';
import { AccessDetailsPanel } from './AccessDetailsPanel';
import { ACCESS_STATUS_LABEL, accessCode, accessLocationCount, accessMembers } from './accessShared';

/**
 * Admin → Access Control (Figma 1607:205373): each access level, how many of the buildings it
 * opens, its status. A user's access level (Admin → Users) is one of these.
 */
export function AccessControlPanel() {
  const toast = useToast();
  const [levels, setLevels] = useState<AdminAccessLevel[] | null>(null);
  const [people, setPeople] = useState<AdminUser[]>([]);
  const [locations, setLocations] = useState<WorkLocation[]>([]);
  const [loadError, setLoadError] = useState('');
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [archiving, setArchiving] = useState<AdminAccessLevel | null>(null);

  useEffect(() => {
    Promise.all([adminApi.getAccessLevels(), adminApi.getUsers(), adminApi.getLocations()])
      .then(([a, u, l]) => {
        setLevels(a);
        setPeople(u);
        setLocations(l);
      })
      .catch(() => setLoadError('Couldn’t load access levels. Please try again.'));
  }, []);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (levels ?? []).filter((a) => !q || `${a.name} ${accessCode(a)} ${a.description}`.toLowerCase().includes(q));
  }, [levels, query]);
  const open = levels?.find((a) => a.id === openId);

  const replace = (next: AdminAccessLevel) => setLevels((list) => (list ?? []).map((a) => (a.id === next.id ? next : a)));
  /** Renames and moves change who holds which level. */
  const reloadUsers = () => adminApi.getUsers().then(setPeople).catch(() => undefined);

  async function setStatus(a: AdminAccessLevel, status: AdminAccessLevel['status']) {
    try {
      replace(await adminApi.updateAccessLevel(a.id, { status }));
      toast(
        status === 'inactive'
          ? { title: `${a.name} was archived!`, description: <>It can’t be given to anyone new</> }
          : { title: `${a.name} was restored!`, description: <>It can be given to users again</> },
      );
      setArchiving(null);
    } catch (err) {
      toast({ tone: 'error', title: `Couldn’t ${status === 'inactive' ? 'archive' : 'restore'} ${a.name}`, description: err instanceof Error ? err.message : 'Please try again.' });
    }
  }

  const holders = archiving ? accessMembers(archiving, people).length : 0;

  return (
    <>
      <AdminPanelHeader title="Access Control" description="Decide which buildings each access level opens">
        <label className={[ui.search, styles.search].join(' ')}>
          <span className={ui.srOnly}>Search access levels</span>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by level" />
          <img src="/admin/search.svg" alt="" width={20} height={20} />
        </label>
        <button type="button" className={[ui.btn, ui.btnPrimary].join(' ')} disabled={!levels} onClick={() => setCreating(true)}>
          Create Access Control
          <img src="/admin/add.svg" alt="" width={20} height={20} />
        </button>
      </AdminPanelHeader>

      <div className={tables.table} role="table" aria-label="Access levels">
        <div className={[tables.headRow, styles.cols].join(' ')} role="row">
          {['ID', 'LEVEL', 'ACCESS LOCATIONS', 'STATUS'].map((h) => (
            <span key={h} role="columnheader">
              {h}
            </span>
          ))}
          <span role="columnheader" className={ui.srOnly}>
            Actions
          </span>
        </div>

        {levels === null && !loadError && <p className={ui.empty}>Loading access levels…</p>}
        {loadError && <p className={ui.empty}>{loadError}</p>}
        {levels !== null && shown.length === 0 && (
          <p className={ui.empty}>{levels.length === 0 ? 'No access levels yet. Create one.' : 'No access levels match your search.'}</p>
        )}

        {shown.map((a) => {
          const active = a.status === 'active';
          return (
            <div
              key={a.id}
              className={[tables.row, tables.rowLink, styles.cols, active ? '' : users.rowInactive].join(' ').trim()}
              role="row"
              tabIndex={0}
              aria-label={a.name}
              onClick={() => setOpenId(a.id)}
              onKeyDown={(e) => {
                if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault();
                  setOpenId(a.id);
                }
              }}
            >
              <span role="cell">
                <span className={users.code}>{accessCode(a)}</span>
              </span>
              <span role="cell" className={[tables.strong, tables.nowrap].join(' ')} title={a.name}>
                {a.name}
              </span>
              <span role="cell" className={tables.cell} title={a.globalAccess ? 'And every WeWork centre outside India' : undefined}>
                {accessLocationCount(a)}/{locations.length}
                {a.globalAccess && <span className={styles.global}> + Global</span>}
              </span>
              <span role="cell">
                <span className={[ui.badge, users[`status_${a.status}`]].join(' ')}>{ACCESS_STATUS_LABEL[a.status]}</span>
              </span>
              <span role="cell" className={tables.actions}>
                <button
                  type="button"
                  className={ui.iconBtn}
                  aria-label={`View ${a.name}`}
                  title="View"
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpenId(a.id);
                  }}
                >
                  <img src="/admin/eye.svg" alt="" width={20} height={20} />
                </button>
                <button
                  type="button"
                  className={[ui.iconBtn, active ? '' : ui.iconBtnOn].join(' ').trim()}
                  aria-label={`${active ? 'Archive' : 'Restore'} ${a.name}`}
                  title={active ? 'Archive' : 'Restore'}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (active) setArchiving(a);
                    else void setStatus(a, 'active');
                  }}
                >
                  <img src="/admin/archive.svg" alt="" width={20} height={20} />
                </button>
              </span>
            </div>
          );
        })}
      </div>

      {creating && levels && (
        <CreateAccessDialog
          locations={locations}
          onClose={() => setCreating(false)}
          onCreated={(created) => {
            setLevels((list) => [...(list ?? []), created]);
            setCreating(false);
          }}
        />
      )}

      {open && (
        <AccessDetailsPanel
          key={open.id}
          level={open}
          levels={levels ?? []}
          users={people}
          locations={locations}
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
          title="Archive access level?"
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
            {holders > 0 && ` The ${holders} ${holders === 1 ? 'user who has it keeps' : 'users who have it keep'} it until you change their access level.`} You can
            restore it any time.
          </p>
        </AdminModal>
      )}
    </>
  );
}
