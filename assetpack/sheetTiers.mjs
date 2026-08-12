// Layout maths for downscaled ("tiered") copies of PRE-BAKED sprite sheets.
//
// This module is deliberately pure and side-effect free. The `.png` and the `.json` of a sheet are two
// SEPARATE AssetPack assets, so two different pipes have to generate their halves of a tier — and those
// halves only line up if both compute the byte-identical layout. Keeping the arithmetic here, with no I/O,
// is what makes that guaranteed rather than hoped for: same input, same output, called twice.
//
// See ./prebakedSheetTiers.mjs for the pipes, and docs/animations.md for the drift background.

/** The `@%%x` naming AssetPack and Pixi both use to mean "this file is a resolution variant". */
export const tierSuffix = (scale) => (scale === 1 ? '' : `@${scale}x`)

/**
 * Max px per side a mobile GPU will accept. Over this the upload fails and Pixi draws nothing — a black
 * box, not an error. Matches scripts/check-animations.mjs and fit-animation-sheets.mjs; keep them in step.
 */
export const MAX_TEXTURE_SIZE = 4096

/**
 * Which downscaled tiers to emit. These are the values Pixi's resolver will match against
 * `texturePreference.resolution`, so they have to be the numbers the runtime asks for (see
 * src/assets/loader.ts) — not arbitrary ratios.
 */
export const TIERS = [0.5, 0.25]

/**
 * A sheet lives in a game's win bundle: `games/<id>/win/<id>-win/`.
 *
 * That folder exists by convention (see `winAnimPath` in src/game/theme.ts) to hold the celebration art
 * kept OUT of the game bundle — by definition the heaviest thing a game ships. So membership of it, not any
 * filename, is what marks a sheet as worth tiering.
 */
const inWinBundle = (sheetPath) => /[\\/][^\\/]*-win[^\\/]*[\\/]/.test(sheetPath)

/**
 * Should this sheet get `@0.5x` / `@0.25x` copies?
 *
 * DEFAULT BY LOCATION, OVERRIDE BY DECLARATION. Deliberately nothing name-based:
 *
 * This is a MULTI-GAME platform, and sheet names are per-game data, not conventions the pipeline can rely
 * on. An earlier version of this matched `/^win-\d+$/`, `/_bounce$/`, `/_winning$/` and two literal decor
 * names — all of which are Fortune Teller's. A second game naming its celebration `bigwin-0…bigwin-4`
 * (`winAnimation.sheet` is a THEME FIELD, and the sheet COUNT varies too) would have matched nothing, got
 * no tiers, loaded full 4K art and crashed exactly as this work set out to fix — silently, because a sheet
 * with no tier is legitimate and simply resolves full resolution.
 *
 * So:
 *  - everything in a game's win bundle tiers, whatever it is called and however many sheets there are;
 *  - any sheet can opt in or out with a `"tier": true | false` field in its OWN json.
 *
 * The opt-in is what the decor sheets use, because for them the answer differs per sheet and getting it
 * backwards makes art WORSE while saving little. Measured in device pixels on the portrait design canvas
 * (390x844) at renderer resolution 2:
 *
 *   gem_shine      frames 200px, drawn ~75px   -> 2.7x oversampled       -> "tier": true
 *   spinning_ball  frames 269px, drawn ~55px   -> 4.9x oversampled       -> "tier": true
 *   chandelier     frames 256px, drawn ~458px  -> already UPSCALED 1.8x  -> no flag; crop instead
 *   hanging_lamps  frames 372px, drawn ~507px  -> already upscaled 1.4x  -> no flag; crop instead
 *   candle_light   frames 254px, drawn ~158px  -> only 1.6x, landscape   -> no flag; crop instead
 *
 * Declaring it in the sheet's own json rather than in a list here means the decision travels WITH the art,
 * needs no rename, and a new game adding sheets needs no change to this pipeline at all. See
 * scripts/crop-animation-sheets.mjs for the lossless lever the three un-tiered decor sheets use instead.
 */
export function shouldTier(sheetPath, json) {
  if (typeof json?.tier === 'boolean') return json.tier
  return inWinBundle(sheetPath)
}

/**
 * Read a sheet's frames without caring which exporter produced it. Two dialects ship in this repo
 * (docs/animations.md, "Two JSON dialects"):
 *
 *   texturepacker  `frames{}` keyed by name, each with `frame` plus optional trim fields
 *   custom         `sprites[]` on a grid, with `spriteSheetWidth/Height`
 *
 * Returns null for anything that is neither, so callers can skip instead of throwing.
 */
