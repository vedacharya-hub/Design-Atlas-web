import { useRef, useState, type CSSProperties, type PointerEvent, type WheelEvent } from 'react';
import styles from './FloorMap.module.css';
import { SeatMarker } from './SeatMarker';
import { Dropdown } from '../../components/ui/Dropdown';
import { Plus, Minus, Search } from '../../components/ui/icons';
import type { FloorZone, Seat } from '../../api/types';
import { ZONE_COLORS, ZONE_FILL_ALPHA } from '../../utils/zoneColors';
import { zoneFor, zoneOfSeat } from './zoneRules';

export interface SeatAssignmentBadge {
  color: string;
  initial: string;
}

interface Props {
  image: string;
  seats: Seat[];
  /** The floor's bays, for the zone filter. */
  bays: string[];
  /** The zones drawn in Admin → Space Zones: their desks are only for their team, department or business unit. */
  zones: FloorZone[];
  /** Who the desk being picked is for: zones they're not part of show as restricted. */
  memberId: string | null;
  selectedSeatIds: string[];
  /** seatId -> member badge, for the Others flow. */
  assignments?: Record<string, SeatAssignmentBadge>;
  onSeatClick: (seat: Seat) => void;
}

const MIN = 0.6;
const MAX = 3;

export function FloorMap({ image, seats, bays, zones, memberId, selectedSeatIds, assignments = {}, onSeatClick }: Props) {
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [zone, setZone] = useState('all');
  const [query, setQuery] = useState('');
  /** A restricted zone under the pointer, and where the pointer is on the map. */
  const [tip, setTip] = useState<{ zone: FloorZone; x: number; y: number; flip: boolean } | null>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  const q = query.toLowerCase().trim();
  const visible = seats.filter((s) => {
    if (zone !== 'all' && s.zone !== zone) return false;
    if (q && !s.label.toLowerCase().includes(q)) return false;
    return true;
  });
  const restricted = (z: FloorZone) => !memberId || !z.memberIds.includes(memberId);
  const anyRestricted = zones.some(restricted);

  const clampZoom = (z: number) => Math.min(MAX, Math.max(MIN, z));

  const onPointerDown = (e: PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
    setTip(null);
  };
  const onPointerMove = (e: PointerEvent) => {
    if (!drag.current) return;
    setOffset({
      x: drag.current.ox + (e.clientX - drag.current.x),
      y: drag.current.oy + (e.clientY - drag.current.y),
    });
  };
  const onPointerUp = () => {
    drag.current = null;
  };
  const onWheel = (e: WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) return; // only zoom on pinch/ctrl-scroll
    setZoom((z) => clampZoom(z - e.deltaY * 0.002));
  };

  /** Hovering a restricted zone: the tip follows the pointer, on its left in the map's right half (clear of the booking panel). */
  const follow = (e: PointerEvent, z: FloorZone) => {
    if (drag.current) return;
    const r = mapRef.current?.getBoundingClientRect();
    if (r) setTip({ zone: z, x: e.clientX - r.left, y: e.clientY - r.top, flip: e.clientX - r.left > r.width / 2 });
  };

  const zoneOptions = [{ value: 'all', label: 'All Zones' }, ...bays.map((z) => ({ value: z, label: z }))];

  return (
    <div ref={mapRef} className={styles.map}>
      <div
        className={styles.viewport}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        onWheel={onWheel}
      >
        <div
          className={styles.stage}
          style={{ transform: `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px) scale(${zoom})` }}
        >
          <img className={styles.floor} src={image} alt="Floor plan" draggable={false} />
          {/* Zones under the desks: yours in its colour, the rest hatched grey and restricted. */}
          {zones.map((z) => {
            const c = ZONE_COLORS[z.color];
            const shut = restricted(z);
            return (
              <div
                key={z.id}
                className={[styles.zone, shut ? styles.zoneRestricted : ''].join(' ').trim()}
                style={
                  {
                    left: `${z.x}%`,
                    top: `${z.y}%`,
                    width: `${z.w}%`,
                    height: `${z.h}%`,
                    '--fill': `${c.fill}${ZONE_FILL_ALPHA}`,
                    '--edge': c.edge,
                  } as CSSProperties
                }
                aria-label={shut ? `${z.name}: restricted zone, only for ${zoneFor(z)}` : `${z.name}, for ${zoneFor(z)}`}
                onPointerMove={shut ? (e) => follow(e, z) : undefined}
                onPointerLeave={shut ? () => setTip((t) => (t?.zone.id === z.id ? null : t)) : undefined}
              >
                <span className={styles.zoneTag}>{shut ? `${z.name} · Restricted` : `${z.name} · ${z.unitNames.join(', ')}`}</span>
              </div>
            );
          })}
          {visible.map((seat) => {
            const badge = assignments[seat.id];
            const z = zoneOfSeat(zones, seat.id);
            return (
              <SeatMarker
                key={seat.id}
                seat={seat}
                selected={selectedSeatIds.includes(seat.id)}
                restricted={!!z && restricted(z) && !badge}
                assignedColor={badge?.color ?? null}
                assignedInitial={badge?.initial ?? null}
                onClick={onSeatClick}
              />
            );
          })}
        </div>
      </div>

      {/* Hovering a restricted zone: who it's for. */}
      {tip && (
        <div
          className={styles.tip}
          style={tip.flip ? { left: tip.x - 14, top: tip.y + 14, transform: 'translateX(-100%)' } : { left: tip.x + 14, top: tip.y + 14 }}
          role="tooltip"
        >
          <span className={styles.tipTitle}>Restricted zone</span>
          <span className={styles.tipText}>
            Only for {zoneFor(tip.zone)}
          </span>
        </div>
      )}

      {/* Legend */}
      <div className={styles.legend}>
        <span><i className={styles.dotGreen} /> Available</span>
        <span><i className={styles.dotRed} /> Not Available</span>
        <span><i className={styles.dotYellow} /> Partially Available</span>
        {anyRestricted && (
          <span><i className={styles.swatchRestricted} /> Restricted zone</span>
        )}
      </div>

      {/* Bottom controls */}
      <div className={styles.controls}>
        <div className={styles.zoomGroup}>
          <button aria-label="Zoom out" onClick={() => setZoom((z) => clampZoom(z - 0.2))}><Minus /></button>
          <span className={styles.zoomLabel}>{Math.round(zoom * 100)}%</span>
          <button aria-label="Zoom in" onClick={() => setZoom((z) => clampZoom(z + 0.2))}><Plus /></button>
        </div>
        <Dropdown options={zoneOptions} value={zone} onChange={setZone} />
        <div className={styles.search}>
          <Search />
          <input
            placeholder="Find Space"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>
    </div>
  );
}
