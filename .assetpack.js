import { pixiPipes } from '@assetpack/core/pixi'
import { createNewAssetAt } from '@assetpack/core'
import {
  prebakedSheetImageFixer,
  prebakedSheetTiers,
} from './assetpack/prebakedSheetTiers.mjs'

// Single 4K source art -> three downscaled tiers. AssetPack treats the source as the
// highest resolution and only ever scales DOWN, so no tier is ever upscaled (no blur).
//   default -> 4K (source, no @x suffix)
//   medium  -> 2K (@0.5x)
//   low     -> 1K (@0.25x)
const resolutions = { default: 1, medium: 0.5, low: 0.25 }

// Cache-bust (content-hashed filenames) ONLY for production builds (`AP_CACHEBUST=1`). In dev the
// filenames stay stable, so repacks don't pile up stale atlas files and the running app's loaded
// manifest never points at a renamed-away atlas (no vanishing icons on new uploads).
const cacheBust = process.env.AP_CACHEBUST === '1'

const pipes = pixiPipes({
  cacheBust, // hashed filenames in prod only (see above)
  resolutions, // fed to the mipmap pipe (loose images)
  compression: { png: true, jpg: true, webp: true },
  texturePacker: {
    // Same tiers for packed atlases; keep sheets within GPU limits.
    resolutionOptions: { resolutions, maximumTextureSize: 4096 },
    // removeFileExtension: frames are addressable as `info_idle` (not `info_idle.png`).
    texturePacker: { nameStyle: 'short', removeFileExtension: true, padding: 2, allowTrim: true },
  },
  audio: {}, // transcodes .wav/.mp3/.ogg -> .mp3 + .ogg
  manifest: {
    createShortcuts: true,
    trimExtensions: true,
    nameStyle: 'short',
    // Order each asset's `src` by resolution, HIGHEST FIRST. Pixi's resolver applies
    // `texturePreference.resolution` as an exact-value filter and falls back to `src[0]` when nothing
    // matches — and a plain (non-`@Nx`) `.json` carries NO resolution at all, because `resolveJsonUrl`
    // only tests names containing a retina prefix and `_buildResolvedAsset` does not default one. So a
    // device asking for tier 1 finds no match among the JSON variants and takes whatever is first;
    // full-resolution has to be that entry. AssetPack's default alphabetical sort puts `@0.5x` first,
    // which would quietly hand every device the half-resolution sheet.
    srcSortOptions: (srcs) =>
      srcs.sort((a, b) => resolutionOf(b) - resolutionOf(a) || pathOf(a).localeCompare(pathOf(b))),
  },
})

const pathOf = (entry) => (typeof entry === 'string' ? entry : entry.src)
/** `foo@0.5x.webp` -> 0.5; anything without a retina prefix is full resolution. */
const resolutionOf = (entry) => parseFloat(/@([\d.]+)x/.exec(pathOf(entry))?.[1] ?? '1')

// --- Pre-baked sprite-sheet resolution tiers ---
// The win/decor sheets are pre-baked outside AssetPack and tagged `{nomip}`, so the mipmap pipe never
// gives them `@0.5x`/`@0.25x` variants — leaving the heaviest art in the game (160 MB of win-popup frames
// alone) full-resolution on every device. These two pipes fill that gap; see
// ./assetpack/prebakedSheetTiers.mjs for why it takes two and why `{nomip}` has to stay.
//
// Placement is load-bearing:
//   * tiers BEFORE `compress`, so generated tiers are compressed and cache-busted like anything else.
//   * the image fixer AFTER `cache-buster`, because it patches `meta.image` to the renamed atlas.
const insertBefore = (name, ...added) => {
  const at = pipes.findIndex((p) => p.name === name)
  if (at === -1) throw new Error(`[.assetpack.js] expected a '${name}' pipe to order against`)
  pipes.splice(at, 0, ...added)
}

insertBefore('compress', prebakedSheetTiers())
insertBefore('pixi-manifest', prebakedSheetImageFixer())

// --- Pre-baked bitmap fonts (.fnt + .png) ---
// A bitmap font's .fnt stores glyph coordinates baked to its exact source .png and points at
// that .png by name (`file="..."`). So the atlas must survive the pipeline untouched:
//   * no mipmap / no compress -> tag the fonts folder {nomip}{nc} (handled by AssetPack itself).
//   * no cache-bust -> renaming the .png would break the .fnt's `file=` reference, and pixiPipes
//     ships no bitmap-font cache-bust mod. So below we make the cache-buster emit a *no-op* child
//     (same filename) for font assets: the transform chain the manifest walks stays intact, but
//     the .fnt and its .png keep stable names so the reference stays valid.
// (The same applies to MSDF fonts generated from a .ttf via msdfFont() — see docs/assets.md.)
const isBitmapFont = (asset) =>
  asset.extension === '.fnt' || /[\\/]fonts[^\\/]*[\\/]/.test(asset.path)

const cacheBuster = pipes.find((p) => p.name === 'cache-buster')
if (cacheBuster) {
  const originalTransform = cacheBuster.transform.bind(cacheBuster)
  cacheBuster.transform = async (asset, options) => {
    if (isBitmapFont(asset)) {
      const passthrough = createNewAssetAt(asset, asset.filename) // unchanged name
      passthrough.buffer = asset.buffer
      return [passthrough]
    }
    return originalTransform(asset, options)
  }
}

// --- Pre-baked TexturePacker sheets (.json + .png authored OUTSIDE AssetPack) ---
// A pre-baked sheet names its atlas INSIDE the JSON (`meta.image: "keys_bounce.png"`), and Pixi's
// spritesheet loader fetches that name relative to the JSON's own URL — it does NOT go back through the
// manifest (pixi.js spritesheetAsset: `loader.load(basePath + asset.meta.image)`). So the sheet issues a
// THIRD request beyond the manifest-resolved .json and .webp, for a filename the cache-buster renamed.
// Symptom: `keys_bounce-_fVswg.json` 200, `keys_bounce-wJfZHg.webp` 200, `keys_bounce.png` 404 — invisible
// in dev, because dev keeps stable filenames.
//
// This USED to be handled by widening `texturePackerCacheBuster`'s `{tps}`-only test to any JSON carrying
// `meta.image`. That no longer works: it resolves ONE atlas per sheet via
// `getFinalTransformedChildren()[0]`, and now that each sheet has `@0.5x`/`@0.25x` tiers it would point
// every tier at the same PNG. `prebakedSheetImageFixer` (registered above) replaces it and pairs each JSON
// tier with its own atlas BY REFERENCE, and `npm run check:built` fails the build if any reference is
// wrong regardless. The built-in stays scoped to `{tps}` folders as it was designed to be.

export default {
  entry: './raw-assets',
  output: './public/assets/',
  cache: true, // incremental build cache in .assetpack/
  // cacheLocation: '.assetpack',
  ignore: ['**/*.md', '**/.DS_Store'], // docs & OS cruft are not assets
  pipes,
}
