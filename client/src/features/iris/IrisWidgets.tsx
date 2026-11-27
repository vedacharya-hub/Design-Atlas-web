import { useEffect, useRef, useState } from 'react';
import styles from './IrisWidgets.module.css';
import { dateKey, dayCount, deskHeadline, formatDay, formatRange, formatTime, fromDateKey, type CardHeader, type SummaryRow } from './irisShared';
import { SELECTED_BUILDING, SELECTED_OFFICE } from '../home/selectedBuilding';
import type { DeskBooking, DeskOption, MeetingRoom, OfficeBooking, RoomBooking } from '../../api/types';

const WEEKDAY_HEADERS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const cx = (...names: (string | false | undefined)[]) => names.filter(Boolean).join(' ');

/**
 * Photo, title, building and badge. The office card titles it with the office; the booking cards
 * (Figma 9961:239115) with the desk or room, and use the smaller 20px badge. Without `header` it
 * shows the member's office photo with its logo and the OFFICE badge.
 */
function OfficeHeader({ title, header }: { title?: string; header?: CardHeader }) {
  return (
    <div className={cx(styles.officeHeader, title && styles.officeHeaderDesk)}>
      <div className={styles.officePhoto}>
        <img src={header?.photo ?? SELECTED_OFFICE.photo} alt="" />
        {!header && (
          <span className={styles.officeLogo}>
            <img src={SELECTED_OFFICE.logo} alt="" />
          </span>
        )}
      </div>
      <div className={styles.officeText}>
        <div className={styles.officeLines}>
          <span className={styles.officeTitle}>{title ?? `${SELECTED_OFFICE.name} • ${SELECTED_OFFICE.floor}`}</span>
          <span className={styles.officeBuilding}>{SELECTED_BUILDING.label}</span>
        </div>
        <span className={styles.officeBadge}>{header?.badge ?? SELECTED_OFFICE.badge}</span>
      </div>
    </div>
  );
}

/** The member's office (Figma 9946:235737). */
export function IrisOfficeCard() {
  return (
    <div className={styles.office}>
      <OfficeHeader />
    </div>
  );
}

interface CalendarProps {
  /** Selectable range (YYYY-MM-DD, inclusive). */
  min: string;
  max: string;
  multiple: boolean;
  /** Booking being rescheduled: shown as "previous → new" above the calendar. */
  current?: string;
  /** Points the calendar up at the office card above it, as in Figma. */
  anchored?: boolean;
  /** Dates sent with Apply; set once applied and the calendar is locked. */
  applied?: string[];
  disabled: boolean;
  onApply: (dates: string[]) => void;
}

