/**
 * Full-screen pictures for the 19 × 14 LED matrix, beside the eyes in led.ts: the WeWork "we" logo
 * in its circle (the welcome and sleep screen) and "hi!" (said when Iris wakes up).
 */
import { COLS, ROWS } from './led';

/**
 * The "we" logo: a thin ring at 60% and a bold, five-dot-tall "we" at full brightness, as in the
 * logo where the letters carry the weight. "#" is lit; a digit is that many tenths.
 */
const LOGO = [
  '.......66666.......',
  '.....66.....66.....',
  '....6.........6....',
  '...6...........6...',
  '..6.............6..',
  '..6.#...#..###..6..',
  '..6.#...#.#...#.6..',
  '..6.#.#.#.#####.6..',
  '..6.#.#.#.#.....6..',
  '..6..#.#...####.6..',
  '...6...........6...',
  '....6.........6....',
  '.....66.....66.....',
  '.......66666.......',
];

const HI = [
  '...................',
  '...................',
  '...................',
  '...#........#...#..',
  '...#............#..',
  '...#........#...#..',
  '...#.###...##...#..',
  '...##...#...#...#..',
  '...#....#...#...#..',
  '...#....#...#......',
  '...#....#..###..#..',
  '...................',
  '...................',
  '...................',
];

export type Screen = 'logo' | 'hi';
const ART: Record<Screen, string[]> = { logo: LOGO, hi: HI };

/** A screen's dots, lit to `brightness` (above 1 the glow blooms). */
export function screenBitmap(name: Screen, brightness = 1) {
  const g = new Float32Array(COLS * ROWS);
  const art = ART[name];
  for (let y = 0; y < ROWS; y++)
    for (let x = 0; x < COLS; x++) {
      const c = art[y][x];
      if (c === '#') g[y * COLS + x] = brightness;
      else if (c >= '1' && c <= '9') g[y * COLS + x] = (Number(c) / 10) * brightness;
    }
  return g;
}
