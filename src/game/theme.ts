import type {
  Edges,
  ReelArt,
  ReelExtraAnim,
  SpinButtonArt,
  ThemeAssets,
} from "@/types/theme";

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
  active: "spin_active",
  pressed: "spin_pressed",
  disabled: "spin_disabled",
};

/**
 * Reel playfield defaults. `frame`/`bg` are LOOSE image paths relative to `games/<id>/` (game-scoped
 * like the backgrounds); `inset` is the inner grid opening as fractions of the frame art (tune by eye
 * per frame). rows/cols = the symbol grid. No corner/extra animations by default.
 */
const REEL_DEFAULTS = {
  rows: 3,
  cols: 5,
  horizontal: {
    frame: "frame/reel_frame_horizontal",
    bg: "frame/reel_bg_horizontal",
    inset: { left: 0.06, top: 0.12, right: 0.06, bottom: 0.12 },
    bleed: { left: 0.007, top: 0.018, right: 0.005, bottom: 0.009 },
  },
  vertical: {
    frame: "frame/reel_frame_vertical",
    bg: "frame/reel_bg_vertical",
    inset: { left: 0.055, top: 0.11, right: 0.055, bottom: 0.11 },
    bleed: { left: 0.007, top: 0.018, right: 0, bottom: 0.011 },
  },
};

interface ReelOrientationOverride {
  frame?: string; // relative path; gets game-scoped
  bg?: string;
  inset?: Edges;
  bleed?: Edges;
}
export interface ReelOverride {
  rows?: number;
  cols?: number;
  horizontal?: ReelOrientationOverride;
  vertical?: ReelOrientationOverride;
  corners?: ReelArt["corners"];
  extraAnimations?: ReelExtraAnim[];
}

export interface ThemeOverrides {
  /** LOOSE image path relative to `games/<id>/` (default `ui/logo`). Gets game-scoped. */
  header?: string;
  /** LOOSE image paths relative to `games/<id>/` (default `images/bg_*`). Get game-scoped. */
  background_h?: string;
  background_v?: string;
  /** Atlas FRAME names (bare, not scoped). */
  spin?: Partial<SpinButtonArt>;
  symbols?: Record<string, string>;
  /** Reel playfield overrides (frame/bg paths get game-scoped; animation sheets stay bare). */
  reel?: ReelOverride;
}

/**
 * Build a game's ThemeAssets. LOOSE images (header, backgrounds) are GAME-SCOPED to
 * `games/<id>/<path>` so their aliases never collide across games; atlas frames (spin, symbols)
 * stay bare frame names. Games override only what differs from the defaults above.
 */
export const makeTheme = (
  gameId: string,
  o: ThemeOverrides = {},
): ThemeAssets => {
  const scope = (rel: string) => `games/${gameId}/${rel}`;
  const orient = (
    d: (typeof REEL_DEFAULTS)["horizontal"],
    ov?: ReelOrientationOverride,
  ) => ({
    frame: scope(ov?.frame ?? d.frame),
    bg: scope(ov?.bg ?? d.bg),
    inset: ov?.inset ?? d.inset,
    bleed: ov?.bleed ?? d.bleed,
  });
  const r = o.reel;
  return {
    header: scope(o.header ?? LOOSE_DEFAULTS.header),
    background_h: scope(o.background_h ?? LOOSE_DEFAULTS.background_h),
    background_v: scope(o.background_v ?? LOOSE_DEFAULTS.background_v),
    spin: { ...SPIN_DEFAULTS, ...(o.spin ?? {}) },
    symbols: { ...(o.symbols ?? {}) },
    reel: {
      rows: r?.rows ?? REEL_DEFAULTS.rows,
      cols: r?.cols ?? REEL_DEFAULTS.cols,
      horizontal: orient(REEL_DEFAULTS.horizontal, r?.horizontal),
      vertical: orient(REEL_DEFAULTS.vertical, r?.vertical),
      corners: r?.corners,
      extraAnimations: r?.extraAnimations,
    },
  };
};
