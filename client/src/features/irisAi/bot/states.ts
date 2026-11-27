/**
 * Iris Bot's states: which one wins, what the eyes show, the ear light, and how the body moves. Every
 * duration is a named constant in TIMING. Pure functions of time: the engine calls them every frame.
 */
import type { Expr } from './led';
import type { Screen } from './screens';
import { L, TAU, cl, sm } from './math';

export type IrisState = 'hidden' | 'standby' | 'idle' | 'listening' | 'searching' | 'thinking' | 'responding' | 'success' | 'error' | 'shy' | 'sleepy';

/** When several apply, the first one here shows. */
export const PRIORITY: IrisState[] = ['error', 'thinking', 'searching', 'responding', 'success', 'shy', 'listening', 'sleepy', 'idle', 'standby'];

export const TIMING = {
  /** Dot-by-dot cross-fade between expressions, and the quicker one into or out of a blink. */
  CROSSFADE: 0.34,
  BLINK_FADE: 0.08,
  /** How long a blink holds, and the gap between idle blinks. */
  BLINK_HOLD: 0.12,
  BLINK_MIN: 3,
  BLINK_MAX: 6,
  /** Body motion eases from one state into the next over this long. */
  MOTION_BLEND: 0.35,
  /** Typing keeps Iris listening this long after the last key. */
  LISTEN_HOLD: 1.2,
  /** Success: the green light holds, then fades; then back to idle. */
  SUCCESS_LIGHT_HOLD: 1.5,
  SUCCESS_LIGHT_FADE: 0.4,
  SUCCESS_BACK: 2,
  /** With `celebrate`, the heart eyes come in after the happy ones and hold this long. */
  CELEBRATE_HEART_AT: 0.35,
  CELEBRATE_HEART: 1.2,
  /** Error: the red light comes in, then the previous state comes back. */
  ERROR_LIGHT_IN: 0.2,
  ERROR_BACK: 1.8,
  /** Idle this long without input: sleepy. */
  SLEEP_AFTER: 20,
  /** Summon rises in, dismiss sinks out; with reduced motion both are a quick fade. */
  SUMMON: 0.45,
  DISMISS: 0.3,
  REDUCED_FADE: 0.15,
  /** The ear lights ease between states over this long. */
  LIGHT_BLEND: 0.25,
  /** Waking from the logo: it glows up, says "hi!", blinks, then the eyes take over. */
  WAKE_GLOW: 0.35,
  WAKE_HI: 1.1,
  WAKE_BLINK: 0.12,
  /** The logo breathes this slowly on the welcome and sleep screens. */
  LOGO_BREATH: 3.2,
} as const;

/** What a screen reader hears when the state changes. */
export const ANNOUNCE: Record<IrisState, string> = {
  hidden: 'Iris is closed',
  standby: 'Iris is ready. Start typing to wake it up',
  idle: 'Iris is ready',
  listening: 'Iris is listening',
  searching: 'Iris is searching',
  thinking: 'Iris is thinking',
  responding: 'Iris is answering',
  success: 'Iris has an answer',
  error: 'Iris ran into an error',
  shy: 'Iris is looking away while you type',
  sleepy: 'Iris is resting',
};

/** What the face and body react to besides the state itself. */
export interface Cues {
  /** Seconds since the state started. */
  u: number;
  /** Pointer gaze in dots, and tilt toward the pointer (−1 … 1). */
  gaze: { x: number; y: number };
  tilt: number;
  /** Caret position across the visible text, 0 … 1. */
  caret: number;
  /** Seconds since the last key press and since the last streamed chunk. */
  keyAge: number;
  chunkAge: number;
  celebrate: boolean;
  reduced: boolean;
}

/** The eyes, or a full-screen picture (the logo, "hi!"). */
export type FaceName = Expr | Screen;

export interface Face {
  expr: FaceName;
  gx: number;
  gy: number;
  /** A picture's brightness; above 1 its glow blooms. */
  level?: number;
}

/** The logo breathing between `low` and `low + range`. */
const breathe = (c: Cues, low: number, range: number) => (c.reduced ? low + range / 2 : low + range * (0.5 + 0.5 * Math.sin((TAU * c.u) / TIMING.LOGO_BREATH)));

/** The eyes for a state; idle blinks, summon, waking and dismiss are layered on by the engine. */
export function faceFor(state: IrisState, c: Cues): Face {
  switch (state) {
    case 'standby':
      // The welcome screen: the logo, glowing softly.
      return { expr: 'logo', gx: 0, gy: 0, level: breathe(c, 0.7, 0.25) };
    case 'idle':
      return { expr: 'idle', gx: c.gaze.x, gy: c.gaze.y };
    case 'listening':
      // Reads along the text: left to right with the caret, as Pip read the email.
      return { expr: 'read', gx: L(-2, 1.4, c.caret), gy: 0 };
    case 'searching':
      // Scans the sources: ±2 dots at 0.6 Hz.
      return { expr: 'read', gx: c.reduced ? 0 : 2 * Math.sin(TAU * 0.6 * c.u), gy: 0 };
    case 'thinking':
      return c.reduced ? { expr: 'read', gx: 0, gy: 0 } : { expr: 'load', gx: 0, gy: 0 };
    case 'responding':
      return { expr: 'idle', gx: 0, gy: 2 };
    case 'success': {
      const heart = c.celebrate && c.u >= TIMING.CELEBRATE_HEART_AT && c.u < TIMING.CELEBRATE_HEART_AT + TIMING.CELEBRATE_HEART;
      return { expr: heart ? 'heart' : 'happy', gx: 0, gy: 0 };
    }
    case 'error':
      return { expr: 'cross', gx: 0, gy: 0 };
    case 'shy':
      return { expr: 'shy', gx: 0, gy: 0 };
    case 'sleepy':
      // The sleep sign: the logo, dimmed and breathing slowly.
      return { expr: 'logo', gx: 0, gy: 0, level: breathe(c, 0.28, 0.2) };
    case 'hidden':
      return { expr: 'off', gx: 0, gy: 0 };
  }
}

