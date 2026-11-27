import { useMemo, useState, type ReactNode } from 'react';
import styles from './LocationTree.module.css';
import type { WorkLocation } from '../../../api/types';
import { BrandSwitch } from '../BrandSwitch';

const centres = (n: number) => `${n} ${n === 1 ? 'Centre' : 'Centres'}`;
/** "26 Centres" when they're all on or all off; "3/26 Centres" when only some are. */
const countText = (on: number, total: number) => (on > 0 && on < total ? `${on}/${centres(total)}` : centres(total));

/** A section title in small caps with a rule running to the right ("ALL COMPANY OFFICE LOCATIONS ———"). */
export function LocationHeading({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <h4 id={id} className={styles.heading}>
      <span>{children}</span>
    </h4>
  );
}

interface TreeProps {
  /** The section's title, above the card. */
  title: string;
  locations: WorkLocation[];
  /** The location ids that are on. */
  value: string[];
  /** Without it the switches only show what's on. */
  onChange?: (ids: string[]) => void;
  /** Narrows the list to buildings whose name, code or city match. */
  query?: string;
  country?: string;
}

/**
 * Buildings by country → city → building (Figma 3066:106945, 3145:642807): a switch on every row.
 * A city's or the country's switch turns everything under it on or off, and shows halfway when only
 * some of it is on. Cities fold open with their chevron; a search opens the ones that match.
 */
export function LocationTree({ title, locations, value, onChange, query = '', country = 'INDIA' }: TreeProps) {
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const on = useMemo(() => new Set(value), [value]);
  const headingId = `loc-tree-${title.replace(/\W+/g, '-').toLowerCase()}`;

  const cities = useMemo(() => {
    const map = new Map<string, WorkLocation[]>();
    for (const l of locations) map.set(l.city, [...(map.get(l.city) ?? []), l]);
    return [...map].map(([city, list]) => ({ city, list }));
  }, [locations]);

  const q = query.trim().toLowerCase();
  const shown = q
    ? cities
        .map(({ city, list }) => ({
          city,
          list: city.toLowerCase().includes(q) ? list : list.filter((l) => `${l.name} ${l.code}`.toLowerCase().includes(q)),
        }))
        .filter((c) => c.list.length > 0)
    : cities;

  const ids = (list: WorkLocation[]) => list.map((l) => l.id);
  const countOn = (list: WorkLocation[]) => list.filter((l) => on.has(l.id)).length;
  /** Turn a group on or off, keeping the order the buildings are listed in. */
  function setGroup(group: string[], next: boolean) {
    if (!onChange) return;
    const set = new Set(value);
    for (const id of group) {
      if (next) set.add(id);
      else set.delete(id);
    }
    onChange(locations.map((l) => l.id).filter((id) => set.has(id)));
  }
  const toggle = (city: string) =>
    setOpen((s) => {
      const next = new Set(s);
      if (next.has(city)) next.delete(city);
      else next.add(city);
      return next;
    });

  const allOn = countOn(locations);
  return (
    <section className={styles.section} aria-labelledby={headingId}>
      <LocationHeading id={headingId}>{title}</LocationHeading>
      <div className={styles.card}>
        <div className={styles.country}>
          <span className={styles.countryName}>{country}</span>
          <span className={styles.right}>
            <span className={styles.count}>{countText(allOn, locations.length)}</span>
            <BrandSwitch
              checked={locations.length > 0 && allOn === locations.length}
              mixed={allOn > 0 && allOn < locations.length}
              label={title.charAt(0) + title.slice(1).toLowerCase()}
              onChange={onChange && ((next) => setGroup(ids(locations), next))}
            />
          </span>
        </div>

        {shown.length === 0 && <p className={styles.empty}>{q ? `No locations match “${query.trim()}”.` : 'No locations yet.'}</p>}

        {shown.map(({ city, list }) => {
          const all = cities.find((c) => c.city === city)!.list;
          const cityOn = countOn(all);
          const expanded = !!q || open.has(city);
          const groupId = `${headingId}-${city.replace(/\W+/g, '-').toLowerCase()}`;
          return (
            <div key={city} role="group" aria-label={city}>
              <div className={styles.row}>
                <button
                  type="button"
                  className={styles.cityToggle}
                  aria-expanded={expanded}
                  aria-controls={groupId}
                  disabled={!!q}
                  onClick={() => toggle(city)}
                >
                  <img className={[styles.chevron, expanded ? styles.chevronOpen : ''].join(' ').trim()} src="/admin/access/chevron.svg" alt="" width={20} height={20} />
                  <span className={styles.city}>{city}</span>
                </button>
                <span className={styles.right}>
                  <span className={styles.count}>{countText(cityOn, all.length)}</span>
                  <BrandSwitch
                    checked={cityOn === all.length}
                    mixed={cityOn > 0 && cityOn < all.length}
                    label={`Every building in ${city}`}
                    onChange={onChange && ((next) => setGroup(ids(all), next))}
                  />
                </span>
              </div>
              {expanded && (
                <div id={groupId}>
                  {list.map((l) => (
                    <div key={l.id} className={[styles.row, styles.building].join(' ')}>
                      <span className={styles.buildingText} title={`${l.name}, ${l.address}`}>
                        <span className={styles.code}>{l.code}</span>
                        <span className={styles.name}>{l.name.replace(/^WeWork\s+/, '')}</span>
                      </span>
                      <BrandSwitch checked={on.has(l.id)} label={l.name} onChange={onChange && ((next) => setGroup([l.id], next))} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

/** Every WeWork centre outside India, as one switch (Figma "GLOBAL LOCATIONS"). */
export function GlobalLocations({ value, onChange }: { value: boolean; onChange?: (next: boolean) => void }) {
  return (
    <section className={styles.section} aria-labelledby="loc-global">
      <LocationHeading id="loc-global">GLOBAL LOCATIONS</LocationHeading>
      <div className={[styles.country, styles.global].join(' ')}>
        <span className={styles.countryName}>GLOBAL LOCATIONS</span>
        <span className={styles.right}>
          <span className={styles.count}>Every centre outside India</span>
          <BrandSwitch checked={value} label="Global locations" onChange={onChange} />
        </span>
      </div>
    </section>
  );
}
