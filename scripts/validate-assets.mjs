#!/usr/bin/env node
/**
 * Asset validator — fails the build (exit 1) if source assets violate the rules the pipeline relies on.
 * Runs in CI BEFORE AssetPack so bad assets never reach the CDN. Also runnable locally:
 *   node scripts/validate-assets.mjs   (or: npm run validate:assets)
 *
 * Checks (see docs/asset-pipeline.md and docs/assets.md):
 *   ERRORS (fail):
 *     1. Animation sheets: <name>.png + <name>.json pair; PNG <= 4096px/side; JSON sheet dims == PNG dims.
 *     2. Atlas ({tps}) frame-name uniqueness within a bundle (nameStyle:'short' -> no dup filenames).
 *     3. Bitmap fonts: `file=` names an existing sibling .png; `face=` equals the filename and has no
 *        spaces (a BitmapText's fontFamily must match the .fnt face).
 *     4. Bundle integrity: every games/<id>{m}/ folder <-> a registry GAMES key (both directions).
 *     5. commonTheme aliases: every alias in commonTheme.ts resolves to a real source asset.
 *   WARNINGS (report, don't fail):
 *     6. Per-game "theme contract" default files present (background/logo/frame/spin).
 */
import {
  readFileSync,
  readdirSync,
  statSync,
  existsSync,
  openSync,
  readSync,
  closeSync,
} from "node:fs";
import { join, extname, basename, relative } from "node:path";

const ROOT = process.cwd();
const RAW = join(ROOT, "raw-assets");
const MAX_TEXTURE = 4096;
const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const SOUND_EXTS = new Set([".wav", ".mp3", ".ogg"]);

const errors = [];
const warnings = [];
const err = (m) => errors.push(m);
const warn = (m) => warnings.push(m);

// ---------- fs helpers ----------
function walk(dir, out = []) {
  console.log(`walk ${relative(ROOT, dir)}`);
  for (const name of readdirSync(dir)) {
    if (name === ".DS_Store") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}
const segs = (p) => relative(RAW, p).split("/");
const inTps = (p) => segs(p).some((s) => s.includes("{tps}"));
// Animation sheets live in two places: `animations{nomip}/` (decor) and the per-game win bundle
// `<id>-win{m}{nomip}/`. Both are PNG+JSON pairs with baked coords, so both get the same checks —
// matching only "animations" silently skipped every win/bounce sheet in the game.
const inAnim = (p) =>
  segs(p).some((s) => s.startsWith("animations") || s.includes("-win{"));
const inFonts = (p) => segs(p).some((s) => s.startsWith("fonts"));
const bundleOf = (p) => {
  const s = segs(p);
  if (s[0].startsWith("common")) return "common";
  if (s[0] === "games" && s[1]) return s[1].replace(/\{m\}$/, "");
  return "default";
};
const stem = (p) => basename(p, extname(p));

/** Read a PNG's pixel dimensions from its IHDR chunk (no external deps). */
function pngSize(p) {
  const fd = openSync(p, "r");
  const buf = Buffer.alloc(24);
  readSync(fd, buf, 0, 24, 0);
  closeSync(fd);
  if (buf.toString("ascii", 1, 4) !== "PNG") return null;
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

if (!existsSync(RAW)) {
  console.error("✖ raw-assets/ not found");
  process.exit(1);
}
const files = walk(RAW);

// ---------- build the set of available aliases (bare basenames) ----------
const available = new Set();
const atlasFramesByBundle = new Map(); // bundle -> Map<frameName, filepath>
for (const f of files) {
  const ext = extname(f).toLowerCase();
  if (inTps(f) && IMAGE_EXTS.has(ext)) {
    const b = bundleOf(f);
    const m = atlasFramesByBundle.get(b) ?? new Map();
    // duplicate frame name within the same bundle = clash (check 2)
    if (m.has(stem(f))) {
      err(
        `[atlas] duplicate frame "${stem(f)}" in bundle "${b}":\n    - ${relative(ROOT, m.get(stem(f)))}\n    - ${relative(ROOT, f)}`,
      );
    } else m.set(stem(f), f);
    atlasFramesByBundle.set(b, m);
    available.add(stem(f));
  } else if (inAnim(f) && ext === ".png") {
    available.add(stem(f));
  } else if (inFonts(f) && (ext === ".fnt" || ext === ".png")) {
    available.add(stem(f)); // font "face" == file basename by convention
  } else if (IMAGE_EXTS.has(ext)) {
    available.add(stem(f)); // loose image
  } else if (SOUND_EXTS.has(ext)) {
    available.add(stem(f)); // sound (addressed by alias too)
  }
}

// ---------- 1. animation sheets ----------
for (const f of files) {
  if (!inAnim(f)) continue;
  const ext = extname(f).toLowerCase();
  if (ext === ".png") {
    const jsonPath = f.replace(/\.png$/i, ".json");
    if (!existsSync(jsonPath)) {
      err(`[anim] ${relative(ROOT, f)} has no matching .json`);
      continue;
    }
    const size = pngSize(f);
    if (!size) {
      err(`[anim] ${relative(ROOT, f)} is not a readable PNG`);
      continue;
    }
    if (size.w > MAX_TEXTURE || size.h > MAX_TEXTURE) {
      err(
        `[anim] ${relative(ROOT, f)} is ${size.w}x${size.h} — exceeds GPU max ${MAX_TEXTURE}px (run scripts/fit-animation-sheets.mjs)`,
      );
    }
    try {
      const j = JSON.parse(readFileSync(jsonPath, "utf8"));
      if (
        j.spriteSheetWidth &&
        (j.spriteSheetWidth !== size.w || j.spriteSheetHeight !== size.h)
      ) {
        err(
          `[anim] ${basename(jsonPath)} sheet dims ${j.spriteSheetWidth}x${j.spriteSheetHeight} != PNG ${size.w}x${size.h}`,
        );
      }
    } catch {
      err(`[anim] ${relative(ROOT, jsonPath)} is not valid JSON`);
    }
  } else if (ext === ".json") {
    const pngPath = f.replace(/\.json$/i, ".png");
    if (!existsSync(pngPath))
      err(`[anim] ${relative(ROOT, f)} has no matching .png`);
  }
}

// ---------- 3. bitmap fonts ----------
for (const f of files) {
  if (!inFonts(f) || extname(f).toLowerCase() !== ".fnt") continue;
  const txt = readFileSync(f, "utf8");
  const m = txt.match(/file="([^"]+)"/);
  const n = txt.match(/info\b[^\n]*?face="([^"]*)"/);
  if (!n || n[1] === "") {
    err(`[font] ${relative(ROOT, f)} has no info face= reference`);
    continue;
  }
  const face = n[1];
  // `face` is the fontFamily a BitmapText must use; a space (e.g. "Alexandria Medium") breaks that
  // match. Convention: face === the .fnt file name (== the alias the code references).
  if (/\s/.test(face))
    err(
      `[font] ${relative(ROOT, f)} face="${face}" contains a space — a BitmapText's fontFamily must match the face; use "${stem(f)}"`,
    );
  else if (face !== stem(f))
    err(
      `[font] ${relative(ROOT, f)} face="${face}" != filename "${stem(f)}" (the fontFamily the code references)`,
    );
  if (!m) {
    err(`[font] ${relative(ROOT, f)} has no page file= reference`);
    continue;
  }
  const ref = m[1];
  if (/\s/.test(ref))
    err(
      `[font] ${relative(ROOT, f)} file="${ref}" contains a space (breaks loading)`,
    );
  const png = join(f, "..", ref);
  if (!existsSync(png))
    err(`[font] ${relative(ROOT, f)} references missing page "${ref}"`);
}

