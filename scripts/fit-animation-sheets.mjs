// Downscale oversized custom animation sheets so they fit under the GPU max texture size.
//
// WHY: mobile/Android GPUs cap textures at ~4096px per side (desktop 8192-16384). A loose
// `animations{nomip}` sheet larger than that can't be uploaded to WebGL, so Pixi renders a
// BLACK BOX / nothing (chandelier, hanging_lamps did exactly this on Android). AssetPack's
// `maximumTextureSize` only guards `{tps}` atlases, not these loose sheets, and `{nomip}`
// ships them at full size, so nothing else clamps them.
//
// WHAT: for each `<sheet>.png` + `<sheet>.json` whose PNG exceeds CAP, shrink the PNG AND
// rewrite the JSON grid coords by the same factor. The frames are a uniform grid, so we
// recompute clean grid positions (avoids sub-pixel drift). Transparent to PixiGameAnimation
// (it slices by JSON coords; k = pixelWidth/spriteSheetWidth is preserved) and to DecorAnimation
// (explicit display size) — only resolution/sharpness drops. Idempotent: already-small sheets
// are skipped, so re-running is a no-op.
//
// Run:  node scripts/fit-animation-sheets.mjs        (then regenerate: npm run assets)

import { readFileSync, writeFileSync } from "node:fs";
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

  // Uniform grid: derive per-frame size + column/row from the original coords, then rebuild
  // clean scaled positions so frames stay perfectly tiled at the new resolution.
  const fw = json.sprites[0].width;
  const fh = json.sprites[0].height;
  const newFrameW = Math.round(fw * factor);
  const newFrameH = Math.round(fh * factor);
  const cols = Math.round(json.spriteSheetWidth / fw);
  const rows = Math.round(json.spriteSheetHeight / fh);
  const newSheetW = cols * newFrameW;
  const newSheetH = rows * newFrameH;

  json.sprites = json.sprites.map((s) => {
    const col = Math.round(s.x / fw);
    const row = Math.round(s.y / fh);
    return {
      ...s,
      x: col * newFrameW,
      y: row * newFrameH,
      width: newFrameW,
      height: newFrameH,
    };
  });
  json.spriteSheetWidth = newSheetW;
  json.spriteSheetHeight = newSheetH;

  await sharp(pngPath).resize(newSheetW, newSheetH).toFile(pngPath + ".tmp");
  // sharp can't read+write the same path in one pipeline; swap the temp in.
  writeFileSync(pngPath, readFileSync(pngPath + ".tmp"));
  const { unlinkSync } = await import("node:fs");
  unlinkSync(pngPath + ".tmp");
  writeFileSync(jsonPath, JSON.stringify(json, null, 2) + "\n");

  console.log(
    `FIT  ${basename(pngPath)}: ${meta.width}x${meta.height} -> ${newSheetW}x${newSheetH} (x${factor.toFixed(3)})`,
  );
  changed++;
}

console.log(changed ? `\nDone: ${changed} sheet(s) downscaled. Now run: npm run assets` : "\nNothing to do — all sheets within cap.");
