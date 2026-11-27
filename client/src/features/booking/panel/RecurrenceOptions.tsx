import styles from './RecurrenceOptions.module.css';
import { useBooking } from '../bookingMachine';

const DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export function RecurrenceOptions() {
  const { state, dispatch } = useBooking();
  const { recurrence } = state;

  const toggleDay = (idx: number) => {
    const set = new Set(recurrence.daysOfWeek);
    set.has(idx) ? set.delete(idx) : set.add(idx);
    dispatch({ type: 'SET_RECURRENCE', rule: { ...recurrence, daysOfWeek: [...set].sort() } });
  };

  return (
    <div className={styles.wrap}>
      <label className={styles.label}>REPEAT ON</label>
      <div className={styles.days}>
        {DAYS.map((d, i) => (
          <button
            key={i}
            type="button"
            className={[styles.day, recurrence.daysOfWeek.includes(i) ? styles.active : ''].join(' ')}
            onClick={() => toggleDay(i)}
          >
            {d}
          </button>
        ))}
      </div>
      <label className={styles.label}>ENDS ON</label>
      <input
        type="date"
        className={styles.date}
        value={recurrence.endDate}
        onChange={(e) => dispatch({ type: 'SET_RECURRENCE', rule: { ...recurrence, endDate: e.target.value } })}
      />
    </div>
  );
}
