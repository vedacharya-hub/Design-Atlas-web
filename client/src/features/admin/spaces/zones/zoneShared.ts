import type { OrgChart, SpaceZone, ZoneColor, ZoneLevel } from '../../../../api/types';
import { ZONE_COLORS } from '../../../../utils/zoneColors';

export { ZONE_COLORS, ZONE_FILL_ALPHA } from '../../../../utils/zoneColors';

/** A zone on the map while editing: saved zones keep their id, new ones get "new-1", "new-2"… */
export type MapZone = SpaceZone & { isNew?: boolean };

export const ZONE_COLOR_LIST = Object.keys(ZONE_COLORS) as ZoneColor[];

export const ZONE_LEVELS: { value: ZoneLevel; label: string }[] = [
  { value: 'team', label: 'Team' },
  { value: 'department', label: 'Department' },
  { value: 'business-unit', label: 'Business Unit' },
];
/** "Team", or "Teams" for more than one. */
export const levelLabel = (level: ZoneLevel, count = 1) => `${ZONE_LEVELS.find((l) => l.value === level)?.label ?? 'Team'}${count === 1 ? '' : 's'}`;

/** The business units, departments or teams a zone can be for. */
export const unitsFor = (org: OrgChart | null, level: ZoneLevel) =>
  !org ? [] : level === 'business-unit' ? org.businessUnits : level === 'department' ? org.departments : org.teams;

/** Who a zone is for, in the order they were picked; ones since deleted are left out. */
export const unitNames = (org: OrgChart | null, zone: Pick<SpaceZone, 'level' | 'unitIds'>) => {
  const units = unitsFor(org, zone.level);
  return zone.unitIds.map((id) => units.find((u) => u.id === id)).filter((u) => u !== undefined);
};

/** "Zone 3": one past the highest "Zone N" on the floor. */
export function nextZoneName(zones: Pick<SpaceZone, 'name'>[]) {
  const used = zones.map((z) => /^zone\s+(\d+)$/i.exec(z.name.trim())).filter((m): m is RegExpExecArray => !!m).map((m) => Number(m[1]));
  return `Zone ${Math.max(zones.length, ...used) + 1}`;
}

/** The first colour no zone on the floor has yet (blue first), or blue again. */
export const nextZoneColor = (zones: Pick<SpaceZone, 'color'>[]): ZoneColor => ZONE_COLOR_LIST.find((c) => !zones.some((z) => z.color === c)) ?? 'blue';

export const seatsLabel = (n: number) => `${n} ${n === 1 ? 'seat' : 'seats'}`;

// ---------- geometry: percent of the plan, like the desks ----------

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
interface Edges {
  l: number;
  t: number;
  r: number;
  b: number;
}
export type Edge = 'l' | 't' | 'r' | 'b';

/** Zones may touch; sharing less than this (rounding) isn't an overlap. Matches the server. */
const EPS = 0.01;
/** The smallest zone, in percent of the plan's sides. Matches the server. */
export const MIN_ZONE_SIDE = 1;

const edgesOf = (r: Rect): Edges => ({ l: r.x, t: r.y, r: r.x + r.w, b: r.y + r.h });
const rectOf = (e: Edges): Rect => ({ x: e.l, y: e.t, w: e.r - e.l, h: e.b - e.t });

/**
 * Whether [a1, a2] runs alongside [b1, b2]: they share more than a touch. A line (a zone being drawn,
 * no height yet) runs alongside a span it lies strictly inside.
 */
const alongside = (a1: number, a2: number, b1: number, b2: number) =>
  a2 - a1 > EPS ? Math.min(a2, b2) - Math.max(a1, b1) > EPS : a1 > b1 + EPS && a1 < b2 - EPS;

/** A desk belongs to the zone its centre is in; the right and bottom edges belong to the next zone. Matches the server. */
export const inZone = (p: { x: number; y: number }, z: Rect) => p.x >= z.x && p.x < z.x + z.w && p.y >= z.y && p.y < z.y + z.h;

export const zonesOverlap = (a: Rect, b: Rect) => {
  const p = edgesOf(a);
  const q = edgesOf(b);
  return alongside(p.l, p.r, q.l, q.r) && alongside(p.t, p.b, q.t, q.b);
};

/** The zone (if any) a point on the plan falls in. */
export const zoneAt = <T extends Rect>(zones: T[], p: { x: number; y: number }) => zones.find((z) => inZone(p, z));

/**
 * Moves one edge towards `to`, stopping at the plan's side or the first zone in the way (one it runs
 * alongside on the other axis), and never closer than the smallest zone to the opposite edge.
 */
