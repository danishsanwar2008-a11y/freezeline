import type { Transition } from "motion/react";

// Presenters often press ahead before a move finishes, so moves are springs that retarget from
// wherever they are. Slow, no overshoot: the deck should feel calm, not flashy.
export const sceneMove: Transition = { type: "spring", duration: 1.1, bounce: 0 };
export const quickFade: Transition = { duration: 0.45, ease: [0.2, 0, 0, 1] };

/** How long the map camera glides between shots (ms). */
export const CAMERA_MS = 2200;
/** How long the storm takes to sweep from calm to its worst hour (ms). */
export const STORM_SWEEP_MS = 7000;
