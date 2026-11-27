import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type FocusEvent, type ReactNode } from 'react';
import styles from './Toaster.module.css';

/**
 * Toasts in the style of Medusa UI's Toaster (docs.medusajs.com/ui/components/toast, built on
 * Sonner): a light card with an icon, title and description, an optional action and ✕, stacked in
 * the bottom right corner. The newest sits in front with up to two peeking out behind it; hovering
 * the stack spreads it out and holds every toast's clock.
 */

export type ToastTone = 'info' | 'success' | 'warning' | 'error' | 'loading';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastInput {
  /** Success unless said otherwise. A loading toast stays until it's replaced or dismissed. */
  tone?: ToastTone;
  title: string;
  /** A line under the title; wrap names in <strong>. */
  description?: ReactNode;
  /** A text button under the description ("Undo"); clicking it also closes the toast. */
  action?: ToastAction;
  /** Show the ✕ (on unless turned off). */
  dismissable?: boolean;
  /** How long it stays, in ms (four seconds unless said otherwise). */
  duration?: number;
  /** Replace the toast with this id in place, e.g. a loading toast becoming a success. */
  id?: number;
}

export type ToastOptions = Omit<ToastInput, 'tone' | 'title'>;

/** `toast({ title, tone })`, or Medusa's `toast.success(title, { description })` and friends. Each returns the toast's id. */
export interface ToastApi {
  (toast: ToastInput): number;
  info: (title: string, options?: ToastOptions) => number;
  success: (title: string, options?: ToastOptions) => number;
  warning: (title: string, options?: ToastOptions) => number;
  error: (title: string, options?: ToastOptions) => number;
  loading: (title: string, options?: ToastOptions) => number;
  /** Close one toast, or all of them. */
  dismiss: (id?: number) => void;
}

interface ToastItem extends ToastInput {
  id: number;
  /** Bumped when the toast is replaced, which restarts its clock. */
  rev: number;
  leaving?: boolean;
}

/** Medusa's default: four seconds. */
export const TOAST_DURATION = 4000;
/** The enter, exit and stacking transitions. */
const MOVE_MS = 400;
/** In front and peeking out behind; the rest wait, hidden. */
const VISIBLE = 3;
/** Older toasts beyond this many give way at once. */
const KEEP = 6;
/** Between toasts when the stack is spread out. */
const GAP = 12;
/** How far each toast behind peeks out, and how much smaller it gets. */
const LIFT = 12;
const SCALE_STEP = 0.05;

const noop = Object.assign(() => 0, {
  info: () => 0,
  success: () => 0,
  warning: () => 0,
  error: () => 0,
  loading: () => 0,
  dismiss: () => {},
}) as ToastApi;
const ToastContext = createContext<ToastApi>(noop);

/** Shows a toast after an operation succeeds or fails. */
export const useToast = () => useContext(ToastContext);

