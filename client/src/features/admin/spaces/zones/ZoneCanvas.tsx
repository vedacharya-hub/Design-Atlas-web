import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import seatStyles from '../seatMap/SeatCanvas.module.css';
import styles from './ZoneCanvas.module.css';
import type { AdminSeat, ZoneColor } from '../../../../api/types';
import { CARD_H, CARD_W, MAX_ZOOM, MIN_ZOOM, PLAN_H, PLAN_W, ZOOM_STEP, usePlanView } from '../seatMap/usePlanView';
import {
  ZONE_COLORS,
  ZONE_FILL_ALPHA,
  bigEnough,
  drawZone,
  inZone,
  moveZone,
  resizeZone,
  roundRect,
  seatsLabel,
  zoneAt,
  type Edge,
  type MapZone,
  type Rect,
} from './zoneShared';

/** A press that travels less than this is a click, not a drag. */
const DRAG_SLOP = 4;
/** Arrow keys move a zone this far (Shift: further), in percent of the plan. */
const KEY_STEP = 0.5;
const KEY_STEP_BIG = 2;

export type ZoneMode = 'move' | 'add';

/** A zone's sides and corners, for resizing: which edges each one moves. */
const HANDLES: { id: string; edges: Edge[]; className: string }[] = [
  { id: 't', edges: ['t'], className: styles.edgeT },
  { id: 'r', edges: ['r'], className: styles.edgeR },
  { id: 'b', edges: ['b'], className: styles.edgeB },
  { id: 'l', edges: ['l'], className: styles.edgeL },
  { id: 'tl', edges: ['t', 'l'], className: [styles.corner, styles.cornerTL].join(' ') },
  { id: 'tr', edges: ['t', 'r'], className: [styles.corner, styles.cornerTR].join(' ') },
  { id: 'bl', edges: ['b', 'l'], className: [styles.corner, styles.cornerBL].join(' ') },
  { id: 'br', edges: ['b', 'r'], className: [styles.corner, styles.cornerBR].join(' ') },
];

interface Props {
  image: string;
  /** The floor's desks, drawn as dots: the ones inside a zone are its seats. */
  seats: AdminSeat[];
  zones: MapZone[];
  editing: boolean;
  mode: ZoneMode;
  onMode: (mode: ZoneMode) => void;
  saving: boolean;
  /** The zone picked on the map or in the list. */
  selectedId: string | null;
  /** A zone hovered in the list. */
  hotId: string | null;
  /** Centre the map on this zone; `n` changes for each request. */
  focus: { id: string; n: number } | null;
  /** A zone just drawn, while its details are being filled in. */
  pending: (Rect & { color: ZoneColor }) | null;
  onSelect: (id: string | null) => void;
  /** A zone moved or resized. */
  onChange: (id: string, rect: Rect) => void;
  /** A zone drawn in Add Zone: its details come next. */
  onDrawn: (rect: Rect) => void;
  /** Edit is offered once there are zones; before that the list's Create Zone starts. */
  canEdit: boolean;
  onEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
}

type Gesture =
  | { kind: 'pan'; sx: number; sy: number; ox: number; oy: number; moved: boolean; zoneId: string | null }
  | { kind: 'move'; id: string; start: Rect; rect: Rect; px: number; py: number; moved: boolean }
  | { kind: 'resize'; id: string; edges: Edge[]; rect: Rect }
  | { kind: 'draw'; anchor: { x: number; y: number }; rect: Rect | null };

/**
 * Space Zones' floor plan (Figma 1598:90456, 3039:106709, 1604:187751): the desks as dots and the zones
 * over them. Edit has Move Zone, where a zone drags by its middle and resizes by its sides and
 * corners, and Add Zone, where dragging out a rectangle draws a new one. Zones never overlap: a zone
 * moved, resized or drawn stops at the next one, and at the plan's edge.
 */
