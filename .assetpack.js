import { readFileSync } from 'node:fs'
import { pixiPipes } from '@assetpack/core/pixi'
import { createNewAssetAt } from '@assetpack/core'

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
  manifest: { createShortcuts: true, trimExtensions: true, nameStyle: 'short' },
})

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
// A TexturePacker sheet names its atlas INSIDE the JSON (`meta.image: "keys_bounce.png"`), and Pixi's
// spritesheet loader fetches that name relative to the JSON's own URL — it does NOT go back through the
// manifest (pixi.js spritesheetAsset: `loader.load(basePath + asset.meta.image)`). So the sheet issues a
// THIRD request beyond the manifest-resolved .json and .webp, for a filename the cache-buster renamed.
// Symptom: `keys_bounce-_fVswg.json` 200, `keys_bounce-wJfZHg.webp` 200, `keys_bounce.png` 404.
//
// AssetPack ships the patch — `texturePackerCacheBuster` rewrites `meta.image` to the hashed name in its
// `finish` hook — but it only tests assets tagged `{tps}`:
//     test: (asset) => asset.allMetaData['tps'] && checkExt(asset.path, '.json')
// Our win/animation sheets are already packed, so they are deliberately NOT `{tps}` (that tag would make
// AssetPack re-pack them, and they sit near the 4096px limit as it is). Result: renamed atlas, stale
// reference. So widen the test to any JSON that names an atlas; `finish` needs no change, as it looks the
// texture up by `meta.image` among siblings — exactly how these pairs are laid out.
//
// This is invisible in dev and ONLY breaks after deploy: dev keeps stable filenames, so the name baked
// into the JSON still resolves.
const isPrebakedSheet = (asset) => {
  if (asset.extension !== '.json') return false
  // Runs AFTER the cache-buster, so `asset.path` is the already-hashed file in `.assetpack/cache-buster/`
  // — a sibling-filename check would compare against renamed files and never match. The reliable marker
  // is `meta.image` itself. That also excludes the custom sheet dialect (`sprites[]` + `spriteSheetWidth`,
  // see PixiGameAnimation), which names no atlas: its image is fetched through the manifest by alias and
  // is already correct (this is why `hanging_lamps` works while `keys_bounce` does not). Matching it here
  // would crash `finish` on the missing `meta`.
  try {
    const raw = asset.buffer ?? readFileSync(asset.path)
    return typeof JSON.parse(raw.toString())?.meta?.image === 'string'
  } catch {
    return false // unreadable / not JSON — leave it to the normal pipeline
  }
}

const tpsCacheBuster = pipes.find((p) => p.name === 'texture-packer-cache-buster')
if (tpsCacheBuster) {
  const originalTest = tpsCacheBuster.test.bind(tpsCacheBuster)
  tpsCacheBuster.test = (asset, options) =>
    originalTest(asset, options) || isPrebakedSheet(asset)
}

export default {
  entry: './raw-assets',
  output: './public/assets/',
  cache: true, // incremental build cache in .assetpack/
  // cacheLocation: '.assetpack',
  ignore: ['**/*.md', '**/.DS_Store'], // docs & OS cruft are not assets
  pipes,
}