/** Calendar from Figma 9946:235600: Monday-first grid, multi-select, day count and Apply. */
export function IrisCalendar({ min, max, multiple, current, anchored, applied, disabled, onApply }: CalendarProps) {
  const today = dateKey(new Date());
  // Booking opens with today picked (the "1 day" state in Figma); reschedule starts empty.
  const [selected, setSelected] = useState<string[]>(applied ?? (multiple && today >= min && today <= max ? [today] : []));
  const shown = applied ?? selected;
  const start = fromDateKey(shown[0] ?? current ?? min);
  const [month, setMonth] = useState(new Date(start.getFullYear(), start.getMonth(), 1));

  const lead = (month.getDay() + 6) % 7;
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells: (string | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => dateKey(new Date(month.getFullYear(), month.getMonth(), i + 1))),
  ];
  while (cells.length % 7) cells.push(null);

  const monthStart = (offset: number) => dateKey(new Date(month.getFullYear(), month.getMonth() + offset, 1));
  const canPrev = monthStart(0) > min;
  const canNext = monthStart(1) <= max;
  const locked = disabled || !!applied;

  const toggle = (key: string) =>
    setSelected((prev) => (multiple ? (prev.includes(key) ? prev.filter((d) => d !== key) : [...prev, key].sort()) : prev[0] === key ? [] : [key]));

  return (
    <div className={styles.calWrap}>
      {current && (
        <div className={styles.change} aria-live="polite">
          <span className={styles.changeFrom}>
            <small>Previous date</small>
            {formatDay(current)}
          </span>
          <img src="/iris/arrow-forward.svg" alt="to" width={24} height={24} />
          <span className={cx(styles.changeTo, shown[0] && styles.changeToSet)}>
            <small>New date</small>
            {shown[0] ? formatDay(shown[0]) : 'Select below'}
          </span>
        </div>
      )}
      <div className={styles.calendar} aria-label={multiple ? 'Choose dates' : 'Choose a date'}>
        {anchored && (
          <span className={styles.calPointer} aria-hidden="true">
            <img src="/iris/tooltip.svg" alt="" width={14.8493} height={14.8493} />
          </span>
        )}
        <div className={styles.calHead}>
          <span className={styles.calMonth}>
            {month.toLocaleDateString('en-IN', { month: 'long' })}, {month.getFullYear()}
          </span>
          <div className={styles.calNav}>
            <button type="button" className={styles.calNavBtn} aria-label="Previous month" disabled={!canPrev} onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>
              <img src="/iris/chevron-left.svg" alt="" width={20} height={20} />
            </button>
            <button type="button" className={styles.calNavBtn} aria-label="Next month" disabled={!canNext} onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>
              <img src="/iris/chevron-forward.svg" alt="" width={20} height={20} />
            </button>
          </div>
        </div>
        <div className={styles.calBody}>
          <div className={styles.calWeekdays} aria-hidden="true">
            {WEEKDAY_HEADERS.map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>
          <div className={styles.calDays} role="grid">
            {cells.map((key, i) => {
              if (!key) return <span key={`b${i}`} className={styles.calCell} />;
              const out = key < min || key > max;
              const isSelected = shown.includes(key);
              return (
                <button
                  key={key}
                  type="button"
                  role="gridcell"
                  className={cx(styles.calCell, styles.calDay, isSelected && styles.calSelected, key === today && styles.calToday, key === current && styles.calCurrent)}
                  disabled={locked || out || key === current}
                  aria-pressed={isSelected}
                  aria-label={`${formatDay(key)}${key === today ? ' (today)' : ''}${key === current ? ' (current booking)' : ''}`}
                  onClick={() => toggle(key)}
                >
                  {Number(key.slice(8))}
                </button>
              );
            })}
          </div>
        </div>
        <div className={styles.calFoot}>
          <span className={styles.calCount}>
            {shown.length === 0 ? (multiple ? 'Select days' : 'Select a date') : multiple ? dayCount(shown.length) : formatDay(shown[0])}
          </span>
          <button type="button" className={styles.calApply} disabled={locked || selected.length === 0} onClick={() => onApply(selected)}>
            {applied ? 'Applied' : 'Apply'}
          </button>
        </div>
      </div>
    </div>
  );
}

interface DeskOptionsProps {
  options: DeskOption[];
  picked?: string;
  disabled: boolean;
  onPick: (option: DeskOption) => void;
  /** Opens the full desk booking page (Iris closes). */
  onManual: () => void;
}

const TAG_CLASS: Record<DeskOption['kind'], string> = {
  favourite: styles.deskTagFavourite,
  recent: styles.deskTagRecent,
  nearby: '',
};

/** Four recommended desks (favourite / recently booked first) and a "Choose seats manually" card, in one scrolling row. */
export function IrisDeskOptions({ options, picked, disabled, onPick, onManual }: DeskOptionsProps) {
  return (
    <div className={styles.desks} role="list" aria-label="Recommended desks">
      {options.slice(0, 4).map(({ desk, kind, reason }) => {
        const chosen = desk.id === picked;
        return (
          <div key={desk.id} role="listitem" className={cx(styles.desk, chosen && styles.deskChosen)}>
            <span className={cx(styles.deskTag, TAG_CLASS[kind])}>
              {kind === 'favourite' && <span className={styles.heart} aria-hidden="true">♥</span>}
              {reason}
            </span>
            <span className={styles.deskName}>{desk.id}</span>
            <span className={styles.deskMeta}>
              {desk.zone} · {desk.floorLabel}
            </span>
            <span className={styles.deskFeatures}>{desk.features.join(' · ') || 'Standard desk'}</span>
            <button type="button" className={styles.deskSelect} disabled={disabled} aria-label={chosen ? `${desk.id} selected` : `Select ${desk.id}`} onClick={() => onPick({ desk, kind, reason })}>
              {chosen ? 'Selected' : 'Select'}
            </button>
          </div>
        );
      })}
      <div role="listitem" className={cx(styles.desk, styles.deskManual)}>
        <span className={styles.manualIcon} aria-hidden="true">
          {Array.from({ length: 9 }, (_, i) => (
            <i key={i} />
          ))}
        </span>
        <span className={styles.manualTitle}>Choose seats manually</span>
        <span className={styles.deskFeatures}>Pick any desk on the floor plan in desk booking.</span>
        <button type="button" className={styles.deskSelect} disabled={disabled} onClick={onManual}>
          Open desk booking
        </button>
      </div>
    </div>
  );
}

