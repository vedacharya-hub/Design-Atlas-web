import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import shell from '../../users/AddOrgUnitDialog.module.css';
import seatDialog from '../seatMap/SeatDialog.module.css';
import fields from '../../users/UserFormFields.module.css';
import styles from './ZoneDialog.module.css';
import type { OrgChart, ZoneColor, ZoneLevel } from '../../../../api/types';
import { SelectField, TextField } from '../../users/UserFormFields';
import { UnitPicker } from './UnitPicker';
import { ZONE_COLORS, ZONE_COLOR_LIST, ZONE_LEVELS, levelLabel, nextZoneColor, nextZoneName, seatsLabel, unitsFor, type MapZone } from './zoneShared';

/** Saving an edit spins at least this long. */
const MIN_SAVING_MS = 400;
const MAX_NAME = 40;

export interface ZoneDetails {
  name: string;
  color: ZoneColor;
  level: ZoneLevel;
  unitIds: string[];
}

interface Props {
  /** The zone being edited; without it, the one just drawn. */
  zone?: MapZone;
  /** The floor's other zones: names are unique, and a new one takes the next name and colour. */
  others: MapZone[];
  /** Seats inside the zone. */
  seats: number;
  /** "WeWork Vaishnavi Signature • 2nd Floor" */
  place: string;
  org: OrgChart | null;
  /** The colour as it's picked, so the map can show it. */
  onColor?: (color: ZoneColor) => void;
  onClose: () => void;
  /** Resolves once saved; a rejection shows its message and keeps the dialog open. */
  onSave: (details: ZoneDetails) => void | Promise<void>;
}

/**
 * Create New Zone (Figma 3039:112228), and the same form from a zone's ⋮ → Edit details: the zone's
 * colour and name on the banner as they change, then its name, colour, and who it's for: one or more
 * teams, departments or business units.
 */
