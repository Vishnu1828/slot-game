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

/**
 * All the art for one reel symbol. `asset` is the still frame the reels scroll; the two optional sheets
 * are the win presentation's beats. Both are optional and independently so — a symbol with no `winning`
 * sheet simply stays static during the glow, and one with no `bounce` sheet gets a code-driven squash.
 */
export interface SymbolArt {
  /** Still atlas FRAME name (bare, from `symbols{tps}`) — what the reels scroll. */
  asset: string;
  /** Bounce sheet base name (no extension), game-scoped by `makeTheme`. */
  bounce?: string;
  /** Winning sheet base name (no extension), game-scoped by `makeTheme`. */
  winning?: string;
  /**
   * Render box as a multiple of the cell box, per animation. The sheets are authored larger than the
   * still symbol (e.g. 391 vs 280) so an effect can overshoot the cell; without this the animation would
   * be squeezed into the still symbol's footprint and the overshoot would be lost. Default 1.
   */
  bounceSizeFrac?: number;
  winningSizeFrac?: number;
}

/**
 * The celebration animation that plays behind the win frame. Declared per game because the art
 * differs in every way that matters: a sequence may ship as one sheet or be split across many (this
 * game's is 80 frames over 10), and its frame count and aspect are the artist's call, not ours.
 * Nothing here is a frame count — playback is driven by `durationMs`, so a re-export with more or
 * fewer frames needs no code change.
 */
export interface WinAnimationArt {
  /** Sheet base name, relative to `games/<id>/win/<id>-win/`. Game-scoped by `makeTheme`. */
  sheet: string;
  /**
   * How many numbered sheets the sequence spans: `${sheet}-0` … `${sheet}-${sheets-1}`. Omit (or 1)
   * when the whole sequence is a single sheet named `sheet`.
   */
  sheets?: number;
  /** Named animation inside the sheet, when the export declares one. Omit → numeric frame order. */
  animation?: string;
  /** Aspect (width / height) of one frame's source size — the sprite is sized to match. */
  aspect: number;
  /** Animation width as a multiple of the win-frame panel width. Default 1. */
  widthFrac?: number;
  /** Centre offset from the panel centre, in panel HEIGHTS. Negative moves it up. Default 0. */
  offsetYFrac?: number;
  /** One full pass in ms. Defaults to the popup's scale-in + count-up, so both land together. */
  durationMs?: number;
}

/** `WinAnimationArt` after `makeTheme` — `sheet`/`sheets` resolved to game-scoped sheet aliases. */
export type WinAnimation = Omit<WinAnimationArt, "sheet" | "sheets"> & {
  sheets: string[];
};

export interface ThemeAssets {
  background_h: string;
  background_v: string;
  header: string;
  spin: SpinButtonArt;
  /** SymbolId → all of that symbol's art. Keys MUST match the ids in the game's `math.ts`. */
  symbols: Record<string, SymbolArt>;
  reel: ReelArt;
  winFrame: string;
  /** Celebration animation behind the win frame. Omit → the popup shows the frame alone. */
  winAnimation?: WinAnimation;
  font: string;
}