function sweepEdge(e: Edges, edge: Edge, to: number, others: Edges[], minSide: number): Edges {
  const horizontal = edge === 'l' || edge === 'r';
  const [a1, a2] = horizontal ? [e.t, e.b] : [e.l, e.r];
  const near = (o: Edges) => (horizontal ? alongside(a1, a2, o.t, o.b) : alongside(a1, a2, o.l, o.r));
  const out = { ...e };
  if (edge === 'r') {
    let lim = 100;
    for (const o of others) if (near(o) && o.l >= e.r - EPS) lim = Math.min(lim, o.l);
    out.r = Math.max(e.l + minSide, Math.min(to, Math.max(lim, e.r)));
  } else if (edge === 'l') {
    let lim = 0;
    for (const o of others) if (near(o) && o.r <= e.l + EPS) lim = Math.max(lim, o.r);
    out.l = Math.min(e.r - minSide, Math.max(to, Math.min(lim, e.l)));
  } else if (edge === 'b') {
    let lim = 100;
    for (const o of others) if (near(o) && o.t >= e.b - EPS) lim = Math.min(lim, o.t);
    out.b = Math.max(e.t + minSide, Math.min(to, Math.max(lim, e.b)));
  } else {
    let lim = 0;
    for (const o of others) if (near(o) && o.b <= e.t + EPS) lim = Math.max(lim, o.b);
    out.t = Math.min(e.b - minSide, Math.max(to, Math.min(lim, e.t)));
  }
  return out;
}

/** Slides a whole zone by dx (then dy) as far as it goes before the plan's side or another zone. */
function slide(e: Edges, dx: number, dy: number, others: Edges[]): Edges {
  let out = e;
  if (dx) {
    const w = e.r - e.l;
    const moved = dx > 0 ? sweepEdge(out, 'r', out.r + dx, others, 0) : sweepEdge(out, 'l', out.l + dx, others, 0);
    out = dx > 0 ? { ...moved, l: moved.r - w } : { ...moved, r: moved.l + w };
  }
  if (dy) {
    const h = e.b - e.t;
    const moved = dy > 0 ? sweepEdge(out, 'b', out.b + dy, others, 0) : sweepEdge(out, 't', out.t + dy, others, 0);
    out = dy > 0 ? { ...moved, t: moved.b - h } : { ...moved, b: moved.t + h };
  }
  return out;
}

const miss = (e: Edges, want: Edges) => Math.abs(e.l - want.l) + Math.abs(e.t - want.t) + Math.abs(e.r - want.r) + Math.abs(e.b - want.b);
/** Of two ways round, the one that lands nearer what was wanted. */
const nearer = (a: Edges, b: Edges, want: Edges) => (miss(b, want) < miss(a, want) - 1e-9 ? b : a);

/**
 * Moving a zone: from where it last was, towards `to`, sliding along any zone in the way rather than
 * through it. Tries across-then-down and down-then-across and keeps whichever gets nearer.
 */
export function moveZone(from: Rect, to: Rect, others: Rect[]): Rect {
  const o = others.map(edgesOf);
  const e = edgesOf(from);
  const want = edgesOf(to);
  const dx = want.l - e.l;
  const dy = want.t - e.t;
  const a = slide(slide(e, dx, 0, o), 0, dy, o);
  const b = slide(slide(e, 0, dy, o), dx, 0, o);
  return rectOf(nearer(a, b, want));
}

/**
 * Resizing a zone by its sides or corners: each edge held moves from where it last was towards
 * `to`, stopping at the plan's side or the next zone, and the zone keeps the smallest size.
 */
export function resizeZone(from: Rect, edges: Edge[], to: { x: number; y: number }, others: Rect[], minSide = MIN_ZONE_SIDE): Rect {
  const o = others.map(edgesOf);
  const e = edgesOf(from);
  const xEdge = edges.find((d) => d === 'l' || d === 'r');
  const yEdge = edges.find((d) => d === 't' || d === 'b');
  const sx = (r: Edges) => (xEdge ? sweepEdge(r, xEdge, to.x, o, minSide) : r);
  const sy = (r: Edges) => (yEdge ? sweepEdge(r, yEdge, to.y, o, minSide) : r);
  const want = { ...e, ...(xEdge ? { [xEdge]: to.x } : {}), ...(yEdge ? { [yEdge]: to.y } : {}) };
  return rectOf(nearer(sy(sx(e)), sx(sy(e)), want));
}

/**
 * Drawing a zone from where the press started to the pointer, as big as it can be without running
 * into another zone. Null when it started inside one.
 */
export function drawZone(anchor: { x: number; y: number }, to: { x: number; y: number }, others: Rect[]): Rect | null {
  if (zoneAt(others, anchor)) return null;
  const start: Rect = { x: anchor.x, y: anchor.y, w: 0, h: 0 };
  const edges: Edge[] = [to.x >= anchor.x ? 'r' : 'l', to.y >= anchor.y ? 'b' : 't'];
  const r = resizeZone(start, edges, to, others, 0);
  return others.some((z) => zonesOverlap(z, r)) ? null : r;
}

/** Big enough to keep, once drawn. */
export const bigEnough = (r: Rect) => r.w >= MIN_ZONE_SIDE && r.h >= MIN_ZONE_SIDE;

/** Rounded as the server keeps it. */
export const roundRect = (r: Rect): Rect => {
  const n = (v: number) => Math.round(v * 1000) / 1000;
  return { x: n(r.x), y: n(r.y), w: n(r.w), h: n(r.h) };
};