export function ZoneDialog({ zone, others, seats, place, org, onColor, onClose, onSave }: Props) {
  const editing = !!zone;
  const [name, setName] = useState(zone?.name ?? nextZoneName(others));
  const [color, setColor] = useState<ZoneColor>(zone?.color ?? nextZoneColor(others));
  const [level, setLevel] = useState<ZoneLevel>(zone?.level ?? 'team');
  const [unitIds, setUnitIds] = useState<string[]>(zone?.unitIds ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [tried, setTried] = useState(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const savingRef = useRef(saving);
  savingRef.current = saving;
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      e.preventDefault();
      if (!savingRef.current) onCloseRef.current();
    };
    document.addEventListener('keydown', onKey, true);
    formRef.current?.querySelector<HTMLInputElement>('input')?.select();
    return () => {
      document.removeEventListener('keydown', onKey, true);
      if (opener?.isConnected) opener.focus();
    };
  }, []);

  // The map shows the colour picked; the first one too.
  useEffect(() => onColor?.(color), [color, onColor]);

  // Active units, plus the zone's own that have since been archived (at the level it was saved at).
  const kept = (id: string) => !!zone && zone.level === level && zone.unitIds.includes(id);
  const units = unitsFor(org, level)
    .filter((u) => u.status === 'active' || kept(u.id))
    .map((u) => ({ id: u.id, name: u.name, archived: u.status !== 'active' }));
  const plural = levelLabel(level, 2);
  const trimmed = name.trim();
  const taken = others.some((z) => z.name.trim().toLowerCase() === trimmed.toLowerCase());
  const nameProblem = !trimmed ? 'Give the zone a name.' : taken ? `There’s already a zone called ${trimmed} on this floor.` : null;
  const unitProblem = unitIds.length ? null : `Choose at least one ${levelLabel(level).toLowerCase()} this zone is for.`;
  const unchanged =
    editing && trimmed === zone.name && color === zone.color && level === zone.level && unitIds.join() === zone.unitIds.join();

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (saving) return;
    setTried(true);
    if (nameProblem || unitProblem) return setError(nameProblem ?? unitProblem ?? '');
    if (unchanged) return onClose();
    setSaving(true);
    setError('');
    try {
      await Promise.all([onSave({ name: trimmed, color, level, unitIds }), editing ? new Promise((r) => setTimeout(r, MIN_SAVING_MS)) : null]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      setSaving(false);
    }
  }

  const c = ZONE_COLORS[color];
  const swatch = { '--fill': c.fill, '--edge': c.edge } as CSSProperties;

  return (
    <div className={shell.backdrop}>
      <div className={shell.dialog} role="dialog" aria-modal="true" aria-labelledby="zone-details-title" aria-describedby="zone-details-place">
        <header className={shell.head}>
          <div className={shell.headText}>
            <h2 id="zone-details-title" className={[shell.title, seatDialog.title].join(' ')}>
              {editing ? 'Edit Zone' : 'Create New Zone'}
            </h2>
            <p id="zone-details-place" className={[shell.subtitle, seatDialog.subtitle].join(' ')}>
              {place}
            </p>
          </div>
          <button type="button" className={shell.close} aria-label="Close" disabled={saving} onClick={onClose}>
            <img src="/admin/user/close.svg" alt="" width={24} height={24} />
          </button>
        </header>

        <form ref={formRef} id="zone-details-form" className={[shell.body, seatDialog.body].join(' ')} onSubmit={(e) => void submit(e)} noValidate>
          <div className={[seatDialog.banner, seatDialog.bannerNew, styles.banner].join(' ')}>
            <span className={styles.orb} style={swatch} aria-hidden="true" />
            <span className={styles.bannerText}>
              <span className={seatDialog.newLabel} aria-live="polite">
                {trimmed || 'Zone'}
              </span>
              <span className={styles.bannerSeats}>{seatsLabel(seats)}</span>
            </span>
          </div>

          <TextField
            label="Zone Name"
            value={name}
            placeholder="Zone name"
            invalid={tried && !!nameProblem}
            onChange={(v) => {
              setName(v.slice(0, MAX_NAME));
              setError('');
            }}
          />

          <label className={fields.field}>
            <span className={fields.label}>Zone Color</span>
            <span className={fields.selectWrap}>
              <select className={[fields.input, styles.colorSelect].join(' ')} value={color} onChange={(e) => setColor(e.target.value as ZoneColor)}>
                {ZONE_COLOR_LIST.map((k) => (
                  <option key={k} value={k}>
                    {ZONE_COLORS[k].label}
                    {k !== zone?.color && others.some((z) => z.color === k) ? ' (in use)' : ''}
                  </option>
                ))}
              </select>
              <span className={styles.swatch} style={swatch} aria-hidden="true" />
              <img className={fields.chevron} src="/admin/user/chevron-down.svg" alt="" width={20} height={20} />
            </span>
          </label>

          <SelectField
            required
            label="Assignment Level"
            value={level}
            choices={ZONE_LEVELS}
            onChange={(v) => {
              if (v === level) return;
              setLevel(v as ZoneLevel);
              // Back at the level it was saved at, the zone's own come back; elsewhere, start afresh.
              setUnitIds(zone && zone.level === v ? zone.unitIds : []);
              setError('');
            }}
          />
          <UnitPicker
            label={plural}
            noun={plural.toLowerCase()}
            units={units}
            value={unitIds}
            invalid={tried && !!unitProblem}
            help={`Only people in the ${plural.toLowerCase()} picked can book this zone’s seats.`}
            onChange={(ids) => {
              setUnitIds(ids);
              setError('');
            }}
          />
          {error && (
            <p className={shell.error} role="alert">
              {error}
            </p>
          )}
        </form>

        <footer className={shell.foot}>
          <button type="button" className={shell.secondary} disabled={saving} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="zone-details-form" className={shell.primary} disabled={saving} aria-busy={saving}>
            {saving ? 'Saving…' : 'Save'}
            {saving ? <span className={shell.spinner} aria-hidden="true" /> : <img src="/admin/user/check-white.svg" alt="" width={20} height={20} />}
          </button>
        </footer>
      </div>
    </div>
  );
}