/** The body: down (+) or up (−) in px, rotation in degrees, squash, and the screen's brightness. */
export interface Motion {
  y: number;
  rot: number;
  sx: number;
  sy: number;
  dim: number;
}
export const REST: Motion = { y: 0, rot: 0, sx: 1, sy: 1, dim: 1 };

/** A quick up-and-back over `len` seconds (0 → 1 → 0), for hops, dips and nods. */
const pulse = (age: number, len: number) => (age >= 0 && age < len ? Math.sin((Math.PI * age) / len) : 0);
/** Eases in over `len` seconds and holds. */
const settle = (u: number, len: number) => sm(cl(u / len));

export function motionFor(state: IrisState, c: Cues): Motion {
  if (c.reduced) return { ...REST, dim: state === 'shy' ? 0.6 : 1 };
  const { u } = c;
  switch (state) {
    case 'standby':
      return { ...REST, y: 0.6 * Math.sin((TAU * u) / TIMING.LOGO_BREATH) };
    case 'idle':
      // A 2 px bob every 2 s, leaning up to 5° toward the pointer.
      return { ...REST, y: Math.sin((TAU * u) / 2), rot: 5 * c.tilt };
    case 'listening':
      // A 3 px hop on each key.
      return { ...REST, y: -3 * pulse(c.keyAge, 0.22) };
    case 'searching':
      return { ...REST, y: -6 * settle(u, 0.4), rot: 2 * Math.sin(TAU * 0.6 * u) };
    case 'thinking':
      return { ...REST, y: -6 * settle(u, 0.4), rot: 3 * Math.sin(TAU * 1.4 * u) };
    case 'responding':
      // A gentle bob, and a 2 px dip for each chunk that streams in.
      return { ...REST, y: 0.8 * Math.sin((TAU * u) / 1.6) + 2 * pulse(c.chunkAge, 0.18) };
    case 'success':
      return c.celebrate ? jump(u) : { ...REST, y: 8 * pulse(u, 0.5) };
    case 'error':
      // Shakes "no" and drops 6 px.
      return { ...REST, y: 6 * settle(u, 0.25), rot: 9 * Math.sin(u * TAU * 2.2) * Math.exp(-2.2 * u) };
    case 'shy':
      return { ...REST, y: 8 * settle(u, 0.3), dim: 0.6 };
    case 'sleepy':
      // Sinks 12 px slowly and breathes.
      return { ...REST, y: 12 * settle(u, 1.6) + 0.6 * Math.sin((TAU * u) / 3.2) };
    case 'hidden':
      return REST;
  }
}

/** A 24 px jump: crouch with a 5% squash, the arc, then the same squash on landing. */
function jump(u: number): Motion {
  const crouch = pulse(u, 0.16);
  const land = pulse(u - 0.66, 0.16);
  const squash = Math.max(crouch, land) * 0.05;
  const air = u >= 0.14 && u < 0.68 ? Math.sin((Math.PI * (u - 0.14)) / 0.54) : 0;
  return { ...REST, y: -24 * air + 2 * squash * 20, sx: 1 + squash, sy: 1 - squash };
}

export type LightTone = 'listen' | 'think' | 'success' | 'error';

/** The ear lights: a colour (or a blend of two) and how bright. */
export interface Light {
  from: LightTone;
  to: LightTone;
  mix: number;
  opacity: number;
}
const OFF: Light = { from: 'listen', to: 'listen', mix: 0, opacity: 0 };
const steady = (tone: LightTone, opacity = 1): Light => ({ from: tone, to: tone, mix: 0, opacity });

export function lightFor(state: IrisState, c: Cues): Light {
  const { u } = c;
  const pulseAt = (hz: number) => (c.reduced ? 1 : 0.6 + 0.4 * Math.sin(TAU * hz * u));
  switch (state) {
    case 'listening':
      return steady('listen');
    case 'searching':
      return steady('think', pulseAt(1.2));
    case 'thinking':
      return steady('think', pulseAt(2.4));
    case 'responding':
      // Blue turning mint as the answer arrives.
      return { from: 'think', to: 'listen', mix: sm(cl(u / 0.6)), opacity: 1 };
    case 'success':
      return steady('success', 1 - cl((u - TIMING.SUCCESS_LIGHT_HOLD) / TIMING.SUCCESS_LIGHT_FADE));
    case 'error':
      return steady('error', cl(u / TIMING.ERROR_LIGHT_IN));
    default:
      return OFF;
  }
}
