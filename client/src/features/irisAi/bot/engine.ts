/**
 * Iris Bot's frame loop: one requestAnimationFrame while the bot is on screen. Each frame reads the
 * controller, picks the eyes and gaze, cross-fades the LED face dot by dot, composes the body motion
 * and sets the ear lights. Everything runs on elapsed seconds, never frame counts.
 */
import type { IrisController } from './controller';
import { bitmap, drawLED, free, SCREEN, type Expr } from './led';
import { screenBitmap } from './screens';
import { L, cl, sm } from './math';
import { faceFor, lightFor, motionFor, REST, TIMING, type Cues, type Face, type LightTone, type Motion } from './states';

export interface EngineParts {
  controller: IrisController;
  /** Takes the body transform; its pivot is the bottom centre. */
  body: HTMLElement;
  /** Takes the summon / dismiss fade. */
  fade: HTMLElement;
  /** Dims for `shy`. */
  screen: HTMLElement;
  lights: HTMLElement[];
  led: HTMLCanvasElement;
  glow: HTMLCanvasElement;
  /** Called every frame before drawing: keeps the bot where it belongs (an anchor, a corner). */
  place?: () => void;
  /** The dismiss has finished: unmount. */
  onDismissed: () => void;
}

const now = () => performance.now() / 1000;
const rand = (a: number, b: number) => a + Math.random() * (b - a);

/** Ease out with a small overshoot (about 10%: 4 px on the 40 px rise). */
const backOut = (p: number) => {
  const c = 1.70158;
  return 1 + (c + 1) * Math.pow(p - 1, 3) + c * Math.pow(p - 1, 2);
};

