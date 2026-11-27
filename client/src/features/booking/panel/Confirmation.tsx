import styles from './Confirmation.module.css';
import { Check } from '../../../components/ui/icons';
import { Button } from '../../../components/ui/Button';
import { useBooking } from '../bookingMachine';
import { formatFull } from '../../../utils/date';

export function Confirmation() {
  const { state, dispatch } = useBooking();
  const count = state.confirmation?.assignments.length ?? state.selectedMembers.length;

  return (
    <div className={styles.wrap}>
      <span className={styles.badge}><Check width={28} height={28} /></span>
      <h3 className={styles.title}>Booking confirmed</h3>
      <p className={styles.detail}>
        {count} desk{count > 1 ? 's' : ''} booked for {formatFull(state.date)}
      </p>
      {state.confirmation?.recurrence && (
        <p className={styles.detail}>Repeats until {state.confirmation.recurrence.endDate}</p>
      )}
      <p className={styles.ref}>Ref: {state.confirmation?.id}</p>
      <Button block variant="secondary" onClick={() => dispatch({ type: 'RESET' })}>
        Make another booking
      </Button>
    </div>
  );
}
