// Health-check every animation sheet the game ships. Read-only — it never edits anything.
//
// Catches the two ways these sheets break, both of which we have actually shipped:
//
//   1. TOO BIG        A sheet over the GPU max texture size can't upload to WebGL, so Pixi draws a
//                     BLACK BOX / nothing. Mobile + Android cap at ~4096px per side. AssetPack's
//                     `maximumTextureSize` only guards `{tps}` atlases, never these loose sheets.
//
//   2. LOOP DRIFT     The subject creeps one way across the animation and snaps back at the wrap —
//                     a swinging lantern turns into a sliding one. This is what a naive downscale
//                     produces: round the frame size to whole px, then resize the whole sheet, and
//                     every row lands a fraction of a px off its cell, accumulating down the sheet.
//                     See `fit-animation-sheets.mjs`, which rescales each frame individually to
//                     avoid exactly this.
//
// How drift is detected: a looping animation has to come home, so the last frame sits next to the
// first. We track each frame's alpha-weighted centroid (robust — a plain bounding box is thrown off by
// faint antialiased edges, which is how this bug hid for so long) and measure DIRECTNESS:
//
//     directness = |last - first|  /  total distance travelled
//
// Drift goes one way and never comes back, so nearly all of its travel is net displacement. Anything
// that returns home — a swing, a flicker — spends its travel going back and forth and nets out near
// zero. Measured on real sheets: a drifting sheet scores 1.00, `candle_light`'s flickering flame
// scores 0.08 (it wanders 24px in total but ends 2px from where it started), and correctly-fitted
// sheets score under 0.02. Hence the 0.3 threshold — far above the noise, far below any real drift.
//
// Comparing the seam to a typical frame STEP instead does not work: a flickering flame has tiny steps
// and would false-positive.
//
// Two sheet formats are handled (see docs/animations.md, "Two JSON dialects"):
//   - custom      `sprites[]` on a uniform grid  — the decor sheets in `animations{nomip}/`
//   - TexturePacker `frames{}` + optional `animations{}` — the win sheets in `win/<id>-win{nomip}/`
//
// Run:  npm run check:animations                          (everything)
//       node scripts/check-animations.mjs <sheet.json>     (one sheet — handy for testing)

import { readFileSync, globSync } from "node:fs";
import { dirname, join, basename, relative } from "node:path";

let sharp;
try {
  sharp = (await import("sharp")).default;
} catch {
  console.error("✖ this check needs `sharp` (it decodes the sheets). Run `npm i -D sharp`.");
  process.exit(1);
}

/** Max px per side before mobile GPUs refuse the upload. Match `fit-animation-sheets.mjs`. */
const CAP = 4096;
/** The first→last gap must exceed this many px before it is worth judging at all. */
const SEAM_FLOOR_PX = 1.5;
/** ...and this share of the total travel must be net displacement. See the note above. */
const DIRECTNESS_LIMIT = 0.3;

/** Trailing frame number, ignoring an extension — matches PixiGameAnimation's own ordering. */
const frameNo = (n) => {
  const m = /(\d+)(?:\.\w+)?$/.exec(n);
  return m ? Number(m[1]) : undefined;
};

/**
 * Normalise either dialect to: the declared sheet size, and a list of frames as
 * `{ rect, offX, offY }` — `off*` being the trim offset, so every centroid is measured in the frame's
 * ORIGINAL (untrimmed) space. Without that, a trimmed sheet would look like it moves when it doesn't.
 *
 * `ordered` is false when we had to guess the play order, and `loops` is false for a one-shot, whose
 * last frame is not supposed to match its first.
 */
function readSheet(json) {
  if (Array.isArray(json.sprites)) {
    return {
      declared: { w: json.spriteSheetWidth, h: json.spriteSheetHeight },
      loops: true,
      frames: json.sprites.map((s) => ({
        rect: { x: s.x, y: s.y, w: s.width, h: s.height },
        offX: 0,
        offY: 0,
      })),
    };
  }
  if (!json.frames || !json.meta?.size) return null;

  // A named `animations` entry IS the play order, and means the sheet is a self-contained sequence.
  // Without one we are looking at a slice of a multi-sheet sequence (the win popup is 80 frames over
  // ten files) — that plays once and need not return home, so drift can't be judged.
  const named = json.animations ? Object.values(json.animations)[0] : null;
  const order =
    named ??
    Object.keys(json.frames).sort((a, b) => (frameNo(a) ?? 0) - (frameNo(b) ?? 0));

  return {
    declared: { w: json.meta.size.w, h: json.meta.size.h },
    loops: !!named,
    rotated: order.some((n) => json.frames[n]?.rotated),
    frames: order.map((n) => {
      const f = json.frames[n];
      return {
        rect: { x: f.frame.x, y: f.frame.y, w: f.frame.w, h: f.frame.h },
        offX: f.spriteSourceSize?.x ?? 0,
        offY: f.spriteSourceSize?.y ?? 0,
      };
    }),
  };
}

