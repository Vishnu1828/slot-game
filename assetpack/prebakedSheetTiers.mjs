// AssetPack pipes that give PRE-BAKED sprite sheets the multi-resolution tiers AssetPack cannot make
// for them, and that own the `meta.image` reference afterwards.
//
// ## The problem
//
// An `AnimatedSprite` needs every frame resident as a live texture at once, so a sheet costs
// `frames x frame area x 4` bytes of GPU memory however well it compressed on disk. The win-presentation
// art dominates this game's memory: the 80-frame popup sequence alone is 160 MB, and one winning symbol's
// glow is another 52 MB, on top of ~124 MB of untiered art already resident. Mobile browsers kill the tab
// at that peak.
//
// Loose images get `@0.5x`/`@0.25x` tiers from AssetPack's `mipmap` pipe. These sheets cannot, for two
// independent reasons, and BOTH are why their folders are tagged `{nomip}`:
//
//   1. `mipmap` resizes the WHOLE SHEET. The frame size has to be a whole number of pixels, so it rounds;
//      every row then lands a fraction of a pixel off its cell and the error ACCUMULATES down the sheet,
//      making the art slide through the animation and snap back at the loop. That is the bug
//      scripts/fit-animation-sheets.mjs exists to undo.
//   2. `mipmap` only touches IMAGES. A pre-baked sheet keeps its frame rects in a sibling `.json`, which
//      the pipe leaves at full-resolution coordinates — so a generated `@0.5x` PNG would be paired with
//      rects that point outside it.
//
// So the tiers are built here: every frame cut and rescaled individually onto an exact grid (no rounding
// left to accumulate), with the JSON rewritten to match. See ./sheetTiers.mjs for that arithmetic.
//
// ## Why two pipes
//
// A sheet's `.json` and `.png` are two SEPARATE AssetPack assets, and a pipe can only return children of
// the asset it was handed. `pixiManifest` groups a `src` array from `asset.getFinalTransformedChildren()`,
// so each half has to emit its own tiers as transform children for Pixi's resolver to see them as
// resolution variants of one alias. `prebakedSheetTiers` does that for both halves, and both halves derive
// their layout from the same pure `planTier` call, so they cannot drift apart.
//
// `prebakedSheetImageFixer` then runs AFTER the cache-buster, because a sheet names its atlas INSIDE the
// JSON (`meta.image`) and Pixi fetches that name relative to the JSON's own URL — bypassing the manifest
// entirely. Rename the PNG without updating `meta.image` and the sheet 404s. This repo has shipped that
// bug before (docs/asset-pipeline.md 7.1) and it is invisible in dev, because dev keeps stable filenames.
//
// AssetPack ships `texturePackerCacheBuster` for exactly this, and `.assetpack.js` used to widen its test
// to cover these untagged sheets. That cannot survive tiering: it resolves ONE atlas per sheet via
// `getFinalTransformedChildren()[0]`, so with three tiers it would point every tier at the same PNG. The
// fixer below replaces it and pairs each JSON tier with its OWN PNG tier by reference — no filename
// matching, so it cannot silently mis-resolve. `scripts/check-built-assets.mjs` then fails the build if any
// reference is wrong anyway, because "invisible until deploy" is not a risk worth carrying twice.

import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { basename } from 'node:path'
import sharp from 'sharp'
import { checkExt, createNewAssetAt } from '@assetpack/core'
import {
  MAX_TEXTURE_SIZE,
  TIERS,
  planTier,
  readSheet,
  renderTier,
  shouldTier,
  tierJson,
  tierSuffix,
} from './sheetTiers.mjs'

/**
 * Pairs of `{ json, png }` assets per sheet per tier, recorded as they are created so the fixer can
 * resolve each JSON's atlas by reference instead of by name. Keyed by sheet identity + tier; the two
 * halves are filled in independently, in whichever order AssetPack happens to transform them.
 *
 * Module-level because a pipe's `finish` needs what its `transform` learned — the same shape AssetPack's
 * own `texturePackerCacheBuster` uses.
 */
const sheetPairs = new Map()

