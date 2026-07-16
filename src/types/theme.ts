/**
 * Per-theme (per-game) asset descriptor. Maps logical UI "roles" to the atlas/loose aliases loaded
 * for that game, so generic components (Header, SpinButton, Reels, Paytable) render any theme just
 * by reading this — no per-game component code. Only the active game's bundle is loaded, so the
 * aliases below resolve to that theme's art.
 */

/** Textures for the spin button's states. `idle` is required; the rest fall back to `idle`. */
export interface SpinButtonArt {
  idle?: string;
  active?: string; // e.g. auto-spin engaged
  pressed?: string; // held down
  disabled?: string; // spin in progress / not allowed
}

export type CornerKey = "tl" | "tr" | "bl" | "br";

/** A decorative animation placed at a frame corner. `sizeFrac` is of the frame width. */
export interface ReelCornerAnim {
  sheet: string;
  sizeFrac: number;
  /** Pull the anim INWARD from the corner (toward center) by this fraction of the frame. Default 0. */
  inset?: number;
  animationSpeed?: number;
}

/** A decorative animation placed at an arbitrary spot on the frame (e.g. top-center). */
export interface ReelExtraAnim {
  sheet: string;
  /** Position as a fraction of the frame rect (0..1, top-left origin). */
  xFrac: number;
  yFrac: number;
  /** Width as a fraction of the frame width; height derived from `aspect`. */
  widthFrac: number;
  aspect: number; // width / height
  animationSpeed?: number;
}

export interface Edges {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Per-orientation reel art: the frame image, its bg, and the inner opening as insets of the frame. */
export interface ReelOrientation {
  /** Ornate frame image (loose, game-scoped alias). */
  frame: string;
  /** Purple reel background behind the symbols (loose, game-scoped alias). */
  bg: string;
  /** Inner grid opening as fractions of the frame art (where symbols sit). */
  inset: Edges;
  /**
   * Fractional expansion of the BG beyond the opening (fractions of frame w/h), to tuck the purple
   * under the frame's inner border so there's no gap. The symbol grid is NOT affected. Default 0.
   */
  bleed?: Edges;
}

/** Reel playfield descriptor — frame + bg + grid shape + decorative animations. Fully data-driven. */
export interface ReelArt {
  rows: number;
  cols: number;
  horizontal: ReelOrientation; // landscape / desktop
  vertical: ReelOrientation; // portrait
  /**
   * Corner animations: one sheet reused at all 4 corners, or a per-corner map — which may be a
   * SUBSET (e.g. only `tl` + `tr` for top corners; omitted corners get nothing).
   */
  corners?:
    | { sameForAll: ReelCornerAnim }
    | { perCorner: Partial<Record<CornerKey, ReelCornerAnim>> };
  /** Extra animations at arbitrary frame positions (e.g. top-center). */
  extraAnimations?: ReelExtraAnim[];
}

export interface ThemeAssets {
  background_h: string;
  background_v: string;
  header: string;
  spin: SpinButtonArt;
  symbols: Record<string, string>;
  reel: ReelArt;
}