export function readSheet(json) {
  if (json?.frames && typeof json.frames === 'object') {
    return {
      dialect: 'texturepacker',
      frames: Object.entries(json.frames).map(([key, f]) => ({
        key,
        rect: f.frame,
        rotated: !!f.rotated,
        meta: f,
      })),
    }
  }
  if (Array.isArray(json?.sprites)) {
    return {
      dialect: 'custom',
      frames: json.sprites.map((s) => ({
        key: s.fileName,
        rect: { x: s.x, y: s.y, w: s.width, h: s.height },
        rotated: false, // the custom dialect has no rotation concept
        meta: s,
      })),
    }
  }
  return null
}

/**
 * Where a frame's pixels actually SIT in the atlas.
 *
 * For a rotated frame these are not `frame.w x frame.h`: the packer stored the sprite turned 90°, so the
 * region is TRANSPOSED while `frame.w/h` keep describing the upright sprite. Pixi encodes the same rule —
 * it builds the frame as `Rectangle(x, y, rect.h, rect.w)` when `rotated` is set
 * (Spritesheet.mjs) — and the shipped win-popup sheets rely on it: 6 of their 80 frames only fit inside
 * the atlas under the transposed reading, and 11 non-rotated frames only fit under the normal one, so the
 * flag is load-bearing and cannot be ignored.
 */
export const storedRegion = (f) => ({
  left: f.rect.x,
  top: f.rect.y,
  width: f.rotated ? f.rect.h : f.rect.w,
  height: f.rotated ? f.rect.w : f.rect.h,
})

/**
 * Turning a stored rotated frame back upright.
 *
 * Counter-clockwise, because the packer stored it rotated 90° CLOCKWISE — verified by eye against an
 * adjacent upright frame of the same sequence, since the numeric tests (centroid, frame-to-frame
 * difference) were too close to call. Getting the sign wrong renders the whole win popup upside down.
 */
export const UNROTATE_DEG = -90

/**
 * Plan a tier: where every frame lands in the rebuilt sheet.
 *
 * Two things here are load-bearing, both for the same reason — a frame's position has to be a whole
 * number of pixels:
 *
 *  1. Every frame is scaled and ROUNDED on its own, then placed on a grid built from those rounded sizes.
 *     Scaling the source positions instead (391 * 0.5 = 195.5) rounds neighbouring frames into each
 *     other, and resizing the sheet as a single image is worse still: each row lands a fraction of a pixel
 *     off its cell and the error ACCUMULATES down the sheet, so the art slides through the animation and
 *     snaps back at the loop. That is the bug scripts/fit-animation-sheets.mjs exists to fix; this avoids
 *     re-introducing it by making the grid exact by construction.
 *  2. The grid is uniform (one cell size for the whole sheet). Frames may differ in size — the win-N popup
 *     art is trimmed, so its heights vary by a few px — and a uniform cell means a frame's cell index is
 *     enough to know its position, with nothing to accumulate.
 *
 * @returns {{cellW:number, cellH:number, cols:number, rows:number, sheetW:number, sheetH:number,
 *            frames:Array<{key:string, src:object, meta:object, x:number, y:number, w:number, h:number}>}}
 */
export function planTier(sheet, scale) {
  if (!(scale > 0 && scale <= 1)) throw new Error(`[sheetTiers] scale must be in (0,1], got ${scale}`)

  const frames = sheet.frames.map((f) => ({
    ...f,
    src: f.rect,
    w: Math.max(1, Math.round(f.rect.w * scale)),
    h: Math.max(1, Math.round(f.rect.h * scale)),
  }))

  const cellW = Math.max(...frames.map((f) => f.w))
  const cellH = Math.max(...frames.map((f) => f.h))
  // Squarish keeps both sides as far as possible from the 4096 GPU limit for a given frame count.
  const cols = Math.max(1, Math.ceil(Math.sqrt(frames.length)))
  const rows = Math.ceil(frames.length / cols)

  return {
    cellW,
    cellH,
    cols,
    rows,
    sheetW: cols * cellW,
    sheetH: rows * cellH,
    frames: frames.map((f, i) => ({
      ...f,
      x: (i % cols) * cellW,
      y: Math.floor(i / cols) * cellH,
    })),
  }
}

