import styles from './DateStep.module.css';
import { Switch } from '../../../components/ui/Switch';
import { Calendar } from '../../../components/ui/Calendar';
import { RecurrenceOptions } from './RecurrenceOptions';
import { MembersStep } from './MembersStep';
import { useBooking } from '../bookingMachine';
import { formatFull } from '../../../utils/date';

export function DateStep() {
  const { state, dispatch } = useBooking();
  const isOthers = state.mode === 'others';

  return (
    <div className={styles.step}>
      {isOthers && <MembersStep />}

      <div className={styles.headerRow}>
        <span className={styles.sectionLabel}>CHOOSE DATE</span>
        <div className={styles.recurring}>
          <span className={styles.sectionLabel}>RECURRING</span>
          <Switch
            checked={state.recurring}
            disabled={isOthers}
            aria-label="Recurring booking"
            onChange={(v) => dispatch({ type: 'TOGGLE_RECURRING', value: v })}
          />
        </div>
      </div>

      <label className={styles.fieldLabel}>DATE</label>
      <div className={styles.field}>{formatFull(state.date)}</div>

      <Calendar value={state.date} onChange={(d) => dispatch({ type: 'SET_DATE', date: d })} />

      {state.recurring && <RecurrenceOptions />}
    </div>
  );
}
