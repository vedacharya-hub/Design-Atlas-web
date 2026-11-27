import { useEffect, useRef, useState } from 'react';
// Shared controls, the user table's tags, the side panel shell, the org unit panels; this panel's rules last.
import ui from '../AdminControls.module.css';
import table from '../users/UsersPanel.module.css';
import panel from '../users/UserDetailsPanel.module.css';
import org from '../users/OrgUnitPanel.module.css';
import styles from './BuildingDetailsPanel.module.css';
import type { AdminBuilding, AdminSpaceView } from '../../../api/types';
import { STATUS_LABEL } from '../users/userShared';
import { BuildingDialog } from './BuildingDialog';
import { buildingCode, floorLabel, spaceCode, sqft } from './spaceShared';

interface Props {
  building: AdminBuilding;
  /** The building's spaces. */
  spaces: AdminSpaceView[];
  onClose: () => void;
  onChange: (building: AdminBuilding) => void;
  /** A space's eye: its details take over. */
  onOpenSpace: (spaceId: string) => void;
}

/**
 * Building Details, in the same 584px right-hand panel as a department's: the building's ID, place,
 * floors and leased area, then its spaces. The pencil edits it in the Add Building dialog.
 */
export function BuildingDetailsPanel({ building, spaces, onClose, onChange, onOpenSpace }: Props) {
  const [editing, setEditing] = useState(false);
  const [closing, setClosing] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Escape closes; the edit dialog claims it first while it's open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) setClosing(true);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

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

  const close = () => setClosing(true);
  const sorted = [...spaces].sort((a, b) => a.floor - b.floor);

  return (
    <>
      <div className={[panel.backdrop, closing ? panel.backdropOut : ''].join(' ').trim()} onMouseDown={close} />
      <div
        ref={panelRef}
        className={[panel.panel, org.panel, closing ? panel.panelOut : ''].join(' ')}
        role="dialog"
        aria-modal="true"
        aria-label={building.name}
        tabIndex={-1}
        onAnimationEnd={(e) => {
          if (closing && e.target === e.currentTarget) onClose();
        }}
      >
        <header className={panel.head}>
          <div className={panel.headText}>
            <h2 className={panel.headTitle}>Building Details</h2>
            <p className={panel.headSub} title={building.address}>
              {building.address}
            </p>
          </div>
          <div className={panel.headActions}>
            <button type="button" className={panel.editBtn} aria-label="Edit building details" onClick={() => setEditing(true)}>
              <img src="/admin/user/edit-24.svg" alt="" width={24} height={24} />
            </button>
            <button type="button" className={panel.closeBtn} aria-label="Close" onClick={close}>
              <img src="/admin/user/close.svg" alt="" width={24} height={24} />
            </button>
          </div>
        </header>

        <div className={panel.body}>
          <section className={[panel.hero, org.hero].join(' ')}>
            <div className={panel.strip} aria-hidden="true" />
            <div className={org.heroRow}>
              <h3 className={org.name}>{building.name}</h3>
              <span className={[panel.status, panel[`status_${building.status}`]].join(' ')}>{STATUS_LABEL[building.status]}</span>
            </div>
          </section>

          <dl className={[panel.grid, org.details].join(' ')}>
            <Item label="BUILDING ID" value={buildingCode(building)} />
            <Item label="CITY" value={`${building.city}, ${building.state}`} />
            <Item label="AREA" value={building.area || '-'} />
            <Item label="TIME ZONE" value={building.timeZone} />
            <Item label="FLOORS" value={String(building.floors)} />
            <Item label="LEASED AREA (Sq.Ft.)" value={`${sqft(building.leasedArea)} Sq.Ft.`} />
          </dl>

          <section className={org.units} aria-labelledby="building-spaces">
            <div className={org.unitsBar}>
              <h3 id="building-spaces" className={org.unitsTitle}>
                Spaces
              </h3>
              <span className={org.unitCount}>
                {spaces.length} {spaces.length === 1 ? 'Space' : 'Spaces'}
              </span>
            </div>
            <div className={org.card}>
              <div role="table" aria-label={`Spaces in ${building.name}`}>
                <div className={[org.headRow, styles.cols].join(' ')} role="row">
                  <span role="columnheader">ID</span>
                  <span role="columnheader">FLOOR</span>
                  <span role="columnheader">SPACES</span>
                  <span role="columnheader">STATUS</span>
                  <span role="columnheader" className={panel.srOnly}>
                    Actions
                  </span>
                </div>
                {sorted.length === 0 && <p className={org.empty}>No spaces in this building yet. Add one from All Spaces.</p>}
                {sorted.map((s) => (
                  <div key={s.id} className={[org.row, styles.cols, s.status === 'inactive' ? table.rowInactive : ''].join(' ').trim()} role="row">
                    <span role="cell">
                      <span className={table.code}>{spaceCode(s)}</span>
                    </span>
                    <span role="cell" className={org.unitName}>
                      {floorLabel(s.floor)}
                    </span>
                    <span role="cell" className={org.members}>
                      {s.booked}/{s.capacity}
                    </span>
                    <span role="cell">
                      <span className={[ui.badge, table[`status_${s.status}`]].join(' ')}>{STATUS_LABEL[s.status]}</span>
                    </span>
                    <span role="cell" className={org.actions}>
                      <button type="button" className={ui.iconBtn} aria-label={`View the ${floorLabel(s.floor)}`} title="View" onClick={() => onOpenSpace(s.id)}>
                        <img src="/admin/eye.svg" alt="" width={20} height={20} />
                      </button>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>
      </div>

      {editing && (
        <BuildingDialog
          raised
          building={building}
          onClose={() => setEditing(false)}
          onSaved={(next) => {
            onChange(next);
            setEditing(false);
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
