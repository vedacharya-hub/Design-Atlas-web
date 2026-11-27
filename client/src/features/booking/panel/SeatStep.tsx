import styles from './SeatStep.module.css';
import { Avatar } from '../../../components/ui/Avatar';
import { Check } from '../../../components/ui/icons';
import { useBooking } from '../bookingMachine';
import type { Seat } from '../../../api/types';

interface Props {
  seats: Seat[];
}

/** Step 2 content — differs by booking mode. */
export function SeatStep({ seats }: Props) {
  const { state, dispatch } = useBooking();
  const seatLabel = (id: string | null) => seats.find((s) => s.id === id)?.label;

  if (state.mode === 'self') {
    const myId = state.currentUser?.id ?? '';
    const chosen = state.assignments[myId];
    return (
      <div className={styles.step}>
        <span className={styles.sectionLabel}>SELECT SEAT</span>

        <button
          className={[styles.option, state.seatSelectionType === 'random' ? styles.optionActive : ''].join(' ')}
          onClick={() => dispatch({ type: 'SET_SEAT_TYPE', value: 'random' })}
        >
          <span className={styles.radio} />
          <span className={styles.optionBody}>
            <span className={styles.optionTitle}>Select a random seat</span>
            <span className={styles.optionSub}>We'll assign the best available desk for you</span>
          </span>
        </button>

        <button
          className={[styles.option, state.seatSelectionType === 'specific' ? styles.optionActive : ''].join(' ')}
          onClick={() => dispatch({ type: 'SET_SEAT_TYPE', value: 'specific' })}
        >
          <span className={styles.radio} />
          <span className={styles.optionBody}>
            <span className={styles.optionTitle}>Select a specific seat on the map</span>
            <span className={styles.optionSub}>
              {state.seatSelectionType === 'specific' && chosen
                ? `Selected: ${seatLabel(chosen)}`
                : 'Tap an available (green) seat on the map'}
            </span>
          </span>
        </button>
      </div>
    );
  }

  // Others: assign a seat to each member.
  return (
    <div className={styles.step}>
      <span className={styles.sectionLabel}>ASSIGN SEATS</span>
      <ul className={styles.memberList}>
        {state.selectedMembers.map((m) => {
          const seatId = state.assignments[m.id];
          const active = state.activeMemberId === m.id;
          return (
            <li
              key={m.id}
              className={[styles.memberRow, active ? styles.memberActive : ''].join(' ')}
              onClick={() => dispatch({ type: 'SET_ACTIVE_MEMBER', memberId: m.id })}
            >
              <Avatar name={m.name} color={m.avatarColor} size={32} />
              <span className={styles.memberInfo}>
                <span className={styles.memberName}>{m.name}{m.isCurrentUser ? ' (You)' : ''}</span>
                <span className={styles.memberSeat}>
                  {seatId ? `Seat ${seatLabel(seatId)}` : active ? 'Tap a seat on the map' : 'No seat yet'}
                </span>
              </span>
              {seatId && <Check className={styles.seated} />}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
