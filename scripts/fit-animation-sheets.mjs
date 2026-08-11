// Downscale oversized custom animation sheets so they fit under the GPU max texture size.
//
// WHY: mobile/Android GPUs cap textures at ~4096px per side (desktop 8192-16384). A loose
// `animations{nomip}` sheet larger than that can't be uploaded to WebGL, so Pixi renders a
// BLACK BOX / nothing (chandelier, hanging_lamps did exactly this on Android). AssetPack's
// `maximumTextureSize` only guards `{tps}` atlases, not these loose sheets, and `{nomip}`
// ships them at full size, so nothing else clamps them.
//
// WHAT: for each `<sheet>.png` + `<sheet>.json` whose PNG exceeds CAP, rebuild the sheet by resizing
// EVERY FRAME INDIVIDUALLY and compositing it onto an exact integer grid.
//
// Why per-frame and not one `resize()` of the whole sheet — this is the important part:
//
//   The frame size has to be a whole number of pixels, so it gets rounded. Resizing the whole sheet
//   scales the artwork by the sheet's own factor, which is NOT that rounded number. Every row then
//   lands a fraction of a pixel off its cell, and because each row is one cell further down, the error
//   ACCUMULATES. The result is art that creeps downward through the animation and snaps back at the
//   loop — a swing turns into a slow slide. Cutting each frame out first and scaling it on its own
//   makes the grid exact by construction, so there is nothing to accumulate.
//
// Transparent to PixiGameAnimation (it slices by JSON coords; k = pixelWidth/spriteSheetWidth is
// preserved) and to DecorAnimation (explicit display size) — only resolution/sharpness drops.
// Idempotent: already-small sheets are skipped, so re-running is a no-op.
//
// Run:  node scripts/fit-animation-sheets.mjs        (then regenerate: npm run assets)

import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { globSync } from "node:fs";
import { dirname, join, basename } from "node:path";
import sharp from "sharp";

const CAP = 4096; // max px per side; keep <= 4096 for Android, drop to 2048 for old/low-end devices

// All custom animation sheets across every game.
const jsonFiles = globSync("raw-assets/games/*/animations*/*.json");

let changed = 0;
for (const jsonPath of jsonFiles) {
  const json = JSON.parse(readFileSync(jsonPath, "utf8"));
  if (!Array.isArray(json.sprites) || !json.spriteSheetWidth) continue; // not a custom sheet

  const pngPath = join(dirname(jsonPath), basename(jsonPath, ".json") + ".png");
  const meta = await sharp(pngPath).metadata();
  const maxSide = Math.max(meta.width, meta.height);
  if (maxSide <= CAP) {
    console.log(`ok   ${basename(pngPath)} (${meta.width}x${meta.height}) — within ${CAP}`);
    continue;
  }

  const factor = CAP / maxSide;
  const fw = json.sprites[0].width;
  const fh = json.sprites[0].height;
  const cols = Math.round(json.spriteSheetWidth / fw);
  const rows = Math.ceil(json.sprites.length / cols);

  // The new frame size is whole pixels, and the new sheet is an exact multiple of it. Both the grid
  // and every frame's position are therefore exact — no rounding is left to accumulate.
  const newFrameW = Math.max(1, Math.round(fw * factor));
  const newFrameH = Math.max(1, Math.round(fh * factor));
  const newSheetW = cols * newFrameW;
  const newSheetH = rows * newFrameH;

  // Cut each frame from its ORIGINAL rect and scale it on its own, so its content keeps the same
  // relationship to its own cell regardless of where the cell sits in the sheet.
  const tiles = [];
  for (let i = 0; i < json.sprites.length; i++) {
    const s = json.sprites[i];
    const input = await sharp(pngPath)
      .extract({ left: s.x, top: s.y, width: s.width, height: s.height })
      .resize(newFrameW, newFrameH, { fit: "fill" })
      .png()
      .toBuffer();
    tiles.push({
      input,
      left: (i % cols) * newFrameW,
      top: Math.floor(i / cols) * newFrameH,
    });
  }

  json.sprites = json.sprites.map((s, i) => ({
    ...s,
    x: (i % cols) * newFrameW,
    y: Math.floor(i / cols) * newFrameH,
    width: newFrameW,
    height: newFrameH,
  }));
  json.spriteSheetWidth = newSheetW;
  json.spriteSheetHeight = newSheetH;

  // sharp can't read+write the same path in one pipeline; build fresh and swap the temp in.
  await sharp({
    create: {
      width: newSheetW,
      height: newSheetH,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(tiles)
    .png()
    .toFile(pngPath + ".tmp");
  writeFileSync(pngPath, readFileSync(pngPath + ".tmp"));
  unlinkSync(pngPath + ".tmp");
  writeFileSync(jsonPath, JSON.stringify(json, null, 2) + "\n");

  console.log(
    `FIT  ${basename(pngPath)}: ${meta.width}x${meta.height} -> ${newSheetW}x${newSheetH} ` +
      `(frame ${fw}x${fh} -> ${newFrameW}x${newFrameH}, ${json.sprites.length} frames rescaled individually)`,
  );
  changed++;
}

console.log(changed ? `\n${changed} sheet(s) refitted — run \`npm run assets\`.` : "\nNothing to do.");
