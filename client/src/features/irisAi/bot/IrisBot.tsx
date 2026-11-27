import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import './tokens.css';
import styles from './IrisBot.module.css';
import { useIris } from './IrisProvider';
import { startEngine } from './engine';
import { ANNOUNCE } from './states';
import { L, sm, cl } from './math';

/** The head is drawn at 200 × 172 with the ears 12 px past each side, then scaled to `size`. */
const HEAD_W = 200;
const HEAD_H = 172;
const EAR_OUT = 12;
const STORE_KEY = 'iris-bot-position';
/** Moving to a new anchor (or size) glides over this long. */
const GLIDE = 0.45;

export type IrisBotPosition = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left' | 'anchor';

export interface IrisBotProps {
  /** On-screen width of the head, px. */
  size?: number;
  position?: IrisBotPosition;
  /** With position "anchor": sits centred on top of this element and follows it. */
  anchorRef?: RefObject<HTMLElement | null>;
  draggable?: boolean;
  onClick?: () => void;
  ariaLabel?: string;
}

function readStored(): { x: number; y: number } | null {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    const v = raw ? (JSON.parse(raw) as { x: number; y: number }) : null;
    return v && Number.isFinite(v.x) && Number.isFinite(v.y) ? v : null;
  } catch {
    return null;
  }
}

/**
 * Iris Bot: a matte-black head with an LED face, floating over everything while Iris AI is open and
 * reacting to it (typing, searching, thinking, answering, errors, a nap). Portalled to the body,
 * fixed, and out of the way of clicks unless it's draggable or clickable.
 */
