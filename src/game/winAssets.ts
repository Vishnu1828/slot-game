import { Assets } from "pixi.js";
import { hasAsset } from "@/utils/assets";
import type { ThemeAssets } from "@/types/theme";
import type { WinLine } from "@/game/math/types";

/**
 * WHICH win-presentation sheets to hold in memory, and WHEN.
 *
 * The celebration art dwarfs everything else a slot loads — for one game it is ~570 MB of decoded
 * texture against ~125 MB for the rest — and it all used to arrive with `loadGame`, before a single
 * spin. It doesn't need to: the beats run in sequence (bounce → payline glow → win popup), never
 * together, and a spin only ever lights the handful of symbols that actually won.
 *
 * So the sheets sit in their own bundle that nothing loads wholesale (see `winAnimPath`), and this
 * module fetches per win and frees per beat.
 *
 * Everything is derived from the THEME, so it is game-agnostic: a game declares its sheets in
 * `symbols[*].bounce` / `symbols[*].winning` and `winAnimation`, and gets this for free.
 */

/** Both files of a sheet — `PixiGameAnimation` resolves a base name through its `.json` and `.png`. */
const sheetFiles = (base: string) => [`${base}.json`, `${base}.png`];

const unique = (xs: string[]) => [...new Set(xs)];

const defined = (xs: (string | undefined)[]) =>
  unique(xs.filter((x): x is string => !!x));

/** Every bounce sheet in a theme. Small, and needed the instant the reels land. */
export const bounceSheets = (theme: ThemeAssets): string[] =>
  defined(Object.values(theme.symbols).map((s) => s.bounce));

/** Every winning-glow sheet in a theme — what gets freed once the glow beat is over. */
export const winningSheets = (theme: ThemeAssets): string[] =>
  defined(Object.values(theme.symbols).map((s) => s.winning));

/** The winning-glow sheets for just the symbols that paid on THIS spin. */
export const winningSheetsFor = (
  theme: ThemeAssets,
  wins: WinLine[],
): string[] => defined(wins.map((win) => theme.symbols[win.symbolId]?.winning));

/** The win-popup celebration sheets (one sequence, possibly split across several sheets). */
export const winPopupSheets = (theme: ThemeAssets): string[] =>
  theme.winAnimation?.sheets ?? [];

/**
 * Load sheets, skipping any already cached.
 *
 * Callers deliberately don't await this. A sheet that misses its beat degrades on its own — `hasSheet`
 * falls back to the code-driven bounce, and `PixiGameAnimation` renders nothing until its frames
 * resolve, leaving the symbol static — so a slow network costs an effect, never a stall. It self-heals
 * too: the next win finds the sheet cached.
 */
export async function ensureSheets(bases: string[]): Promise<void> {
  const missing = bases.filter((b) => !hasAsset(`${b}.json`));
  if (!missing.length) return;
  try {
    await Assets.load(missing.flatMap(sheetFiles));
  } catch {
    // Swallowed on purpose: the fallbacks above cover it and retrying next win is free.
  }
}

/** Free sheets and their GPU textures. Never-loaded aliases are skipped. */
export async function releaseSheets(bases: string[]): Promise<void> {
  const loaded = bases.filter((b) => hasAsset(`${b}.json`));
  if (!loaded.length) return;
  try {
    await Assets.unload(loaded.flatMap(sheetFiles));
  } catch {
    // Non-fatal: worst case Pixi's texture GC reclaims it after its idle window instead.
  }
}
