import { useCallback, useEffect, useLayoutEffect, useState, type RefObject } from 'react';
import { PLAN_RATIO } from './seatShared';

/** The plan at 100%: 540px wide in a card with 16px around it (Figma 1592:144219, 558 × 540). */
export const PLAN_W = 540;
export const PLAN_H = PLAN_W * PLAN_RATIO;
export const PAD = 16;
export const CARD_W = PLAN_W + PAD * 2;
export const CARD_H = PLAN_H + PAD * 2;
export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 3;
export const ZOOM_STEP = 0.1;
/** Room kept clear of the plan, top and bottom, for the toolbar and the legend when it first fits. */
const FIT_MARGIN = 80;

export const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const clampZoom = (z: number) => clamp(Math.round(z * 100) / 100, MIN_ZOOM, MAX_ZOOM);
/** Room kept clear of the plan at the sides. */
const SIDE_MARGIN = 48;
/** The zoom at which the whole plan fits the map, never past 100%. */
const wholePlanZoom = (size: { w: number; h: number }) =>
  clampZoom(Math.floor(Math.min(1, (size.h - FIT_MARGIN * 2) / CARD_H, (size.w - SIDE_MARGIN) / CARD_W) * 20) / 20);

export interface PlanView {
  zoom: number;
  /** How far the plan's centre sits from the map's, in pixels. */
  x: number;
  y: number;
  /** Glide to this view rather than jump. */
  animate: boolean;
}

type Ref = RefObject<HTMLDivElement | null>;

/**
 * The floor plan's pan and zoom, shared by Space Map and Space Zones: it first zooms so the whole
 * plan fits (never past 100%); scrolling pans, and pinching or ⌘/Ctrl-scrolling zooms around the
 * pointer. `pane` is the map, `viewport` takes the wheel and `plan` is the plan image's box.
 */
export function usePlanView(pane: Ref, viewport: Ref, plan: Ref) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState<PlanView>({ zoom: 1, x: 0, y: 0, animate: false });
  const [fitted, setFitted] = useState(false);

  useLayoutEffect(() => {
    const el = pane.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [pane]);
  useEffect(() => {
    if (fitted || !size.w || !size.h) return;
    setView((v) => ({ ...v, zoom: wholePlanZoom(size) }));
    setFitted(true);
  }, [size, fitted]);

  useEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) {
        const px = e.clientX - rect.left - rect.width / 2;
        const py = e.clientY - rect.top - rect.height / 2;
        setView((v) => {
          const zoom = clampZoom(v.zoom * Math.exp(-e.deltaY * 0.01));
          const k = zoom / v.zoom;
          return { zoom, x: px - (px - v.x) * k, y: py - (py - v.y) * k, animate: false };
        });
      } else {
        setView((v) => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY, animate: false }));
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [viewport]);

  /** Where a point on the plan (in percent) sits on the map, in pixels. */
  const toPane = (p: { x: number; y: number }) => ({
    x: size.w / 2 + view.x + (PAD + (p.x / 100) * PLAN_W - CARD_W / 2) * view.zoom,
    y: size.h / 2 + view.y + (PAD + (p.y / 100) * PLAN_H - CARD_H / 2) * view.zoom,
  });

  /** A pointer's spot on the plan, in percent; null when it's off the plan, unless `clampToPlan`. */
  const toPlan = (clientX: number, clientY: number, clampToPlan = false) => {
    const r = plan.current?.getBoundingClientRect();
    if (!r) return null;
    const x = ((clientX - r.left) / r.width) * 100;
    const y = ((clientY - r.top) / r.height) * 100;
    if (clampToPlan) return { x: clamp(x, 0, 100), y: clamp(y, 0, 100) };
    return x >= 0 && x <= 100 && y >= 0 && y <= 100 ? { x, y } : null;
  };

  const zoomBy = (delta: number) =>
    setView((v) => {
      const zoom = clampZoom(v.zoom + delta);
      const k = zoom / v.zoom;
      return { zoom, x: v.x * k, y: v.y * k, animate: true };
    });

  /** Glides a point on the plan (in percent) to the middle of the map. */
  const centreOn = useCallback(
    (p: { x: number; y: number }) =>
      setView((v) => ({
        ...v,
        x: -(PAD + (p.x / 100) * PLAN_W - CARD_W / 2) * v.zoom,
        y: -(PAD + (p.y / 100) * PLAN_H - CARD_H / 2) * v.zoom,
        animate: true,
      })),
    [],
  );

  /**
   * Glides to fit an area of the plan (in percent) in the map, clear of the toolbar and legend, as
   * close as the zoom goes; with none, back to the whole plan.
   */
  const fitTo = useCallback(
    (r: { x: number; y: number; w: number; h: number } | null) => {
      if (!size.w || !size.h) return;
      if (!r) return setView({ zoom: wholePlanZoom(size), x: 0, y: 0, animate: true });
      const w = Math.max((r.w / 100) * PLAN_W, 1);
      const h = Math.max((r.h / 100) * PLAN_H, 1);
      const zoom = Math.max(wholePlanZoom(size), clampZoom(Math.min((size.w - SIDE_MARGIN * 2) / w, (size.h - FIT_MARGIN * 2) / h)));
      const cx = r.x + r.w / 2;
      const cy = r.y + r.h / 2;
      setView({
        zoom,
        x: -(PAD + (cx / 100) * PLAN_W - CARD_W / 2) * zoom,
        y: -(PAD + (cy / 100) * PLAN_H - CARD_H / 2) * zoom,
        animate: true,
      });
    },
    [size],
  );

  return { size, view, setView, toPane, toPlan, zoomBy, centreOn, fitTo };
}
