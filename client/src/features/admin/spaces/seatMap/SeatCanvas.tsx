import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import styles from './SeatCanvas.module.css';
import type { SpaceZoneView } from '../../../../api/types';
import { ZONE_COLORS, ZONE_FILL_ALPHA } from '../../../../utils/zoneColors';
import { canKeepFor, spaceNoun, type MapSeat } from './seatShared';
import { inZone } from '../zones/zoneShared';
import { CARD_H, CARD_W, MAX_ZOOM, MIN_ZOOM, PLAN_H, PLAN_W, ZOOM_STEP as STEP, clamp, usePlanView } from './usePlanView';

/** A press that travels less than this is a click, not a drag. */
const DRAG_SLOP = 4;
/** Popover and hover-card sizes, to keep them inside the map. */
const POP = { w: 210, h: 90 };
const CARD = { w: 280, h: 112 };

export type EditMode = 'move' | 'add';

interface Props {
  image: string;
  /** The desks on the floor. */
  seats: MapSeat[];
  /** The zones drawn in Space Zones, shown under the desks and offered in the zone filter. */
  spaceZones: SpaceZoneView[];
  /** The zone picked in the filter (its id), or "all": the map zooms to it and fades the rest. */
  zone: string;
  onZone: (zone: string) => void;
  /** "2nd Floor • WeWork Vaishnavi Signature", under a desk's name on hover. */
  place: string;
  editing: boolean;
  mode: EditMode;
  onMode: (mode: EditMode) => void;
  /** Desks on the floor now (edits included), and how many it may have. */
  count: number;
  limit: number;
  saving: boolean;
  /** The free desk whose "Assign Seat" popover is open. */
  selectedId: string | null;
  /** A desk hovered in the list. */
  highlightId: string | null;
  /** Centre the map on this desk; `n` changes for each request. */
  focus: { id: string; n: number } | null;
  /** Where a new desk is about to go, while its dialog is open. */
  pending: { x: number; y: number } | null;
  /** A desk clicked (or the empty map, with null). */
  onSelect: (seat: MapSeat | null) => void;
  onAssign: (seat: MapSeat) => void;
  /** The popover's edit icon: the desk's type and note. */
  onEditSeat: (seat: MapSeat) => void;
  onMove: (id: string, x: number, y: number) => void;
  onAddAt: (x: number, y: number) => void;
  onEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
}

type Gesture =
  | {
      kind: 'pan';
      sx: number;
      sy: number;
      ox: number;
      oy: number;
      moved: boolean;
      onSeat: boolean;
    }
  | { kind: 'seat'; id: string };

/**
 * Space Map's floor plan (Figma 1592:143788): drag to pan, the − / + or ⌘-scroll to zoom. Green desks
 * are free and red ones are someone's permanent seat; hovering a red one says whose (1595:92634),
 * clicking a green one offers "Assign Seat" (1594:88498). Edit (1595:91841) moves desks by dragging
 * (3025:299994, 1595:93317) or adds them where the map is tapped (1595:94197), up to the space's limit.
 */
