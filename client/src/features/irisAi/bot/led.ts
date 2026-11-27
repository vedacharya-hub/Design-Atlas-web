/**
 * The face: a 19 × 14 LED matrix on a 164 × 124 screen. Two eyes, each a 7 × 9 bitmap, at columns 2 and 10.
 * bitmap() lights a matrix for one expression (shifted by the gaze), drawLED() cross-fades two matrices dot by dot.
 */
import { L, TAU, cl, hash, sm } from "./math";

export const COLS = 19;
export const ROWS = 14;
const PITCH = 8;
const DOT = 5.4;
const RADIUS = 1.8;
const GLOW_R = 4.2;
const OX = (164 - (COLS - 1) * PITCH) / 2;
const OY = (124 - (ROWS - 1) * PITCH) / 2;
export const SCREEN = { w: 164, h: 124, dpr: 2 };
const UNLIT = "rgba(255,255,255,.04)";
const LIT = (v: number) => `rgba(246,244,236,${v})`;
const GLOW = (v: number) => `rgba(220,255,236,${v * 0.8})`;

export type Expr =
  | "idle" | "blink" | "read" | "star" | "heart" | "happy"
  | "sleepy" | "shy" | "cross" | "load" | "off";

const E: Record<Exclude<Expr, "load">, string[]> = {
  idle: ["..###..", ".#####.", "#######", "#######", "#######", "#######", ".#####.", "..###..", "......."],
  blink: [".......", ".......", ".......", ".......", "#######", ".......", ".......", ".......", "......."],
  read: [".......", ".......", ".......", ".#####.", "#######", "#######", ".#####.", ".......", "......."],
  star: ["...#...", "...#...", "..###..", "#######", "..###..", "..#.#..", ".#...#.", ".......", "......."],
  heart: [".......", ".##.##.", "#######", "#######", ".#####.", "..###..", "...#...", ".......", "......."],
  happy: [".......", ".......", "..###..", ".#...#.", "#.....#", ".......", ".......", ".......", "......."],
  sleepy: [".......", ".......", ".......", ".......", ".......", "#######", ".#####.", ".......", "......."],
  shy: [".......", ".......", ".......", ".......", ".#####.", "#######", ".......", ".......", "......."],
  cross: ["#.....#", ".#...#.", "..#.#..", "...#...", "..#.#..", ".#...#.", "#.....#", ".......", "......."],
  off: [".......", ".......", ".......", ".......", ".......", ".......", ".......", ".......", "......."],
};
const RING: [number, number][] = [
  [3, 1], [5, 2], [6, 4], [5, 6], [3, 7], [1, 6], [0, 4], [1, 2],
];
const EYE_COLS = [2, 10];

export function bitmap(name: Expr, gx: number, gy: number, t: number, mask?: [number, number]) {
  const g = new Float32Array(COLS * ROWS);
  EYE_COLS.forEach((ex, ei) => {
    if (mask && mask[ei]) return;
    if (name == "load") {
      RING.forEach(([c, r], j) => {
        const ph = (((j / 8 - t * 1.6) % 1) + 1) % 1,
          v = 0.25 + 0.75 * Math.pow(1 - ph, 3);
        g[(3 + r) * COLS + ex + c] = v;
      });
      return;
    }
    const b = E[name];
    for (let r = 0; r < 9; r++)
      for (let c = 0; c < 7; c++)
        if (b[r][c] == "#") {
          const x = ex + c + gx,
            y = 2 + r + gy;
          if (x >= 0 && x < COLS && y >= 0 && y < ROWS) g[y * COLS + x] = 1;
        }
  });
  return g;
}

export function drawLED(led: CanvasRenderingContext2D, glow: CanvasRenderingContext2D, A: Float32Array, B: Float32Array, k: number) {
  [led, glow].forEach((c) => {
    c.setTransform(SCREEN.dpr, 0, 0, SCREEN.dpr, 0, 0);
    c.clearRect(0, 0, SCREEN.w, SCREEN.h);
  });
  for (let y = 0; y < ROWS; y++)
    for (let x = 0; x < COLS; x++) {
      const i = y * COLS + x,
        kk = sm(cl((k - hash(i) * 0.4) / 0.6)),
        v = L(A[i], B[i], kk),
        px = OX + x * PITCH,
        py = OY + y * PITCH;
      led.fillStyle = UNLIT;
      led.beginPath();
      led.roundRect(px - DOT / 2, py - DOT / 2, DOT, DOT, RADIUS);
      led.fill();
      if (v > 0.01) {
        led.fillStyle = LIT(v);
        led.beginPath();
        led.roundRect(px - DOT / 2, py - DOT / 2, DOT, DOT, RADIUS);
        led.fill();
        glow.fillStyle = GLOW(v);
        glow.beginPath();
        glow.arc(px, py, GLOW_R, 0, TAU);
        glow.fill();
      }
    }
}

const FIXED: Expr[] = ["sleepy", "happy", "heart", "star", "load", "shy", "cross"];
export const free = (n: Expr) => !FIXED.includes(n);
