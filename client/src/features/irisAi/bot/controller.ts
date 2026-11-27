/**
 * Iris Bot's controller: the app reports what's happening (open, typing, searching, a chunk streamed,
 * an error…) and the controller works out the one state that shows. The engine reads snapshot() every
 * frame; React reads `state` through subscribe().
 */
import { PRIORITY, TIMING, type IrisState } from './states';

export type { IrisState };

/** States the app sets for its own work; typing and sleepiness are layered over them. */
type Task = 'idle' | 'searching' | 'thinking' | 'responding' | 'success' | 'error';

export interface IrisSnapshot {
  state: IrisState;
  previous: IrisState;
  /** Seconds (performance clock) when `state` began. */
  changedAt: number;
  celebrate: boolean;
  errorMessage: string;
  keyAt: number;
  chunkAt: number;
  /** Caret position across the visible text, 0 … 1. */
  caret: number;
  summonAt: number;
  dismissAt: number;
  /** When Iris last woke from the logo (welcome or sleep screen): glow, "hi!", then the eyes. */
  wakeAt: number;
}

export interface IrisController {
  /** Summon: hidden → idle. */
  open(): void;
  /** Dismiss. */
  close(): void;
  setState(s: IrisState, opts?: { celebrate?: boolean }): void;
  /** Call on every input event. */
  typing(info: { caret: number; length: number; sensitive?: boolean }): void;
  /** Call on every streamed chunk while responding. */
  chunk(): void;
  /** Shorthand for setState("error"). */
  error(message?: string): void;
  success(opts?: { celebrate?: boolean }): void;
  bindInput(el: HTMLInputElement | HTMLTextAreaElement, opts?: { sensitive?: boolean }): () => void;
  subscribe(fn: (s: IrisState) => void): () => void;
  /** Any pointer or key activity: restarts the inactivity timer (typing is what wakes Iris). */
  activity(): void;
  snapshot(): IrisSnapshot;
  readonly state: IrisState;
  readonly errorMessage: string;
}

const now = () => performance.now() / 1000;
/** Characters per line the eyes read across before starting again at the left. */
const READ_WIDTH = 48;

