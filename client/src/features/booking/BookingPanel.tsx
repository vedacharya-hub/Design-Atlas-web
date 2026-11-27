import styles from './BookingPanel.module.css';
import { Tabs } from '../../components/ui/Tabs';
import { Stepper } from '../../components/ui/Stepper';
import { Button } from '../../components/ui/Button';
import { DateStep } from './panel/DateStep';
import { SeatStep } from './panel/SeatStep';
import { Confirmation } from './panel/Confirmation';
import { bookingApi } from '../../api/bookingApi';
import type { FloorZone, Seat } from '../../api/types';
import { useBooking, allMembersSeated } from './bookingMachine';
import { mayBook } from './zoneRules';
import { formatShort, toISODate } from '../../utils/date';

interface Props {
  seats: Seat[];
  /** The floor's zones: a random seat comes from outside the ones that aren't yours. */
  zones: FloorZone[];
  onBooked: () => void; // refresh seat statuses after a successful booking
}

export function BookingPanel({ seats, zones, onBooked }: Props) {
  const { state, dispatch } = useBooking();
  const { mode, step, status } = state;

  const deskCount = mode === 'self' ? 1 : state.selectedMembers.length;

  const canProceed = (() => {
    if (step === 1) return true;
    if (mode === 'self') {
      return state.seatSelectionType === 'random' || !!state.assignments[state.currentUser?.id ?? ''];
    }
    return allMembersSeated(state);
  })();

  async function submit() {
    dispatch({ type: 'SUBMIT_START' });
    try {
      let assignments = state.selectedMembers.map((m) => ({
        memberId: m.id,
        seatId: state.assignments[m.id] ?? '',
      }));

      // Self + random: pick an available seat now, outside zones that aren't yours.
      if (mode === 'self' && state.seatSelectionType === 'random') {
        const free = seats.find((s) => s.status === 'available' && mayBook(zones, s.id, state.currentUser?.id));
        if (!free) throw new Error('No available seats to assign.');
        assignments = [{ memberId: state.currentUser!.id, seatId: free.id }];
      }

      const booking = await bookingApi.createBooking({
        floorId: state.filters.floorId,
        shift: state.filters.shift,
        date: toISODate(state.date),
        mode,
        assignments,
        recurrence: state.recurring ? state.recurrence : undefined,
      });
      dispatch({ type: 'SUBMIT_SUCCESS', booking });
      onBooked();
    } catch (err) {
      dispatch({ type: 'SUBMIT_ERROR', error: (err as Error).message });
    }
  }

  return (
    <aside className={styles.panel}>
      {status === 'confirmed' ? (
        <Confirmation />
      ) : (
        <>
          <div className={styles.head}>
            <Tabs
              items={[
                { value: 'self', label: 'MySelf' },
                { value: 'others', label: 'Others', disabled: state.recurring },
              ]}
              value={mode}
              onChange={(v) => dispatch({ type: 'SET_MODE', mode: v as 'self' | 'others' })}
            />
            <div className={styles.stepper}>
              <Stepper current={step} />
            </div>
          </div>

          <div className={styles.body}>
            {step === 1 ? <DateStep /> : <SeatStep seats={seats} />}
          </div>

          {status === 'error' && <div className={styles.error}>{state.error}</div>}

          <div className={styles.footer}>
            <div className={styles.summary}>
              <span className={styles.summaryDate}>{formatShort(state.date)}</span>
              <span className={styles.summaryCount}>{deskCount} Desk{deskCount > 1 ? 's' : ''}</span>
            </div>
            {step === 1 ? (
              <Button onClick={() => dispatch({ type: 'GOTO_STEP', step: 2 })}>Choose desk</Button>
            ) : (
              <div className={styles.footerActions}>
                <Button variant="secondary" onClick={() => dispatch({ type: 'GOTO_STEP', step: 1 })}>
                  Back
                </Button>
                <Button disabled={!canProceed || status === 'submitting'} onClick={submit}>
                  {status === 'submitting' ? 'Booking…' : 'Confirm booking'}
                </Button>
              </div>
            )}
          </div>
        </>
      )}
    </aside>
  );
}
