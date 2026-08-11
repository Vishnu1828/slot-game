import type { LayoutMode } from "@/hooks/useScreen";

/**
 * Per-mode sizing POLICY for the reel frame (how big on each device — not which art). The frame is
 * fit inside a `widthFrac × heightFrac` box of the screen, preserving its texture aspect (like
 * Header), then centered at `x = w/2`, `y = centerYFrac * h`. Tune per mode.
 */
export interface ReelSizing {
  widthFrac: number; // max frame width as a fraction of screen width
  heightFrac: number; // max frame height as a fraction of screen height
  centerYFrac: number; // vertical center as a fraction of screen height
}

/**
 * Motion blur on a spinning reel — a vertical-only `BlurFilter` on each reel column.
 *
 * `BLUR_CELL_FRAC` is a fraction of CELL HEIGHT, so the smear stays proportional at any screen size.
 * Keep it small: symbols are drawn at `REEL_FILL` (0.86) of the cell, leaving only ~7% of a cell above
 * and below the art, and `Reels` renders one spare row above the grid but NONE below. A blur wider than
 * that gap samples transparency and fades the bottom row against the frame opening.
 *
 * Strength also scales with reel velocity, normalised against speed level 1 (`BLUR_REF_CELLS_PER_SEC`),
 * so "extra fast" smears harder than "normal" rather than every speed looking the same.
 */
export const BLUR_CELL_FRAC = 0.05;
export const BLUR_REF_CELLS_PER_SEC = 16;
/**
 * Ease in/out time (ms). A reel's `spinning` flag flips in a single frame when it lands, so reading it
 * raw would pop the blur off; this ramps it instead.
 */
export const BLUR_RAMP_MS = 120;

export const REEL: Record<LayoutMode, ReelSizing> = {
  desktop: { widthFrac: 0.7, heightFrac: 0.7, centerYFrac: 0.5 },
  "mobile-landscape": { widthFrac: 0.5, heightFrac: 0.7, centerYFrac: 0.48 },
  portrait: { widthFrac: 0.96, heightFrac: 0.5, centerYFrac: 0.48 },
};
