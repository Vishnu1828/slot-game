# Sprite-sheet animations

How frame animations work in this project, why the setup is the way it is, and how to add one.
The reusable player is [`src/components/pixi/PixiGameAnimation.tsx`](../src/components/pixi/PixiGameAnimation.tsx).

## What a sprite-sheet animation is

An animation is a **flipbook**: a stack of still frames shown quickly. Instead of shipping N separate
PNGs (N downloads, N GPU uploads), all frames are packed into **one big PNG** (the "sprite sheet")
plus a small **JSON** that lists where each frame sits inside that PNG.

Example: `candle_light.png` is one 2794×2156 image; `candle_light.json` lists 30 rectangles
(254×196 each) — one per candle-flicker frame.

## The 3 Pixi building blocks (the mental model)

| Pixi type | What it is | Analogy |
|---|---|---|
| `TextureSource` | the actual image uploaded to the GPU (the whole PNG) | a contact sheet pinned to the wall |
| `Texture` | a **window** into a source: `{ source, frame: Rectangle }` | a cutout that shows only one photo |
| `AnimatedSprite` | a sprite that flips through an **array of `Texture`s** | the flipbook that swaps cutouts |

Key insight: **one `TextureSource` (one GPU upload), many `Texture` windows into it.** That's what
makes sheets efficient — 30 frames = 1 GPU texture + 30 cheap rectangle windows.

```
TextureSource (candle_light.png on GPU)
 ├─ Texture(frame 0,0,254,196)
 ├─ Texture(frame 254,0,254,196)
 └─ … 30 windows
        ↓
 AnimatedSprite([t0, t1, … t29])  → flips through them each tick
```

## Two JSON "dialects"

There are two sprite-sheet metadata shapes, and they're handled completely differently:

**A. Standard Pixi / TexturePacker** — has `frames` + `meta`:
```json
{ "frames": { "f0": { "frame": {"x":0,"y":0,"w":254,"h":196} } }, "meta": { "image": "sheet.png" } }
```
Pixi recognizes this automatically. `Assets.get("sheet")` returns a ready `Spritesheet` with
`.textures` (windows already cut) and `.animations`. You do nothing. This is what AssetPack's `{tps}`
folders produce.

**B. This project's animation format** — a plain PNG + custom JSON with a `sprites` array:
```json
{ "sprites": [{ "fileName":"candlelight_000.png", "x":0,"y":0,"width":254,"height":196 }],
  "spriteSheetWidth": 2794, "spriteSheetHeight": 2156 }
```
Pixi does **not** understand this. Loading a `.json` with no `frames`/`meta` just returns the **raw
parsed object** — Pixi cuts no windows. *We* slice the frames ourselves with
`new Texture({ source, frame })`. `PixiGameAnimation` does this for you.

## How `PixiGameAnimation` plays a custom sheet — step by step

```
loadGame()  → game bundle downloads <name>.png + <name>.json
     ↓
Assets.get("<name>.png")   → Texture wrapping the GPU TextureSource
Assets.get("<name>.json")  → raw { sprites, spriteSheetWidth } object
     ↓
for each sprite rect:  new Texture({ source: atlas.source, frame: Rectangle(x·k, y·k, w·k, h·k) })
     ↓                                                              (k = resolution scale — see below)
textures = [t0 … tN]
     ↓
<pixiAnimatedSprite textures={textures}/> → gotoAndPlay(0) → the ticker advances the frame each tick
```

It also accepts a standard Pixi `Spritesheet` under the same alias (uses `.animations[name]` or all
`.textures`) — so both dialects work through one component.

## One sequence split across several sheets

`sheet` accepts a **string or an array**. An array is treated as ONE sequence: the frames of every
sheet are pooled and put in playback order together, so the sheets may be listed in any order and a
frame may live in any of them.

```tsx
<PixiGameAnimation sheet={["win-0", …, "win-9"]} loop={false} durationMs={3000} />
```

This exists because a long sequence can't fit one sheet under the 4096px cap. The win-popup art is 80
frames of 867×527 spread over ten 2048×2048 sheets — and the exporter scattered them: `win-0.json`
holds frames 13, 10, 11, 12, 52, 50, 51, 49, and carries no `animations` key at all.

`orderFrames` therefore picks one of three strategies, in order:

1. **Every source already ordered** (a named `animations` entry, or the custom dialect's `sprites`
   array) → concatenate as-is.
2. **Every pooled frame name ends in digits** → sort by that trailing number, across all sheets. This
   is the case above, and it also makes a single scrambled TexturePacker export play correctly.
3. **Otherwise** → insertion order.

Rule 2 is the only inference. It's inert for the decor and symbol sheets here, which take rule 1 or 3.
If your exporter emits an `animations` key, you get rule 1 and nothing is guessed.

Frame COUNT never appears in code: `durationMs` derives the speed from `textures.length`, so
re-exporting with more or fewer frames needs no change. See the win-presentation section of
[assets.md](assets.md) for how these sheets are loaded and freed.