const pairKey = (asset, scale) => {
  const root = rootOf(asset)
  return `${root.directory}::${basename(root.filename, root.extension)}::${scale}`
}

/** The asset as it entered the pipeline — its path/directory still point at the source tree. */
const rootOf = (asset) => asset.rootTransformAsset ?? asset

const record = (asset, scale, half, value) => {
  const key = pairKey(asset, scale)
  const entry = sheetPairs.get(key) ?? { key, scale }
  entry[half] = value
  sheetPairs.set(key, entry)
}

/** The tier a generated filename belongs to. No `@Nx` means full resolution. */
const tierOfFilename = (filename) => parseFloat(/@([\d.]+)x\./.exec(filename)?.[1] ?? '1')

/**
 * The one output file of `asset` that belongs to `scale`, in `extension`.
 *
 * The tier filter is not optional. Tiers are created as transform CHILDREN of the base asset, so
 * `getFinalTransformedChildren()` on a base sheet returns the leaves of the whole subtree — the base's own
 * compressed/cache-busted files AND every tier's. Taking the first match (as AssetPack's own
 * `texturePackerCacheBuster` does, with `[0]`) then hands the full-resolution JSON a half-resolution atlas:
 * a file that exists, so only a dimension check catches it. This is precisely why that pipe could not be
 * widened to cover tiered sheets.
 */
const pickFinal = (asset, extension, scale) =>
  asset
    .getFinalTransformedChildren()
    .find((f) => f.extension === extension && tierOfFilename(f.filename) === scale) ?? null

/**
 * Find the other half of a sheet in the SOURCE tree.
 *
 * Walks the original (pre-transform) siblings rather than guessing a path, because by the time a pipe runs
 * an asset's `path` may already live in `.assetpack/`.
 */
function sibling(asset, extension) {
  const root = rootOf(asset)
  const stem = basename(root.filename, root.extension)
  return (
    root.parent?.children?.find(
      (c) => c.extension === extension && basename(c.filename, c.extension) === stem,
    ) ?? null
  )
}

/**
 * Read a sheet's JSON regardless of which half we were handed, or null if this asset is not part of a
 * pre-baked sheet we tier. Reads from the source path: an asset's own `buffer` may already be a
 * compressed/renamed derivative by the time some pipes run.
 */
function sheetFor(asset) {
  if (!checkExt(asset.path, '.json', '.png')) return null

  const root = rootOf(asset)
  const isJson = root.extension === '.json'

  // Cheap gate first: a sheet is a `.json` + `.png` PAIR, so a lone image (an atlas source, a background)
  // is out before any file is read. Most assets exit here.
  const jsonAsset = isJson ? root : sibling(asset, '.json')
  if (!jsonAsset) return null

  let json
  try {
    json = JSON.parse(readFileSync(jsonAsset.path, 'utf8'))
  } catch {
    return null // not JSON we understand; leave it to the normal pipeline
  }

  // Ask the sheet, not its name — `shouldTier` explains at length why nothing here may be name-based.
  if (!shouldTier(jsonAsset.path, json)) return null

  const sheet = readSheet(json)
  if (!sheet?.frames.length) return null

  const stem = basename(root.filename, root.extension)

  // The custom `sprites[]` dialect names no atlas, so it needs no `meta.image` fixup; the TexturePacker
  // dialect does. Both tier the same way.
  return { json, sheet, isJson, stem, jsonAsset }
}

/**
 * Emit `@0.5x` / `@0.25x` children for both halves of every pre-baked sheet we tier.
 *
 * Register BEFORE `compress`, so the generated tiers are compressed and cache-busted like any other asset
 * rather than shipping as raw PNGs.
 */
