# raw-assets — source assets (input to AssetPack)

These are the **source** files. Running `npm run assets` processes them into optimized,
multi-resolution output under `public/assets/` (git-ignored). Author art at **4K** — AssetPack
only ever scales **down** (to 2K and 1K), so nothing is ever upscaled or blurry.

## Bundles

A folder becomes a loadable PixiJS bundle **only when tagged `{m}`**. A `{m}` folder nested
inside another `{m}` folder is its own **separate** bundle (the parent bundle does *not* include
the nested assets). Everything untagged lands in the implicit `default` bundle. Bundle names are
the folder basename (`nameStyle: 'short'`), so they **must be unique across games** — hence the
per-game prefix on the nested preload folder.

| Folder                                          | Bundle name        | Loaded when            |
| ----------------------------------------------- | ------------------ | ---------------------- |
| `common{m}/`                                    | `common`           | shared, once           |
| `games/<game>{m}/`                              | `<game>`           | that game              |
| `games/<game>{m}/<game>-preload{m}/`            | `<game>-preload`   | that game's loading UI |

The preload bundle lives **inside** its game folder. Add a new game by copying the whole
`games/<game>{m}/` folder (including its `<game>-preload{m}` child) with a new unique prefix.
(A shared boot bundle can be re-added later as `common-preload{m}/` if needed.)

## Asset-family conventions (per bundle)

| Family     | Where                    | Tag / notes                                              |
| ---------- | ------------------------ | ------------------------------------------------------- |
| UI texture | `ui{tps}/`               | `{tps}` = pack into one atlas, mipmapped to 3 tiers      |
| Symbols    | `reels{tps}/`            | `{tps}` atlas                                            |
| Big image  | `images/`                | loose (backgrounds >4096px); still mipmapped            |
| Animation  | `animations/<name>{tps}/`| frame sequence packed; or drop spine `.skel/.atlas/.png`|
| Sound      | `sounds/`                | `.wav`/`.mp3`/`.ogg` → auto-transcoded to `.mp3` + `.ogg`|
| Font       | `fonts{nomip}{nc}/`      | drop pre-baked bitmap font pairs `Name.fnt` + `Name.png`|

### Bitmap fonts (important)

Put pre-baked bitmap fonts (`Name.fnt` + `Name.png`) in a folder tagged **`fonts{nomip}{nc}`**:

- `{nomip}` — do **not** generate resolution variants (a font atlas's glyph coords are baked to
  its exact `.png`; a resized copy would be wrong).
- `{nc}` — do **not** compress (the `.fnt` references the `.png` specifically, not a `.webp`).
- The config additionally exempts `fonts/` files from **cache-busting**, so the `.png` keeps its
  name and the `.fnt`'s `file="Name.png"` reference stays valid.

Both files must sit together and the `.fnt`'s `file=` must name the sibling `.png`. To instead
**generate** a font from a `.ttf`, tag it `{msdf}` (or `{sdf}`) and add `msdfFont()` to the
`pipes` in `.assetpack.js` — output is the same `.fnt` + `.png` pair.

## Tag cheat-sheet

- `{m}` — start a new manifest bundle. `{mIgnore}` — exclude from manifest.
- `{tps}` — pack a folder of images into a texture atlas.
- `{msdf}` / `{sdf}` — generate a bitmap font from a `.ttf` (needs `msdfFont()` in the pipes).
- `{fix}` — emit only the base resolution (no downscaled variants).
- `{nomip}` — no resolution variants at all.
- `{nc}` — do not compress.