## The killer detail: resolution tiers and `k`

AssetPack generates **multiple resolution tiers** of every image (`@0.5x`, `@0.25x`) so small devices
download small images; Pixi serves whichever tier fits. But the JSON coordinates are always in the
**original** image's pixel space (2794 wide). If Pixi loaded the 1397-wide `@0.5x` copy and you cut a
rectangle at the original `x=254`, you slice the **wrong pixels**.

Fix: convert JSON coords into the *loaded* image's space with a scale factor

```
k = atlas.source.pixelWidth / json.spriteSheetWidth
```

| Tier served | pixelWidth | k | frame.x = 254·k |
|---|---|---|---|
| full | 2794 | 1.0 | 254 ✅ |
| @0.5x | 1397 | 0.5 | 127 ✅ |
| @0.25x | 699 | 0.25 | 63.5 ✅ |

Because Pixi tags each tier with a `resolution`, the sliced frame still **displays** at the original
254×196 logical size — so you get correct frames *and* correct size at any tier.

> **This is why a naive slicer (`Rectangle(sprite.x, sprite.y, …)` with no `k`) only works when there
> is a single, full-size image** (`k = 1`). The moment a multi-resolution build serves a smaller tier,
> it breaks. Always derive from `source.pixelWidth`, never assume the original size.

## Drift — why a swing turns into a slide

**Drift is when the subject creeps a little further off-centre in every frame, so instead of swinging
in place it slowly slides across the screen and then jumps back at the loop.** The lanterns and the
chandelier both shipped like this. It is the single easiest way to break one of these sheets, and the
hardest to spot by eye.

### Where it comes from

A sheet is a grid, and the JSON says how big one cell is. That number must be a **whole** pixel — you
cannot have a cell 235.5px tall. So when a sheet is shrunk to fit the GPU limit, the cell size gets
rounded.

If you then resize the *whole image* in one go, the artwork is scaled by a factor that does **not**
match that rounded cell. Row 1 is off by half a pixel, row 2 by one, row 3 by one and a half — the
error adds up all the way down the sheet:

```
what the JSON thinks          where the art actually is
┌──────────┐ row 0            ┌──────────┐   aligned
├──────────┤ row 1            ├──────────┤   ½px low
├──────────┤ row 2            ├──────────┤   1px low
├──────────┤ row 3            ├──────────┤   1½px low   → by the last row it is far off,
└──────────┘                  └──────────┘      and frame 0 snaps it back
```

`fit-animation-sheets.mjs` avoids this by cutting **each frame out first, scaling it on its own, and
placing it on an exact grid** — so there is no rounding left to accumulate. Never shrink one of these
sheets in an image editor; use that script.

### How the check finds it

A looping animation has to come home: its last frame sits right next to its first. So
`check-animations.mjs` follows the centre of the artwork frame by frame and asks how much of its
movement is **one-way**:

```
directness = |last frame − first frame| ÷ total distance travelled
```

A pendulum swings out and back, so it nets out near zero. Drift never comes back, so nearly all of its
travel is net displacement:

| | directness |
|---|---|
| drifting sheet | **1.00** |
| `candle_light` — flame wanders 24px, ends 2px away | 0.08 |
| a correctly fitted sheet | < 0.02 |

Anything over **0.3** fails. It measures the *alpha-weighted centre*, not a bounding box — a bounding
box follows the faintest antialiased pixel, which is exactly what hid this bug during the first two
attempts to diagnose it.

One-shot sequences are skipped: the 80-frame win popup spread over ten files plays once and is under no
obligation to end where it started. The check treats a sheet as looping only when its JSON declares a
named `animations` entry.

## Texture ownership / cleanup

- **Custom sheet:** *we* created the per-frame `Texture` windows, so we `texture.destroy(false)` them
  on change/unmount. The `false` keeps the shared `TextureSource` (owned by the Assets cache) alive —
  destroying it would break every other window into that PNG.
- **Standard `Spritesheet`:** the sheet owns its textures; we don't destroy them.

## Adding a new animation

1. Export the sheet as **one PNG + one custom JSON** (the `sprites` format above).
2. Drop both into the right folder, same base name — **which folder depends on when it plays**:

   | Plays | Folder | Loaded |
   |---|---|---|
   | continuously (decor: candles, lamps) | `games/<game>{m}/animations{nomip}/` | eagerly, with `loadGame` |
   | only during a win (bounce / glow / popup) | `games/<game>{m}/win/<game>-win{m}{nomip}/` | per win — see [assets.md](assets.md) |

   - **Not `{tps}`** — the PNG is already packed; `{tps}` would re-pack it into a different atlas and
     invalidate your JSON coords.
   - **Must be `{nomip}`** — a pre-baked sheet must ship at a SINGLE resolution. Without it, AssetPack
     generates `@0.5x`/`@0.25x` copies; when a downscaled tier is served, your JSON coords (in the
     original size) slice the wrong region and you get **partial frames** (e.g. 2 of 4 candles). Same
     reason bitmap fonts are tagged `{nomip}`.
   - Win art gets the extra `{m}`, which is what keeps it out of the game bundle. Get this wrong and
     nothing breaks — it just loads eagerly again, quietly costing hundreds of MB.