export function prebakedSheetTiers() {
  return {
    name: 'prebaked-sheet-tiers',
    folder: false,
    defaultOptions: null,

    test(asset) {
      return sheetFor(asset) !== null
    },

    async transform(asset) {
      const found = sheetFor(asset)
      if (!found) return [asset]
      const { json, sheet, isJson, stem } = found

      // The untouched original is tier 1 and stays in the chain, so a device with the pixels to use it
      // still resolves full-resolution art.
      record(asset, 1, isJson ? 'json' : 'png', asset)
      const out = [asset]

      const source = isJson ? null : readFileSync(rootOf(asset).path)

      for (const scale of TIERS) {
        const plan = planTier(sheet, scale)

        // Repacking should always shrink, but a sheet with very many frames could square up past the GPU
        // limit. Skipping one tier is recoverable; shipping an unuploadable texture is a black screen.
        if (Math.max(plan.sheetW, plan.sheetH) > MAX_TEXTURE_SIZE) {
          console.warn(
            `[prebaked-sheet-tiers] ${stem}${tierSuffix(scale)} would be ` +
              `${plan.sheetW}x${plan.sheetH}, over the ${MAX_TEXTURE_SIZE}px limit — tier skipped`,
          )
          continue
        }

        const name = `${stem}${tierSuffix(scale)}${isJson ? '.json' : '.png'}`
        const child = createNewAssetAt(asset, name)

        child.buffer = isJson
          ? Buffer.from(
              JSON.stringify(
                tierJson(json, sheet, plan, scale, `${stem}${tierSuffix(scale)}.png`),
              ),
            )
          : await renderTier(sharp, source, plan)

        record(asset, scale, isJson ? 'json' : 'png', child)
        out.push(child)
      }

      return out
    },
  }
}

/**
 * Point every sheet JSON at its OWN atlas after the cache-buster has renamed both.
 *
 * Register AFTER `cache-buster`. Replaces the widened `texturePackerCacheBuster` for these folders — see
 * the header for why that one cannot handle tiers.
 */
export function prebakedSheetImageFixer() {
  return {
    name: 'prebaked-sheet-image-fixer',
    folder: false,
    defaultOptions: null,

    test() {
      return false // nothing to transform; all the work is a patch at the end
    },

    async finish() {
      for (const { key, scale, json: jsonAsset, png: pngAsset } of sheetPairs.values()) {
        if (!jsonAsset || !pngAsset) {
          // Both halves are recorded from the same `shouldTier` decision, so a gap means one half never
          // reached this pipe — a real pipeline problem, not something to paper over.
          console.warn(`[prebaked-sheet-image-fixer] ${key}: missing half, cannot fix meta.image`)
          continue
        }

        // Exactly one JSON and one atlas per tier — see `pickFinal` for why this must not be "the first
        // child".
        const finalJson = pickFinal(jsonAsset, '.json', scale)
        if (!finalJson) continue

        let parsed
        try {
          parsed = JSON.parse(finalJson.buffer.toString())
        } catch {
          continue
        }
        if (typeof parsed?.meta?.image !== 'string') continue // custom dialect names no atlas

        const wanted = parsed.meta.image.slice(parsed.meta.image.lastIndexOf('.'))
        const atlas = pickFinal(pngAsset, wanted, scale)
        if (!atlas) {
          console.warn(
            `[prebaked-sheet-image-fixer] ${key}: no ${wanted} atlas at tier ${scale} to point at`,
          )
          continue
        }
        if (parsed.meta.image === atlas.filename) continue

        parsed.meta.image = atlas.filename

        // By the time a `finish` hook runs, the pipeline has ALREADY written every asset to disk. So
        // patching the buffer is only half the job: the content hash changes with it, the manifest is
        // built from `asset.path` after this, and nothing else will move the file. Rename the path, then
        // delete the file written under the old hash and write the new one by hand — the same three
        // steps AssetPack's own `texturePackerCacheBuster` performs, and omitting the last two produced a
        // manifest pointing at names that did not exist on disk.
        const previousPath = finalJson.path
        const previousHash = finalJson.hash
        finalJson.buffer = Buffer.from(JSON.stringify(parsed))

        if (previousHash && finalJson.hash) {
          finalJson.path = finalJson.path.replace(previousHash, finalJson.hash)
        }
        if (finalJson.path !== previousPath && existsSync(previousPath)) {
          rmSync(previousPath)
        }
        writeFileSync(finalJson.path, finalJson.buffer)
      }
    },
  }
}