export function IrisBot({ size = 96, position = 'bottom-right', anchorRef, draggable = false, onClick, ariaLabel = 'Iris AI assistant' }: IrisBotProps) {
  const iris = useIris();
  const [mounted, setMounted] = useState(iris.state !== 'hidden');
  const [said, setSaid] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const fadeRef = useRef<HTMLDivElement>(null);
  const screenRef = useRef<HTMLDivElement>(null);
  const ledRef = useRef<HTMLCanvasElement>(null);
  const glowRef = useRef<HTMLCanvasElement>(null);
  const lightRefs = useRef<HTMLSpanElement[]>([]);
  const dragged = useRef<{ x: number; y: number } | null>(draggable ? readStored() : null);
  const drag = useRef<{ dx: number; dy: number; moved: boolean } | null>(null);
  // Placement, read by the engine every frame.
  const placement = useRef({ position, anchorRef, size });
  placement.current = { position, anchorRef, size };

  // Show while Iris is open; the engine unmounts it once the dismiss has played.
  useEffect(
    () =>
      iris.subscribe((s) => {
        if (s !== 'hidden') setMounted(true);
        setSaid(s === 'error' && iris.errorMessage ? `Iris ran into an error: ${iris.errorMessage}` : ANNOUNCE[s]);
      }),
    [iris],
  );

  useEffect(() => {
    if (!mounted) return;
    const body = bodyRef.current;
    const fade = fadeRef.current;
    const screen = screenRef.current;
    const led = ledRef.current;
    const glow = glowRef.current;
    const wrap = wrapRef.current;
    if (!body || !fade || !screen || !led || !glow || !wrap) return;

    let at: { x: number; y: number; scale: number } | null = null;
    let glide: { from: { x: number; y: number; scale: number }; start: number; key: unknown } | null = null;
    let lastKey: unknown = null;
    let lastScale = 0;
    const place = () => {
      const { position: pos, anchorRef: anchor, size: px } = placement.current;
      const scale = px / HEAD_W;
      const w = (HEAD_W + EAR_OUT * 2) * scale;
      const h = HEAD_H * scale;
      const offset = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--iris-offset')) || 24;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      let target: { x: number; y: number };
      let key: unknown = pos;
      const el = anchor?.current;
      if (dragged.current) {
        target = { x: Math.min(vw - w, Math.max(0, dragged.current.x)), y: Math.min(vh - h, Math.max(0, dragged.current.y)) };
        key = 'dragged';
      } else if (pos === 'anchor' && el) {
        const r = el.getBoundingClientRect();
        target = { x: r.left + r.width / 2 - w / 2, y: r.top - h };
        key = el;
      } else {
        const right = pos.endsWith('right');
        const bottom = pos.startsWith('bottom') || pos === 'anchor';
        target = { x: right ? vw - offset - w : offset, y: bottom ? vh - offset - h : offset };
      }
      const next = { ...target, scale };
      const t = performance.now() / 1000;
      // A new anchor, corner or size glides there; following the same one (scrolling, resizing) is instant.
      if (at && (key !== lastKey || scale !== lastScale) && !drag.current) glide = { from: at, start: t, key };
      lastKey = key;
      lastScale = scale;
      if (glide) {
        const p = sm(cl((t - glide.start) / GLIDE));
        at = { x: L(glide.from.x, next.x, p), y: L(glide.from.y, next.y, p), scale: L(glide.from.scale, next.scale, p) };
        if (p >= 1) glide = null;
      } else at = next;
      wrap.style.transform = `translate(${at.x.toFixed(1)}px, ${at.y.toFixed(1)}px)`;
      wrap.style.width = `${(HEAD_W + EAR_OUT * 2) * at.scale}px`;
      wrap.style.height = `${HEAD_H * at.scale}px`;
      wrap.style.setProperty('--iris-scale', String(at.scale));
    };

    return startEngine({
      controller: iris,
      body,
      fade,
      screen,
      lights: lightRefs.current.filter(Boolean),
      led,
      glow,
      place,
      onDismissed: () => setMounted(false),
    });
  }, [mounted, iris]);

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (!draggable) return;
    const r = wrapRef.current!.getBoundingClientRect();
    drag.current = { dx: e.clientX - r.left, dy: e.clientY - r.top, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d) return;
    d.moved = true;
    dragged.current = { x: e.clientX - d.dx, y: e.clientY - d.dy };
  }
  function onPointerUp() {
    const d = drag.current;
    drag.current = null;
    if (d?.moved && dragged.current) {
      try {
        localStorage.setItem(STORE_KEY, JSON.stringify(dragged.current));
      } catch {
        // Private mode or blocked storage: the position just isn't remembered.
      }
    } else onClick?.();
  }

  const interactive = draggable || !!onClick;
  const live = (
    <span className={styles.srOnly} aria-live="polite">
      {said}
    </span>
  );
  if (!mounted) return createPortal(live, document.body);

  return createPortal(
    <div className={styles.layer}>
      <div
        ref={wrapRef}
        className={[styles.bot, interactive ? styles.interactive : '', draggable ? styles.draggable : ''].join(' ').trim()}
        role={onClick && !draggable ? 'button' : 'img'}
        aria-label={ariaLabel}
        tabIndex={onClick ? 0 : undefined}
        onKeyDown={(e) => {
          if (onClick && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            onClick();
          }
        }}
        onPointerDown={interactive ? onPointerDown : undefined}
        onPointerMove={draggable ? onPointerMove : undefined}
        onPointerUp={interactive ? onPointerUp : undefined}
        onPointerCancel={() => (drag.current = null)}
      >
        <div ref={fadeRef} className={styles.fade}>
          <div className={styles.stage} style={{ '--iris-w': `${HEAD_W}px`, '--iris-h': `${HEAD_H}px` } as CSSProperties}>
            <div ref={bodyRef} className={styles.body}>
              {[0, 1].map((i) => (
                <span key={i} className={[styles.ear, i ? styles.earRight : styles.earLeft].join(' ')}>
                  <span className={styles.slot}>
                    <span
                      className={styles.light}
                      ref={(el) => {
                        if (el) lightRefs.current[i] = el;
                      }}
                    />
                  </span>
                </span>
              ))}
              <div className={styles.head}>
                <span className={styles.grain} />
                <span className={styles.sheen} />
                <div className={styles.bezel} />
                <div ref={screenRef} className={styles.screen}>
                  <canvas ref={glowRef} className={styles.glow} />
                  <canvas ref={ledRef} className={styles.led} />
                  <span className={styles.glass} />
                  <span className={styles.arc} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      {live}
    </div>,
    document.body,
  );
}