function readTones(): Record<LightTone, [number, number, number]> {
  const css = getComputedStyle(document.documentElement);
  const rgb = (name: string, fallback: string): [number, number, number] => {
    const hex = (css.getPropertyValue(name).trim() || fallback).replace('#', '');
    const n = parseInt(hex.length === 3 ? hex.replace(/./g, (c) => c + c) : hex, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  return {
    listen: rgb('--iris-listen', '#8ff0c2'),
    think: rgb('--iris-think', '#8ab4ff'),
    success: rgb('--iris-success', '#5fe3a1'),
    error: rgb('--iris-error', '#ff6b61'),
  };
}

export function startEngine(parts: EngineParts): () => void {
  const { controller, body, fade, screen, lights, led, glow } = parts;
  led.width = glow.width = SCREEN.w * SCREEN.dpr;
  led.height = glow.height = SCREEN.h * SCREEN.dpr;
  const ledCtx = led.getContext('2d');
  const glowCtx = glow.getContext('2d');
  if (!ledCtx || !glowCtx) return () => {};

  const media = window.matchMedia('(prefers-reduced-motion: reduce)');
  const tones = readTones();

  // The pointer, for the gaze and the tilt.
  let pointer: { x: number; y: number } | null = null;
  const onPointer = (e: PointerEvent) => {
    pointer = { x: e.clientX, y: e.clientY };
    controller.activity();
  };
  const onKey = () => controller.activity();
  window.addEventListener('pointermove', onPointer, { passive: true });
  window.addEventListener('pointerdown', onPointer, { passive: true });
  window.addEventListener('keydown', onKey);

  // The face: the expression fading out, the one fading in, and when the fade began.
  let from: Face = { expr: 'off', gx: 0, gy: 0 };
  let to: Face = { expr: 'off', gx: 0, gy: 0 };
  let fadeAt = now();
  let nextBlink = now() + rand(TIMING.BLINK_MIN, TIMING.BLINK_MAX);
  let blinkUntil = -Infinity;
  let gaze = { x: 0, y: 0 };
  let tilt = 0;
  // Motion and light ease from wherever they were when the state changed.
  let lastMotion: Motion = REST;
  let motionFrom: Motion = REST;
  let lightState = { rgb: tones.listen, opacity: 0 };
  let seenChange = -1;
  let lastT = now();
  let raf = 0;
  let stopped = false;

  const frame = () => {
    if (stopped) return;
    raf = requestAnimationFrame(frame);
    if (document.hidden) return;
    const t = now();
    const dt = Math.min(0.1, t - lastT);
    lastT = t;
    const reduced = media.matches;
    const s = controller.snapshot();
    parts.place?.();

    if (s.changedAt !== seenChange) {
      seenChange = s.changedAt;
      motionFrom = lastMotion;
    }

    // Gaze and tilt follow the pointer from the bot's own centre.
    const box = body.getBoundingClientRect();
    if (pointer) {
      const dx = pointer.x - (box.left + box.width / 2);
      const dy = pointer.y - (box.top + box.height / 2);
      const d = Math.hypot(dx, dy) || 1;
      const reach = Math.min(1, d / 200) * 2.4;
      const k = 1 - Math.exp(-dt * 10);
      gaze = { x: L(gaze.x, (dx / d) * reach, k), y: L(gaze.y, (dy / d) * reach, k) };
      tilt = L(tilt, Math.max(-1, Math.min(1, dx / 320)), 1 - Math.exp(-dt * 4));
    }

    const u = t - s.changedAt;
    const cues: Cues = { u, gaze, tilt, caret: s.caret, keyAge: t - s.keyAt, chunkAge: t - s.chunkAt, celebrate: s.celebrate, reduced };

    // ----- face -----
    const summonU = t - s.summonAt;
    const dismissU = s.state === 'hidden' ? t - s.dismissAt : -1;
    // Waking from the logo: it glows up, dissolves into "hi!", blinks, and the eyes take over.
    const wakeU = t - s.wakeAt;
    const wakeHi = TIMING.WAKE_GLOW + TIMING.WAKE_HI;
    const waking = wakeU >= 0 && wakeU < wakeHi + TIMING.WAKE_BLINK;
    let glowLevel = 0.75;
    let want: Face = faceFor(s.state, cues);
    if (dismissU >= 0) want = { expr: dismissU < TIMING.BLINK_HOLD ? 'blink' : 'off', gx: 0, gy: 0 };
    // Summon powers on to the logo (the welcome screen), dot by dot.
    else if (summonU < 0.12) want = { expr: 'off', gx: 0, gy: 0 };
    else if (waking) {
      if (wakeU < TIMING.WAKE_GLOW) {
        const p = sm(cl(wakeU / TIMING.WAKE_GLOW));
        want = { expr: 'logo', gx: 0, gy: 0, level: L(0.9, 1.4, p) };
        glowLevel = L(0.75, 1, p);
      } else if (wakeU < wakeHi) {
        want = { expr: 'hi', gx: 0, gy: 0, level: 1 };
        glowLevel = L(1, 0.75, sm(cl((wakeU - TIMING.WAKE_GLOW) / 0.6)));
      } else want = { expr: 'blink', gx: 0, gy: 0 };
    } else if (s.state === 'idle') {
      if (t >= nextBlink) {
        blinkUntil = t + TIMING.BLINK_HOLD;
        nextBlink = blinkUntil + rand(TIMING.BLINK_MIN, TIMING.BLINK_MAX);
      }
      if (t < blinkUntil) want = { expr: 'blink', gx: 0, gy: 0 };
    }
    if (want.expr !== to.expr) {
      from = to;
      fadeAt = t;
    }
    to = want;
    const blink = from.expr === 'blink' || to.expr === 'blink';
    const k = reduced ? 1 : blink ? cl((t - fadeAt) / TIMING.BLINK_FADE) * 1.5 : cl((t - fadeAt) / TIMING.CROSSFADE);
    // Free expressions move by whole dots toward the gaze; the others stay centred.
    const at = (f: Face) => {
      if (f.expr === 'logo' || f.expr === 'hi') return screenBitmap(f.expr, f.level ?? 1);
      const e: Expr = f.expr;
      return bitmap(e, free(e) ? Math.round(f.gx) : 0, free(e) ? Math.round(f.gy) : 0, t);
    };
    drawLED(ledCtx, glowCtx, at(from), at(to), k);
    glow.style.opacity = glowLevel.toFixed(3);

    // ----- body -----
    const target = s.state === 'hidden' ? REST : motionFor(s.state, cues);
    const b = reduced ? 1 : sm(cl(u / TIMING.MOTION_BLEND));
    const m: Motion = {
      y: L(motionFrom.y, target.y, b),
      rot: L(motionFrom.rot, target.rot, b),
      sx: L(motionFrom.sx, target.sx, b),
      sy: L(motionFrom.sy, target.sy, b),
      dim: L(motionFrom.dim, target.dim, b),
    };
    lastMotion = m;

    // Summon rises 40 px with a little overshoot; dismiss sinks 40 px. Reduced motion only fades.
    // A little start as it wakes.
    let lift = reduced || !waking ? 0 : -4 * Math.sin(Math.PI * cl(wakeU / 0.45));
    let opacity = 1;
    if (dismissU >= 0) {
      const len = reduced ? TIMING.REDUCED_FADE : TIMING.DISMISS;
      const p = cl(dismissU / len);
      opacity = 1 - p;
      if (!reduced) lift += 40 * sm(p);
      if (p >= 1) {
        stop();
        parts.onDismissed();
        return;
      }
    } else if (summonU < TIMING.SUMMON) {
      const len = reduced ? TIMING.REDUCED_FADE : TIMING.SUMMON;
      const p = cl(summonU / len);
      opacity = sm(p);
      if (!reduced) lift += 40 * (1 - backOut(p));
    }
    body.style.transform = `translateY(${(m.y + lift).toFixed(2)}px) rotate(${m.rot.toFixed(2)}deg) scale(${m.sx.toFixed(3)}, ${m.sy.toFixed(3)})`;
    fade.style.opacity = opacity.toFixed(3);
    screen.style.opacity = m.dim.toFixed(3);

    // ----- ear lights -----
    const light = s.state === 'hidden' ? { from: 'listen' as LightTone, to: 'listen' as LightTone, mix: 0, opacity: 0 } : lightFor(s.state, cues);
    const rgb = [0, 1, 2].map((i) => L(tones[light.from][i], tones[light.to][i], light.mix)) as [number, number, number];
    const ease = reduced ? 1 : 1 - Math.exp(-dt / (TIMING.LIGHT_BLEND / 3));
    lightState = {
      rgb: [0, 1, 2].map((i) => L(lightState.rgb[i], rgb[i], ease)) as [number, number, number],
      opacity: L(lightState.opacity, light.opacity, ease),
    };
    const color = `rgb(${lightState.rgb.map((v) => Math.round(v)).join(',')})`;
    for (const el of lights) {
      el.style.backgroundColor = color;
      el.style.opacity = lightState.opacity.toFixed(3);
      el.style.boxShadow = `0 0 6px 1px ${color}`;
    }
  };

  function stop() {
    stopped = true;
    cancelAnimationFrame(raf);
    window.removeEventListener('pointermove', onPointer);
    window.removeEventListener('pointerdown', onPointer);
    window.removeEventListener('keydown', onKey);
  }

  raf = requestAnimationFrame(frame);
  return stop;
}
