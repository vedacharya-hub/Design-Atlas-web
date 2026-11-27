import { useCallback, useEffect, useMemo, useState } from 'react';
import styles from './BookOfficeDesk.module.css';
import { NavBar } from './NavBar';
import { FilterBar } from './FilterBar';
import { FloorMap, type SeatAssignmentBadge } from './FloorMap';
import { BookingPanel } from './BookingPanel';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import { AccountSettingsPanel } from '../account/AccountSettingsPanel';
import { bookingApi } from '../../api/bookingApi';
import type { FilterOptions, Floor, FloorZone, Seat } from '../../api/types';
import { useBooking, assignedSeatIds } from './bookingMachine';
import { mayBook } from './zoneRules';

interface Props {
  active: string;
  onTabChange: (tab: string) => void;
}

export function BookOfficeDesk({ active, onTabChange }: Props) {
  const { state, dispatch } = useBooking();
  const [options, setOptions] = useState<FilterOptions | null>(null);
  const [floor, setFloor] = useState<Floor | null>(null);
  const [seats, setSeats] = useState<Seat[]>([]);
  const [zones, setZones] = useState<FloorZone[]>([]);
  const [deskType, setDeskType] = useState('office');
  const [accountOpen, setAccountOpen] = useState(false);

  // Initial load: filters + members.
  useEffect(() => {
    (async () => {
      const [opts, members] = await Promise.all([bookingApi.getFilters(), bookingApi.getMembers()]);
      setOptions(opts);
      const firstFloor = opts.floors[0];
      const office = opts.offices.find((o) => o.floorId === firstFloor?.id);
      const currentUser = members.find((m) => m.isCurrentUser) ?? members[0];
      dispatch({
        type: 'INIT',
        currentUser,
        filters: {
          building: firstFloor?.building ?? '',
          floorId: firstFloor?.id ?? '',
          officeNo: office?.officeNo ?? '',
          shift: opts.shifts[0]?.id ?? '',
        },
      });
    })();
  }, [dispatch]);

  const loadSeats = useCallback((floorId: string) => {
    if (!floorId) return;
    Promise.all([bookingApi.getFloor(floorId), bookingApi.getSeats(floorId), bookingApi.getZones(floorId).catch(() => [])]).then(([f, s, z]) => {
      setFloor(f);
      setSeats(s);
      setZones(z);
    });
  }, []);

  // Who the desk being picked is for: yourself, or (booking for others) the member being seated.
  const bookingFor = state.mode === 'others' ? state.activeMemberId : (state.currentUser?.id ?? null);

  useEffect(() => {
    loadSeats(state.filters.floorId);
  }, [state.filters.floorId, loadSeats]);

  const handleSeatClick = useCallback(
    (seat: Seat) => {
      if (state.step !== 2) return; // seats are pickable only in step 2
      if (state.mode === 'self' && state.seatSelectionType !== 'specific') return;
      if (seat.status !== 'available') return;
      // A zone's desks are only for its team, department or business unit.
      if (!mayBook(zones, seat.id, bookingFor)) return;
      dispatch({ type: 'ASSIGN_SEAT', seatId: seat.id });
    },
    [state.step, state.mode, state.seatSelectionType, zones, bookingFor, dispatch],
  );

  // Member badges to render on assigned seats (Others flow).
  const assignmentBadges = useMemo(() => {
    const map: Record<string, SeatAssignmentBadge> = {};
    if (state.mode === 'others') {
      for (const m of state.selectedMembers) {
        const seatId = state.assignments[m.id];
        if (seatId) map[seatId] = { color: m.avatarColor, initial: m.name[0].toUpperCase() };
      }
    }
    return map;
  }, [state.mode, state.selectedMembers, state.assignments]);

  const selectedSeatIds = useMemo(() => assignedSeatIds(state), [state]);

  return (
    <div className={styles.page}>
      <NavBar
        user={state.currentUser}
        active={active}
        onSelect={onTabChange}
        onAvatarClick={() => setAccountOpen(true)}
      />

      <div className={styles.subHeader}>
        <h1 className={styles.title}>Book Office Desk</h1>
        <SegmentedControl
          items={[
            { value: 'office', label: 'Office Desk' },
            { value: 'shared', label: 'Shared Desk' },
          ]}
          value={deskType}
          onChange={setDeskType}
        />
      </div>

      <FilterBar options={options} />

      <div className={styles.stage}>
        {floor && (
          <FloorMap
            image={floor.image}
            seats={seats}
            bays={floor.zones}
            zones={zones}
            memberId={bookingFor}
            selectedSeatIds={selectedSeatIds}
            assignments={assignmentBadges}
            onSeatClick={handleSeatClick}
          />
        )}
        <BookingPanel seats={seats} zones={zones} onBooked={() => loadSeats(state.filters.floorId)} />
      </div>

      {accountOpen && state.currentUser && (
        <AccountSettingsPanel user={state.currentUser} onClose={() => setAccountOpen(false)} />
      )}
    </div>
  );
}