interface Choice {
  id: string;
  /** Small line and big value of the tile: "OCT" / "21", or "PM" / "3:30". */
  tile: [string, string];
  label: string;
  sub?: string;
  /** A row that can't be picked, e.g. CANCELLED or CURRENT. */
  badge?: { text: string; tone: 'cancelled' | 'current' };
  ariaLabel: string;
}

const tileOfDate = (key: string): [string, string] => {
  const d = fromDateKey(key);
  return [d.toLocaleDateString('en-IN', { month: 'short' }).toUpperCase(), String(d.getDate())];
};
const tileOfTime = (minutes: number): [string, string] => {
  const [time, meridiem] = formatTime(minutes).split(' ');
  return [meridiem, time];
};

interface ChoiceListProps {
  label: string;
  choices: Choice[];
  picked?: string;
  disabled: boolean;
  onPick: (id: string) => void;
  /** Scrolls when there are more rows than fit, keeping this row in view. */
  scrollTo?: string;
  time?: boolean;
}

/** The stacked radio rows of Figma 9961:239853: tile, label, then a radio or a badge. */
function ChoiceList({ label, choices, picked, disabled, onPick, scrollTo, time }: ChoiceListProps) {
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Scroll only the list, never the chat thread around it.
    const list = listRef.current;
    const row = scrollTo ? list?.querySelector<HTMLElement>(`[data-choice="${scrollTo}"]`) : null;
    if (list && row) list.scrollTop = row.offsetTop - (list.clientHeight - row.offsetHeight) / 2;
  }, [scrollTo]);

  return (
    <div ref={listRef} className={cx(styles.dayList, scrollTo && styles.dayListScroll)} role="radiogroup" aria-label={label}>
      {choices.map((c) => {
        const checked = c.id === picked;
        return (
          <button
            key={c.id}
            data-choice={c.id}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={c.ariaLabel}
            className={styles.dayRow}
            disabled={disabled || !!c.badge}
            onClick={() => onPick(c.id)}
          >
            <span className={cx(styles.dayTile, time && styles.dayTileTime)}>
              <small>{c.tile[0]}</small>
              <b>{c.tile[1]}</b>
            </span>
            <span className={styles.dayName}>
              {c.label}
              {c.sub && <small>{c.sub}</small>}
            </span>
            {c.badge ? (
              <span className={cx(styles.rowBadge, c.badge.tone === 'cancelled' ? styles.rowBadgeCancelled : styles.rowBadgeCurrent)}>{c.badge.text}</span>
            ) : (
              <span className={cx(styles.radio, checked && styles.radioOn)} aria-hidden="true" />
            )}
          </button>
        );
      })}
    </div>
  );
}

interface BookingPickerProps {
  purpose: 'reschedule' | 'cancel';
  bookings: DeskBooking[];
  /** Days already cancelled from the same bookings: listed, not selectable. */
  cancelled: DeskBooking[];
  picked?: string;
  disabled: boolean;
  onPick: (booking: DeskBooking) => void;
}

