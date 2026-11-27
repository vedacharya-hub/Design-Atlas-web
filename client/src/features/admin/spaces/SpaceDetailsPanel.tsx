import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
// The side panel shell (user details), then this panel's own rules.
import ui from '../AdminControls.module.css';
import panel from '../users/UserDetailsPanel.module.css';
import styles from './SpaceDetailsPanel.module.css';
import { adminApi } from '../../../api/adminApi';
import type { AdminBuilding, AdminSpaceView, Floor, SpaceBookingSettings, SpaceFloorMap, SpaceStatus } from '../../../api/types';
import { useToast } from '../Toaster';
import { BrandSwitch } from '../BrandSwitch';
import { SaveButton, type SaveStatus } from '../users/SaveButton';
import { StatusSelect } from '../users/UserDetailsPanel';
import { SelectField, TextField } from '../users/UserFormFields';
import { STATUS_LABEL } from '../users/userShared';
import { PickerField } from '../events/EventFields';
import { longDate } from '../events/eventShared';
import { FloorMapFile } from './FloorMapFile';
import { SeatMapTab } from './seatMap/SeatMapTab';
import { ZonesTab } from './zones/ZonesTab';
import { FLOOR_MAP_ACCEPT, WEEKDAYS, floorLabel, isFloorMapFile, readFloorMap, spaceCode, spacePlace, sqft } from './spaceShared';

/** Saving spins at least this long, then "Saved" holds this long before the details come back. */
const MIN_SAVING_MS = 500;
const SAVED_HOLD_MS = 1000;

type Tab = 'general' | 'map' | 'zones';

/** The edit view's working copy: numbers stay text while they're typed. */
interface Draft {
  buildingId: string;
  floor: string;
  capacity: string;
  floorMap: SpaceFloorMap | null;
  status: SpaceStatus;
  multiDayLimit: string;
  futureLimitDays: string;
  instructions: string;
  restricted: boolean;
  restrictFrom: string;
  restrictUntil: string;
  restrictDays: number[];
}

const draftOf = (s: AdminSpaceView): Draft => ({
  buildingId: s.buildingId,
  floor: String(s.floor),
  capacity: String(s.capacity),
  floorMap: s.floorMap,
  status: s.status,
  multiDayLimit: String(s.booking.multiDayLimit),
  futureLimitDays: String(s.booking.futureLimitDays),
  instructions: s.booking.instructions,
  restricted: s.booking.restricted,
  restrictFrom: s.booking.restrictFrom,
  restrictUntil: s.booking.restrictUntil,
  restrictDays: s.booking.restrictDays,
});

const days = (n: number) => (n === 0 ? 'No limit' : `${n} ${n === 1 ? 'day' : 'days'}`);

interface Props {
  space: AdminSpaceView;
  spaces: AdminSpaceView[];
  buildings: AdminBuilding[];
  onClose: () => void;
  onChange: (space: AdminSpaceView) => void;
}

/**
 * Space Details (Figma 1592:143530) from the right: the building, floor and location over General,
 * Space Map and Space Zones. The pencil opens the edit
 * view (1592:153563, 1592:154141): the building, floor, total spaces, floor map, status and booking
 * settings change; the ID, leased area and the building's city, area and time zone are greyed out.
 */
