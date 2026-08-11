/**
 * Timing for the post-spin win presentation, shared by the flow hook (`useWinPresentation`) and the
 * components it drives. Kept here rather than in either one so the glow's length and the moment the win
 * screen opens are the SAME number by construction and can never drift apart.
 *
 * These are milliseconds of PIXI TICKER time, not wall clock — every beat is driven by `deltaMS`, so the
 * whole presentation shares one clock with the animations inside it.
 */

/**
 * How long the winning symbols hit for, before the lines are drawn. Sized for the 14-frame bounce sheets
 * at ~30fps; keep it short — anything past ~500ms and players start hammering the spin button.
 */
export const BOUNCE_MS = 470;

/** How long winning lines glow before the win screen opens. */
export const PAYLINE_MS = 3500;

/** Bright→dim cycles fitted into that window (2 over 3.5s = a 1.75s breath each). */
export const PAYLINE_CYCLES = 2;
