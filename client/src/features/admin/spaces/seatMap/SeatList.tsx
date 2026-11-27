import { useMemo } from 'react';
import ui from '../../AdminControls.module.css';
import styles from './SeatList.module.css';
import { canKeepFor, type MapSeat } from './seatShared';

export type SeatFilter = 'all' | 'assigned' | 'available';

interface Props {
  /** Desks in the zone picked on the map. */
  seats: MapSeat[];
  /** The floor's zones, in order, for the groups. */
  zones: string[];
  filter: SeatFilter;
  onFilter: (filter: SeatFilter) => void;
  query: string;
  onQuery: (query: string) => void;
  /** The desk open or hovered on the map. */
  activeId: string | null;
  onPick: (seat: MapSeat) => void;
  onHover: (id: string | null) => void;
}

const byLabel = (a: MapSeat, b: MapSeat) => a.label.localeCompare(b.label, undefined, { numeric: true });

/**
 * The desks beside the map (Figma 1594:86785): All / Assigned / Available with their counts, a search
 * over desks and people, then each zone's desks: a green tile and the person for a permanent seat,
 * a grey tile and "Unassigned" for a free one.
 */
export function SeatList({ seats, zones, filter, onFilter, query, onQuery, activeId, onPick, onHover }: Props) {
  const counts = useMemo(() => {
    const assigned = seats.filter((s) => s.assignment).length;
    return { all: seats.length, assigned, available: seats.length - assigned };
  }, [seats]);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const shown = seats.filter((s) => {
      if (filter === 'assigned' && !s.assignment) return false;
      if (filter === 'available' && s.assignment) return false;
      if (!q) return true;
      const a = s.assignment;
      return [s.label, s.zone, a?.name, a?.email, a?.team].some((v) => v?.toLowerCase().includes(q));
    });
    const order = [...zones, ...new Set(shown.map((s) => s.zone).filter((z) => !zones.includes(z)))];
    return order
      .map((zone) => ({
        zone,
        seats: shown.filter((s) => s.zone === zone).sort(byLabel),
      }))
      .filter((g) => g.seats.length > 0);
  }, [seats, zones, filter, query]);

  const tabs: { id: SeatFilter; label: string; count: number }[] = [
    { id: 'all', label: 'All', count: counts.all },
    { id: 'assigned', label: 'Assigned', count: counts.assigned },
    { id: 'available', label: 'Available', count: counts.available },
  ];

  return (
    <aside className={styles.list} aria-label="Desks">
      <div className={styles.tabs} role="tablist" aria-label="Show desks">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={filter === t.id}
            className={[styles.tab, filter === t.id ? styles.tabOn : ''].join(' ').trim()}
            onClick={() => onFilter(t.id)}
          >
            {t.label}
            <span className={styles.count}>{t.count}</span>
          </button>
        ))}
      </div>

      <div className={styles.searchRow}>
        <label className={[ui.search, styles.search].join(' ')}>
          <input type="search" value={query} placeholder="Search Seat, employee" aria-label="Search desks and people" onChange={(e) => onQuery(e.target.value)} />
          <img src="/admin/search.svg" alt="" width={20} height={20} />
        </label>
      </div>

      <div className={styles.scroll}>
        {groups.length === 0 ? (
          <p className={styles.empty}>
            {query.trim()
              ? `No desks or people match “${query.trim()}”.`
              : filter === 'assigned'
                ? 'No permanent seats yet. Click a green desk on the map to assign one.'
                : filter === 'available'
                  ? 'Every desk here is someone’s permanent seat.'
                  : 'No desks on the map yet. Use Edit to add some.'}
          </p>
        ) : (
          groups.map((g) => (
            <section key={g.zone} className={styles.group} aria-label={g.zone}>
              <h4 className={styles.zone}>{g.zone.toUpperCase()}</h4>
              <ul className={styles.rows}>
                {g.seats.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      className={[styles.row, s.id === activeId ? styles.rowActive : ''].join(' ').trim()}
                      onClick={() => onPick(s)}
                      onPointerEnter={() => onHover(s.id)}
                      onPointerLeave={() => onHover(null)}
                      onFocus={() => onHover(s.id)}
                      onBlur={() => onHover(null)}
                    >
                      <span className={[styles.tile, s.assignment ? styles.tileTaken : ''].join(' ').trim()}>{s.label}</span>
                      {s.assignment ? (
                        <span className={styles.who}>
                          <span className={styles.name}>{s.assignment.name}</span>
                          <span className={styles.team}>{s.assignment.team || s.assignment.email}</span>
                        </span>
                      ) : (
                        <span className={styles.who}>
                          <span className={styles.team}>{s.isNew ? 'New · not saved yet' : canKeepFor(s.spaceType) ? 'Unassigned' : `${s.spaceType} · open to all`}</span>
                        </span>
                      )}
                      {s.assignment ? <span className={styles.permanent}>Permanent</span> : <span className={styles.available}>Available</span>}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </div>
    </aside>
  );
}
