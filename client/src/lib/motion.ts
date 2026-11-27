import type { Transition } from 'motion/react';

/**
 * Animate UI's motion tokens (animate-ui.com), for the roles this app animates: one value per role,
 * so two things doing the same job move the same way. `@animate-ui/react` ships these from
 * '@animate-ui/react/utils/motion' but needs React 19; until the app moves to it, they live here.
 */

/** Enters or leaves: starts fast, so the interface answers on the first frame. */
export const ease = {
  out: [0.23, 1, 0.32, 1],
} as const satisfies Record<string, readonly [number, number, number, number]>;

export const spring = {
  /** Press feedback: there in ~120ms. */
  press: { type: 'spring', stiffness: 550, damping: 30, restSpeed: 10 },
  /** Making room for new content: quick, no overshoot. */
  reflow: { type: 'spring', stiffness: 500, damping: 40 },
} as const satisfies Record<string, Transition>;

export const transition = {
  /** Two icons or labels swapping in place. */
  swap: { duration: 0.15, ease: ease.out },
} as const satisfies Record<string, Transition>;

export const scale = {
  /** Anything pressed. */
  press: 0.97,
  /** An icon swapping for another grows from, and shrinks to, this. */
  icon: 0.5,
} as const;

export const blur = {
  /** Icons and short labels swapping in place: the overlap reads as one shape changing. */
  icon: 'blur(2px)',
} as const;
