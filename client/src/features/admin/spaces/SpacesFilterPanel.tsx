import { useEffect, useRef, useState } from 'react';
import styles from '../users/UsersFilterPanel.module.css';
import type { AdminBuilding, AdminSpaceView, SpaceStatus } from '../../../api/types';
import { SelectField } from '../users/UserFormFields';
import { RadioGroup } from '../users/UsersFilterPanel';

export interface SpaceFilters {
  buildingId: string;
  city: string;
  status: '' | SpaceStatus;
}

export const NO_SPACE_FILTERS: SpaceFilters = { buildingId: '', city: '', status: '' };

/** How many filters are set (the count on the Filter button). */
export const countSpaceFilters = (f: SpaceFilters) => Object.values(f).filter(Boolean).length;

export const matchesSpaceFilters = (s: AdminSpaceView, f: SpaceFilters) =>
  (!f.buildingId || s.buildingId === f.buildingId) && (!f.city || s.city === f.city) && (!f.status || s.status === f.status);

/** Same as the panel's slide-out; a timer rather than animationend, which a hidden tab never fires. */
const CLOSE_MS = 240;

const STATUS_CHOICES: { value: SpaceFilters['status']; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
];

interface Props {
  spaces: AdminSpaceView[];
  buildings: AdminBuilding[];
  value: SpaceFilters;
  onApply: (filters: SpaceFilters) => void;
  onClose: () => void;
}

/**
 * Filters for All Spaces, in the same 490px panel as the Users and Events filters: the building, the
 * city and the status. Save applies them; closing the panel any other way leaves them as they were.
 */
export function SpacesFilterPanel({ spaces, buildings, value, onApply, onClose }: Props) {
  const [draft, setDraft] = useState<SpaceFilters>(value);
  const [closing, setClosing] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const closingRef = useRef(false);
  const set = (patch: Partial<SpaceFilters>) => setDraft((d) => ({ ...d, ...patch }));

  function close(apply?: SpaceFilters) {
    if (closingRef.current) return;
    closingRef.current = true;
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

  // Buildings with a space, and their cities.
  const withSpaces = buildings.filter((b) => spaces.some((s) => s.buildingId === b.id));
  const cities = [...new Set(withSpaces.map((b) => b.city))].sort();

  return (
    <>
      <div className={[styles.backdrop, closing ? styles.backdropOut : ''].join(' ').trim()} onMouseDown={() => close()} />
      <div
        ref={panelRef}
        className={[styles.panel, closing ? styles.panelOut : ''].join(' ').trim()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="spaces-filter-title"
        tabIndex={-1}
      >
        <header className={styles.head}>
          <h2 id="spaces-filter-title" className={styles.title}>
            Filters
          </h2>
          <button type="button" className={styles.close} aria-label="Close filters" onClick={() => close()}>
            <img src="/admin/user/close.svg" alt="" width={24} height={24} />
          </button>
        </header>

        <div className={styles.body}>
          <SelectField label="Building" placeholder="All" value={draft.buildingId} choices={withSpaces.map((b) => ({ value: b.id, label: b.name }))} onChange={(buildingId) => set({ buildingId })} />
          <SelectField label="City" placeholder="All" value={draft.city} choices={cities} onChange={(city) => set({ city })} />
          <RadioGroup label="Status" name="spaces-filter-status" value={draft.status} choices={STATUS_CHOICES} onChange={(v) => set({ status: v as SpaceFilters['status'] })} />
        </div>

        <footer className={styles.foot}>
          <button type="button" className={styles.secondary} disabled={countSpaceFilters(draft) === 0} onClick={() => setDraft(NO_SPACE_FILTERS)}>
            Clear all
          </button>
          <button type="button" className={styles.primary} onClick={() => close(draft)}>
            Save
            <img src="/admin/user/check-white.svg" alt="" width={20} height={20} />
          </button>
        </footer>
      </div>
    </>
  );
}
