# CLAUDE.md

Guidance for working in this repo. Read this before making changes.

## What this is

A **multi-game slot/casino platform** built with **PixiJS 8** rendered through **@pixi/react**
(React 19 + TypeScript + Vite). Art is authored at 4K and processed by **AssetPack** into
multi-resolution, per-game asset bundles that are loaded on demand at runtime. One shell boots a
game by id, shows a loading screen while its assets stream in, then renders that game plus shared
overlays.

## Commands

- `npm run dev` — runs the AssetPack watcher **and** Vite together (via `concurrently`). Use this.
- `npm run build` — lint → clean production asset build (`assets:prod`) → `vite build`.
- `npm run lint` — ESLint. Keep it clean.
- `npm run check:animations` — **run after adding/changing any animation sheet.** Read-only; catches
  the two ways they break: over the ~4096px GPU limit (black screen on mobile) and loop *drift* (the
  art slides across and snaps back). `npm run fit:animations` is the fix for both — it shrinks sheets
  frame-by-frame, which is the only correct way. See `docs/animations.md`.
- `npm run check:built` — **run after any asset build.** Validates the *generated* tree in
  `public/assets/`: every sheet's `meta.image` names a file that exists **and is the right size**, every
  manifest `src` is on disk, each `src` list is ordered highest-resolution first, nothing exceeds 4096px.
  `validate:assets` only inspects `raw-assets/` *before* AssetPack, so it structurally cannot catch a
  mistake the pipeline itself makes — and the worst of those is invisible in dev and only 404s after a
  cache-busted deploy. Wired into `build` and into CI before the R2 upload.
- `npm run assets` — one-shot asset generation (dev: stable filenames, no cache-bust).
- `npm run assets:prod` — clean + cache-busted generation (used by `build`).
- `node scripts/crop-animation-sheets.mjs` — one-off, when adding a decor animation sheet. Strips
  transparent padding shared by every frame (lossless). `--dry` reports first. Rewrites `raw-assets/`, so
  it is deliberately manual, not part of a build. See `docs/animations.md`.

**Adding a new game needs a clean asset build.** Sheets added to an *existing* folder tier incrementally,
but when the whole `games/<id>{m}/…{nomip}/` tree is new, AssetPack's incremental pass does not apply the
folder tags and you get output with no resolution tiers. Run `rm -rf public/assets .assetpack && npm run
assets`. CI is unaffected — `assets:prod` already starts clean.

There is **no test suite**. Verify changes by running `npm run dev` and exercising the UI, plus
`npm run lint`. For type-checking, `tsc` currently fails on a pre-existing invalid
`"ignoreDeprecations": "6.0"` in `tsconfig.app.json`; check types with a temp override:
`echo '{"extends":"./tsconfig.app.json","compilerOptions":{"ignoreDeprecations":"5.0"}}' > .tsv.json && npx tsc --noEmit -p .tsv.json; rm .tsv.json`

## Assets (AssetPack) — read before touching `raw-assets/` or `.assetpack.js`

- **Source** lives in `raw-assets/`; **generated output** goes to `public/assets/` (git-ignored).
  Never edit `public/assets/` by hand. After adding/removing source assets, the running app needs a
  **page reload** to pick up the new manifest.
- **Folder tags** drive processing: `{m}` = a loadable manifest **bundle**; `{tps}` = pack a folder
  of small images into a **texture atlas**; `{nomip}` / `{nc}` = no mipmap / no compress (used on
  bitmap-font and pre-baked animation folders). Bundles: `common`, `<game>`, and the nested
  `<game>-preload` / `<game>-win`. Bundle name = game id = the string passed to `loadGame(id)`.
- **A nested `{m}` folder is its own bundle and its assets LEAVE the parent.** That is how
  `games/<id>{m}/win/<id>-win{m}{nomip}/` (the bounce / winning-glow / win-popup sheets — by far the
  heaviest art a slot ships) stays out of `loadGame`. Keep the game-id prefix: AssetPack names a
  bundle after its folder basename, so a shared name warns and gets rewritten once a second game ships.
- **Resolutions**: source is treated as the highest tier; AssetPack only scales **down**
  (`{ default:1, medium:0.5, low:0.25 }`). Author big; never upscale (upscaling = blur).
- **Atlas rule**: small buttons/icons go in a `{tps}` group; **large panels/backgrounds stay
  loose** (a plain folder) — a big image in an atlas can push the sheet past `maximumTextureSize`
  and force a blurry downscale.