export function SpaceDetailsPanel({ space, spaces, buildings, onClose, onChange }: Props) {
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('general');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [error, setError] = useState('');
  const [reading, setReading] = useState(false);
  const [closing, setClosing] = useState(false);
  const [floor, setFloor] = useState<Floor | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const editing = draft !== null;

  // A mapped floor brings its plan; Space Map and Space Zones load its desks and zones.
  useEffect(() => {
    if (!space.seatMapId) return;
    adminApi.getFloor(space.seatMapId).then(setFloor).catch(() => setFloor(null));
  }, [space.seatMapId]);

  // Escape backs out of editing first, then closes. Pickers and menus inside claim it before this.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if (draft) cancelEdit();
      else setClosing(true);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panelRef.current?.focus();
    return () => {
      document.body.style.overflow = overflow;
      clearTimeout(savedTimer.current);
      opener?.focus?.();
    };
  }, []);

  const set = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  const close = () => setClosing(true);

  function startEdit() {
    setDraft(draftOf(space));
    setTab('general');
    setError('');
  }
  function cancelEdit() {
    clearTimeout(savedTimer.current);
    setDraft(null);
    setSaveStatus('idle');
    setError('');
  }

  // While editing, the building's own details follow the building picked.
  const building = buildings.find((b) => b.id === (draft?.buildingId ?? space.buildingId));
  const buildingChoices = buildings.filter((b) => b.status === 'active' || b.id === space.buildingId).map((b) => ({ value: b.id, label: b.name }));
  const floorChoices = useMemo(() => {
    if (!building) return [];
    const taken = new Set(spaces.filter((s) => s.id !== space.id && s.buildingId === building.id).map((s) => s.floor));
    return Array.from({ length: building.floors }, (_, i) => i + 1)
      .filter((n) => !taken.has(n))
      .map((n) => ({ value: String(n), label: floorLabel(n) }));
  }, [building, spaces, space.id]);

  async function pickMap(file: File | undefined) {
    if (!file) return;
    if (!isFloorMapFile(file)) return setError('The floor map must be a PNG, JPG, WebP or SVG image.');
    setError('');
    setReading(true);
    try {
      const url = await readFloorMap(file);
      set({ floorMap: { name: file.name, size: file.size, url } });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That file couldn’t be read.');
    } finally {
      setReading(false);
    }
  }

  /** What's wrong with the working copy, if anything. */
  function problem(d: Draft): string | null {
    if (!d.floor) return 'Choose a floor.';
    if (!/^\d+$/.test(d.capacity) || +d.capacity < 1 || +d.capacity > 10000) return 'Total spaces must be between 1 and 10,000.';
    if (!/^\d+$/.test(d.multiDayLimit) || +d.multiDayLimit > 365) return 'The multiple day booking limit must be between 0 and 365 days.';
    if (!/^\d+$/.test(d.futureLimitDays) || +d.futureLimitDays > 365) return 'Future bookings can be limited to between 0 and 365 days.';
    if (d.restricted) {
      if (!d.restrictFrom || !d.restrictUntil) return 'Choose the start and end dates for restricted bookings.';
      if (d.restrictFrom > d.restrictUntil) return 'The end date must be on or after the start date.';
      if (d.restrictDays.length === 0) return 'Choose at least one day of the week.';
    }
    return null;
  }

  /** Save → Saving… → Saved, held a moment on the edit view, then back to the details. A failure stays on "Try again". */
  async function save(e?: FormEvent) {
    e?.preventDefault();
    if (!draft || saveStatus === 'saving' || reading) return;
    const wrong = problem(draft);
    if (wrong) {
      setError(wrong);
      setSaveStatus('error');
      return;
    }
    clearTimeout(savedTimer.current);
    const booking: SpaceBookingSettings = {
      multiDayLimit: +draft.multiDayLimit,
      futureLimitDays: +draft.futureLimitDays,
      instructions: draft.instructions,
      restricted: draft.restricted,
      restrictFrom: draft.restrictFrom,
      restrictUntil: draft.restrictUntil,
      restrictDays: draft.restrictDays,
    };
    setSaveStatus('saving');
    setError('');
    try {
      const [next] = await Promise.all([
        adminApi.updateSpace(space.id, {
          buildingId: draft.buildingId,
          floor: +draft.floor,
          capacity: +draft.capacity,
          floorMap: draft.floorMap,
          status: draft.status,
          booking,
        }),
        new Promise((r) => setTimeout(r, MIN_SAVING_MS)),
      ]);
      onChange(next);
      setSaveStatus('saved');
      const where = `${floorLabel(next.floor)}, ${next.building}`;
      toast(
        space.status === 'active' && next.status === 'inactive'
          ? { title: 'Space archived!', description: <><strong>{where}</strong> won’t take bookings</> }
          : { title: 'Space updated!', description: <>Saved your changes to <strong>{where}</strong></> },
      );
      savedTimer.current = setTimeout(() => {
        // The Save button leaves with the edit view: keep focus in the panel.
        const hadFocus = (document.activeElement as HTMLButtonElement | null)?.form?.id === 'space-edit';
        setDraft(null);
        setSaveStatus('idle');
        if (hadFocus) panelRef.current?.focus();
      }, SAVED_HOLD_MS);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong. Please try again.';
      setSaveStatus('error');
      setError(message);
      toast({
        tone: 'error',
        title: 'Couldn’t save the space',
        description: message,
      });
    }
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'general', label: 'General' },
    { id: 'map', label: 'Space Map' },
    { id: 'zones', label: 'Space Zones' },
  ];
  const place = spacePlace({
    officeNo: space.officeNo,
    floor: draft ? +draft.floor || space.floor : space.floor,
  });

  return (
    <>
      <div className={[panel.backdrop, closing ? panel.backdropOut : ''].join(' ').trim()} onMouseDown={close} />
      <div
        ref={panelRef}
        className={[panel.panel, styles.panel, closing ? panel.panelOut : ''].join(' ')}
        role="dialog"
        aria-modal="true"
        aria-label={`${editing ? 'Edit ' : ''}${floorLabel(space.floor)}, ${space.building}`}
        tabIndex={-1}
        onAnimationEnd={(e) => {
          if (closing && e.target === e.currentTarget) onClose();
        }}
      >
        <header className={panel.head}>
          <h2 className={panel.headTitle}>Space Details</h2>
          {editing ? (
            <SaveButton status={saveStatus} form="space-edit" className={panel.saveBtn} />
          ) : (
            <div className={panel.headActions}>
              <button type="button" className={panel.editBtn} aria-label="Edit space details" onClick={startEdit}>
                <img src="/admin/user/edit-24.svg" alt="" width={24} height={24} />
              </button>
              <button type="button" className={panel.closeBtn} aria-label="Close" onClick={close}>
                <img src="/admin/user/close.svg" alt="" width={24} height={24} />
              </button>
            </div>
          )}
        </header>

        <div className={panel.body}>
          <section className={[panel.hero, styles.hero].join(' ')}>
            <div className={styles.heroRow}>
              <div className={styles.heroName}>
                <h3 className={styles.name}>{building?.name ?? space.building}</h3>
                <p className={styles.place}>{place}</p>
              </div>
              <span className={styles.heroRule} aria-hidden="true" />
              <div className={styles.heroFact}>
                <span className={styles.heroLabel}>LOCATION</span>
                <span className={styles.heroValue}>{[building?.city, building?.state].filter(Boolean).join(', ') || '-'}</span>
              </div>
              <div className={styles.heroStatus}>
                {editing ? (
                  <StatusSelect value={draft.status} label="Space status" onChange={(status) => set({ status })} />
                ) : (
                  <span className={[panel.status, panel[`status_${space.status}`], styles.badge].join(' ')}>{STATUS_LABEL[space.status]}</span>
                )}
              </div>
            </div>
            <div className={[panel.tabs, styles.tabs].join(' ')} role="tablist" aria-label="Space details">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === t.id}
                  className={[panel.tab, styles.tab, tab === t.id ? panel.tabActive : ''].join(' ').trim()}
                  onClick={() => setTab(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </section>

          {error && (
            <p className={[panel.error, styles.error].join(' ')} role="alert">
              {error}
            </p>
          )}

          {tab === 'general' &&
            (editing ? (
              <form id="space-edit" className={[styles.content, styles.contentEdit].join(' ')} onSubmit={(e) => void save(e)} noValidate>
                <section className={styles.section}>
                  <h4 className={styles.sectionTitle}>Space Details</h4>
                  <div className={styles.formGrid}>
                    <TextField label="Space ID" value={spaceCode(space)} locked lockedTitle="The ID can’t be changed" />
                    <SelectField
                      required
                      label="Building Name"
                      value={draft.buildingId}
                      choices={buildingChoices}
                      onChange={(buildingId) => {
                        // Keep the floor if the new building has it free.
                        const next = buildings.find((b) => b.id === buildingId);
                        const free = next && +draft.floor <= next.floors && !spaces.some((s) => s.id !== space.id && s.buildingId === buildingId && s.floor === +draft.floor);
                        set({ buildingId, floor: free ? draft.floor : '' });
                      }}
                    />
                    <SelectField required label="Floors" value={draft.floor} choices={floorChoices} onChange={(floor) => set({ floor })} />
                    <TextField label="Total Spaces" value={draft.capacity} onChange={(v) => set({ capacity: v.replace(/\D/g, '') })} />
                    <TextField label="Leased Area (Sq.Ft)" value={`${sqft(space.leasedArea)} Sq.Ft`} locked lockedTitle="Set when the space was added" />
                    <TextField label="City" value={building?.city ?? ''} locked lockedTitle="Comes from the building" />
                    <TextField label="Area" value={building?.area ?? ''} locked lockedTitle="Comes from the building" />
                    <TextField label="Time Zone" value={building?.timeZone ?? ''} locked lockedTitle="Comes from the building" />
                    <TextField label="WeWork Private Space / Floor ID" value={space.floorId} locked lockedTitle="Assigned by WeWork" />
                    <div className={styles.mapField}>
                      <span className={styles.fieldLabel}>Floor Map</span>
                      {draft.floorMap ? (
                        <FloorMapFile map={draft.floorMap} onRemove={() => set({ floorMap: null })} />
                      ) : (
                        <button type="button" className={[ui.btn, ui.btnSecondary, styles.upload].join(' ')} disabled={reading} onClick={() => fileRef.current?.click()}>
                          {reading ? 'Reading…' : 'Upload Map'}
                          <img src="/admin/spaces/add-dark.svg" alt="" width={24} height={24} />
                        </button>
                      )}
                      <input
                        ref={fileRef}
                        type="file"
                        accept={FLOOR_MAP_ACCEPT}
                        hidden
                        onChange={(e) => {
                          void pickMap(e.target.files?.[0]);
                          e.target.value = '';
                        }}
                      />
                    </div>
                  </div>
                </section>

                <section className={styles.card} aria-labelledby="space-booking-settings">
                  <h4 id="space-booking-settings" className={styles.cardTitle}>
                    Booking Settings
                  </h4>
                  <div className={[styles.cardBody, styles.cardBodyEdit].join(' ')}>
                    <div className={styles.column}>
                      <TextField label="Multiple Day Booking Limit" value={draft.multiDayLimit} onChange={(v) => set({ multiDayLimit: v.replace(/\D/g, '') })} />
                      <TextField label="Limit future bookings (In Days)" value={draft.futureLimitDays} onChange={(v) => set({ futureLimitDays: v.replace(/\D/g, '') })} />
                    </div>
                    <label className={styles.instructionsField}>
                      <span className={styles.fieldLabel}>Reservation Instructions</span>
                      <textarea
                        className={styles.instructions}
                        value={draft.instructions}
                        maxLength={2000}
                        placeholder="One instruction per line"
                        onChange={(e) => set({ instructions: e.target.value })}
                      />
                    </label>
                    <Restrict draft={draft} onChange={set} />
                  </div>
                </section>
              </form>
            ) : (
              <div className={styles.content}>
                <section className={styles.section}>
                  <h4 className={styles.sectionTitle}>Space Details</h4>
                  <dl className={styles.facts}>
                    <Fact label="SPACE ID" value={spaceCode(space)} />
                    <Fact label="BUILDING NAME" value={space.building} />
                    <Fact label="FLOOR" value={floorLabel(space.floor)} />
                    <Fact label="TOTAL SPACES" value={`${space.capacity} Spaces`} />
                    <Fact label="LEASED AREA (Sq.Ft.)" value={`${sqft(space.leasedArea)} Sq.Ft.`} />
                    <Fact label="CITY" value={[space.city, space.state].filter(Boolean).join(', ')} />
                    <Fact label="AREA" value={space.area || '-'} />
                    <Fact label="TIME ZONE" value={space.timeZone} />
                    <div className={styles.fact}>
                      <dt className={styles.factLabel}>FLOOR MAP</dt>
                      <dd className={styles.factMap}>{space.floorMap ? <FloorMapFile map={space.floorMap} /> : <span className={styles.none}>No floor map yet</span>}</dd>
                    </div>
                  </dl>
                </section>

                <section className={styles.card} aria-labelledby="space-booking-settings">
                  <h4 id="space-booking-settings" className={styles.cardTitle}>
                    Booking Settings
                  </h4>
                  <div className={styles.cardBody}>
                    <dl className={styles.column}>
                      <Fact label="MULTIPLE DAY BOOKING LIMIT" value={days(space.booking.multiDayLimit)} />
                      <Fact label="LIMIT FUTURE BOOKINGS (IN DAYS)" value={days(space.booking.futureLimitDays)} />
                      <Fact label="BOOKING CAPACITY" value={String(space.capacity)} />
                    </dl>
                    <dl className={styles.column}>
                      <div className={styles.fact}>
                        <dt className={styles.factLabel}>RESERVATION INSTRUCTIONS</dt>
                        <dd className={styles.factValue}>
                          {space.booking.instructions.trim() ? (
                            <ul className={styles.list}>
                              {space.booking.instructions
                                .split('\n')
                                .map((line) => line.trim())
                                .filter(Boolean)
                                .map((line, i) => (
                                  <li key={i}>{line}</li>
                                ))}
                            </ul>
                          ) : (
                            <span className={styles.none}>None</span>
                          )}
                        </dd>
                      </div>
                    </dl>
                    <dl className={styles.column}>
                      <div className={styles.fact}>
                        <dt className={styles.factLabel}>RESTRICT BOOKINGS</dt>
                        <dd className={styles.switchRow}>
                          <BrandSwitch checked={space.booking.restricted} />
                          {space.booking.restricted ? 'ON' : 'OFF'}
                        </dd>
                      </div>
                      {space.booking.restricted && (
                        <div className={styles.fact}>
                          <dt className={styles.factLabel}>BOOKING WINDOW</dt>
                          <dd className={styles.factValue}>
                            {longDate(space.booking.restrictFrom)} to {longDate(space.booking.restrictUntil)}
                            <span className={styles.days}>{space.booking.restrictDays.map((d) => WEEKDAYS[d].name).join(', ')}</span>
                          </dd>
                        </div>
                      )}
                    </dl>
                  </div>
                </section>
              </div>
            ))}

          {tab === 'map' &&
            (floor ? (
              <SeatMapTab space={space} floor={floor} buildingName={building?.name ?? space.building} />
            ) : (
              <div className={styles.tabBody}>
                {(draft?.floorMap ?? space.floorMap) ? (
                  <img className={styles.mapImage} src={(draft?.floorMap ?? space.floorMap)!.url} alt={`Floor map of the ${floorLabel(space.floor)}`} />
                ) : (
                  <p className={ui.empty}>No floor map yet. Upload one from the edit view to see it here.</p>
                )}
              </div>
            ))}
          {tab === 'zones' &&
            (floor ? (
              <ZonesTab space={space} floor={floor} buildingName={building?.name ?? space.building} />
            ) : (
              <div className={styles.tabBody}>
                <p className={ui.empty}>Zones can be drawn here once the floor’s desks are mapped.</p>
              </div>
            ))}
        </div>
      </div>
    </>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.fact}>
      <dt className={styles.factLabel}>{label}</dt>
      <dd className={styles.factValue}>{value}</dd>
    </div>
  );
}

