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
// basePath makes Pixi resolve them against the assets root regardless of the current route —
// otherwise a page at /games/... would resolve them against the page URL and 404 (e.g. /games/games/..).
//
// Assets are served from the app host by default. To decouple asset hosting from the app deploy (host
// them on a dedicated CDN / object storage — recommended as the game count grows), set
// `VITE_ASSETS_BASE` to the assets root origin, e.g. `https://cdn.example.com/assets` (no trailing
// slash). Unset → identical to the previous behaviour.
const ASSETS_BASE =
  import.meta.env.VITE_ASSETS_BASE ?? `${import.meta.env.BASE_URL}assets`
const MANIFEST_URL = `${ASSETS_BASE}/manifest.json`

let initialized: Promise<void> | null = null

/**
 * The resolution tiers the pipeline actually emits. MUST match `.assetpack.js` (`resolutions`) and
 * `assetpack/sheetTiers.mjs` (`TIERS`) — Pixi matches this value EXACTLY (see `pickTier`), so a tier
 * listed here that no asset carries silently selects nothing.
 */
const TIERS = [1, 0.5, 0.25] as const

/** Longest edge of the source art. Everything is authored at 4K and only ever scaled down. */
const AUTHORED_LONGEST_EDGE = 3840

/** Devices reporting this much RAM (GiB) or less get one tier smaller than their screen implies. */
const LOW_MEMORY_GIB = 2

/**
 * `?tier=0.5` / `localStorage.tier = "0.5"` — pin a tier on a real device.
 *
 * The automatic choice below depends on screen size and reported RAM, neither of which can be faked in
 * devtools, so without this there is no way to check on the phone that is actually crashing whether it
 * picked the tier you think it did. Same switch-it-on-by-hand spirit as `components/dev/PerfOverlay`.
 */
function tierOverride(): number | null {
  try {
    const raw =
      new URLSearchParams(window.location.search).get('tier') ??
      window.localStorage.getItem('tier')
    const value = raw === null ? NaN : parseFloat(raw)
    return (TIERS as readonly number[]).includes(value) ? value : null
  } catch {
    return null // private-mode localStorage can throw; never let a debug switch break startup
  }
}

/**
 * Which resolution tier this device should load.
 *
 * Derived from the RENDERER's pixel budget against the size the art was authored at, because that ratio is
 * what decides whether a smaller tier is even visible. `App.tsx` caps the renderer at
 * `min(devicePixelRatio, 2)`, so that same cap has to apply here or we would size against pixels that are
 * never drawn. Both edges are considered so the answer does not change when the device rotates.
 *
 *   390x844  @dpr3 -> 1688/3840 = 0.44 -> 0.5   (phone: half-resolution art is still oversampled)
 *   1024x1366@dpr2 -> 2732/3840 = 0.71 -> 1
 *   1920x1080@dpr1 -> 1920/3840 = 0.50 -> 0.5
 *   1512x982 @dpr2 -> 3024/3840 = 0.79 -> 1
 *
 * We take the SMALLEST tier that still meets the ratio, so art is never upscaled — a tier is only chosen
 * when the device genuinely cannot show the detail in the one above it.
 *
 * The memory step-down is separate on purpose: a cheap phone can pair a dense screen with very little RAM,
 * and this whole tiering exists because the GPU runs out of room, not because the screen is small. Stepping
 * down one tier rather than jumping straight to the smallest keeps it proportionate to the device.
 */
function pickTier(): number {
  const override = tierOverride()
  if (override !== null) return override

  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const longestEdge = Math.max(window.innerWidth, window.innerHeight) * dpr
  const ratio = longestEdge / AUTHORED_LONGEST_EDGE

  const ascending = [...TIERS].sort((a, b) => a - b)
  let tier = ascending.find((t) => t >= ratio) ?? 1

  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory
  if (memory !== undefined && memory <= LOW_MEMORY_GIB) {
    tier = ascending[Math.max(0, ascending.indexOf(tier) - 1)]
  }

  return tier
}

/**
 * Initialise the Assets system with the generated manifest. Fetches only the manifest JSON —
 * no textures/audio yet. Safe to call multiple times (memoised).
 */
export function initAssets(): Promise<void> {
  initialized ??= Assets.init({
    manifest: MANIFEST_URL,
    basePath: ASSETS_BASE,
    // Pixi treats this as an EXACT-VALUE FILTER, not a nearest match: it keeps only the variants whose
    // resolution equals one of these, and if none do it falls through to the first `src` entry
    // (Resolver.resolve). Two consequences worth spelling out, both of which have bitten this file:
    //
    //   * Pass a number that is not a real tier and the preference does NOTHING. The previous
    //     `Math.min(devicePixelRatio, 2)` was exactly that — 2 matches none of 1/0.5/0.25 — so dpr-1
    //     desktops got full 4K art while retina phones silently got whatever `src[0]` happened to be.
    //   * Pass FALLBACK values and they narrow rather than back off. A plain `.json` carries no
    //     resolution at all (`resolveJsonUrl` only tests names with a retina prefix), so asking for
    //     `[1, 0.5]` matches nothing at 1, then matches `@0.5x` and returns the HALF-resolution sheet.
    //     Hence a single value, with `.assetpack.js` sorting full-resolution first for it to fall back to.
    texturePreference: { resolution: [pickTier()] },
  })
  return initialized
}

/** The tier in use, for the perf overlay / debugging. */
export const activeTier = (): number => pickTier()

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