/**
 * Rewrite a sheet's JSON for a tier.
 *
 * `meta.scale` is the field that makes this whole approach invisible to the rest of the app: Pixi's
 * Spritesheet reads it as the sheet's resolution and DIVIDES every rect, `spriteSourceSize` and
 * `sourceSize` by it. So a sheet whose coordinates are all multiplied by `scale`, carrying
 * `meta.scale === scale`, reports the EXACT same logical geometry as the full-resolution original — same
 * frame sizes, same anchors, same trim offsets. Only the pixel detail drops. Nothing downstream needs to
 * know a tier is in play: no component changes, no `aspect` constants to retune.
 *
 * The custom dialect has no equivalent field, but it does not need one: PixiGameAnimation derives
 * `k = atlas.source.pixelWidth / json.spriteSheetWidth` and scales the rects itself, so writing the tier's
 * real pixel coordinates is already correct there.
 */
export function tierJson(json, sheet, plan, scale, imageName) {
  const round = (v) => Math.round(v * scale)

  if (sheet.dialect === 'texturepacker') {
    const frames = {}
    for (const f of plan.frames) {
      const { spriteSourceSize, sourceSize } = f.meta
      frames[f.key] = {
        ...f.meta,
        frame: { x: f.x, y: f.y, w: f.w, h: f.h },
        // We straightened every frame while repacking, so the tier has no rotated frames left. Leaving
        // this true would make Pixi transpose a rect that is already upright.
        rotated: false,
        // Trim offsets have to move with the rect or a trimmed frame composites at the wrong place inside
        // its untrimmed box — which reads as the animation jittering, not as a scaling bug.
        ...(spriteSourceSize && {
          spriteSourceSize: {
            x: round(spriteSourceSize.x),
            y: round(spriteSourceSize.y),
            w: f.w,
            h: f.h,
          },
        }),
        ...(sourceSize && {
          sourceSize: { w: round(sourceSize.w), h: round(sourceSize.h) },
        }),
      }
    }
    return {
      ...json,
      frames,
      meta: {
        ...json.meta,
        image: imageName,
        size: { w: plan.sheetW, h: plan.sheetH },
        scale: String(scale),
        // TexturePacker's own incremental-build hash, meaningless once repacked and not read by Pixi.
        smartupdate: undefined,
      },
    }
  }

  return {
    ...json,
    sprites: plan.frames.map((f) => ({
      ...f.meta,
      x: f.x,
      y: f.y,
      width: f.w,
      height: f.h,
    })),
    spriteSheetWidth: plan.sheetW,
    spriteSheetHeight: plan.sheetH,
    // Trim metadata a crop may have left behind (see scripts/crop-animation-sheets.mjs). It is in the same
    // pixel space as the sprite rects, so it has to scale with them or a tiered+cropped sheet — gem_shine
    // is both — would be placed as though it had never been cropped.
    ...(json.sourceSize && {
      sourceSize: { w: round(json.sourceSize.w), h: round(json.sourceSize.h) },
    }),
    ...(json.offset && { offset: { x: round(json.offset.x), y: round(json.offset.y) } }),
  }
}

/**
 * Composite a planned tier into a PNG buffer, cutting each frame from the source and resizing it ALONE.
 *
 * `sharp` is passed in rather than imported so this module stays dependency-free and testable, and so the
 * pipes control which sharp instance (and therefore which libvips) is used.
 */
export async function renderTier(sharp, sourceBuffer, plan) {
  const tiles = await Promise.all(
    plan.frames.map(async (f) => {
      // Cut and (if the packer stored it turned) straighten, as its OWN sharp pass. Chaining
      // extract -> rotate -> resize in one pipeline leaves the order up to sharp's internal stage
      // ordering; splitting it makes "straighten, then scale" explicit and unambiguous, which matters
      // because a wrong order here silently mangles only the rotated frames.
      let cut = sharp(sourceBuffer).extract(storedRegion(f))
      if (f.rotated) cut = cut.rotate(UNROTATE_DEG)
      const upright = await cut.png().toBuffer()

      return {
        input: await sharp(upright).resize(f.w, f.h, { fit: 'fill' }).png().toBuffer(),
        left: f.x,
        top: f.y,
      }
    }),
  )

  return sharp({
    create: {
      width: plan.sheetW,
      height: plan.sheetH,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(tiles)
    .png()
    .toBuffer()
}
