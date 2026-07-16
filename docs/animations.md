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

## Texture ownership / cleanup

- **Custom sheet:** *we* created the per-frame `Texture` windows, so we `texture.destroy(false)` them
  on change/unmount. The `false` keeps the shared `TextureSource` (owned by the Assets cache) alive —
  destroying it would break every other window into that PNG.
- **Standard `Spritesheet`:** the sheet owns its textures; we don't destroy them.

## Adding a new animation

1. Export the sheet as **one PNG + one custom JSON** (the `sprites` format above).
2. Drop both into the game's animations folder, same base name:
   `raw-assets/games/<game>{m}/animations{nomip}/<name>.png` and `<name>.json`.
   - **Not `{tps}`** — the PNG is already packed; `{tps}` would re-pack it into a different atlas and
     invalidate your JSON coords.
   - **Must be `{nomip}`** — a pre-baked sheet must ship at a SINGLE resolution. Without it, AssetPack
     generates `@0.5x`/`@0.25x` copies; when a downscaled tier is served, your JSON coords (in the
     original size) slice the wrong region and you get **partial frames** (e.g. 2 of 4 candles). Same
     reason bitmap fonts are tagged `{nomip}`.
3. Run `npm run assets` (or it's already running under `npm run dev`) and **reload** the page so the
   new manifest is picked up. Both files land in the game bundle and load with `loadGame`.
4. Render it:

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
| `sheet` | — | base alias (`<name>` → `<name>.png` + `<name>.json`) |
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
- **Put the PNG in a `{tps}` folder** → AssetPack re-packs it into a *different* atlas and your JSON
  coords no longer match. Keep animation PNG+JSON in a plain `{nomip}` folder.
- **Blurry frames** → a low tier was served; author the sheet large enough, and never upscale sources.