/** "Choose date for reschedule / cancellation" (Figma 9961:239853): a radio row per booked day. */
export function IrisBookingPicker({ purpose, bookings, cancelled, picked, disabled, onPick }: BookingPickerProps) {
  const title = purpose === 'reschedule' ? 'Choose date for reschedule' : 'Choose date for cancellation';
  const rows = [...bookings.map((b) => ({ b, gone: false })), ...cancelled.map((b) => ({ b, gone: true }))].sort((x, y) =>
    x.b.date.localeCompare(y.b.date),
  );
  const deskIds = new Set(rows.map(({ b }) => b.deskId));
  const choices: Choice[] = rows.map(({ b, gone }) => ({
    id: b.id,
    tile: tileOfDate(b.date),
    label: `${fromDateKey(b.date).toLocaleDateString('en-IN', { weekday: 'long' })}${deskIds.size > 1 ? ` · ${b.deskId}` : ''}`,
    badge: gone ? { text: 'CANCELLED', tone: 'cancelled' } : undefined,
    ariaLabel: `${formatDay(b.date)}, ${b.deskId}${gone ? ', cancelled' : ''}`,
  }));
  return (
    <section className={styles.summary} aria-label={title}>
      <OfficeHeader title={deskIds.size === 1 ? deskHeadline(rows[0].b.deskId) : 'Office Desks'} />
      <div className={styles.summaryBody}>
        <h4 className={styles.summaryTitle}>{title}</h4>
        <hr className={styles.summaryRule} />
        <ChoiceList
          label={title}
          choices={choices}
          picked={picked}
          disabled={disabled}
          onPick={(id) => onPick(bookings.find((b) => b.id === id)!)}
        />
      </div>
    </section>
  );
}

interface OfficeBookingPickerProps {
  bookings: OfficeBooking[];
  header: CardHeader;
  picked?: string;
  disabled: boolean;
  onPick: (booking: OfficeBooking) => void;
}

/** Which day of a private office booking to reschedule: office header and a radio row per day. */
export function IrisOfficeBookingPicker({ bookings, header, picked, disabled, onPick }: OfficeBookingPickerProps) {
  const title = 'Choose date for reschedule';
  const officeNames = new Set(bookings.map((b) => b.office.name));
  const choices: Choice[] = [...bookings]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((b) => ({
      id: b.id,
      tile: tileOfDate(b.date),
      label: fromDateKey(b.date).toLocaleDateString('en-IN', { weekday: 'long' }),
      sub: officeNames.size > 1 ? b.office.name : undefined,
      ariaLabel: `${formatDay(b.date)}, ${b.office.name}`,
    }));
  return (
    <section className={styles.summary} aria-label={title}>
      <OfficeHeader title={officeNames.size === 1 ? bookings[0].office.name : 'Private Offices'} header={header} />
      <div className={styles.summaryBody}>
        <h4 className={styles.summaryTitle}>{title}</h4>
        <hr className={styles.summaryRule} />
        <ChoiceList label={title} choices={choices} picked={picked} disabled={disabled} onPick={(id) => onPick(bookings.find((b) => b.id === id)!)} />
      </div>
    </section>
  );
}

interface RoomBookingPickerProps {
  purpose: 'reschedule' | 'cancel';
  bookings: RoomBooking[];
  rooms: MeetingRoom[];
  picked?: string;
  disabled: boolean;
  onPick: (booking: RoomBooking) => void;
}

/** Which meeting to reschedule or cancel, when there are several: date tile, room and time. */
export function IrisRoomBookingPicker({ purpose, bookings, rooms, picked, disabled, onPick }: RoomBookingPickerProps) {
  const title = purpose === 'reschedule' ? 'Choose meeting for reschedule' : 'Choose meeting for cancellation';
  const choices: Choice[] = bookings.map((b) => {
    const room = rooms.find((r) => r.id === b.roomId);
    return {
      id: b.id,
      tile: tileOfDate(b.date),
      label: room?.name ?? b.roomId,
      sub: formatRange(b.start, b.end),
      ariaLabel: `${room?.name ?? b.roomId}, ${formatDay(b.date)}, ${formatRange(b.start, b.end)}`,
    };
  });
  return (
    <section className={styles.summary} aria-label={title}>
      <div className={styles.summaryBody}>
        <h4 className={styles.summaryTitle}>{title}</h4>
        <hr className={styles.summaryRule} />
        <ChoiceList label={title} choices={choices} picked={picked} disabled={disabled} onPick={(id) => onPick(bookings.find((b) => b.id === id)!)} />
      </div>
    </section>
  );
}