// ---------- 4. bundle <-> registry ----------
const gameFolders = existsSync(join(RAW, "games"))
  ? readdirSync(join(RAW, "games"))
      .filter((d) => d.endsWith("{m}"))
      .map((d) => d.replace(/\{m\}$/, ""))
  : [];
const registryPath = join(ROOT, "src/game/registry.ts");
const registryIds = new Set();
if (existsSync(registryPath)) {
  const reg = readFileSync(registryPath, "utf8");
  const gamesBlock = reg.slice(reg.indexOf("GAMES"));
  for (const m of gamesBlock.matchAll(/"([a-z0-9-]+)":\s*\{/g))
    registryIds.add(m[1]);
} else {
  warn("registry.ts not found — skipping bundle/registry check");
}
for (const id of gameFolders) {
  if (registryIds.size && !registryIds.has(id))
    err(`[registry] game folder "games/${id}{m}" has no registry GAMES entry`);
}
for (const id of registryIds) {
  if (!gameFolders.includes(id))
    err(
      `[registry] registry game "${id}" has no raw-assets/games/${id}{m}/ folder`,
    );
}

// ---------- 5. commonTheme aliases resolve ----------
const ctPath = join(ROOT, "src/constants/commonTheme.ts");
if (existsSync(ctPath)) {
  const ct = readFileSync(ctPath, "utf8");
  const aliases = new Set();
  for (const m of ct.matchAll(/:\s*"([^"]+)"/g)) {
    if (/^[A-Za-z0-9_]+$/.test(m[1])) aliases.add(m[1]); // alias-shaped tokens only
  }
  for (const a of aliases) {
    if (!available.has(a))
      err(
        `[commonTheme] alias "${a}" does not resolve to any source asset in raw-assets/`,
      );
  }
} else {
  warn("commonTheme.ts not found — skipping alias resolution check");
}

// ---------- 6. per-game theme contract (WARN) ----------
const CONTRACT_LOOSE = [
  "images/bg_horizontal",
  "images/bg_vertical",
  "ui/logo",
  "frame/reel_frame_horizontal",
  "frame/reel_frame_vertical",
  "frame/reel_bg_horizontal",
  "frame/reel_bg_vertical",
];
const CONTRACT_FRAMES = ["spin_active", "spin_pressed", "spin_disabled"];
for (const id of gameFolders) {
  const base = join(RAW, "games", `${id}{m}`);
  for (const rel of CONTRACT_LOOSE) {
    const hit =
      IMAGE_EXTS.size &&
      [...IMAGE_EXTS].some((e) => existsSync(join(base, rel + e)));
    if (!hit)
      warn(
        `[contract] game "${id}" missing default ${rel}.<img> (ok if overridden in theme.ts)`,
      );
  }
  const frames = atlasFramesByBundle.get(id) ?? new Map();
  for (const fr of CONTRACT_FRAMES) {
    if (!frames.has(fr))
      warn(
        `[contract] game "${id}" missing spin frame "${fr}" (ok if overridden)`,
      );
  }
}

// ---------- report ----------
for (const w of warnings) console.warn("⚠ " + w);
for (const e of errors) console.error("✖ " + e);
if (errors.length) {
  console.error(
    `\n✖ asset validation FAILED: ${errors.length} error(s), ${warnings.length} warning(s).`,
  );
  process.exit(1);
}
console.log(`✔ asset validation passed (${warnings.length} warning(s)).`);
