import styles from './ShiftFloorMap.module.css';
import type { Seat } from '../../api/types';

interface Props {
  image: string;
  seats: Seat[];
  assignedSeatIds: string[];
  color: string;
  editable: boolean;
  onSeatClick: (seat: Seat) => void;
}

/** Floor map that colors desks by shift assignment instead of booking status, with an optional click-to-assign mode. */
export function ShiftFloorMap({ image, seats, assignedSeatIds, color, editable, onSeatClick }: Props) {
  return (
    <div className={styles.map}>
      <div className={styles.stage}>
        <img className={styles.floor} src={image} alt="Floor plan" draggable={false} />
        {seats.map((seat) => {
          const assigned = assignedSeatIds.includes(seat.id);
          return (
            <button
              key={seat.id}
              type="button"
              className={[styles.seat, assigned ? styles.assigned : '', editable ? styles.editable : ''].join(' ')}
              style={{
                left: `${seat.x}%`,
                top: `${seat.y}%`,
                ...(assigned ? { background: color, borderColor: color } : {}),
              }}
              disabled={!editable}
              title={seat.label}
              onClick={() => onSeatClick(seat)}
            />
          );
        })}
      </div>

      <div className={styles.legend}>
        <span>
          <i className={styles.dot} style={{ background: color }} /> Assigned to this shift
        </span>
        <span>
          <i className={styles.dotMuted} /> Unassigned
        </span>
      </div>

      {editable && <div className={styles.hint}>Click desks on the map to add or remove them from this shift.</div>}
    </div>
  );
}
