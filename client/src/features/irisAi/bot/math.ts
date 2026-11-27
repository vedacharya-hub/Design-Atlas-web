export const TAU = Math.PI * 2;
/** Clamp to 0 … 1 */
export const cl = (v: number) => Math.min(1, Math.max(0, v));
/** Linear interpolation from a to b by k */
export const L = (a: number, b: number, k: number) => a + (b - a) * k;
/** Smootherstep, for 0 … 1 */
export const sm = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
/** A fixed pseudo-random number in 0 … 1 for each integer i */
export const hash = (i: number) => {
  const s = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};
