import styles from './SpaceZonesTab.module.css';
import type { Floor, Seat } from '../../../api/types';

interface Props {
  floor: Floor;
  seats: Seat[];
}

const ZONE_COLORS = ['#3659f5', '#f97316', '#7c3aed', '#0ea5e9', '#db2777', '#11a830'];

export function SpaceZonesTab({ floor, seats }: Props) {
  return (
    <div className={styles.grid}>
      {floor.zones.map((zone, i) => {
        const zoneSeats = seats.filter((s) => s.zone === zone);
        const available = zoneSeats.filter((s) => s.status === 'available').length;
        return (
          <div key={zone} className={styles.card}>
            <span className={styles.dot} style={{ background: ZONE_COLORS[i % ZONE_COLORS.length] }} />
            <div className={styles.info}>
              <span className={styles.name}>{zone}</span>
              <span className={styles.count}>
                {zoneSeats.length ? `${zoneSeats.length} desks · ${available} available` : 'No desks mapped yet'}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
