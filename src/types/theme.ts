/**
 * Per-theme (per-game) asset descriptor. Maps logical UI "roles" to the atlas/loose aliases loaded
 * for that game, so generic components (Header, SpinButton, Reels, Paytable) render any theme just
 * by reading this — no per-game component code. Only the active game's bundle is loaded, so the
 * aliases below resolve to that theme's art.
 */

/** Textures for the spin button's states. `idle` is required; the rest fall back to `idle`. */
export interface SpinButtonArt {
  idle: string;
  active?: string; // e.g. auto-spin engaged
  pressed?: string; // held down
  disabled?: string; // spin in progress / not allowed
}

export interface ThemeAssets {
  background_h: string;
  background_v: string;
  header: string;
  spin: SpinButtonArt;
  symbols: Record<string, string>;
}