/** Holds the toasts for the app, in the window's bottom right corner. */
export function ToastProvider({ children }: { children: ReactNode }) {
  // Oldest first.
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [heights, setHeights] = useState<Record<number, number>>({});
  const [expanded, setExpanded] = useState(false);
  const [pageHidden, setPageHidden] = useState(() => typeof document !== 'undefined' && document.hidden);
  const seq = useRef(0);

  useEffect(() => {
    const onVisibility = () => setPageHidden(document.hidden);
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  const dismiss = useCallback((id?: number) => {
    const matches = (t: ToastItem) => id === undefined || t.id === id;
    setToasts((list) => list.map((t) => (matches(t) ? { ...t, leaving: true } : t)));
    // Gone once the exit has played (a timer, so it also happens in a background tab).
    setTimeout(() => {
      setToasts((list) => list.filter((t) => !(t.leaving && matches(t))));
      setHeights((h) => {
        if (id === undefined) return {};
        const { [id]: _, ...rest } = h;
        return rest;
      });
    }, MOVE_MS);
  }, []);

  const push = useCallback((input: ToastInput) => {
    const id = input.id ?? ++seq.current;
    seq.current = Math.max(seq.current, id);
    setToasts((list) => {
      const at = list.findIndex((t) => t.id === id && !t.leaving);
      if (at >= 0) return list.map((t, i) => (i === at ? { tone: 'success', ...input, id, rev: t.rev + 1 } : t));
      const next = [...list, { tone: 'success' as const, ...input, id, rev: 0 }];
      // Past the most we keep, the oldest go straight away; they're hidden behind the stack anyway.
      let extra = next.filter((t) => !t.leaving).length - KEEP;
      return extra > 0 ? next.filter((t) => t.leaving || extra-- <= 0) : next;
    });
    return id;
  }, []);

  const api = useMemo(() => {
    const toast = ((input: ToastInput) => push(input)) as ToastApi;
    const tone = (t: ToastTone) => (title: string, options: ToastOptions = {}) => push({ ...options, tone: t, title });
    toast.info = tone('info');
    toast.success = tone('success');
    toast.warning = tone('warning');
    toast.error = tone('error');
    toast.loading = tone('loading');
    toast.dismiss = dismiss;
    return toast;
  }, [push, dismiss]);

  // Newest first: where each sits, and how far up it goes when the stack spreads out.
  const live = toasts.filter((t) => !t.leaving).reverse();
  const places = new Map<number, { index: number; offset: number }>();
  live.reduce((offset, t, index) => {
    places.set(t.id, { index, offset });
    return offset + (heights[t.id] ?? 0) + GAP;
  }, 0);
  const frontHeight = live[0] ? heights[live[0].id] : undefined;

  // The last one gone while the pointer was on it: nothing will say it left.
  useEffect(() => {
    if (live.length === 0) setExpanded(false);
  }, [live.length]);

  const onHeight = useCallback((id: number, height: number) => setHeights((h) => (h[id] === height ? h : { ...h, [id]: height })), []);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <section aria-label="Notifications">
        <ol
          className={styles.stack}
          data-expanded={expanded}
          onMouseEnter={() => setExpanded(true)}
          onMouseLeave={() => setExpanded(false)}
          onFocus={() => setExpanded(true)}
          onBlur={(e: FocusEvent<HTMLOListElement>) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setExpanded(false);
          }}
        >
          {toasts.map((t) => (
            <ToastCard
              key={t.id}
              toast={t}
              place={places.get(t.id)}
              height={heights[t.id]}
              frontHeight={frontHeight}
              expanded={expanded}
              paused={expanded || pageHidden}
              onHeight={onHeight}
              onDismiss={() => dismiss(t.id)}
            />
          ))}
        </ol>
      </section>
    </ToastContext.Provider>
  );
}

interface CardProps {
  toast: ToastItem;
  /** Where it sits among the live toasts; undefined once it's leaving. */
  place?: { index: number; offset: number };
  height?: number;
  frontHeight?: number;
  expanded: boolean;
  paused: boolean;
  onHeight: (id: number, height: number) => void;
  onDismiss: () => void;
}

