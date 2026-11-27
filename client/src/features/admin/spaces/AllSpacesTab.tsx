import { useMemo, useState } from 'react';
// Shared controls, the Users table's tags and badges, then this page's own rules.
import ui from '../AdminControls.module.css';
import users from '../users/UsersPanel.module.css';
import styles from './SpacesPanel.module.css';
import { adminApi } from '../../../api/adminApi';
import type { AdminBuilding, AdminSpaceView, SpaceStatus } from '../../../api/types';
import { AdminModal } from '../AdminModal';
import { useToast } from '../Toaster';
import { STATUS_LABEL } from '../users/userShared';
import { AddSpaceDialog } from './AddSpaceDialog';
import { SpacesFilterPanel, NO_SPACE_FILTERS, countSpaceFilters, matchesSpaceFilters, type SpaceFilters } from './SpacesFilterPanel';
import { floorLabel, spaceCode } from './spaceShared';

interface Props {
  spaces: AdminSpaceView[] | null;
  buildings: AdminBuilding[];
  loadError: string;
  onCreated: (space: AdminSpaceView) => void;
  onChange: (space: AdminSpaceView) => void;
  onOpen: (spaceId: string) => void;
}

/** All Spaces (Figma 1588:138055): every floor the company has, with search, filters and Add Space. */
export function AllSpacesTab({ spaces, buildings, loadError, onCreated, onChange, onOpen }: Props) {
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<SpaceFilters>(NO_SPACE_FILTERS);
  const [filterOpen, setFilterOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [archiving, setArchiving] = useState<AdminSpaceView | null>(null);
  const filterCount = countSpaceFilters(filters);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (spaces ?? []).filter(
      (s) =>
        matchesSpaceFilters(s, filters) &&
        (!q || [s.building, s.city, s.area, floorLabel(s.floor), spaceCode(s), s.officeNo].some((v) => v.toLowerCase().includes(q))),
    );
  }, [spaces, query, filters]);

  async function setStatus(s: AdminSpaceView, status: SpaceStatus) {
    try {
      onChange(await adminApi.updateSpace(s.id, { status }));
      const where = `${floorLabel(s.floor)}, ${s.building}`;
      toast(
        status === 'inactive'
          ? { title: 'Space archived!', description: <><strong>{where}</strong> won’t take bookings</> }
          : { title: 'Space restored!', description: <><strong>{where}</strong> is taking bookings again</> },
      );
      setArchiving(null);
    } catch (err) {
      toast({ tone: 'error', title: `Couldn’t ${status === 'inactive' ? 'archive' : 'restore'} the space`, description: err instanceof Error ? err.message : 'Please try again.' });
    }
  }

  return (
    <>
      <div className={styles.bar}>
        <div className={styles.barText}>
          <h2 className={styles.barTitle}>All Spaces</h2>
          <p className={styles.barDescription}>Private offices and sittings at WeWork</p>
        </div>
        <div className={styles.controls}>
          <div className={styles.searchFilter}>
            <label className={[ui.search, styles.search].join(' ')}>
              <span className={ui.srOnly}>Search spaces</span>
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search Location, Building, Floors" />
              <img src="/admin/search.svg" alt="" width={20} height={20} />
            </label>
            <button
              type="button"
              className={[ui.btn, ui.btnSecondary, filterCount ? ui.btnSecondaryOn : ''].join(' ').trim()}
              aria-haspopup="dialog"
              aria-expanded={filterOpen}
              onClick={() => setFilterOpen(true)}
            >
              <img src="/admin/filter.svg" alt="" width={24} height={24} />
              Filter
              {filterCount > 0 && <span className={ui.filterCount}>{filterCount}</span>}
            </button>
          </div>
          <button type="button" className={[ui.btn, ui.btnPrimary].join(' ')} disabled={!spaces || buildings.length === 0} onClick={() => setAdding(true)}>
            Add Space
            <img src="/admin/add.svg" alt="" width={20} height={20} />
          </button>
        </div>
      </div>

      <div className={styles.table} role="table" aria-label="Spaces">
        <div className={[styles.headRow, styles.spaceCols].join(' ')} role="row">
          <span role="columnheader">ID</span>
          <span role="columnheader">BUILDING</span>
          <span role="columnheader">FLOOR</span>
          <span role="columnheader" className={styles.headInfo}>
            SPACES
            <img src="/admin/spaces/info.svg" alt="Booked today out of the total" title="Booked today out of the total" width={18} height={18} />
          </span>
          <span role="columnheader">TIME ZONE</span>
          <span role="columnheader">STATUS</span>
          <span role="columnheader" className={ui.srOnly}>
            Actions
          </span>
        </div>

        {spaces === null && !loadError && <p className={ui.empty}>Loading spaces…</p>}
        {loadError && <p className={ui.empty}>{loadError}</p>}
        {spaces !== null && shown.length === 0 && (
          <p className={ui.empty}>{spaces.length === 0 ? 'No spaces yet. Add the floors your company has.' : 'No spaces match your search or filters.'}</p>
        )}

        {shown.map((s) => {
          const active = s.status === 'active';
          return (
            <div
              key={s.id}
              className={[styles.row, styles.rowLink, styles.spaceCols, active ? '' : users.rowInactive].join(' ').trim()}
              role="row"
              tabIndex={0}
              aria-label={`${floorLabel(s.floor)}, ${s.building}`}
              onClick={() => onOpen(s.id)}
              onKeyDown={(e) => {
                if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault();
                  onOpen(s.id);
                }
              }}
            >
              <span role="cell">
                <span className={users.code}>{spaceCode(s)}</span>
              </span>
              <span role="cell" className={styles.stack}>
                <span className={[styles.strong, styles.nowrap].join(' ')} title={s.building}>
                  {s.building}
                </span>
                <span className={[styles.muted, styles.nowrap].join(' ')}>{[s.city, s.state].filter(Boolean).join(', ')}</span>
              </span>
              <span role="cell" className={styles.cell}>
                {floorLabel(s.floor)}
              </span>
              <span role="cell" className={styles.cell}>
                {s.booked}/{s.capacity}
              </span>
              <span role="cell" className={styles.cell}>
                {s.timeZone}
              </span>
              <span role="cell">
                <span className={[ui.badge, users[`status_${s.status}`]].join(' ')}>{STATUS_LABEL[s.status]}</span>
              </span>
              <span role="cell" className={styles.actions}>
                <button
                  type="button"
                  className={ui.iconBtn}
                  aria-label={`View ${floorLabel(s.floor)}, ${s.building}`}
                  title="View"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpen(s.id);
                  }}
                >
                  <img src="/admin/eye.svg" alt="" width={20} height={20} />
                </button>
                <button
                  type="button"
                  className={[ui.iconBtn, active ? '' : ui.iconBtnOn].join(' ').trim()}
                  aria-label={`${active ? 'Archive' : 'Restore'} ${floorLabel(s.floor)}, ${s.building}`}
                  title={active ? 'Archive' : 'Restore'}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (active) setArchiving(s);
                    else void setStatus(s, 'active');
                  }}
                >
                  <img src="/admin/archive.svg" alt="" width={20} height={20} />
                </button>
              </span>
            </div>
          );
        })}
      </div>

      {filterOpen && spaces && (
        <SpacesFilterPanel spaces={spaces} buildings={buildings} value={filters} onApply={setFilters} onClose={() => setFilterOpen(false)} />
      )}

      {adding && spaces && (
        <AddSpaceDialog
          buildings={buildings}
          spaces={spaces}
          onClose={() => setAdding(false)}
          onCreated={(created) => {
            onCreated(created);
            setAdding(false);
          }}
        />
      )}

      {archiving && (
        <AdminModal
          title="Archive space?"
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
            The {floorLabel(archiving.floor)} at {archiving.building} ({spaceCode(archiving)}) will stop taking new bookings. You can restore it any time.
          </p>
        </AdminModal>
      )}
    </>
  );
}
