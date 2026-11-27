import styles from './FilterBar.module.css';
import { Dropdown } from '../../components/ui/Dropdown';
import { Pin } from '../../components/ui/icons';
import type { FilterOptions } from '../../api/types';
import { useBooking } from './bookingMachine';

export function FilterBar({ options }: { options: FilterOptions | null }) {
  const { state, dispatch } = useBooking();
  const { filters } = state;
  if (!options) return null;

  const buildingOpts = options.buildings.map((b) => ({ value: b, label: b }));
  const floorOpts = options.floors
    .filter((f) => f.building === filters.building)
    .map((f) => ({ value: f.id, label: f.label }));
  const officeOpts = options.offices
    .filter((o) => o.floorId === filters.floorId)
    .map((o) => ({ value: o.officeNo, label: o.officeNo }));
  const shiftOpts = options.shifts.map((s) => ({ value: s.id, label: s.label }));

  return (
    <div className={styles.bar}>
      <Dropdown
        icon={<Pin />}
        options={buildingOpts}
        value={filters.building}
        onChange={(v) => dispatch({ type: 'SET_FILTER', key: 'building', value: v })}
      />
      <Dropdown
        options={floorOpts}
        value={filters.floorId}
        onChange={(v) => dispatch({ type: 'SET_FILTER', key: 'floorId', value: v })}
      />
      <Dropdown
        options={officeOpts}
        value={filters.officeNo}
        onChange={(v) => dispatch({ type: 'SET_FILTER', key: 'officeNo', value: v })}
      />
      <Dropdown
        options={shiftOpts}
        value={filters.shift}
        onChange={(v) => dispatch({ type: 'SET_FILTER', key: 'shift', value: v })}
      />
    </div>
  );
}
