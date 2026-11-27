import { useMemo, useState } from 'react';
import ui from '../AdminControls.module.css';
import users from '../users/UsersPanel.module.css';
import styles from './SpacesPanel.module.css';
import { adminApi } from '../../../api/adminApi';
import type { AdminBuilding, AdminSpaceView, SpaceStatus } from '../../../api/types';
import { AdminModal } from '../AdminModal';
import { useToast } from '../Toaster';
import { STATUS_LABEL } from '../users/userShared';
import { shortBuilding } from '../events/eventShared';
import { BuildingDialog } from './BuildingDialog';
import { buildingCode, sqft } from './spaceShared';

interface Props {
  buildings: AdminBuilding[] | null;
  spaces: AdminSpaceView[];
  loadError: string;
  onCreated: (building: AdminBuilding) => void;
  onChange: (building: AdminBuilding) => void;
  onOpen: (buildingId: string) => void;
}

/** Building (Figma 1588:138969): the buildings where the company has space, with search and Add Building. */
export function BuildingsTab({ buildings, spaces, loadError, onCreated, onChange, onOpen }: Props) {
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const [archiving, setArchiving] = useState<AdminBuilding | null>(null);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (buildings ?? []).filter((b) => !q || [b.name, b.address, b.city, b.area, buildingCode(b)].some((v) => v.toLowerCase().includes(q)));
  }, [buildings, query]);

  const spaceCount = (b: AdminBuilding) => spaces.filter((s) => s.buildingId === b.id && s.status === 'active').length;

  async function setStatus(b: AdminBuilding, status: SpaceStatus) {
    try {
      onChange(await adminApi.updateBuilding(b.id, { status }));
      toast(
        status === 'inactive'
          ? { title: `${b.name} was archived!`, description: <>Its spaces won’t take bookings</> }
          : { title: `${b.name} was restored!`, description: <>Restore its spaces from <strong>All Spaces</strong> to take bookings again</> },
      );
      setArchiving(null);
    } catch (err) {
      toast({ tone: 'error', title: `Couldn’t ${status === 'inactive' ? 'archive' : 'restore'} ${b.name}`, description: err instanceof Error ? err.message : 'Please try again.' });
    }
  }

  return (
    <>
      <div className={styles.bar}>
        <div className={styles.barText}>
          <h2 className={styles.barTitle}>Buildings</h2>
          <p className={styles.barDescription}>WeWork buildings where your company has space</p>
        </div>
        <div className={styles.controls}>
          <label className={[ui.search, styles.search].join(' ')}>
            <span className={ui.srOnly}>Search buildings</span>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search Location, Building, Floors" />
            <img src="/admin/search.svg" alt="" width={20} height={20} />
          </label>
          <button type="button" className={[ui.btn, ui.btnPrimary].join(' ')} disabled={!buildings} onClick={() => setAdding(true)}>
            Add Building
            <img src="/admin/add.svg" alt="" width={20} height={20} />
          </button>
        </div>
      </div>

      <div className={styles.table} role="table" aria-label="Buildings">
        <div className={[styles.headRow, styles.buildingCols].join(' ')} role="row">
          {['ID', 'BUILDING NAME', 'LOCATION', 'FLOORS', 'LEASED AREA (SQ.ft)', 'STATUS'].map((h) => (
            <span key={h} role="columnheader">
              {h}
            </span>
          ))}
          <span role="columnheader" className={ui.srOnly}>
            Actions
          </span>
        </div>

        {buildings === null && !loadError && <p className={ui.empty}>Loading buildings…</p>}
        {loadError && <p className={ui.empty}>{loadError}</p>}
        {buildings !== null && shown.length === 0 && <p className={ui.empty}>{buildings.length === 0 ? 'No buildings yet.' : 'No buildings match your search.'}</p>}

        {shown.map((b) => {
          const active = b.status === 'active';
          return (
            <div
              key={b.id}
              className={[styles.row, styles.rowLink, styles.buildingCols, active ? '' : users.rowInactive].join(' ').trim()}
              role="row"
              tabIndex={0}
              aria-label={b.name}
              onClick={() => onOpen(b.id)}
              onKeyDown={(e) => {
                if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault();
                  onOpen(b.id);
                }
              }}
            >
              <span role="cell">
                <span className={users.code}>{buildingCode(b)}</span>
              </span>
              <span role="cell" className={styles.strong}>
                {b.name}
              </span>
              <span role="cell" className={styles.stack}>
                <span className={[styles.strong, styles.nowrap].join(' ')}>{shortBuilding(b.name)}</span>
                <span className={styles.muted}>{b.address}</span>
              </span>
              <span role="cell" className={styles.cell}>
                {b.floors}
              </span>
              <span role="cell" className={styles.cell}>
                {sqft(b.leasedArea)}
              </span>
              <span role="cell">
                <span className={[ui.badge, users[`status_${b.status}`]].join(' ')}>{STATUS_LABEL[b.status]}</span>
              </span>
              <span role="cell" className={styles.actions}>
                <button
                  type="button"
                  className={ui.iconBtn}
                  aria-label={`View ${b.name}`}
                  title="View"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpen(b.id);
                  }}
                >
                  <img src="/admin/eye.svg" alt="" width={20} height={20} />
                </button>
                <button
                  type="button"
                  className={[ui.iconBtn, active ? '' : ui.iconBtnOn].join(' ').trim()}
                  aria-label={`${active ? 'Archive' : 'Restore'} ${b.name}`}
                  title={active ? 'Archive' : 'Restore'}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (active) setArchiving(b);
                    else void setStatus(b, 'active');
                  }}
                >
                  <img src="/admin/archive.svg" alt="" width={20} height={20} />
                </button>
              </span>
            </div>
          );
        })}
      </div>

      {adding && (
        <BuildingDialog
          onClose={() => setAdding(false)}
          onSaved={(created) => {
            onCreated(created);
            setAdding(false);
          }}
        />
      )}

      {archiving && (
        <AdminModal
          title="Archive building?"
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
            {archiving.name}
            {spaceCount(archiving) > 0 ? ` and its ${spaceCount(archiving)} ${spaceCount(archiving) === 1 ? 'space' : 'spaces'}` : ''} will stop taking new bookings. You can
            restore it any time.
          </p>
        </AdminModal>
      )}
    </>
  );
}
