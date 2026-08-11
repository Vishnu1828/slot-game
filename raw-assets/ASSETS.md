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
  A **nested** `{m}` is its own bundle and its assets leave the parent.
- **`{tps}`** = pack small images into one atlas; big images/backgrounds stay **loose**.
- **`{nomip}`** = single resolution (animation sheets, fonts); **`{nc}`** = no compress (fonts).
- Atlas frame names are **bare & global within a bundle** (must be unique); per-game loose images are
  **game-scoped** via `makeTheme` so they don't collide across games.
- **Win art goes in `games/<game>{m}/win/<game>-win{m}{nomip}/`** — bounce, winning glows and the win
  popup. The nested `{m}` keeps it out of the game bundle so it loads per win instead of at startup;
  it's the heaviest art in the game (~570 MB decoded for fortune-teller). Keep the `<game>-` prefix.
- After adding/removing assets: `npm run assets` (or it runs under `npm run dev`) → **reload** the page,
  then `npm run validate:assets`.
