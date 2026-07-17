# raw-assets — source assets (input to AssetPack)

These are the **source** files. `npm run assets` processes them into optimized, multi-resolution
output under `public/assets/` (git-ignored). Author art at **4K** — AssetPack only scales **down**
(to 2K and 1K), so nothing is ever upscaled or blurry. **Never edit `public/assets/` by hand.**

## 📖 Full guide → [`docs/assets.md`](../docs/assets.md)

The complete, authoritative reference — folder structure, bundles & tags, common vs game-specific
placement, asset **naming/alias** rules, the "theme contract" names shared across games, how assets
render at runtime, add-a-game / add-a-common-asset recipes, and pitfalls — lives in
[`docs/assets.md`](../docs/assets.md). Read that before adding or renaming anything here.

## 30-second orientation

- A folder becomes a loadable bundle only when tagged **`{m}`** (`common{m}/`, `games/<game>{m}/`).
- **`{tps}`** = pack small images into one atlas; big images/backgrounds stay **loose**.
- **`{nomip}`** = single resolution (animation sheets, fonts); **`{nc}`** = no compress (fonts).
- Atlas frame names are **bare & global within a bundle** (must be unique); per-game loose images are
  **game-scoped** via `makeTheme` so they don't collide across games.
- After adding/removing assets: `npm run assets` (or it runs under `npm run dev`) → **reload** the page.
