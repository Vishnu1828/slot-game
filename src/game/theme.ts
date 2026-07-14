import type { SpinButtonArt, ThemeAssets } from "@/types/theme";

/**
 * LOOSE per-game images, given as paths RELATIVE to `games/<id>/`. makeTheme prefixes them with the
 * game id so the resulting aliases (e.g. `games/<id>/ui/logo`) are unique — short aliases like
 * "logo"/"bg_horizontal" would otherwise collide across the 20+ games in Pixi's global resolver.
 */
const LOOSE_DEFAULTS = {
  header: "ui/logo",
  background_h: "images/bg_horizontal",
  background_v: "images/bg_vertical",
};

/**
 * Atlas FRAME names for the spin button. Frames are looked up by name (not by path), so they are
 * NOT game-scoped — only the active game's atlas is loaded, so a bare frame name is unambiguous.
 */
const SPIN_DEFAULTS: SpinButtonArt = {
  idle: "spin_idle",
  active: "spin_active",
  pressed: "spin_pressed",
  disabled: "spin_disabled",
};

export interface ThemeOverrides {
  /** LOOSE image path relative to `games/<id>/` (default `ui/logo`). Gets game-scoped. */
  header?: string;
  /** LOOSE image paths relative to `games/<id>/` (default `images/bg_*`). Get game-scoped. */
  background_h?: string;
  background_v?: string;
  /** Atlas FRAME names (bare, not scoped). */
  spin?: Partial<SpinButtonArt>;
  symbols?: Record<string, string>;
}

/**
 * Build a game's ThemeAssets. LOOSE images (header, backgrounds) are GAME-SCOPED to
 * `games/<id>/<path>` so their aliases never collide across games; atlas frames (spin, symbols)
 * stay bare frame names. Games override only what differs from the defaults above.
 */
export const makeTheme = (gameId: string, o: ThemeOverrides = {}): ThemeAssets => {
  const scope = (rel: string) => `games/${gameId}/${rel}`;
  return {
    header: scope(o.header ?? LOOSE_DEFAULTS.header),
    background_h: scope(o.background_h ?? LOOSE_DEFAULTS.background_h),
    background_v: scope(o.background_v ?? LOOSE_DEFAULTS.background_v),
    spin: { ...SPIN_DEFAULTS, ...(o.spin ?? {}) },
    symbols: { ...(o.symbols ?? {}) },
  };
};
