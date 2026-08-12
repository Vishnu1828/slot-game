#!/usr/bin/env node
/**
 * Strip transparent padding from custom (`sprites[]`) animation sheets. LOSSLESS: no resolution is lost and
 * no frames are dropped, so nothing about how the animation looks or how smoothly it plays changes.
 *
 * ## Why
 *
 * An `AnimatedSprite` holds every frame as a live texture at once, so a sheet costs
 * `frames x frame area x 4` bytes of GPU memory — and empty pixels cost exactly as much as drawn ones.
 * Measured on the shipped decor sheets, a third of the chandelier's cell area is transparent:
 *
 *   chandelier     239 frames, 256x235 cell, content 245x164 -> 33.2% padding -> 54.8 MB down to 36.6 MB
 *   gem_shine       96 frames, 200x200 cell, content 170x168 -> 28.6% padding -> 14.6 MB down to 10.5 MB
 *   candle_light   120 frames, 254x196 cell, content 226x172 -> 21.9% padding -> 22.8 MB down to 17.8 MB
 *   hanging_lamps  120 frames, 186x372 cell, content 167x340 -> 17.9% padding -> 31.7 MB down to 26.0 MB
 *
 * This matters most for exactly the sheets that CANNOT be tiered. `chandelier` and `hanging_lamps` are drawn
 * larger on screen than their source frames already, so a lower-resolution tier would visibly blur them
 * (see assetpack/sheetTiers.mjs). Cropping is the only lever that costs nothing.
 *
 * ## Union bounding box, not per-frame
 *
 * The crop is ONE box covering the drawn pixels of every frame, not a tight box per frame. A per-frame crop
 * would move each frame's content relative to its own cell, which is drift — the subject would wander
 * through the animation. A single box preserves every frame's position relative to every other exactly.
 *
 * ## Keeping the art in the same place on screen
 *
 * Callers size these sheets by screen fractions and place them by anchor, so a smaller frame would
 * otherwise land somewhere else. Rather than retune `CHANDELIER_ASPECT` / `_H_FRAC` / `_Y_FRAC` by hand
 * (brittle, and wrong again for the next sheet), the crop records what it removed:
 *
 *   "sourceSize": { "w": 256, "h": 235 }   the cell size BEFORE cropping
 *   "offset":     { "x": 3,   "y": 71  }   where the kept box sat inside it
 *
 * `PixiGameAnimation` treats `width`/`height` as the size of the `sourceSize` box and offsets the frame
 * inside it — the same trim semantics it already honours for TexturePacker sheets. So placement is
 * unchanged and no call site moves. Sheets without these fields behave exactly as before.
 *
 * Only the custom dialect is handled. The pre-baked TexturePacker win sheets already carry their own trim
 * data (and rotated frames), and tiering has already taken them from 566 MB to 145 MB, so the remaining
 * ~14% padding there is not worth touching that machinery for.
 *
 * Idempotent: an already-cropped sheet has no padding left to find and is skipped.
 *
 * Run:  node scripts/crop-animation-sheets.mjs        (then: npm run assets)
 *       node scripts/crop-animation-sheets.mjs --dry  (report only, write nothing)
 */
import { readFileSync, writeFileSync, globSync, renameSync } from 'node:fs'
import { dirname, join, basename } from 'node:path'
import sharp from 'sharp'

const DRY = process.argv.includes('--dry')

/** Below this there is nothing worth a repack, and repacking is not free of risk. */
const MIN_PADDING = 0.05

/** Alpha at or below this counts as empty. Not 0: antialiased edges trail off into 1-2/255. */
const ALPHA_FLOOR = 8

const mb = (px) => (px * 4) / 1048576

const sheets = globSync('raw-assets/games/*/animations*/*.json').sort()

let changed = 0
let savedMb = 0