- **cache-bust is production-only** (`AP_CACHEBUST=1`). Dev uses **stable filenames** so repacks
  don't pile up stale atlases or make the loaded manifest go stale (that caused "asset vanished /
  blurry" bugs). Don't turn cache-bust on for dev.
- **Bitmap fonts** ship as pre-baked `.fnt` + `.png` in a `fonts{nomip}{nc}` folder; `.assetpack.js`
  has a custom cache-buster passthrough (a no-op child that keeps the filename) so the `.png` keeps
  its name and the `.fnt`'s `file=` reference stays valid. A BitmapText's `fontFamily` must equal
  the `.fnt`'s internal `face` name (e.g. `Inter_Regular`), not the filename.
- **Pre-baked TexturePacker sheets** (the `<game>-win` bounce/winning/win-N art) name their atlas *inside*
  the JSON (`meta.image`), and Pixi fetches that name directly rather than through the manifest — so the
  cache-buster's rename must be reflected there or the sheet 404s. **The failure is invisible in dev**
  (stable filenames) and only appears after a cache-busted deploy. `assetpack/prebakedSheetTiers.mjs` owns
  that rewrite, pairing each JSON with its **own** atlas by reference. AssetPack's built-in
  `texturePackerCacheBuster` cannot be used here: it resolves one atlas per sheet via
  `getFinalTransformedChildren()[0]`, so with three resolution tiers it points every tier at the same PNG —
  a file that exists, so only a size comparison catches it. It stays scoped to `{tps}` folders.
  `npm run check:built` fails the build if any reference is wrong regardless.
  Custom-dialect sheets (`sprites[]`, in `animations{nomip}/`) name no atlas and need no fixup.
  See `docs/asset-pipeline.md` § 7.1.
- **Sheets get resolution tiers from our own pipe, not from `mipmap`.** `{nomip}` must stay on the sheet
  folders (`mipmap` resizes whole sheets and never touches the sibling `.json`), so
  `assetpack/prebakedSheetTiers.mjs` generates `@0.5x`/`@0.25x` for **both halves** — rescaling every frame
  individually onto an exact grid, and setting `meta.scale` so a tier reports identical logical geometry.
  Which sheets tier is **never name-based** (names are per-game data): everything in a game's win bundle
  tiers by default, and any sheet opts in or out with a top-level `"tier": true | false` in its own JSON.
  Tier only what is drawn *smaller* than its frames — `chandelier` is drawn larger, so it is cropped
  instead. `.assetpack.js` also sorts each manifest `src` **highest-resolution first**, because a plain
  `.json` carries no resolution and Pixi's tier-1 fallback takes `src[0]`. See `docs/animations.md`.

## Runtime asset loading — `src/assets/loader.ts`

`initAssets()` fetches only the manifest. `loadGame(id)` loads `['common', id]`; `loadPreload(id)`
loads `<id>-preload`. `basePath` is set to `/assets`, so asset `src` resolves correctly regardless
of the current route. Access loaded assets by their **alias** via `Assets.get('alias')` — atlas
frames are addressable by their frame name (e.g. `sound_idle`), loose images by their short alias
(e.g. `footer`, `bg_horizontal`).

**`initAssets()` picks a resolution tier, and the value must be a REAL tier.** Pixi applies
`texturePreference.resolution` as an **exact-value filter, not a nearest match**: it keeps only variants
whose resolution equals one of the given values, and falls through to `src[0]` if none do. Two traps, both
of which have bitten this file — (1) passing a number that is not a tier (the old
`Math.min(devicePixelRatio, 2)` = 2) makes the preference do *nothing*; (2) passing **fallback** values
narrows rather than backing off, so `[1, 0.5]` returns the half-resolution sheet. Hence a **single** value,
derived from the renderer's pixel budget against the 4K authoring size and stepped down on low-RAM devices.
`?tier=0.5` / `localStorage.tier` pins one — screen size and `deviceMemory` cannot be faked in devtools, so
that switch is the only way to compare tiers on the device that is actually struggling. `PerfOverlay` shows
the live tier.

**Win-presentation art is demand-loaded, not bundle-loaded.** Its beats run in sequence, and a spin only
lights the symbols that won, so `src/game/winAssets.ts` fetches per win and frees per beat. Every list is
derived from the theme (`symbols[*].bounce`/`winning`, `winAnimation`) and orchestrated by the shared
`useWinPresentation`, so a new game gets it by folder convention + theme fields, with no code. Nothing
calls `loadBundle` on `<id>-win`; individual aliases are loaded and unloaded. On a phone (tier 0.5) idle
texture is ~80 MB and peak ~130 MB. Three rules in that file are load-bearing:

