import { useEffect, useRef, useState } from 'react';
import styles from '../users/UsersFilterPanel.module.css';
import own from './EventsFilterPanel.module.css';
import type { AdminEvent, AdminEventStatus, WorkLocation } from '../../../api/types';
import { SelectField } from '../users/UserFormFields';
import { RadioGroup } from '../users/UsersFilterPanel';
import { PickerField } from './EventFields';

export interface EventFilters {
  locationId: string;
  /** An AdminUser id. */
  createdBy: string;
  /** YYYY-MM-DD: created that day. */
  createdOn: string;
  /** YYYY-MM-DD: happening on or after / on or before. */
  from: string;
  until: string;
  status: '' | AdminEventStatus;
}

export const NO_EVENT_FILTERS: EventFilters = { locationId: '', createdBy: '', createdOn: '', from: '', until: '', status: '' };

/** How many filters are set (the count on the Filter button). */
export const countEventFilters = (f: EventFilters) => Object.values(f).filter(Boolean).length;

export function matchesEventFilters(e: AdminEvent, f: EventFilters) {
  return (
    (!f.locationId || e.locationId === f.locationId) &&
    (!f.createdBy || e.createdBy.id === f.createdBy) &&
    (!f.createdOn || e.createdOn === f.createdOn) &&
    (!f.from || e.date >= f.from) &&
    (!f.until || e.date <= f.until) &&
    (!f.status || e.status === f.status)
  );
}

/** Same as the panel's slide-out; a timer rather than animationend, which a hidden tab never fires. */
const CLOSE_MS = 240;

const STATUS_CHOICES: { value: EventFilters['status']; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'archived', label: 'Archived' },
  { value: 'completed', label: 'Completed' },
];

interface Props {
  events: AdminEvent[];
  locations: WorkLocation[];
  value: EventFilters;
  onApply: (filters: EventFilters) => void;
  onClose: () => void;
}

/**
 * Filters for Events (Figma 8825:278761): a 490px panel from the right with the building, who created
 * it and when, the dates it runs between, and its status. Save applies them and the panel slides
 * back out; closing it any other way leaves the filters as they were.
 */
export function EventsFilterPanel({ events, locations, value, onApply, onClose }: Props) {
  const [draft, setDraft] = useState<EventFilters>(value);
  const [closing, setClosing] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const closingRef = useRef(false);
  const set = (patch: Partial<EventFilters>) => setDraft((d) => ({ ...d, ...patch }));

  function close(apply?: EventFilters) {
    if (closingRef.current) return;
    closingRef.current = true;
    // Filter straight away, so the table is already updated as the panel slides off.
    if (apply) onApply(apply);
    setClosing(true);
    setTimeout(onClose, CLOSE_MS);
  }

  useEffect(() => {
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) close();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // Everyone who has created an event, by name.
  const creators = [...new Map(events.map((e) => [e.createdBy.id, e.createdBy.name])).entries()]
    .sort((a, b) => a[1].localeCompare(b[1]))
    .map(([id, name]) => ({ value: id, label: name }));
  const untilEarly = !!draft.from && !!draft.until && draft.until < draft.from;

  return (
    <>
      <div className={[styles.backdrop, closing ? styles.backdropOut : ''].join(' ').trim()} onMouseDown={() => close()} />
      <div
        ref={panelRef}
        className={[styles.panel, closing ? styles.panelOut : ''].join(' ').trim()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="events-filter-title"
        tabIndex={-1}
      >
        <header className={styles.head}>
          <h2 id="events-filter-title" className={styles.title}>
            Filters
          </h2>
          <button type="button" className={styles.close} aria-label="Close filters" onClick={() => close()}>
            <img src="/admin/user/close.svg" alt="" width={24} height={24} />
          </button>
        </header>

        <div className={styles.body}>
          <SelectField label="Location" placeholder="All" value={draft.locationId} choices={locations.map((l) => ({ value: l.id, label: l.name }))} onChange={(locationId) => set({ locationId })} />
          <SelectField label="Created By" placeholder="All" value={draft.createdBy} choices={creators} onChange={(createdBy) => set({ createdBy })} />
          <PickerField loose label="Created Date" type="date" icon="/admin/events/calendar-event.svg" value={draft.createdOn} onChange={(v) => set({ createdOn: (v as string) ?? '' })} />
          <div className={own.pair}>
            <PickerField loose label="Show From" type="date" icon="/admin/events/calendar-event.svg" value={draft.from} onChange={(v) => set({ from: (v as string) ?? '' })} />
            <PickerField
              loose
              label="Show Until"
              type="date"
              icon="/admin/events/calendar-event.svg"
              value={draft.until}
              min={draft.from || undefined}
              invalid={untilEarly}
              help={untilEarly ? 'Pick a date on or after Show From.' : undefined}
              onChange={(v) => set({ until: (v as string) ?? '' })}
            />
          </div>
          <RadioGroup label="Status" name="events-filter-status" value={draft.status} choices={STATUS_CHOICES} onChange={(v) => set({ status: v as EventFilters['status'] })} />
        </div>

        <footer className={styles.foot}>
          <button type="button" className={styles.secondary} disabled={countEventFilters(draft) === 0} onClick={() => setDraft(NO_EVENT_FILTERS)}>
            Clear all
          </button>
          <button type="button" className={styles.primary} disabled={untilEarly} onClick={() => close(draft)}>
            Save
            <img src="/admin/user/check-white.svg" alt="" width={20} height={20} />
          </button>
        </footer>
      </div>
    </>
  );
}