/** Restrict bookings: the switch, then the dates and days members may book on. */
function Restrict({ draft, onChange }: { draft: Draft; onChange: (patch: Partial<Draft>) => void }) {
  const untilEarly = !!draft.restrictFrom && !!draft.restrictUntil && draft.restrictUntil < draft.restrictFrom;
  return (
    <div className={styles.restrict}>
      <div className={styles.fact}>
        <span className={styles.factLabel} id="space-restrict-label">
          RESTRICT BOOKINGS
        </span>
        <span className={styles.switchRow}>
          <BrandSwitch checked={draft.restricted} labelledBy="space-restrict-label" onChange={(restricted) => onChange({ restricted })} />
          {draft.restricted ? 'ON' : 'OFF'}
        </span>
        {!draft.restricted && <span className={styles.note}>Restrict users for booking office space at set dates and Days - based on the duration</span>}
      </div>
      {draft.restricted && (
        <div className={styles.window}>
          <PickerField
            small
            label="START DATE"
            type="date"
            icon="/admin/events/calendar-event.svg"
            value={draft.restrictFrom}
            onChange={(v) => onChange({ restrictFrom: (v as string) ?? '' })}
          />
          <PickerField
            small
            label="END DATE"
            type="date"
            icon="/admin/events/calendar-event.svg"
            value={draft.restrictUntil}
            min={draft.restrictFrom || undefined}
            invalid={untilEarly}
            help={untilEarly ? 'Pick a date on or after the start date.' : undefined}
            onChange={(v) => onChange({ restrictUntil: (v as string) ?? '' })}
          />
          <div className={styles.weekField} role="group" aria-labelledby="space-days-label">
            <span id="space-days-label" className={styles.smallLabel}>
              DAYS OF WEEK
            </span>
            <div className={styles.week}>
              {WEEKDAYS.map((d, i) => {
                const on = draft.restrictDays.includes(i);
                return (
                  <button
                    key={d.name}
                    type="button"
                    className={[styles.day, on ? styles.dayOn : ''].join(' ').trim()}
                    aria-pressed={on}
                    aria-label={d.name}
                    title={d.name}
                    onClick={() => onChange({ restrictDays: on ? draft.restrictDays.filter((x) => x !== i) : [...draft.restrictDays, i].sort() })}
                  >
                    {d.letter}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