export function createIrisController(): IrisController {
  let open = false;
  let task: Task = 'idle';
  let input: 'listening' | 'shy' | null = null;
  let sleepy = false;
  /** Asleep on the welcome logo until the member starts typing (or Iris starts work). */
  let awake = false;
  let celebrate = false;
  let errorMessage = '';
  let beforeError: IrisState = 'idle';

  let state: IrisState = 'hidden';
  let previous: IrisState = 'hidden';
  let changedAt = now();
  let keyAt = -Infinity;
  let chunkAt = -Infinity;
  let caret = 0;
  let summonAt = -Infinity;
  let dismissAt = -Infinity;
  let wakeAt = -Infinity;

  const subscribers = new Set<(s: IrisState) => void>();
  const timers: Record<'input' | 'task' | 'sleep', ReturnType<typeof setTimeout> | undefined> = { input: undefined, task: undefined, sleep: undefined };
  const later = (key: keyof typeof timers, seconds: number, fn: () => void) => {
    clearTimeout(timers[key]);
    timers[key] = setTimeout(fn, seconds * 1000);
  };
  const cancel = (key: keyof typeof timers) => {
    clearTimeout(timers[key]);
    timers[key] = undefined;
  };

  function pick(): IrisState {
    if (!open) return 'hidden';
    if (!awake && task === 'idle' && !input) return 'standby';
    const active: IrisState[] = [task, ...(input ? [input] : []), ...(sleepy ? (['sleepy'] as const) : [])];
    return PRIORITY.find((s) => active.includes(s)) ?? 'idle';
  }

  function update() {
    const next = pick();
    if (next !== state) {
      previous = state;
      state = next;
      changedAt = now();
      subscribers.forEach((fn) => fn(state));
    }
    // Only an idle Iris grows sleepy.
    if (state === 'idle') later('sleep', TIMING.SLEEP_AFTER, () => ((sleepy = true), update()));
    else if (state !== 'sleepy') cancel('sleep');
  }

  /** Off the logo: the wake-up plays (glow, "hi!", blink) before the eyes take over. */
  function wake() {
    if (!awake || sleepy) wakeAt = now();
    awake = true;
    sleepy = false;
  }

  function setTask(next: Task, opts: { celebrate?: boolean } = {}) {
    if (next !== 'idle') wake();
    if (next !== 'error' && next !== 'success') cancel('task');
    if (next === 'error') {
      // Remember what to come back to. Work that failed (searching, thinking, responding) is over,
      // so it comes back to idle rather than to a spinner nobody will stop.
      if (state !== 'error') beforeError = ['searching', 'thinking', 'responding'].includes(state) ? 'idle' : state;
      later('task', TIMING.ERROR_BACK, () => {
        task = beforeError === 'success' ? 'success' : 'idle';
        if (beforeError === 'sleepy') sleepy = true;
        update();
      });
    }
    if (next === 'success') {
      celebrate = !!opts.celebrate;
      later('task', TIMING.SUCCESS_BACK, () => ((task = 'idle'), update()));
    }
    task = next;
    sleepy = false;
    update();
  }

  const controller: IrisController = {
    open() {
      if (open) return;
      open = true;
      task = 'idle';
      input = null;
      sleepy = false;
      awake = false;
      wakeAt = -Infinity;
      summonAt = now();
      update();
    },
    close() {
      if (!open) return;
      open = false;
      dismissAt = now();
      (Object.keys(timers) as (keyof typeof timers)[]).forEach(cancel);
      update();
    },
    setState(s, opts) {
      if (s === 'hidden') return controller.close();
      if (!open) controller.open();
      if (s === 'listening' || s === 'shy') {
        input = s;
        later('input', TIMING.LISTEN_HOLD, () => ((input = null), update()));
        return update();
      }
      if (s === 'sleepy') {
        sleepy = true;
        return update();
      }
      if (s === 'standby') {
        // Back to the welcome logo.
        awake = false;
        sleepy = false;
        input = null;
        task = 'idle';
        cancel('input');
        cancel('task');
        return update();
      }
      if (s === 'idle') {
        input = null;
        cancel('input');
      }
      setTask(s, opts);
    },
    typing(info) {
      keyAt = now();
      caret = info.length ? (info.caret % READ_WIDTH) / READ_WIDTH : 0;
      wake();
      input = info.sensitive ? 'shy' : 'listening';
      later('input', TIMING.LISTEN_HOLD, () => ((input = null), update()));
      update();
    },
    chunk() {
      chunkAt = now();
      controller.activity();
    },
    error(message = '') {
      errorMessage = message;
      controller.setState('error');
    },
    success(opts) {
      controller.setState('success', opts);
    },
    bindInput(el, opts = {}) {
      const sensitive = !!opts.sensitive;
      const report = () => controller.typing({ caret: el.selectionStart ?? el.value.length, length: el.value.length, sensitive });
      const onKey = (e: Event) => {
        const key = (e as KeyboardEvent).key;
        // Arrows, Enter and modifiers aren't typing.
        if (key.length === 1 || key === 'Backspace' || key === 'Delete') report();
      };
      const onSelection = () => {
        if (document.activeElement === el && input) caret = el.value.length ? ((el.selectionStart ?? 0) % READ_WIDTH) / READ_WIDTH : 0;
      };
      const onBlur = () => {
        input = null;
        cancel('input');
        update();
      };
      const onFocus = () => controller.activity();
      el.addEventListener('input', report);
      el.addEventListener('keydown', onKey);
      el.addEventListener('focus', onFocus);
      el.addEventListener('blur', onBlur);
      document.addEventListener('selectionchange', onSelection);
      return () => {
        el.removeEventListener('input', report);
        el.removeEventListener('keydown', onKey);
        el.removeEventListener('focus', onFocus);
        el.removeEventListener('blur', onBlur);
        document.removeEventListener('selectionchange', onSelection);
      };
    },
    subscribe(fn) {
      subscribers.add(fn);
      return () => {
        subscribers.delete(fn);
      };
    },
    activity() {
      // Moving about keeps an idle Iris from dozing off; only typing (or work) wakes a sleeping one.
      if (state === 'idle') update();
    },
    snapshot: () => ({ state, previous, changedAt, celebrate, errorMessage, keyAt, chunkAt, caret, summonAt, dismissAt, wakeAt }),
    get state() {
      return state;
    },
    get errorMessage() {
      return errorMessage;
    },
  };
  return controller;
}
