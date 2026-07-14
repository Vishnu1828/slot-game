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
- `npm run assets` — one-shot asset generation (dev: stable filenames, no cache-bust).
- `npm run assets:prod` — clean + cache-busted generation (used by `build`).

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
  bitmap-font folders). Bundles: `common`, `<game>`, and `<game>-preload` (nested in the game
  folder). Bundle name = game id = the string passed to `loadGame(id)`.
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

## Runtime asset loading — `src/assets/loader.ts`

`initAssets()` fetches only the manifest. `loadGame(id)` loads `['common', id]`; `loadPreload(id)`
loads `<id>-preload`. `basePath` is set to `/assets`, so asset `src` resolves correctly regardless
of the current route. Access loaded assets by their **alias** via `Assets.get('alias')` — atlas
frames are addressable by their frame name (e.g. `sound_idle`), loose images by their short alias
(e.g. `footer`, `bg_horizontal`).

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
