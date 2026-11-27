import { useEffect, useMemo, useRef, useState } from 'react';
// Shared controls; this tab's rules last.
import ui from '../AdminControls.module.css';
import usersStyles from '../users/UsersPanel.module.css';
import styles from './CoworkingPermissionsTab.module.css';
import { adminApi } from '../../../api/adminApi';
import type { CoworkingPermissions, WorkLocation } from '../../../api/types';
import { BrandSwitch } from '../BrandSwitch';
import { useToast } from '../Toaster';
import { useDismiss } from '../users/useRowMenu';
import { useSheetTip } from '../users/bulk/SheetCells';

/** On a saved switch: they only change from ⋮ → Edit permissions. */
const LOCKED_TIP = 'Saved permissions can’t be changed here. Choose ⋮ → Edit permissions to change them.';

/** "WeWork Platina BKC" → "Platina BKC": the list is all WeWork. */
const shortName = (name: string) => name.replace(/^WeWork\s+/i, '');
const centres = (n: number) => `${n} ${n === 1 ? 'Centre' : 'Centres'}`;

interface Draft {
  disabled: Set<string>;
  global: boolean;
}

interface Props {
  /** The buildings, in the order the company lists them. */
  locations: WorkLocation[];
  permissions: CoworkingPermissions;
  onSaved: (next: CoworkingPermissions) => void;
}

/**
 * Company Settings → Co-working Permissions (Figma 8413:199754; editing 11667:306310): every WeWork
 * co-working building in India by city, and the centres abroad as one switch. Saved, the switches
 * only show what's allowed (hovering one says how to change it); ⋮ → Edit permissions makes them
 * switchable, with Save. A city or India switch turns all of its buildings on or off, and reads as
 * part-on when only some are. A building turned off is off for everyone: users who have it see it
 * restricted.
 */