- **Load the `.json` only.** A TexturePacker sheet fetches its own atlas via `meta.image`, so also loading
  `<base>.png` decodes the same pixels a second time under a different URL *and* format — doubling every
  byte of win art for a copy nothing reads. Only the custom `sprites[]` dialect needs its atlas by alias.
- **Load and free of one sheet take turns** (one promise chain per sheet). They must not overlap:
  `Assets.unload` awaits an in-flight load and then destroys what it produced, while the load's own
  continuation has already run `Cache.set` — leaving the alias **cached but destroyed**, which renders
  nothing and never self-repairs. Do not "fix" this by *skipping* a colliding free: that drops it with
  nothing to retry, and the art accumulates spin after spin until the tab dies.
- **`hasAsset` checks liveness, not just presence** (`src/utils/assets.ts`), so a cached-but-destroyed sheet
  reports missing and the next win re-fetches it.

See `docs/assets.md`.

## App structure & rendering flow

```
main.tsx → App.tsx (<Application> + React Query provider)
  └─ GameShell(game)                 // src/game/GameShell.tsx — the load gate:
       initAssets → load loading font → LoadingScreen (progress)
       → loadGame(game) → PixiNavigation
          └─ PixiNavigation(game)    // src/navigation — store-driven router
               currentScreen 'game' → GAMES[game].Screen (lazy)   // registry
               overlays (info/quit/…) + Toast = COMMON to all games
                 └─ <game>/GameScreen.tsx → Background + Footer (+ reels later)
```

- **Game registry** (`src/game/registry.ts`): `GAMES` maps a game id → `{ title, Screen: lazy(...) }`.
  The key **must** equal the asset bundle name. Add a game = add one entry + its `raw-assets/games/<id>{m}/`
  folder + `src/game/<id>/GameScreen.tsx`. Screens are code-split via `React.lazy`.
- **Navigation** (`src/store/useNavigationStore.ts`): `currentScreen` + a single `activeOverlay`.
  `showOverlay/hideOverlay/toggleOverlay`. Overlays are shared across all games and render on top of
  the game screen (JSX order = z-order). Build overlay screens incrementally; only render slots that
  exist so the build doesn't break.
- **Multi-game caveat**: game backgrounds use short aliases (`bg_horizontal`, `logo`) that will
  **collide across games** in the manifest. Switch to game-scoped aliases before adding game #2.

## Reusable Pixi components — `src/components/pixi/`

Prefer these over raw `<pixi*>` intrinsics; each **self-registers** its class via `extend(...)` and
guards on load:
- `PixiContainer`, `PixiSprite`, `PixiNineSliceSprite`, `PixiBitmapText`, `PixiLayout`.
- Sprites accept a `Texture` **or an alias string** and render nothing until the texture is loaded.
- `PixiLayout` wraps `@pixi/layout` (flexbox); pass a `layout` prop. All components accept an
  optional `layout` prop so they can be flex children.
- If you use a raw `<pixiXxx>` directly (e.g. for event handlers not on the wrapper's typed props),
  you **must** `extend({ Xxx })` at the top of that file, or you'll get *"Xxx is not part of the
  PIXI namespace"*.

UI components in `src/components/ui/`: `IconButton` (stateful: `idle`/`hover`/`pressed` textures +
`active` toggle + `onPress`), `Footer`, `StatBlock`, `VolumeSlider`, `Background`.

## State & data conventions

- **Zustand** (`src/store/`) owns ephemeral UI/game state (navigation, settings/volume). **React
  Query** (`src/api/queryClient.ts`) owns server state (balance, spin results — not wired yet).
  Don't mirror server data into Zustand.
- **Audio**: `src/utils/audio.ts` is the single audio engine (`bgm`, `sfx`, `audio` master
  controls, WebAudio unlock). `useSettingsStore` holds the UI `volume` and **delegates** to
  `audio.setMasterVolume` — never poke `sound.volumeAll` directly. To play a sound, use
  `sfx.play(alias)` / `bgm.play(alias)`; they resolve via `Assets.get` (because @pixi/sound
  registers loaded sounds under the manifest's *full-path* alias, `sound.find('shortName')` misses).
  WebAudio is unlocked on the first user gesture in `App.tsx`.

## Conventions

- Sizing is currently **fixed-px** with a `portrait`/orientation split (see `useScreen` and
  `constants/`), not a global design scale. Backgrounds cover-fit and swap by orientation
  (`bg_vertical` portrait, `bg_horizontal` landscape/desktop).
- Path alias `@/*` → `src/*`.
- Match the existing file's formatting; keep `npm run lint` clean.
