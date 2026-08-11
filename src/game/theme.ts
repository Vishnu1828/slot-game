import type {
  Edges,
  ReelArt,
  ReelExtraAnim,
  SpinButtonArt,
  SymbolArt,
  ThemeAssets,
  WinAnimation,
  WinAnimationArt,
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
  winFrame: "win/win_popup_frame",
};

/**
 * Bitmap-font FACE name for win/celebration text. NOT a path and NOT game-scoped: Pixi installs a
 * bitmap font under the `face` name baked into its `.fnt`, so this must match that string exactly
 * (`win_font.fnt` declares `info face="win_font"`). A game overrides it by shipping its own `.fnt`
 * with a different face and passing that name.
 */
const FONT_DEFAULT = "win_font";

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
  /**
   * SymbolId → art. `asset` is a bare atlas frame name; `bounce`/`winning` are sheet base names
   * relative to `games/<id>/win/<id>-win/` and get scoped by makeTheme.
   */
  symbols?: Record<string, SymbolArt>;
  /** Reel playfield overrides (frame/bg paths get game-scoped; animation sheets stay bare). */
  reel?: ReelOverride;
  winFrame?: string;
  /** Celebration animation behind the win frame; sheet names get game-scoped by makeTheme. */
  winAnimation?: WinAnimationArt;
  font?: string;
}

/**
 * Game-scope each symbol's ANIMATION SHEET names while leaving its still atlas frame bare.
 *
 * The sheets are referenced path-scoped rather than by bare basename on purpose: the bare shortcut is
 * global across every loaded bundle, and AssetPack *silently drops* a shortcut two assets both claim — so
 * a second game shipping its own `crystal_winning` would make the alias vanish with no error at all.
 * `PixiGameAnimation` appends `.json`/`.png`, and the path-scoped extension-qualified aliases exist, so a
 * scoped base name resolves unchanged.
 */
/**
 * Where a game's win-presentation sheets live: `games/<id>/win/<id>-win/`.
 *
 * The `{m}` on that folder makes it its OWN AssetPack bundle, deliberately NOT part of the game
 * bundle, so `loadGame` doesn't pull hundreds of MB of celebration art into memory before a single
 * spin — the sheets are fetched per win instead (see `src/game/winAssets.ts`).
 *
 * The folder name carries the game id because AssetPack names a bundle after its folder BASENAME and
 * ignores the path (`nameStyle: 'short'`). A shared name like `animation-win` in every game builds
 * fine, but each extra game emits a "Duplicate bundle name" warning and AssetPack rewrites them all to
 * relative names — so the bundle's name would change shape the day a second game shipped. Prefixing
 * with the id keeps it unique, stable and warning-free.
 */
export const winAnimPath = (gameId: string, rel: string) =>
  `games/${gameId}/win/${gameId}-win/${rel}`;

/**
 * Expand a win animation's sheet declaration into the scoped aliases `PixiGameAnimation` resolves.
 * `sheets: n` means the sequence is split across `${sheet}-0` … `${sheet}-${n-1}`; omitting it (or
 * `1`) means the whole thing is one sheet. The player pools and re-orders them by frame number, so
 * the count is the only thing a game with differently-sliced art has to change.
 */
const scopeWinAnimation = (
  gameId: string,
  a?: WinAnimationArt,
): WinAnimation | undefined => {
  if (!a) return undefined;
  const { sheet, sheets = 1, ...rest } = a;
  const names =
    sheets > 1
      ? Array.from({ length: sheets }, (_, i) => `${sheet}-${i}`)
      : [sheet];
  return { ...rest, sheets: names.map((n) => winAnimPath(gameId, n)) };
};

const scopeSymbols = (
  gameId: string,
  symbols: Record<string, SymbolArt> = {},
): Record<string, SymbolArt> => {
  const winAnim = (rel: string) => winAnimPath(gameId, rel);
  return Object.fromEntries(
    Object.entries(symbols).map(([id, art]) => [
      id,
      {
        ...art,
        ...(art.bounce ? { bounce: winAnim(art.bounce) } : {}),
        ...(art.winning ? { winning: winAnim(art.winning) } : {}),
      },
    ]),
  );
};

/**
 * Build a game's ThemeAssets. LOOSE images (header, backgrounds) are GAME-SCOPED to
 * `games/<id>/<path>` so their aliases never collide across games; atlas frames (spin, symbol `asset`)
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
    symbols: scopeSymbols(gameId, o.symbols),
    winFrame: scope(o.winFrame ?? LOOSE_DEFAULTS.winFrame),
    winAnimation: scopeWinAnimation(gameId, o.winAnimation),
    font: o.font ?? FONT_DEFAULT, // bare face name — never scoped (see FONT_DEFAULT)
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
