import { Assets, type ProgressCallback, type UnresolvedAsset } from 'pixi.js'

/**
 * Runtime asset loading for the multi-game shell.
 *
 * AssetPack (see /.assetpack.js) produces `public/assets/manifest.json` at build time, listing
 * every bundle and, per asset, all resolution variants (@0.5x / @0.25x). We only ever fetch the
 * tiny manifest up front; the heavy bundles are pulled on demand, so a player only ever downloads
 * the resolution tier their device needs and only the assets for the game they open.
 *
 * Bundle names come from the `{m}`-tagged folders in raw-assets:
 *   'common', '<game>', '<game>-preload' (the preload bundle is nested inside its game folder)
 */

// AssetPack writes asset `src` paths RELATIVE to public/assets/ (e.g. "games/lucky-slots/..").
// basePath makes Pixi resolve them against /assets/ regardless of the current route — otherwise
// a page at /games/... would resolve them against the page URL and 404 (e.g. /games/games/..).
const ASSETS_BASE = `${import.meta.env.BASE_URL}assets`
const MANIFEST_URL = `${ASSETS_BASE}/manifest.json`

let initialized: Promise<void> | null = null

/**
 * Initialise the Assets system with the generated manifest. Fetches only the manifest JSON —
 * no textures/audio yet. Safe to call multiple times (memoised).
 */
export function initAssets(): Promise<void> {
  initialized ??= Assets.init({
    manifest: MANIFEST_URL,
    basePath: ASSETS_BASE,
    // Cap the resolution we ever request so hi-DPI phones don't pull the 4K tier needlessly.
    // Pixi picks, per asset, the variant whose resolution best matches this value.
    texturePreference: { resolution: Math.min(window.devicePixelRatio || 1, 2) },
  })
  return initialized
}

/**
 * Load a game's loading-screen assets (the `<game>-preload` bundle, nested inside the game
 * folder). Call this first so the loading screen can paint before the larger game bundle arrives.
 */
export async function loadPreload(game: string, onProgress?: ProgressCallback): Promise<void> {
  await initAssets()
  await Assets.loadBundle(`${game}-preload`, onProgress)
}

/**
 * Load a game's full asset set: shared `common` bundle + the game's own bundle. Reports 0..1
 * progress for the loading bar. Assets for other games are never fetched.
 */
export async function loadGame(game: string, onProgress?: ProgressCallback): Promise<void> {
  await initAssets()
  await Assets.loadBundle(['common', game], onProgress)
}

/** Free the loading-screen art once the game is shown (those textures aren't needed anymore). */
export async function unloadPreload(game: string): Promise<void> {
  await Assets.unloadBundle(`${game}-preload`)
}

/** Free a game's GPU/CPU memory when leaving it (keeps `common` resident). */
export async function unloadGame(game: string): Promise<void> {
  await Assets.unloadBundle(game)
}

/** Escape hatch for loading an ad-hoc list of aliases outside the bundle flow. */
export async function loadAssets(
  aliases: string | string[] | UnresolvedAsset | UnresolvedAsset[],
  onProgress?: ProgressCallback,
): Promise<void> {
  await initAssets()
  await Assets.load(aliases, onProgress)
}
