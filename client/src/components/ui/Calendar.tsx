import { useState } from 'react';
import styles from './Calendar.module.css';
import { ChevronLeft, ChevronRight } from './icons';

interface Props {
  value: Date;
  onChange: (date: Date) => void;
  /** Dates before this are disabled. Defaults to today. */
  minDate?: Date;
}

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Days rendered for a month view, padded to full Mon–Sun weeks. */
function monthMatrix(year: number, month: number): Date[] {
  const first = new Date(year, month, 1);
  // Convert JS Sunday=0 to Monday=0.
  const lead = (first.getDay() + 6) % 7;
  const start = new Date(year, month, 1 - lead);
  return Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
}

export function Calendar({ value, onChange, minDate }: Props) {
  const [view, setView] = useState(() => new Date(value.getFullYear(), value.getMonth(), 1));
  const min = startOfDay(minDate ?? new Date());
  const days = monthMatrix(view.getFullYear(), view.getMonth());

  const isSame = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

  return (
    <div className={styles.calendar}>
      <div className={styles.header}>
        <span className={styles.title}>
          {MONTHS[view.getMonth()]}, {view.getFullYear()}
        </span>
        <div className={styles.nav}>
          <button
            className={styles.chevron}
            aria-label="Previous month"
            onClick={() => setView(new Date(view.getFullYear(), view.getMonth() - 1, 1))}
          >
            <ChevronLeft />
          </button>
          <button
            className={styles.chevron}
            aria-label="Next month"
            onClick={() => setView(new Date(view.getFullYear(), view.getMonth() + 1, 1))}
          >
            <ChevronRight />
          </button>
        </div>
      </div>

      <div className={styles.grid}>
        {WEEKDAYS.map((d) => (
          <div key={d} className={styles.weekday}>{d}</div>
        ))}
        {days.map((day) => {
          const outside = day.getMonth() !== view.getMonth();
          const disabled = startOfDay(day) < min;
          const selected = isSame(day, value);
          return (
            <button
              key={day.toISOString()}
              disabled={disabled}
              className={[
                styles.cell,
                outside ? styles.outside : '',
                selected ? styles.selected : '',
              ].join(' ')}
              onClick={() => onChange(startOfDay(day))}
            >
              {day.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}
