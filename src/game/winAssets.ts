import { Assets, Spritesheet } from "pixi.js";
import { getAsset, hasAsset } from "@/utils/assets";
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

/**
 * Both files of a sheet. Only the `.json` is ever loaded DIRECTLY — see `loadSheet` for why loading the
 * `.png` as well would decode the same atlas a second time. Release still has to consider both, because a
 * custom-dialect sheet does load its atlas by alias.
 */
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
 * One promise chain per sheet, so a load and an unload of the SAME sheet can never overlap.
 *
 * They must not overlap, and skipping is not an acceptable way to achieve that. Pixi's `Assets.unload`
 * AWAITS an in-flight load and then destroys what it produced, while the load's own continuation has
 * already run `Cache.set` — leaving the alias cached and pointing at a destroyed `TextureSource`. That is
 * the "the winning symbol sometimes doesn't show" bug, and nothing ever removes the dead entry.
 *
 * An earlier fix here SKIPPED releases that collided with a load. That traded the corruption for a LEAK:
 * the release was dropped and never retried, so every glow a spin touched stayed resident. Eight symbols
 * later the whole set was in memory — around 97 MB of glows that should have been ~13 — which is why a
 * 4 GB device died after a few minutes of play rather than immediately.
 *
 * Chaining instead of skipping fixes both: a release simply waits its turn, then runs. Nothing is dropped,
 * and by the time the unload starts the load has fully settled, so `Cache.remove` finds the entry and
 * removes it properly.
 */
const chains = new Map<string, Promise<unknown>>();

/** Queue `op` behind anything already pending for `base`, whether that succeeded or failed. */
function serial<T>(base: string, op: () => Promise<T>): Promise<T> {
  const prev = chains.get(base) ?? Promise.resolve();
  const next = prev.then(op, op);
  // Store a non-rejecting link so one failure cannot poison every later operation on this sheet.
  chains.set(
    base,
    next.catch(() => undefined),
  );
  return next;
}

/**
 * Load ONE sheet's assets — the `.json`, plus its atlas only if the atlas is not already covered.
 *
 * A pre-baked TexturePacker sheet names its atlas inside itself (`meta.image`) and Pixi's spritesheet
 * loader fetches that file directly, bypassing the manifest and the resolver
 * (`spritesheetAsset`: `loader.load(basePath + asset.meta.image)`). Loading `<base>.png` as well therefore
 * decodes the SAME PIXELS A SECOND TIME under a different URL — and a different format, since the alias
 * carries a webp variant while `meta.image` names the png. Nothing reads that second copy:
 * `PixiGameAnimation` resolves these sheets through the `Spritesheet` and never looks at the `.png`.
 *
 * That doubled every byte of win art. Only the custom `sprites[]` dialect genuinely needs its atlas by
 * alias, so ask the loaded JSON which kind it is rather than assuming.
 */
async function loadSheet(base: string): Promise<void> {
  await Assets.load(`${base}.json`);
  if (!(getAsset(`${base}.json`) instanceof Spritesheet)) {
    await Assets.load(`${base}.png`);
  }
}

/**
 * Load sheets, skipping any already cached.
 *
 * Callers deliberately don't await this. A sheet that misses its beat degrades on its own — `hasSheet`
 * falls back to the code-driven bounce, and `PixiGameAnimation` renders nothing until its frames
 * resolve, leaving the symbol static — so a slow network costs an effect, never a stall. It self-heals
 * too: the next win re-requests anything that is missing or was destroyed under it.
 */
export async function ensureSheets(bases: string[]): Promise<void> {
  await Promise.all(
    unique(bases).map((base) =>
      serial(base, async () => {
        if (hasAsset(`${base}.json`)) return;
        try {
          await loadSheet(base);
        } catch {
          // Swallowed on purpose: the fallbacks above cover it and retrying next win is free.
        }
      }),
    ),
  );
}

/** Free sheets and their GPU textures. Never-loaded aliases are skipped. */
export async function releaseSheets(bases: string[]): Promise<void> {
  await Promise.all(
    unique(bases).map((base) =>
      serial(base, async () => {
        // Per FILE, not per sheet: a TexturePacker sheet never loaded its `.png` by alias, and unloading
        // an alias that was never loaded just makes Pixi warn.
        const files = sheetFiles(base).filter((f) => hasAsset(f));
        if (!files.length) return;
        try {
          await Assets.unload(files);
        } catch {
          // Non-fatal: worst case Pixi's texture GC reclaims it after its idle window instead.
        } finally {
          // Belt and braces against the interleaving described on `chains`: guarantee the alias is gone so
          // the next win re-fetches rather than rendering nothing forever.
          for (const f of files) {
            if (Assets.cache.has(f)) Assets.cache.remove(f);
          }
          // Say so, loudly, if a release did not actually release. A leak here is invisible by nature —
          // memory creeps up over several minutes of play and the tab dies far from the cause — and this
          // module has already shipped one (a release that collided with a load used to be dropped
          // silently). One check per beat is nothing next to another round of that.
          if (import.meta.env.DEV) {
            const stuck = sheetFiles(base).filter((f) => Assets.cache.has(f));
            if (stuck.length)
              console.warn(
                `[winAssets] ${base}: still resident after release — ${stuck.join(", ")}`,
              );
          }
        }
      }),
    ),
  );
}
