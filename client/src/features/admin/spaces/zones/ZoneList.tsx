import { useEffect, useRef, type CSSProperties } from 'react';
import styles from './ZoneList.module.css';
import type { OrgChart } from '../../../../api/types';
import { useRowMenu } from '../../users/useRowMenu';
import { RowMenu } from '../../users/RowMenu';
import { ZONE_COLORS, levelLabel, seatsLabel, unitNames, type MapZone } from './zoneShared';

/** Roughly the ⋮ menu's height, to open it upwards near the bottom of the window. */
const MENU_HEIGHT = 96;
/** The most teams (or departments, or business units) a card lists before "+N more". */
const MAX_NAMES = 3;

interface Props {
  zones: MapZone[];
  /** Seats in each zone, by id. */
  counts: Map<string, number>;
  org: OrgChart | null;
  editing: boolean;
  selectedId: string | null;
  onPick: (zone: MapZone) => void;
  onHover: (id: string | null) => void;
  /** The empty state's Create Zone. */
  onCreate: () => void;
  onEditZone: (zone: MapZone) => void;
  onDeleteZone: (zone: MapZone) => void;
}

/**
 * The zones beside the map (Figma 3039:111640, 1604:187751): a card each with its colour, seats, and
 * who it's for, and a ⋮ menu to edit its details or delete it. With none yet, the empty state offers
 * Create Zone (1598:90456).
 */
export function ZoneList({ zones, counts, org, editing, selectedId, onPick, onHover, onCreate, onEditZone, onDeleteZone }: Props) {
  const menu = useRowMenu(MENU_HEIGHT);
  const listRef = useRef<HTMLUListElement>(null);

  // A zone picked on the map: bring its card into view.
  useEffect(() => {
    if (!selectedId) return;
    listRef.current?.querySelector(`[data-card="${CSS.escape(selectedId)}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selectedId]);

  return (
    <aside className={styles.list} aria-label="Space zones">
      <h4 className={styles.title}>Space Zones</h4>
      {zones.length === 0 ? (
        <div className={styles.empty}>
          {editing ? (
            <p className={styles.emptyText}>Drag a section on the map to draw your first zone. The seats inside it become part of the zone.</p>
          ) : (
            <>
              <p className={styles.emptyText}>You can create zones and assign them to teams on the map. Start creating zones now!</p>
              <button type="button" className={styles.create} onClick={onCreate}>
                Create Zone
              </button>
            </>
          )}
        </div>
      ) : (
        <ul ref={listRef} className={styles.cards}>
          {zones.map((z) => {
            const c = ZONE_COLORS[z.color];
            // Who it's for, a line each: up to three, or two and "+N more" until the zone is picked.
            const names = unitNames(org, z);
            const shown = z.id === selectedId || names.length <= MAX_NAMES ? names : names.slice(0, MAX_NAMES - 1);
            const hidden = names.length - shown.length;
            return (
              <li
                key={z.id}
                data-card={z.id}
                className={[styles.card, z.id === selectedId ? styles.cardOn : ''].join(' ').trim()}
                onMouseEnter={() => onHover(z.id)}
                onMouseLeave={() => onHover(null)}
              >
                <button type="button" className={styles.cardMain} aria-pressed={z.id === selectedId} onClick={() => onPick(z)}>
                  <span className={styles.dot} style={{ '--fill': c.fill, '--edge': c.edge } as CSSProperties} aria-hidden="true" />
                  <span className={styles.text}>
                    <span className={styles.name}>
                      {z.name}
                      {z.isNew && <span className={styles.unsaved}>New</span>}
                    </span>
                    <span className={styles.seats}>{seatsLabel(counts.get(z.id) ?? 0)}</span>
                  </span>
                  <span className={styles.unit} title={names.length > 1 ? names.map((u) => u.name).join(', ') : undefined}>
                    <span className={styles.level}>{levelLabel(z.level, Math.max(names.length, 1))}</span>
                    {names.length === 0 && <span className={styles.unitName}>-</span>}
                    {shown.map((u) => (
                      <span key={u.id} className={[styles.unitName, u.status === 'active' ? '' : styles.unitArchived].join(' ').trim()}>
                        {u.name}
                        {u.status === 'active' ? '' : ' (archived)'}
                      </span>
                    ))}
                    {hidden > 0 && <span className={styles.unitMore}>+{hidden} more</span>}
                  </span>
                </button>
                <div className={styles.more} ref={menu.menu?.id === z.id ? menu.ref : undefined}>
                  <button
                    type="button"
                    className={styles.moreBtn}
                    aria-label={`More actions for ${z.name}`}
                    aria-haspopup="menu"
                    aria-expanded={menu.menu?.id === z.id}
                    onClick={(e) => menu.open(z.id, e.currentTarget)}
                  >
                    <img src="/admin/user/more-2-fill.svg" alt="" width={20} height={20} />
                  </button>
                  {menu.menu?.id === z.id && (
                    <RowMenu state={menu} className={styles.menu}>
                      <button
                        type="button"
                        role="menuitem"
                        className={styles.menuItem}
                        onClick={() => {
                          menu.close();
                          onEditZone(z);
                        }}
                      >
                        Edit details
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        className={[styles.menuItem, styles.menuItemDanger].join(' ')}
                        onClick={() => {
                          menu.close();
                          onDeleteZone(z);
                        }}
                      >
                        Delete zone
                      </button>
                    </RowMenu>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}