export function SeatCanvas(props: Props) {
  const { image, seats, spaceZones, zone, onZone, place, editing, mode, onMode, count, limit, saving, selectedId, highlightId, focus, pending } = props;
  const paneRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const planRef = useRef<HTMLDivElement>(null);
  const { size, view, setView, toPane, toPlan, zoomBy, centreOn, fitTo } = usePlanView(paneRef, viewportRef, planRef);
  const [panning, setPanning] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [ghost, setGhost] = useState<{ x: number; y: number } | null>(null);
  const gesture = useRef<Gesture | null>(null);
  const full = count >= limit;
  const picked = zone === 'all' ? undefined : spaceZones.find((z) => z.id === zone);

  // A zone picked in the filter: zoom to fit it; All Zones: back to the whole plan. Not on first
  // load, which fits the plan already.
  const shownZone = useRef(zone);
  useEffect(() => {
    if (shownZone.current === zone) return;
    shownZone.current = zone;
    fitTo(picked ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zone, picked?.id]);

  // A desk picked in the list: glide it to the middle.
  useEffect(() => {
    if (!focus) return;
    const seat = seats.find((s) => s.id === focus.id);
    if (seat) centreOn(seat);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.n]);

  // Leaving edit mode or switching modes drops the hover and the add cursor.
  useEffect(() => {
    setGhost(null);
    setHoverId(null);
  }, [editing, mode]);

  /** Below and right of a desk, flipped or nudged to stay inside the map. */
  const placeNear = (p: { x: number; y: number }, box: { w: number; h: number }) => {
    const gap = 10 * Math.max(1, view.zoom);
    let left = p.x - 8;
    let top = p.y + gap;
    if (top + box.h > size.h - 8) top = p.y - gap - box.h;
    left = clamp(left, 8, Math.max(8, size.w - box.w - 8));
    top = clamp(top, 8, Math.max(8, size.h - box.h - 8));
    return { left, top };
  };

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    const seatEl = (e.target as HTMLElement).closest<HTMLElement>('[data-seat]');
    if (editing && mode === 'move' && seatEl) {
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      gesture.current = { kind: 'seat', id: seatEl.dataset.seat! };
      setDragId(seatEl.dataset.seat!);
      return;
    }
    // A desk's own click handles it when not editing.
    if (seatEl && !editing) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    gesture.current = {
      kind: 'pan',
      sx: e.clientX,
      sy: e.clientY,
      ox: view.x,
      oy: view.y,
      moved: false,
      onSeat: !!seatEl,
    };
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (editing && mode === 'add') {
      const onPlan = toPlan(e.clientX, e.clientY);
      const r = paneRef.current!.getBoundingClientRect();
      setGhost(onPlan ? { x: e.clientX - r.left, y: e.clientY - r.top } : null);
    }
    const g = gesture.current;
    if (!g) return;
    if (g.kind === 'seat') {
      const p = toPlan(e.clientX, e.clientY, true);
      if (p) props.onMove(g.id, p.x, p.y);
      return;
    }
    const dx = e.clientX - g.sx;
    const dy = e.clientY - g.sy;
    if (!g.moved && Math.hypot(dx, dy) < DRAG_SLOP) return;
    if (!g.moved) setPanning(true);
    g.moved = true;
    setView((v) => ({ ...v, x: g.ox + dx, y: g.oy + dy, animate: false }));
  }

  function onPointerUp(e: PointerEvent<HTMLDivElement>) {
    const g = gesture.current;
    gesture.current = null;
    setPanning(false);
    setDragId(null);
    if (!g || g.kind !== 'pan' || g.moved) return;
    if (editing) {
      if (mode !== 'add' || g.onSeat || full) return;
      const p = toPlan(e.clientX, e.clientY);
      if (p) props.onAddAt(p.x, p.y);
    } else {
      props.onSelect(null);
    }
  }

  function onSeatKey(e: KeyboardEvent<HTMLButtonElement>, seat: MapSeat) {
    if (!editing || mode !== 'move') return;
    const step = e.shiftKey ? 1 : 0.25;
    const d = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    }[e.key];
    if (!d) return;
    e.preventDefault();
    props.onMove(seat.id, clamp(seat.x + d[0], 0, 100), clamp(seat.y + d[1], 0, 100));
  }

  const selected = !editing && selectedId ? seats.find((s) => s.id === selectedId && !s.assignment) : undefined;
  const hovered = hoverId ? seats.find((s) => s.id === hoverId) : undefined;
  const card = !editing && hovered?.assignment && hovered.id !== selected?.id ? hovered : undefined;
  const moving = editing && mode === 'move' ? seats.find((s) => s.id === (dragId ?? hoverId)) : undefined;
  /** A free desk, hovered: its number in a tooltip (a kept one shows its card instead). */
  const named = !editing && hovered && !hovered.assignment && hovered.id !== selected?.id ? hovered : undefined;

  return (
    <div ref={paneRef} className={styles.canvas} data-mode={editing ? mode : 'view'}>
      <div
        ref={viewportRef}
        className={[styles.viewport, panning ? styles.panning : ''].join(' ').trim()}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={() => setGhost(null)}
      >
        <div
          className={[styles.stage, view.animate ? styles.stageAnimate : ''].join(' ').trim()}
          style={
            {
              width: CARD_W,
              height: CARD_H,
              transform: `translate(-50%, -50%) translate(${view.x}px, ${view.y}px) scale(${view.zoom})`,
              // Zone edges and labels stay the same size on screen at any zoom.
              '--k': 1 / view.zoom,
            } as CSSProperties
          }
        >
          <div ref={planRef} className={styles.plan} style={{ width: PLAN_W, height: PLAN_H }}>
            <img className={styles.planImage} src={image} alt="Floor plan" draggable={false} />
            {/* The zones drawn in Space Zones, under the desks: whose each one is. */}
            {spaceZones.map((z) => {
              const c = ZONE_COLORS[z.color];
              return (
                <div
                  key={z.id}
                  className={[styles.spaceZone, picked && picked.id !== z.id ? styles.faded : '', picked?.id === z.id ? styles.spaceZoneOn : ''].join(' ').trim()}
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
                  aria-hidden="true"
                >
                  <span className={styles.spaceZoneTag}>
                    {z.name}
                    {z.unitNames.length ? ` · ${z.unitNames.join(', ')}` : ''}
                  </span>
                </div>
              );
            })}
            {seats.map((seat) => {
              const assignee = seat.assignment;
              return (
                <button
                  key={seat.id}
                  type="button"
                  data-seat={seat.id}
                  className={[
                    styles.seat,
                    assignee ? styles.seatAssigned : '',
                    seat.isNew ? styles.seatNew : '',
                    seat.id === selected?.id ? styles.seatSelected : '',
                    seat.id === highlightId || seat.id === hoverId ? styles.seatHot : '',
                    seat.id === dragId ? styles.seatDragging : '',
                    // Outside the zone picked in the filter.
                    picked && !inZone(seat, picked) ? styles.faded : '',
                  ]
                    .join(' ')
                    .replace(/\s+/g, ' ')
                    .trim()}
                  style={{ left: `${seat.x}%`, top: `${seat.y}%` }}
                  aria-label={`${seat.label}, ${seat.zone}, ${assignee ? `permanent seat of ${assignee.name}` : 'available'}${editing && mode === 'move' ? '. Arrow keys move it.' : ''}`}
                  tabIndex={editing && mode === 'add' ? -1 : 0}
                  onPointerEnter={() => setHoverId(seat.id)}
                  onPointerLeave={() => setHoverId((h) => (h === seat.id ? null : h))}
                  onFocus={() => setHoverId(seat.id)}
                  onBlur={() => setHoverId((h) => (h === seat.id ? null : h))}
                  onKeyDown={(e) => onSeatKey(e, seat)}
                  onClick={() => !editing && props.onSelect(seat)}
                />
              );
            })}
            {pending && <span className={styles.pending} style={{ left: `${pending.x}%`, top: `${pending.y}%` }} aria-hidden="true" />}
          </div>
        </div>
      </div>

      {/* Top: Edit, or the edit tools and Save. */}
      {editing ? (
        <>
          <div className={styles.modes} role="radiogroup" aria-label="Edit the map">
            <button
              type="button"
              role="radio"
              aria-checked={mode === 'move'}
              className={[styles.mode, mode === 'move' ? styles.modeOn : ''].join(' ').trim()}
              onClick={() => onMode('move')}
            >
              <img src={mode === 'move' ? '/admin/spaces/map/move-white.svg' : '/admin/spaces/map/move-grey.svg'} alt="" width={18} height={18} />
              Move Seats
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={mode === 'add'}
              className={[styles.mode, mode === 'add' ? styles.modeOn : ''].join(' ').trim()}
              disabled={full && mode !== 'add'}
              title={full ? `This space takes up to ${limit} desks. Raise its total spaces to add more.` : undefined}
              onClick={() => onMode('add')}
            >
              <img src={mode === 'add' ? '/admin/spaces/map/focus-add-white.svg' : '/admin/spaces/map/focus-add-grey.svg'} alt="" width={18} height={18} />
              Add Seats {count}/{limit}
            </button>
          </div>
          <div className={styles.topRight}>
            <button type="button" className={styles.saveBtn} disabled={saving} onClick={props.onCancel}>
              Cancel
            </button>
            <button type="button" className={styles.saveBtn} disabled={saving} aria-busy={saving} onClick={props.onSave}>
              {saving ? 'Saving…' : 'Save'}
              {saving ? <span className={styles.spinner} aria-hidden="true" /> : <img src="/admin/spaces/map/check.svg" alt="" width={18} height={18} />}
            </button>
          </div>
        </>
      ) : (
        <button type="button" className={styles.editBtn} onClick={props.onEdit}>
          <img src="/admin/spaces/map/pencil.svg" alt="" width={20} height={20} />
          Edit
        </button>
      )}

      {/* Bottom: the legend, zoom and zones; centred while editing (1595:91841). */}
      <div className={[styles.bar, editing ? styles.barCentred : ''].join(' ').trim()}>
        <ul className={styles.legend}>
          <li>
            <span className={[styles.dot, styles.dotFree].join(' ')} />
            Available
          </li>
          <li>
            <span className={[styles.dot, styles.dotTaken].join(' ')} />
            Assigned
          </li>
        </ul>
        <div className={styles.controls}>
          <div className={styles.zoom}>
            <button type="button" className={styles.round} aria-label="Zoom out" disabled={view.zoom <= MIN_ZOOM} onClick={() => zoomBy(-STEP)}>
              <img src="/admin/spaces/map/minus.svg" alt="" width={20} height={20} />
            </button>
            <span className={styles.zoomValue} aria-live="polite">
              {Math.round(view.zoom * 100)}%
            </span>
            <button type="button" className={styles.round} aria-label="Zoom in" disabled={view.zoom >= MAX_ZOOM} onClick={() => zoomBy(STEP)}>
              <img src="/admin/spaces/map/add.svg" alt="" width={20} height={20} />
            </button>
          </div>
          <label className={styles.zone}>
            <span className={styles.zoneText}>{picked?.name ?? 'All Zones'}</span>
            <img src="/admin/spaces/map/chevron-down.svg" alt="" width={20} height={20} />
            <select className={styles.zoneSelect} value={zone} aria-label="Zone" onChange={(e) => onZone(e.target.value)}>
              <option value="all">All Zones</option>
              {spaceZones.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name}
                  {z.unitNames.length ? ` (${z.unitNames.join(', ')})` : ''}
                </option>
              ))}
              {spaceZones.length === 0 && <option disabled>No zones yet: draw them in Space Zones</option>}
            </select>
          </label>
        </div>
      </div>

      {/* A free desk, clicked: edit it, or "Assign Seat" (1594:88498). Meeting rooms and phone booths stay open to all. */}
      {selected && (
        <div className={styles.pop} style={placeNear(toPane(selected), POP)} role="dialog" aria-label={`${spaceNoun(selected.spaceType)} ${selected.label}`}>
          <p className={styles.popHead}>
            {spaceNoun(selected.spaceType)} {selected.label} • {selected.zone}
          </p>
          <div className={styles.popFoot}>
            <button type="button" className={styles.popEdit} aria-label={`Edit ${selected.label}`} title="Edit space type and notes" onClick={() => props.onEditSeat(selected)}>
              <img src="/admin/spaces/edit.svg" alt="" width={18} height={18} />
            </button>
            {canKeepFor(selected.spaceType) ? (
              // eslint-disable-next-line jsx-a11y/no-autofocus
              <button type="button" className={styles.popBtn} autoFocus onClick={() => props.onAssign(selected)}>
                Assign Seat
              </button>
            ) : (
              <span className={styles.popNote}>Open for everyone to book</span>
            )}
          </div>
        </div>
      )}

      {/* A free desk, hovered: its number. */}
      {named && (
        <span className={[styles.tip, styles.float, styles.labelTip].join(' ')} style={{ left: toPane(named).x, top: toPane(named).y - 8 * Math.max(1, view.zoom) }} role="tooltip">
          {named.label}
        </span>
      )}

      {/* A permanent seat, hovered: whose it is (1595:92634). */}
      {card?.assignment && (
        <div className={styles.card} style={placeNear(toPane(card), CARD)} role="tooltip">
          <div className={styles.cardHead}>
            <p className={styles.cardTitle}>
              {card.label} - {card.zone}
            </p>
            <p className={styles.cardPlace}>{place}</p>
          </div>
          <div className={styles.cardFoot}>
            <p className={styles.cardLabel}>Assigned to</p>
            <p className={styles.cardName}>{card.assignment.name}</p>
            <p className={styles.cardEmail}>{card.assignment.email}</p>
          </div>
        </div>
      )}

      {/* Moving: "Move the Space" under the desk held or hovered (1595:93317). */}
      {moving && (
        <span className={[styles.tip, styles.float].join(' ')} style={placeNear(toPane(moving), { w: 110, h: 30 })} role="status">
          Move the Space
        </span>
      )}

      {/* Adding: the cursor's "Tap to add Space" (1595:94197). */}
      {editing && mode === 'add' && ghost && (
        <span className={styles.addTip} style={{ left: ghost.x + 14, top: ghost.y - 15 }} role="status">
          <img className={styles.addTipArrow} src="/admin/spaces/map/tooltip-arrow.svg" alt="" width={16} height={8.5} />
          <span className={styles.tip}>{full ? 'Seat limit reached' : 'Tap to add Space'}</span>
        </span>
      )}
    </div>
  );
}