3. **Export at FULL size — do not shrink it yourself for mobile.** If it's over 4096px per side, run
   `npm run fit:animations`, which shrinks it correctly (see [Drift](#drift--why-a-swing-turns-into-a-slide)).
4. **Test it — this step is not optional:**

   ```bash
   npm run check:animations   # size + drift; catches the two ways these sheets break
   npm run validate:assets    # .json/.png pairing, alias resolution, bundle wiring
   ```

   Both are read-only and take a few seconds. `check:animations` covers **both** folders and both JSON
   dialects. Run them before you commit — the drift bug below shipped precisely because nothing tested
   for it.
5. Run `npm run assets` (or it's already running under `npm run dev`) and **reload** the page so the
   new manifest is picked up.
6. Render it:

```tsx
import PixiGameAnimation from "@/components/pixi/PixiGameAnimation";

<PixiGameAnimation sheet="candle_light" x={w / 2} y={h / 2} loop animationSpeed={0.4} />
```

`sheet` is the base name; the component looks up `<name>.png` and `<name>.json` (extension-qualified,
to avoid the bare-name shortcut colliding across the two files). Frames play in `sprites[]` order, so
name your source frames with zero-padded indices (`_000`, `_001`, …).

## Props cheat-sheet

| prop | default | notes |
|---|---|---|
| `sheet` | — | base alias (`<name>` → `<name>.png` + `<name>.json`), or an **array** = one sequence pooled across sheets |
| `animation` | — | only for a standard `Spritesheet` (named animation) |
| `x`, `y`, `anchor` | anchor `0.5` | placement (anchor is center by default) |
| `width`, `height`, `scale` | natural | display size overrides |
| `loop` | `true` | loop or play once |
| `animationSpeed` | `0.4` | frames advanced per tick |
| `autoPlay` | `true` | start on mount; `false` = stopped on frame 0 |
| `restartKey` | — | change it to restart from frame 0 |
| `onComplete` | — | fires when a non-looping animation ends |
| `onFrameChange` | — | `(frame, total)` each frame |

Speed/loop update **in place**; only a new frame-set or `restartKey` restarts. Callbacks are held in
refs, so swapping a callback never restarts playback.

## Common pitfalls

- **Nothing renders** → the sheet isn't loaded yet, or the alias is wrong. Confirm `<name>.png` /
  `<name>.json` exist in `public/assets/manifest.json` after `npm run assets` + reload.
- **Frames shifted/garbled** → resolution mismatch; make sure coords are scaled by `k` (they are, in
  `PixiGameAnimation`). Don't hand-slice with raw JSON coords elsewhere.
- **Partial frames (e.g. 2 of 4)** → the sheet shipped multi-resolution. Tag the folder `{nomip}` so
  it's single-resolution and the JSON coords line up (this is the usual cause).
- **The art slides across and jumps back each loop** → drift, from shrinking the sheet the wrong way.
  See [Drift](#drift--why-a-swing-turns-into-a-slide). Catch it with `npm run check:animations`, fix it
  with `npm run fit:animations`. Never shrink one of these sheets in an image editor.
- **Black screen / nothing on a real phone** → the PNG is over the ~4096px GPU limit, so it can't be
  uploaded. Same two commands: `check:animations` reports it, `fit:animations` fixes it. Export at full
  size and let the script shrink it — it is the only thing that shrinks these correctly.
- **Put the PNG in a `{tps}` folder** → AssetPack re-packs it into a *different* atlas and your JSON
  coords no longer match. Keep animation PNG+JSON in a plain `{nomip}` folder.
- **Blurry frames** → a low tier was served; author the sheet large enough, and never upscale sources.
- **Black box / nothing on mobile (esp. Android)** → the PNG exceeds the GPU **max texture size**.
  Mobile/Android caps textures at ~**4096px per side** (desktop 8192–16384); a larger texture can't
  upload to WebGL, so Pixi shows black/nothing. `{nomip}` ships sheets at full size and the `{tps}`
  `maximumTextureSize` cap does **not** apply to these loose sheets, so nothing clamps them
  automatically. Keep every animation sheet **≤ 4096px on each side** (drop to **≤ 2048** if you must
  support old/low-end devices). If a sheet is too big, run `node scripts/fit-animation-sheets.mjs` — it
  downscales any oversized sheet's PNG **and** rewrites its JSON grid coords by the same factor (safe
  for `PixiGameAnimation`; only sharpness drops), then re-run `npm run assets`. For best quality at
  small on-screen sizes, prefer re-exporting the animation with fewer/smaller frames rather than
  relying on the downscaler.