/** One toast: leaves when its time is up (held while the stack is hovered or the page is hidden), or when closed. */
function ToastCard({ toast, place, height, frontHeight, expanded, paused, onHeight, onDismiss }: CardProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const tone = toast.tone ?? 'success';
  const duration = toast.duration ?? (tone === 'loading' ? Infinity : TOAST_DURATION);
  const remaining = useRef(duration);
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;
  // Where it was when it started leaving, so it fades out from there.
  const lastPlace = useRef(place ?? { index: 0, offset: 0 });
  if (place) lastPlace.current = place;
  const { index, offset } = lastPlace.current;

  // Its natural height, for the stack to lay out by.
  useLayoutEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const report = () => onHeight(toast.id, el.offsetHeight);
    report();
    const observer = new ResizeObserver(report);
    observer.observe(el);
    return () => observer.disconnect();
  }, [toast.id, onHeight]);

  // In from below once its starting place has been laid out.
  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), 0);
    return () => clearTimeout(timer);
  }, []);

  // A replaced toast gets its full time again.
  useEffect(() => {
    remaining.current = duration;
  }, [toast.rev, duration]);

  useEffect(() => {
    if (paused || toast.leaving || !Number.isFinite(remaining.current)) return;
    const started = Date.now();
    const timer = setTimeout(() => dismissRef.current(), Math.max(0, remaining.current));
    return () => {
      clearTimeout(timer);
      remaining.current -= Date.now() - started;
    };
  }, [paused, toast.leaving, toast.rev]);

  const front = index === 0;
  const visible = index < VISIBLE;
  // Behind the front one while stacked: as tall as it, its content hidden.
  const tucked = !expanded && !front;
  let transform: string;
  if (!mounted || (toast.leaving && front)) transform = 'translateY(100%)';
  else if (expanded) transform = `translateY(${-offset}px)`;
  else transform = `translateY(${-LIFT * index}px) scale(${1 - SCALE_STEP * index})`;
  const shownHeight = tucked ? frontHeight : height;

  return (
    <li
      className={styles.toast}
      data-front={front}
      aria-hidden={!visible || undefined}
      style={{
        transform,
        opacity: !mounted || toast.leaving || !visible ? 0 : 1,
        height: shownHeight === undefined ? undefined : shownHeight,
        zIndex: 100 - index,
        pointerEvents: visible && !toast.leaving ? undefined : 'none',
      }}
    >
      <div className={styles.card}>
        <div
          ref={contentRef}
          className={styles.content}
          role={tone === 'error' ? 'alert' : 'status'}
          style={{ opacity: tucked ? 0 : 1 }}
        >
          <div className={styles.main}>
            <span className={[styles.icon, styles[`icon_${tone}`]].join(' ')} aria-hidden="true">
              {ICONS[tone]}
            </span>
            <div className={styles.body}>
              <div className={styles.text}>
                <span className={styles.title}>{toast.title}</span>
                {toast.description && <span className={styles.description}>{toast.description}</span>}
              </div>
              {toast.action && (
                <button
                  type="button"
                  className={styles.action}
                  tabIndex={tucked ? -1 : undefined}
                  onClick={() => {
                    toast.action!.onClick();
                    onDismiss();
                  }}
                >
                  {toast.action.label}
                </button>
              )}
            </div>
          </div>
          {toast.dismissable !== false && (
            <button type="button" className={styles.close} aria-label="Dismiss" tabIndex={tucked ? -1 : undefined} onClick={onDismiss}>
              <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
                <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="m11.25 3.75-7.5 7.5M3.75 3.75l7.5 7.5" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

/** Medusa UI's 15px icons (@medusajs/icons, MIT): filled circles, and a spinner for loading. */
const ICONS: Record<ToastTone, ReactNode> = {
  info: (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <path
        fill="currentColor"
        d="M7.5.389A7.12 7.12 0 0 0 .389 7.5 7.12 7.12 0 0 0 7.5 14.611 7.12 7.12 0 0 0 14.611 7.5c0-3.921-3.19-7.111-7.111-7.111m.667 10.444a.667.667 0 0 1-1.334 0V7.944H6.39a.667.667 0 0 1 0-1.333h.667c.612 0 1.11.498 1.11 1.111zM7.5 5.5a.89.89 0 0 1 0-1.778.89.89 0 0 1 0 1.778"
      />
    </svg>
  ),
  success: (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <path
        fill="currentColor"
        d="M7.5.389C3.58.389.389 3.579.389 7.5s3.19 7.111 7.111 7.111 7.111-3.19 7.111-7.111S11.421.389 7.5.389m3.416 5.074-3.778 4.889a.67.67 0 0 1-.502.258h-.025a.67.67 0 0 1-.496-.22l-2-2.222a.668.668 0 0 1 .992-.893l1.465 1.629 3.29-4.257a.667.667 0 0 1 1.055.815z"
      />
    </svg>
  ),
  warning: (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <path
        fill="currentColor"
        d="M7.5.389C3.58.389.389 3.579.389 7.5s3.19 7.111 7.111 7.111 7.111-3.19 7.111-7.111S11.421.389 7.5.389m-.667 3.939a.667.667 0 0 1 1.334 0v3.679a.667.667 0 0 1-1.334 0zm.667 7.098a.89.89 0 0 1 0-1.778.89.89 0 0 1 0 1.778"
      />
    </svg>
  ),
  error: (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <path
        fill="currentColor"
        d="M7.5.389C3.58.389.389 3.579.389 7.5s3.19 7.111 7.111 7.111 7.111-3.19 7.111-7.111S11.421.389 7.5.389m2.916 9.084a.667.667 0 0 1-.943.943L7.5 8.443l-1.973 1.973a.665.665 0 0 1-.943 0 .667.667 0 0 1 0-.943L6.558 7.5 4.584 5.527a.667.667 0 1 1 .944-.943L7.5 6.557l1.973-1.973a.667.667 0 0 1 .943.943L8.444 7.5l1.973 1.973z"
      />
    </svg>
  ),
  loading: (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <g stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5">
        <path d="M3.11 2.943 4.68 4.514" />
        <path d="M1.222 7.5h2.222" opacity="0.88" />
        <path d="m3.11 12.057 1.571-1.571" opacity="0.75" />
        <path d="M7.667 13.945v-2.222" opacity="0.63" />
        <path d="m12.224 12.057-1.572-1.571" opacity="0.5" />
        <path d="M14.112 7.5h-2.223" opacity="0.38" />
        <path d="m12.224 2.943-1.572 1.571" opacity="0.25" />
        <path d="M7.667 1.055v2.223" opacity="0.13" />
      </g>
    </svg>
  ),
};