function CoworkingPermissionsEditor({ locations, permissions, onSaved }: Props) {
  const toast = useToast();
  const tip = useSheetTip();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  useDismiss(moreOpen, moreRef, () => setMoreOpen(false));

  const editing = draft !== null;
  const disabled = draft?.disabled ?? new Set(permissions.disabledLocationIds);
  const global = draft?.global ?? permissions.global;
  const isOn = (id: string) => !disabled.has(id);

  const dirty =
    !!draft &&
    (draft.global !== permissions.global ||
      draft.disabled.size !== permissions.disabledLocationIds.length ||
      permissions.disabledLocationIds.some((id) => !draft.disabled.has(id)));

  // Escape leaves editing when nothing has changed; with changes it does nothing, so they aren't lost.
  const state = useRef({ editing, dirty });
  state.current = { editing, dirty };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || !state.current.editing || state.current.dirty) return;
      e.preventDefault();
      setDraft(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // Cities in the order their first building comes, each with its buildings.
  const cities = useMemo(() => {
    const byCity = new Map<string, WorkLocation[]>();
    for (const l of locations) byCity.set(l.city, [...(byCity.get(l.city) ?? []), l]);
    return [...byCity.entries()].map(([city, list]) => ({ city, list }));
  }, [locations]);

  // Search: a city's name shows all its buildings; otherwise the buildings that match, their cities opened.
  const q = query.trim().toLowerCase();
  const shown = cities
    .map(({ city, list }) => ({
      city,
      list,
      matches: !q || city.toLowerCase().includes(q) ? list : list.filter((l) => `${l.code} ${l.name} ${l.address}`.toLowerCase().includes(q)),
    }))
    .filter((c) => c.matches.length > 0);
  const globalShown = !q || 'global locations abroad international'.includes(q);

  const indiaOn = locations.filter((l) => isOn(l.id)).length;
  const total = locations.length + permissions.globalCentres;
  const active = indiaOn + (global ? permissions.globalCentres : 0);

  /** Turns buildings on or off in the draft. */
  function set(ids: string[], on: boolean) {
    setDraft((d) => {
      if (!d) return d;
      const next = new Set(d.disabled);
      for (const id of ids) {
        if (on) next.delete(id);
        else next.add(id);
      }
      return { ...d, disabled: next };
    });
  }

  function toggleCity(city: string) {
    setOpen((o) => {
      const next = new Set(o);
      if (next.has(city)) next.delete(city);
      else next.add(city);
      return next;
    });
  }

  async function save() {
    if (!draft || saving) return;
    if (!dirty) return setDraft(null);
    const before = new Set(permissions.disabledLocationIds);
    const turnedOff = [...draft.disabled].filter((id) => !before.has(id)).length;
    const turnedOn = [...before].filter((id) => !draft.disabled.has(id)).length;
    setSaving(true);
    try {
      const next = await adminApi.saveCoworking({ disabledLocationIds: [...draft.disabled], global: draft.global });
      onSaved(next);
      setDraft(null);
      const changes = [
        turnedOff ? `turned off ${turnedOff} ${turnedOff === 1 ? 'location' : 'locations'}` : '',
        turnedOn ? `turned on ${turnedOn} ${turnedOn === 1 ? 'location' : 'locations'}` : '',
        next.global !== permissions.global ? `${next.global ? 'allowed' : 'turned off'} global locations` : '',
      ].filter(Boolean);
      const what = changes.join(', ');
      toast({
        title: 'Co-working permissions saved!',
        description: `${what[0].toUpperCase()}${what.slice(1)}.${turnedOff || (!next.global && permissions.global) ? ' Users who have them now see them as restricted.' : ''}`,
      });
    } catch (err) {
      toast({ tone: 'error', title: 'Couldn’t save the permissions', description: err instanceof Error ? err.message : 'Please try again.' });
    } finally {
      setSaving(false);
    }
  }

  /** A switch: live while editing; saved, it only shows the setting and says how to change it. */
  const toggle = (label: string, on: boolean, onChange: (on: boolean) => void, mixed = false) =>
    editing ? (
      <BrandSwitch checked={on} mixed={mixed} label={label} onChange={onChange} />
    ) : (
      <span className={styles.locked} data-tip={LOCKED_TIP} data-tip-when="always" tabIndex={0} aria-label={`${label}: ${mixed ? 'some on' : on ? 'on' : 'off'}. ${LOCKED_TIP}`}>
        <BrandSwitch checked={on} mixed={mixed} />
      </span>
    );

  /** "26 Centres", or "8 of 26 Centres" when only some are on. */
  const countOf = (ids: string[]) => {
    const on = ids.filter(isOn).length;
    return on === 0 || on === ids.length ? centres(ids.length) : `${on} of ${centres(ids.length)}`;
  };
  const allIds = locations.map((l) => l.id);
  const groupState = (ids: string[]) => {
    const on = ids.filter(isOn).length;
    return { on: on === ids.length && ids.length > 0, mixed: on > 0 && on < ids.length };
  };
  const india = groupState(allIds);

  return (
    <div className={styles.tab} {...tip.handlers}>
      <div className={styles.bar}>
        <h3 className={styles.title}>Co-working Locations</h3>
        <div className={styles.controls}>
          <span className={styles.count} aria-live="polite">
            {active} of {total} {editing ? 'Selected' : 'locations active'}
          </span>
          <label className={styles.search}>
            <span className={ui.srOnly}>Search co-working locations</span>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search" />
            <img src="/admin/user/search.svg" alt="" width={20} height={20} />
          </label>
          {editing ? (
            <>
              <button type="button" className={[ui.btn, ui.btnSecondary].join(' ')} disabled={saving} onClick={() => setDraft(null)}>
                Cancel
              </button>
              <button type="button" className={[ui.btn, ui.btnPrimary, styles.save].join(' ')} disabled={saving} aria-busy={saving} onClick={() => void save()}>
                {saving ? 'Saving…' : 'Save'}
                <img src="/admin/user/check-white.svg" alt="" width={20} height={20} />
              </button>
            </>
          ) : (
            <div className={ui.filterWrap} ref={moreRef}>
              <button type="button" className={ui.iconBtn} aria-label="More options" aria-expanded={moreOpen} aria-haspopup="menu" onClick={() => setMoreOpen((o) => !o)}>
                <img src="/admin/user/more-2-fill.svg" alt="" width={20} height={20} />
              </button>
              {moreOpen && (
                <div className={[usersStyles.moreMenu, styles.menu].join(' ')} role="menu">
                  <button
                    type="button"
                    role="menuitem"
                    className={usersStyles.moreItem}
                    onClick={() => {
                      setMoreOpen(false);
                      setDraft({ disabled: new Set(permissions.disabledLocationIds), global: permissions.global });
                    }}
                  >
                    <img src="/admin/company/edit.svg" alt="" width={20} height={20} />
                    Edit permissions
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <section className={styles.section} aria-labelledby="coworking-india">
        <div className={styles.sectionHead}>
          <h4 id="coworking-india" className={styles.sectionTitle}>
            ALL WEWORK CO - WORKING LOCATIONS
          </h4>
          <span className={styles.rule} aria-hidden="true" />
        </div>
        <div className={styles.card}>
          <div className={styles.regionRow}>
            <span className={styles.regionName}>INDIA</span>
            <span className={styles.end}>
              <span className={styles.centres}>{countOf(allIds)}</span>
              {toggle('All co-working locations in India', india.on, (on) => set(allIds, on), india.mixed)}
            </span>
          </div>
          {shown.length === 0 && <p className={styles.empty}>No locations in India match “{query.trim()}”.</p>}
          {shown.map(({ city, list, matches }) => {
            const ids = list.map((l) => l.id);
            const s = groupState(ids);
            const expanded = open.has(city) || !!q;
            return (
              <div key={city} className={styles.city}>
                <div className={styles.cityRow}>
                  <button type="button" className={styles.cityToggle} aria-expanded={expanded} onClick={() => toggleCity(city)}>
                    <img className={expanded ? undefined : styles.chevronClosed} src="/admin/access/chevron.svg" alt="" width={20} height={20} />
                    <span className={styles.cityName}>{city}</span>
                  </button>
                  <span className={styles.end}>
                    <span className={styles.centres}>{countOf(ids)}</span>
                    {toggle(`All co-working locations in ${city}`, s.on, (on) => set(ids, on), s.mixed)}
                  </span>
                </div>
                {expanded &&
                  matches.map((l) => (
                    <div key={l.id} className={[styles.centreRow, isOn(l.id) ? '' : styles.centreOff].join(' ').trim()}>
                      <span className={styles.centre} title={l.address}>
                        <span className={styles.code}>{l.code}</span>
                        <span className={styles.centreName}>{shortName(l.name)}</span>
                      </span>
                      {toggle(shortName(l.name), isOn(l.id), (on) => set([l.id], on))}
                    </div>
                  ))}
              </div>
            );
          })}
        </div>
      </section>

      {globalShown && (
        <section className={styles.section} aria-labelledby="coworking-global">
          <div className={styles.sectionHead}>
            <h4 id="coworking-global" className={styles.sectionTitle}>
              GLOBAL LOCATIONS
            </h4>
            <span className={styles.rule} aria-hidden="true" />
          </div>
          <div className={[styles.card, styles.regionRow, styles.globalRow].join(' ')}>
            <span className={styles.regionName}>GLOBAL LOCATIONS</span>
            <span className={styles.end}>
              <span className={styles.centres}>{centres(permissions.globalCentres)}</span>
              {toggle('WeWork centres outside India', global, (on) => setDraft((d) => d && { ...d, global: on }))}
            </span>
          </div>
        </section>
      )}

      {tip.node}
    </div>
  );
}

/** Loads the buildings and the saved permissions, then shows them. */
export function CoworkingPermissionsTab() {
  const [locations, setLocations] = useState<WorkLocation[] | null>(null);
  const [permissions, setPermissions] = useState<CoworkingPermissions | null>(null);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    const fail = () => setLoadError('Couldn’t load the co-working permissions. Please try again.');
    adminApi.getLocations().then(setLocations).catch(fail);
    adminApi.getCoworking().then(setPermissions).catch(fail);
  }, []);

  if (loadError) return <p className={ui.empty}>{loadError}</p>;
  if (!locations || !permissions) return <p className={ui.empty}>Loading co-working permissions…</p>;
  return <CoworkingPermissionsEditor locations={locations} permissions={permissions} onSaved={setPermissions} />;
}