export function ZoneCanvas(props: Props) {
  const { image, seats, zones, editing, mode, onMode, saving, selectedId, hotId, focus, pending } = props;
  const paneRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const planRef = useRef<HTMLDivElement>(null);
  const { size, view, setView, toPane, toPlan, zoomBy, centreOn } = usePlanView(paneRef, viewportRef, planRef);
  const gesture = useRef<Gesture | null>(null);
  const [panning, setPanning] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [drawing, setDrawing] = useState<Rect | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  /** Add Zone: the pointer over the map, and whether it's over a zone. */
  const [ghost, setGhost] = useState<{ x: number; y: number; blocked: boolean } | null>(null);
  const moving = editing && mode === 'move';
  const adding = editing && mode === 'add';

  useEffect(() => {
    if (!focus) return;
    const z = zones.find((x) => x.id === focus.id);
    if (z) centreOn({ x: z.x + z.w / 2, y: z.y + z.h / 2 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.n]);

  // Switching modes drops what the pointer was doing.
  useEffect(() => {
    setGhost(null);
    setDrawing(null);
    setHoverId(null);
  }, [editing, mode]);

  const others = (id: string | null) => zones.filter((z) => z.id !== id);
  const seatCount = (r: Rect) => seats.filter((s) => inZone(s, r)).length;

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    const zoneEl = target.closest<HTMLElement>('[data-zone]');
    const zoneId = zoneEl?.dataset.zone ?? null;
    const zone = zoneId ? zones.find((z) => z.id === zoneId) : undefined;
    const p = toPlan(e.clientX, e.clientY, true);
    if (moving && zone && p) {
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      props.onSelect(zone.id);
      setActiveId(zone.id);
      const handle = HANDLES.find((h) => h.id === target.closest<HTMLElement>('[data-handle]')?.dataset.handle);
      gesture.current = handle
        ? { kind: 'resize', id: zone.id, edges: handle.edges, rect: zone }
        : { kind: 'move', id: zone.id, start: zone, rect: zone, px: p.x, py: p.y, moved: false };
      return;
    }
    if (adding) {
      const onPlan = toPlan(e.clientX, e.clientY);
      if (onPlan && !zoneAt(zones, onPlan)) {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        gesture.current = { kind: 'draw', anchor: onPlan, rect: null };
        setGhost(null);
        return;
      }
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    gesture.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, ox: view.x, oy: view.y, moved: false, zoneId };
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const g = gesture.current;
    if (adding && !g) {
      const onPlan = toPlan(e.clientX, e.clientY);
      const r = paneRef.current!.getBoundingClientRect();
      setGhost(onPlan ? { x: e.clientX - r.left, y: e.clientY - r.top, blocked: !!zoneAt(zones, onPlan) } : null);
    }
    if (!g) return;
    if (g.kind === 'pan') {
      const dx = e.clientX - g.sx;
      const dy = e.clientY - g.sy;
      if (!g.moved && Math.hypot(dx, dy) < DRAG_SLOP) return;
      if (!g.moved) setPanning(true);
      g.moved = true;
      setView((v) => ({ ...v, x: g.ox + dx, y: g.oy + dy, animate: false }));
      return;
    }
    const p = toPlan(e.clientX, e.clientY, true);
    if (!p) return;
    if (g.kind === 'draw') {
      g.rect = drawZone(g.anchor, p, zones);
      setDrawing(g.rect);
      const r = paneRef.current!.getBoundingClientRect();
      setGhost({ x: e.clientX - r.left, y: e.clientY - r.top, blocked: !g.rect });
    } else if (g.kind === 'move') {
      g.moved = true;
      g.rect = moveZone(g.rect, { ...g.start, x: g.start.x + p.x - g.px, y: g.start.y + p.y - g.py }, others(g.id));
      props.onChange(g.id, g.rect);
    } else {
      g.rect = resizeZone(g.rect, g.edges, p, others(g.id));
      props.onChange(g.id, g.rect);
    }
  }

  function onPointerUp() {
    const g = gesture.current;
    gesture.current = null;
    setPanning(false);
    setActiveId(null);
    if (!g) return;
    if (g.kind === 'draw') {
      setDrawing(null);
      if (g.rect && bigEnough(g.rect)) props.onDrawn(roundRect(g.rect));
      return;
    }
    if (g.kind === 'move' || g.kind === 'resize') {
      if (g.kind === 'resize' || g.moved) props.onChange(g.id, roundRect(g.rect));
      return;
    }
    if (!g.moved) props.onSelect(g.zoneId);
  }

  function onZoneKey(e: KeyboardEvent<HTMLDivElement>, zone: MapZone) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      props.onSelect(zone.id);
      return;
    }
    if (!moving) return;
    const step = e.shiftKey ? KEY_STEP_BIG : KEY_STEP;
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (!d) return;
    e.preventDefault();
    props.onSelect(zone.id);
    props.onChange(zone.id, roundRect(moveZone(zone, { ...zone, x: zone.x + d[0], y: zone.y + d[1] }, others(zone.id))));
  }

  /** A dark tip centred over the top of a zone. */
  const tipOver = (r: Rect): CSSProperties => {
    const p = toPane({ x: r.x + r.w / 2, y: r.y });
    return { left: p.x, top: p.y - 8 };
  };

  const active = activeId ? zones.find((z) => z.id === activeId) : undefined;
  const hovered = !editing && hoverId ? zones.find((z) => z.id === hoverId) : undefined;
  const ghostTip = ghost && !drawing ? (ghost.blocked ? 'Zones can’t overlap' : 'Drag a Section to Create Zone') : null;

  return (
    <div ref={paneRef} className={[seatStyles.canvas, styles.canvas].join(' ')} data-mode={editing ? mode : 'view'}>
      <div
        ref={viewportRef}
        className={[seatStyles.viewport, panning ? seatStyles.panning : ''].join(' ').trim()}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={() => setGhost(null)}
      >
        <div
          className={[seatStyles.stage, view.animate ? seatStyles.stageAnimate : ''].join(' ').trim()}
          style={
            {
              width: CARD_W,
              height: CARD_H,
              transform: `translate(-50%, -50%) translate(${view.x}px, ${view.y}px) scale(${view.zoom})`,
              // Edges and handles stay the same size on screen at any zoom.
              '--k': 1 / view.zoom,
            } as CSSProperties
          }
        >
          <div ref={planRef} className={[seatStyles.plan, styles.plan].join(' ')} style={{ width: PLAN_W, height: PLAN_H }}>
            <img className={seatStyles.planImage} src={image} alt="Floor plan" draggable={false} />
            {zones.map((z) => {
              const c = ZONE_COLORS[z.color];
              const count = seatCount(z);
              return (
                <div
                  key={z.id}
                  data-zone={z.id}
                  className={[
                    styles.zone,
                    z.id === selectedId ? styles.zoneSelected : '',
                    z.id === hotId || z.id === hoverId ? styles.zoneHot : '',
                    z.id === activeId ? styles.zoneActive : '',
                  ]
                    .join(' ')
                    .replace(/\s+/g, ' ')
                    .trim()}
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
                  role="button"
                  tabIndex={adding ? -1 : 0}
                  aria-pressed={z.id === selectedId}
                  aria-label={`${z.name}, ${seatsLabel(count)}${moving ? '. Drag to move, drag a side or corner to resize; arrow keys move it.' : ''}`}
                  onPointerEnter={() => setHoverId(z.id)}
                  onPointerLeave={() => setHoverId((h) => (h === z.id ? null : h))}
                  onKeyDown={(e) => onZoneKey(e, z)}
                >
                  {moving && HANDLES.map((h) => <span key={h.id} data-handle={h.id} className={h.className} aria-hidden="true" />)}
                </div>
              );
            })}
            {seats.map((s) => (
              <span
                key={s.id}
                className={[styles.dot, s.assignment ? styles.dotTaken : ''].join(' ').trim()}
                style={{ left: `${s.x}%`, top: `${s.y}%` }}
                aria-hidden="true"
              />
            ))}
            {(drawing ?? pending) && (
              <div
                className={[styles.zone, styles.zoneDraft].join(' ')}
                style={
                  {
                    left: `${(drawing ?? pending)!.x}%`,
                    top: `${(drawing ?? pending)!.y}%`,
                    width: `${(drawing ?? pending)!.w}%`,
                    height: `${(drawing ?? pending)!.h}%`,
                    '--fill': `${ZONE_COLORS[pending?.color ?? 'blue'].fill}${ZONE_FILL_ALPHA}`,
                    '--edge': ZONE_COLORS[pending?.color ?? 'blue'].edge,
                  } as CSSProperties
                }
                aria-hidden="true"
              />
            )}
          </div>
        </div>
      </div>

      {/* Top: Edit, or Move Zone / Add Zone (3039:106813) and Save (3039:106810). */}
      {editing ? (
        <>
          <div className={seatStyles.modes} role="radiogroup" aria-label="Edit the zones">
            <button
              type="button"
              role="radio"
              aria-checked={mode === 'move'}
              className={[seatStyles.mode, styles.mode, mode === 'move' ? seatStyles.modeOn : ''].join(' ').trim()}
              disabled={zones.length === 0 && mode !== 'move'}
              title={zones.length === 0 ? 'Draw a zone first' : undefined}
              onClick={() => onMode('move')}
            >
              <img src={mode === 'move' ? '/admin/spaces/map/move-white.svg' : '/admin/spaces/map/move-grey.svg'} alt="" width={18} height={18} />
              Move Zone
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={mode === 'add'}
              className={[seatStyles.mode, styles.mode, mode === 'add' ? seatStyles.modeOn : ''].join(' ').trim()}
              onClick={() => onMode('add')}
            >
              <img src={mode === 'add' ? '/admin/spaces/map/focus-add-white.svg' : '/admin/spaces/map/focus-add-grey.svg'} alt="" width={18} height={18} />
              Add Zone
            </button>
          </div>
          <div className={seatStyles.topRight}>
            <button type="button" className={seatStyles.saveBtn} disabled={saving} onClick={props.onCancel}>
              Cancel
            </button>
            <button type="button" className={seatStyles.saveBtn} disabled={saving} aria-busy={saving} onClick={props.onSave}>
              {saving ? 'Saving…' : 'Save'}
              {saving ? <span className={seatStyles.spinner} aria-hidden="true" /> : <img src="/admin/spaces/map/check.svg" alt="" width={18} height={18} />}
            </button>
          </div>
        </>
      ) : (
        props.canEdit && (
          <button type="button" className={seatStyles.editBtn} onClick={props.onEdit}>
            <img src="/admin/spaces/map/pencil.svg" alt="" width={20} height={20} />
            Edit
          </button>
        )
      )}

      {/* Bottom left: − 100% + */}
      <div className={seatStyles.bar}>
        <div className={seatStyles.controls}>
          <div className={seatStyles.zoom}>
            <button type="button" className={seatStyles.round} aria-label="Zoom out" disabled={view.zoom <= MIN_ZOOM} onClick={() => zoomBy(-ZOOM_STEP)}>
              <img src="/admin/spaces/map/minus.svg" alt="" width={20} height={20} />
            </button>
            <span className={seatStyles.zoomValue} aria-live="polite">
              {Math.round(view.zoom * 100)}%
            </span>
            <button type="button" className={seatStyles.round} aria-label="Zoom in" disabled={view.zoom >= MAX_ZOOM} onClick={() => zoomBy(ZOOM_STEP)}>
              <img src="/admin/spaces/map/add.svg" alt="" width={20} height={20} />
            </button>
          </div>
        </div>
      </div>

      {/* A zone hovered: its name and seats. */}
      {hovered && !panning && (
        <span className={[seatStyles.tip, styles.zoneTip].join(' ')} style={tipOver(hovered)} role="tooltip">
          {hovered.name} · {seatsLabel(seatCount(hovered))}
        </span>
      )}

      {/* Moving or resizing: the seats it takes in as it goes. */}
      {active && (
        <span className={[seatStyles.tip, styles.zoneTip].join(' ')} style={tipOver(active)} role="status">
          {seatsLabel(seatCount(active))}
        </span>
      )}

      {/* Drawing: the seats inside so far, by the pointer. */}
      {drawing && ghost && (
        <span className={[seatStyles.tip, styles.drawTip].join(' ')} style={{ left: ghost.x + 14, top: ghost.y + 14 }} role="status">
          {seatsLabel(seatCount(drawing))}
        </span>
      )}

      {/* Add Zone: "Drag a Section to Create Zone" under the pointer (3039:106804). */}
      {adding && ghost && ghostTip && size.w > 0 && (
        <span className={[seatStyles.addTip, styles.addTip].join(' ')} style={{ left: ghost.x - 20, top: ghost.y + 16 }} role="status">
          <img className={styles.addTipArrow} src="/admin/spaces/map/tooltip-arrow.svg" alt="" width={16} height={8.5} />
          <span className={[seatStyles.tip, styles.addTipText].join(' ')}>{ghostTip}</span>
        </span>
      )}
    </div>
  );
}