const arg = process.argv[2];
const jsonFiles = arg
  ? [arg]
  : [
      ...globSync("raw-assets/games/*/animations*/*.json"), // decor
      ...globSync("raw-assets/games/*/win/*/*.json"), // win: bounce / winning / popup
    ];

const errors = [];
let sized = 0;
let drifted = 0;

for (const jsonPath of jsonFiles) {
  const json = JSON.parse(readFileSync(jsonPath, "utf8"));
  const sheet = readSheet(json);
  if (!sheet) continue; // not an animation sheet
  const rel = relative(process.cwd(), jsonPath);
  const pngPath = join(dirname(jsonPath), basename(jsonPath, ".json") + ".png");

  const { data, info } = await sharp(pngPath).raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H, channels: C } = info;
  sized++;

  // --- 1. size: the black-screen check ---
  if (W > CAP || H > CAP) {
    errors.push(
      `[size] ${rel}\n    ${basename(pngPath)} is ${W}x${H} — over the ${CAP}px GPU limit, so it renders BLACK on mobile.` +
        `\n    Fix: npm run fit:animations`,
    );
  }
  if (W !== sheet.declared.w || H !== sheet.declared.h) {
    errors.push(
      `[grid] ${rel}\n    JSON says ${sheet.declared.w}x${sheet.declared.h} but the PNG is ${W}x${H}.` +
        `\n    Every frame will be sliced from the wrong place.`,
    );
    continue; // centroids would be meaningless
  }

  // --- 2. loop drift ---
  // Only for sequences that are supposed to come home. A one-shot (the multi-sheet win popup) may
  // legitimately end somewhere else, and a rotated frame would need transposing to measure honestly.
  if (!sheet.loops || sheet.rotated || sheet.frames.length < 3) continue;
  drifted++;

  const pts = [];
  for (const f of sheet.frames) {
    let sx = 0;
    let sy = 0;
    let tot = 0;
    for (let y = 0; y < f.rect.h; y++) {
      for (let x = 0; x < f.rect.w; x++) {
        const px = f.rect.x + x;
        const py = f.rect.y + y;
        if (px >= W || py >= H) continue;
        const a = data[(py * W + px) * C + 3];
        if (a) {
          sx += a * x;
          sy += a * y;
          tot += a;
        }
      }
    }
    // Back into the untrimmed frame's own space, so trimming can't masquerade as movement.
    if (tot) pts.push({ x: f.offX + sx / tot, y: f.offY + sy / tot });
  }
  if (pts.length < 3) continue;

  for (const axis of ["x", "y"]) {
    const v = pts.map((p) => p[axis]);
    const seam = Math.abs(v[v.length - 1] - v[0]);
    const travelled = v.slice(1).reduce((sum, n, i) => sum + Math.abs(n - v[i]), 0);
    const directness = travelled ? seam / travelled : 0;
    if (seam > SEAM_FLOOR_PX && directness > DIRECTNESS_LIMIT) {
      errors.push(
        `[drift] ${rel}\n    Along ${axis.toUpperCase()} the art ends ${seam.toFixed(1)}px from where it started, out of` +
          ` ${travelled.toFixed(1)}px travelled — ${(directness * 100).toFixed(0)}% of its movement is one-way.` +
          `\n    It never returns, so the loop snaps back: the subject slides across and jumps home.` +
          `\n    Fix: re-export at full size, then npm run fit:animations`,
      );
    }
  }
}

console.log(`checked ${sized} sheet(s) for size, ${drifted} of them for drift`);
if (errors.length) {
  console.error(`\n${errors.map((e) => "✖ " + e).join("\n\n")}`);
  console.error(`\n✖ animation check FAILED: ${errors.length} problem(s).`);
  process.exit(1);
}
console.log("✔ animation check passed — all sheets fit the GPU limit and every loop comes home.");
