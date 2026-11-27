import styles from './SeatMarker.module.css';
import type { Seat } from '../../api/types';

interface Props {
  seat: Seat;
  selected: boolean;
  /** In a zone the person booking isn't part of: grey, and it can't be picked. */
  restricted?: boolean;
  /** When set, seat is assigned to a member and shows their colour. */
  assignedColor?: string | null;
  assignedInitial?: string | null;
  onClick: (seat: Seat) => void;
}

export function SeatMarker({ seat, selected, restricted = false, assignedColor, assignedInitial, onClick }: Props) {
  const clickable = seat.status === 'available' && !restricted;
  return (
    <button
      className={[
        styles.seat,
        styles[seat.status],
        restricted ? styles.restricted : '',
        selected ? styles.selected : '',
        assignedColor ? styles.assigned : '',
      ].join(' ')}
      style={{
        left: `${seat.x}%`,
        top: `${seat.y}%`,
        ...(assignedColor ? { background: assignedColor, borderColor: assignedColor } : {}),
      }}
      disabled={!clickable && !assignedColor}
      title={restricted ? `${seat.label} · restricted zone` : `${seat.label} · ${seat.status}`}
      onClick={() => onClick(seat)}
    >
      {assignedInitial && <span className={styles.initial}>{assignedInitial}</span>}
    </button>
  );
}
