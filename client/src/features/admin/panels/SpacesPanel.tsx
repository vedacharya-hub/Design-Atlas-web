import { useEffect, useState } from 'react';
import styles from './Panels.module.css';
import { adminApi } from '../../../api/adminApi';
import { AdminPanelHeader } from '../AdminPanelHeader';
import { GeneralTab } from '../tabs/GeneralTab';
import { SpaceMapTab } from '../tabs/SpaceMapTab';
import { SpaceZonesTab } from '../tabs/SpaceZonesTab';
import { ShiftsTab } from '../tabs/ShiftsTab';
import type { Floor, Seat } from '../../../api/types';

const FLOOR_ID = 'floor-2';

type SpaceTab = 'general' | 'map' | 'zones' | 'shifts';

const SPACE_TABS: { value: SpaceTab; label: string }[] = [
  { value: 'general', label: 'General' },
  { value: 'map', label: 'Space Map' },
  { value: 'zones', label: 'Space Zones' },
  { value: 'shifts', label: 'Shifts' },
];

/** Admin → Spaces: the floor's details with General / Space Map / Space Zones / Shifts tabs. */
export function SpacesPanel() {
  const [tab, setTab] = useState<SpaceTab>('general');
  const [floor, setFloor] = useState<Floor | null>(null);
  const [seats, setSeats] = useState<Seat[]>([]);

  const refreshFloor = () => {
    adminApi.getFloor(FLOOR_ID).then(setFloor);
  };

  useEffect(() => {
    refreshFloor();
    adminApi.getSeats(FLOOR_ID).then(setSeats);
  }, []);

  return (
    <>
      <AdminPanelHeader title="Space Details" description="Configure your work spaces and space settings" />
      {floor && (
        <>
          <div className={styles.summary}>
            <div className={styles.summaryText}>
              <span className={styles.building}>{floor.building}</span>
              <span className={styles.sub}>
                {floor.officeNo}, {floor.floorLabel}
              </span>
            </div>
            <div className={styles.meta}>
              <div className={styles.metaCol}>
                <span className={styles.metaLabel}>TIME ZONE</span>
                <span className={styles.metaValue}>Asia / Kolkata</span>
              </div>
              <div className={styles.metaCol}>
                <span className={styles.metaLabel}>LOCATION</span>
                <span className={styles.metaValue}>Bangalore, Karnataka</span>
              </div>
            </div>
            <span className={styles.badge}>ACTIVE</span>
          </div>

          <div className={styles.tabsRow} role="tablist">
            {SPACE_TABS.map((t) => (
              <button
                key={t.value}
                role="tab"
                aria-selected={tab === t.value}
                className={[styles.tabBtn, tab === t.value ? styles.tabBtnActive : ''].join(' ').trim()}
                onClick={() => setTab(t.value)}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className={styles.body}>
            {tab === 'general' && <GeneralTab floor={floor} seatCount={seats.length} />}
            {tab === 'map' && <SpaceMapTab floor={floor} seats={seats} />}
            {tab === 'zones' && <SpaceZonesTab floor={floor} seats={seats} />}
            {tab === 'shifts' && <ShiftsTab floor={floor} seats={seats} onFloorChange={refreshFloor} />}
          </div>
        </>
      )}
    </>
  );
}