interface RoomSlotsProps {
  booking: RoomBooking;
  room: MeetingRoom;
  header: CardHeader;
  /** Free start times (minutes from midnight) for the same duration, excluding the current one. */
  slots: number[];
  /** The start picked, once answered. */
  picked?: number;
  disabled: boolean;
  onPick: (start: number) => void;
}

/**
 * New time for a meeting: every free 30-minute start that day, same duration, stacked like the
 * reschedule date list. The current slot sits in place marked CURRENT; long lists scroll inside the
 * card, opening on the current slot.
 */
export function IrisRoomSlots({ booking, room, header, slots, picked, disabled, onPick }: RoomSlotsProps) {
  const title = 'Choose time for reschedule';
  const duration = booking.end - booking.start;
  const starts = [...new Set([...slots, booking.start])].sort((a, b) => a - b);
  const choices: Choice[] = starts.map((start) => {
    const current = start === booking.start;
    return {
      id: String(start),
      tile: tileOfTime(start),
      label: formatRange(start, start + duration),
      badge: current ? { text: 'CURRENT', tone: 'current' } : undefined,
      ariaLabel: `${formatRange(start, start + duration)}${current ? ', current booking' : ''}`,
    };
  });
  return (
    <section className={styles.summary} aria-label={title}>
      <OfficeHeader title={room.name} header={header} />
      <div className={styles.summaryBody}>
        <h4 className={styles.summaryTitle}>{title}</h4>
        <hr className={styles.summaryRule} />
        <ChoiceList
          label={title}
          choices={choices}
          picked={picked === undefined ? undefined : String(picked)}
          disabled={disabled}
          onPick={(id) => onPick(Number(id))}
          scrollTo={String(picked ?? booking.start)}
          time
        />
      </div>
    </section>
  );
}

interface SummaryProps {
  /** Header line, e.g. "Office Desk - D12". */
  headline: string;
  header?: CardHeader;
  title: string;
  rows: SummaryRow[];
  change?: { from: string; to: string };
  /** Without labels the card has no buttons (a finished booking). */
  primaryLabel?: string;
  secondaryLabel?: string;
  tone?: 'danger';
  chosen?: 'primary' | 'secondary';
  disabled: boolean;
  onPrimary: () => void;
  onSecondary: () => void;
}

/**
 * Summary card from Figma 9961:239115: desk header, serif title, label/value rows between
 * dividers, then the secondary button on the left and the primary CTA on the right. Once booked
 * (9961:239950) it has the Booking ID and no buttons.
 */
export function IrisSummaryCard({ headline, header, title, rows, change, primaryLabel, secondaryLabel, tone, chosen, disabled, onPrimary, onSecondary }: SummaryProps) {
  const hasActions = !!(primaryLabel || secondaryLabel);
  return (
    <section className={styles.summary} aria-label={title}>
      <OfficeHeader title={headline} header={header} />
      <div className={styles.summaryBody}>
        <h4 className={styles.summaryTitle}>{title}</h4>
        <hr className={styles.summaryRule} />
        {change && (
          <div className={styles.summaryChange}>
            <span>{change.from}</span>
            <img src="/iris/arrow-forward.svg" alt="to" width={24} height={24} />
            <span className={styles.summaryChangeTo}>{change.to}</span>
          </div>
        )}
        <dl className={styles.summaryRows}>
          {rows.map((r) => (
            <div key={r.label}>
              <dt>{r.label}</dt>
              <dd>{r.value}</dd>
            </div>
          ))}
        </dl>
        {hasActions && (
          <>
            <hr className={styles.summaryRule} />
            <div className={styles.summaryActions}>
              {secondaryLabel && (
                <button type="button" className={cx(styles.summarySecondary, chosen === 'secondary' && styles.summaryChosen)} disabled={disabled} onClick={onSecondary}>
                  {secondaryLabel}
                </button>
              )}
              {primaryLabel && (
                <button
                  type="button"
                  className={cx(styles.summaryPrimary, tone === 'danger' && styles.summaryDanger, chosen === 'primary' && styles.summaryChosen)}
                  disabled={disabled}
                  onClick={onPrimary}
                >
                  {primaryLabel}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
