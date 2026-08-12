#!/usr/bin/env node
/**
 * Validate the GENERATED assets in `public/assets/`. Exits 1 on any problem.
 *
 * `validate-assets.mjs` checks `raw-assets/` BEFORE AssetPack runs, so by construction it cannot see
 * anything the pipeline itself gets wrong. This runs after, and exists because of one specific failure mode
 * that has already reached production once:
 *
 *   A pre-baked sprite sheet names its atlas INSIDE its JSON (`meta.image`), and Pixi fetches that name
 *   relative to the JSON's own URL — never through the manifest. The cache-buster renames files in
 *   production only, so a stale `meta.image` still resolves in dev and 404s exclusively after deploy.
 *   (docs/asset-pipeline.md 7.1)
 *
 * CI builds assets and syncs them straight to R2, so "someone checks a production build by hand" is not a
 * control. This is.
 *
 * Run:  npm run check:built           (after npm run assets / assets:prod)
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join, dirname, relative, extname } from 'node:path'
import sharp from 'sharp'

const ROOT = process.cwd()
const OUT = join(ROOT, 'public', 'assets')
const MANIFEST = join(OUT, 'manifest.json')

/** Max px per side a mobile GPU will accept. Matches assetpack/sheetTiers.mjs + check-animations.mjs. */
const MAX_TEXTURE = 4096

const errors = []
const notes = []
const err = (m) => errors.push(m)
const rel = (p) => relative(ROOT, p)

if (!existsSync(MANIFEST)) {
  console.error(`✖ no ${rel(MANIFEST)} — run \`npm run assets\` first.`)
  process.exit(1)
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else out.push(p)
  }
  return out
}

const dimensions = async (p) => {
  const { width, height } = await sharp(p).metadata()
  return { w: width, h: height }
}

const files = walk(OUT)

// ---------------------------------------------------------------- 1. meta.image points at the RIGHT atlas
//
// The whole reason this script exists, and existence alone is not enough to check.
//
// The realistic bug is not a dangling reference but a MIS-PAIRING: with three tiers per sheet, a fixup that
// resolves "the sheet's atlas" instead of "this tier's atlas" hands every tier the same PNG. That file
// exists, so it passes any existence check while the frame rects address an atlas of the wrong size — the
// animation renders as garbage slices.
//
// So compare the atlas's real dimensions against the `meta.size` the JSON declares. That catches the
// mis-pairing, the stale cache-busted name, and a truncated/rewritten atlas, all with one comparison.
let sheetsChecked = 0
for (const file of files) {
  if (extname(file) !== '.json' || file === MANIFEST) continue

  let json
  try {
    json = JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    continue // not every .json out here is a sprite sheet
  }

  const refs = []
  if (typeof json?.meta?.image === 'string') refs.push(json.meta.image)
  if (Array.isArray(json?.meta?.related_multi_packs)) refs.push(...json.meta.related_multi_packs)
  if (!refs.length) continue

  sheetsChecked++
  for (const ref of refs) {
    const atlas = join(dirname(file), ref)
    if (!existsSync(atlas)) {
      err(`${rel(file)}: meta.image "${ref}" does not exist next to it (Pixi fetches this name directly)`)
      continue
    }

    const declared = json.meta.size
    if (!declared) continue // nothing to compare against
    const actual = await dimensions(atlas)
    if (actual.w !== declared.w || actual.h !== declared.h) {
      err(
        `${rel(file)}: meta.image "${ref}" is ${actual.w}x${actual.h} but meta.size declares ` +
          `${declared.w}x${declared.h} — the JSON is paired with the wrong atlas`,
      )
    }
  }
}

// ---------------------------------------------------------------- 2. every manifest src exists
const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'))
let srcChecked = 0
for (const bundle of manifest.bundles ?? []) {
  for (const asset of bundle.assets ?? []) {
    for (const entry of [].concat(asset.src ?? [])) {
      const src = typeof entry === 'string' ? entry : entry.src
      srcChecked++
      if (!existsSync(join(OUT, src))) {
        err(`bundle "${bundle.name}": manifest src "${src}" does not exist`)
      }
    }
  }
}

// ---------------------------------------------------------------- 3. tier ORDER within each src list
//
// Pixi applies `texturePreference.resolution` as an exact-value filter and falls back to `src[0]` when
// nothing matches — and a plain `.json` carries no resolution at all, so for JSON that fallback is the
// ONLY way full resolution is ever selected. If the sort in `.assetpack.js` regresses, every device
// silently drops to half-resolution sheets with nothing failing. Assert the invariant instead.
const resolutionOf = (src) => parseFloat(/@([\d.]+)x/.exec(src)?.[1] ?? '1')
for (const bundle of manifest.bundles ?? []) {
  for (const asset of bundle.assets ?? []) {
    const srcs = [].concat(asset.src ?? []).map((e) => (typeof e === 'string' ? e : e.src))
    if (srcs.length < 2) continue
    const resolutions = srcs.map(resolutionOf)
    if (resolutions[0] !== Math.max(...resolutions)) {
      err(
        `bundle "${bundle.name}": ${srcs[0]} is first in src but is not the highest resolution ` +
          `(${resolutions.join(', ')}) — Pixi's tier-1 fallback takes src[0]`,
      )
    }
  }
}

// ---------------------------------------------------------------- 4. nothing exceeds the GPU limit
for (const file of files) {
  if (!['.png', '.webp', '.jpg', '.jpeg', '.avif'].includes(extname(file))) continue
  const size = await dimensions(file)
  if (Math.max(size.w, size.h) > MAX_TEXTURE) {
    err(`${rel(file)}: ${size.w}x${size.h} exceeds the ${MAX_TEXTURE}px GPU limit (renders as nothing)`)
  }
}

// ---------------------------------------------------------------- 5. tiered sheets really produced tiers
//
// A skipped tier is legitimate (see the 4096 guard in prebakedSheetTiers) but must never be silent: it
// means some devices load art several times heavier than intended, which is the bug this all started as.
const tiered = new Map()
for (const bundle of manifest.bundles ?? []) {
  for (const asset of bundle.assets ?? []) {
    const srcs = [].concat(asset.src ?? []).map((e) => (typeof e === 'string' ? e : e.src))
    const base = srcs[0]
    if (!base || !/-win\//.test(base)) continue
    tiered.set(base, new Set(srcs.map(resolutionOf)))
  }
}
for (const [base, res] of tiered) {
  const missing = [0.5, 0.25].filter((t) => !res.has(t))
  if (missing.length) notes.push(`${base}: no @${missing.join('x, @')}x tier`)
}

// ---------------------------------------------------------------- report
if (notes.length) {
  console.log(`\n⚠ ${notes.length} sheet(s) missing a tier:`)
  for (const n of notes) console.log(`   ${n}`)
}

console.log(
  `\nchecked ${sheetsChecked} sprite sheet(s), ${srcChecked} manifest src entries, ` +
    `${files.filter((f) => extname(f) === '.png').length} textures.`,
)

if (errors.length) {
  console.error(`\n✖ ${errors.length} problem(s):`)
  for (const e of errors) console.error(`   ${e}`)
  process.exit(1)
}
console.log('✔ generated assets look good.')