for (const jsonPath of sheets) {
  const json = JSON.parse(readFileSync(jsonPath, 'utf8'))
  if (!Array.isArray(json.sprites) || !json.spriteSheetWidth) continue // not a custom sheet

  const name = basename(jsonPath, '.json')
  const pngPath = join(dirname(jsonPath), `${name}.png`)

  const { data, info } = await sharp(pngPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const stride = info.channels
  const rowBytes = info.width * stride

  // One box over every frame, in frame-local coordinates.
  let left = Infinity
  let top = Infinity
  let right = -1
  let bottom = -1
  for (const s of json.sprites) {
    for (let y = 0; y < s.height; y++) {
      const row = (s.y + y) * rowBytes
      for (let x = 0; x < s.width; x++) {
        if (data[row + (s.x + x) * stride + 3] > ALPHA_FLOOR) {
          if (x < left) left = x
          if (x > right) right = x
          if (y < top) top = y
          if (y > bottom) bottom = y
        }
      }
    }
  }

  if (right < 0) {
    console.log(`skip ${name} — every frame is fully transparent`)
    continue
  }

  // Frames may differ in size; the box has to be valid for all of them, so clamp to the smallest.
  const cellW = Math.min(...json.sprites.map((s) => s.width))
  const cellH = Math.min(...json.sprites.map((s) => s.height))
  const keepW = Math.min(right - left + 1, cellW - left)
  const keepH = Math.min(bottom - top + 1, cellH - top)

  const padding = 1 - (keepW * keepH) / (cellW * cellH)
  if (padding < MIN_PADDING) {
    console.log(`ok   ${name} — ${(padding * 100).toFixed(1)}% padding, below the ${MIN_PADDING * 100}% floor`)
    continue
  }

  const cols = Math.max(1, Math.round(json.spriteSheetWidth / json.sprites[0].width))
  const rows = Math.ceil(json.sprites.length / cols)
  const sheetW = cols * keepW
  const sheetH = rows * keepH

  const before = json.sprites.length * cellW * cellH
  const after = json.sprites.length * keepW * keepH
  const report =
    `${name}: cell ${cellW}x${cellH} -> ${keepW}x${keepH} at (${left},${top})  ` +
    `${(padding * 100).toFixed(1)}% padding  sheet ${json.spriteSheetWidth}x${json.spriteSheetHeight} -> ` +
    `${sheetW}x${sheetH}  ${mb(before).toFixed(1)} -> ${mb(after).toFixed(1)} MB`

  if (DRY) {
    console.log(`dry  ${report}`)
    savedMb += mb(before) - mb(after)
    continue
  }

  const tiles = []
  for (let i = 0; i < json.sprites.length; i++) {
    const s = json.sprites[i]
    tiles.push({
      input: await sharp(pngPath)
        .extract({ left: s.x + left, top: s.y + top, width: keepW, height: keepH })
        .png()
        .toBuffer(),
      left: (i % cols) * keepW,
      top: Math.floor(i / cols) * keepH,
    })
  }

  // Compose what the crop removed with anything a previous crop already recorded, so re-running stays
  // correct: `offset` is relative to the ORIGINAL cell, which does not change.
  const priorOffset = json.offset ?? { x: 0, y: 0 }
  const cropped = {
    ...json,
    sprites: json.sprites.map((s, i) => ({
      ...s,
      x: (i % cols) * keepW,
      y: Math.floor(i / cols) * keepH,
      width: keepW,
      height: keepH,
    })),
    spriteSheetWidth: sheetW,
    spriteSheetHeight: sheetH,
    sourceSize: json.sourceSize ?? { w: cellW, h: cellH },
    offset: { x: priorOffset.x + left, y: priorOffset.y + top },
  }

  // sharp cannot read and write the same path in one pipeline; build beside it and swap, so a failed run
  // leaves the source intact rather than half-written.
  const tmp = `${pngPath}.tmp`
  await sharp({
    create: { width: sheetW, height: sheetH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite(tiles)
    .png()
    .toFile(tmp)
  renameSync(tmp, pngPath)
  writeFileSync(jsonPath, `${JSON.stringify(cropped, null, 2)}\n`)

  console.log(`CROP ${report}`)
  changed++
  savedMb += mb(before) - mb(after)
}

console.log(
  changed || DRY
    ? `\n${DRY ? 'dry run' : `${changed} sheet(s) cropped`} — ` +
        `${savedMb.toFixed(0)} MB of GPU memory ${DRY ? 'would be' : ''} saved.` +
        (DRY ? '' : '\nRun `npm run assets`, then check placement with `?anim=compare`.')
    : '\nNothing to do.',
)
