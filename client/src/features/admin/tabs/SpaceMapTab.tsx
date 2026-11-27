import styles from './SpaceMapTab.module.css';
import { FloorMap } from '../../booking/FloorMap';
import type { Floor, Seat } from '../../../api/types';

interface Props {
  floor: Floor;
  seats: Seat[];
}

/** Read-only view of the booking floor map, for admins to check the layout. */
export function SpaceMapTab({ floor, seats }: Props) {
  return (
    <div className={styles.root}>
      <FloorMap
        image={floor.image}
        seats={seats}
        bays={floor.zones}
        zones={[]}
        memberId={null}
        selectedSeatIds={[]}
        onSeatClick={() => {}}
      />
    </div>
  );
}
