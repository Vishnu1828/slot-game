# Architecture — runtime, build, multi-game & scaling roadmap

The big-picture guide to how this multi-game slot platform is put together: how it boots and renders
(**runtime**), how source art becomes shipped assets (**build**), how **multiple games** are isolated
and loaded, and the **phased plan** for scaling to 20+ games without wrecking repo size or build time.

Companion docs (deep dives): [assets.md](assets.md) (asset placement/naming), [animations.md](animations.md)
(sprite-sheet animations), [responsive-layout.md](responsive-layout.md) (the scale-to-fit design canvas).

---

## 1. What this is

A **multi-game** slot/casino platform: **PixiJS 8** rendered via **@pixi/react** (React 19 + TypeScript +
Vite). One shell boots a game by **id**, streams that game's assets in behind a loading screen, then
renders the game plus shared overlays. Art is authored at **4K** and processed by **AssetPack** into
multi-resolution, per-game bundles loaded on demand.

Two independent axes to keep in your head:
- **Runtime** — what the browser does: fetch a manifest, load one game's bundle, render it.
- **Build** — what `npm run assets` / `vite build` do: turn `raw-assets/` into optimized `public/assets/`.

---

## 2. Runtime architecture

### 2.1 Boot flow

```
main.tsx
 └─ App.tsx            <Application> (PixiJS canvas) + React Query provider
     └─ GameShell(id)  THE LOAD GATE:
          initAssets()            → fetch manifest.json only
          load loading font       → LoadingScreen shows progress
          loadGame(id)            → load ['common', id] bundles
          └─ PixiNavigation(id)   store-driven router
               currentScreen 'game' → GAMES[id].Screen   (React.lazy, code-split)
               + shared overlays (info / quit / settings / toast)
                 └─ <game>/GameScreen.tsx
                      Background + decor (real screen)
                      DesignStage { ReelFrame + Header + Controls }   (design canvas, scaled)
                      Footer + GameState (real screen chrome)
```

Key files: [src/App.tsx](../src/App.tsx), [src/game/GameShell.tsx](../src/game/GameShell.tsx),
[src/navigation/PixiNavigation.tsx](../src/navigation/PixiNavigation.tsx),
[src/game/registry.ts](../src/game/registry.ts).

### 2.2 Runtime asset loading (the important part)

[src/assets/loader.ts](../src/assets/loader.ts) is the whole runtime asset story:

- `initAssets()` — fetches **only** `manifest.json` (tiny; lists every bundle + each asset's resolution
  variants). No textures yet. Memoised.
- `loadPreload(id)` — loads the small `<id>-preload` bundle so the loading screen can paint first.
- `loadGame(id)` — loads `['common', id]` — the shared bundle **plus the one game's** bundle. **Assets for
  other games are never fetched.**
- `unloadGame(id)` / `unloadPreload(id)` — free GPU/CPU memory when leaving a game (keeps `common`).
- **Resolution**: `texturePreference.resolution = min(devicePixelRatio, 2)` — Pixi picks, per asset, the
  variant (`@0.5x` / `@0.25x` / full) closest to the device, so phones don't pull the 4K tier.
- **Asset base**: `ASSETS_BASE = import.meta.env.VITE_ASSETS_BASE ?? \`${import.meta.env.BASE_URL}assets\``.
  Unset → served with the app (today). Set → served from a **CDN** with zero code change (see §6).

**Why this scales:** a player who opens one game downloads `common` + that game only — not the other 19.
This is the core reason 20+ games in one app is fine at runtime.

### 2.3 Code-splitting

Each game's screen is `lazy(() => import('./<id>/GameScreen'))` in the registry, so its **JavaScript** is a
separate chunk fetched only when that game opens — the JS mirrors the on-demand asset story.

### 2.4 Rendering & responsiveness

- Reusable Pixi wrappers in `src/components/pixi/` (`PixiSprite`, `PixiNineSliceSprite`, `PixiBitmapText`,
  `PixiContainer`, `PixiLayout`, `PixiGameAnimation`) — each self-registers its class and accepts an
  **alias string** or a `Texture`, rendering nothing until loaded (safe to mount while a bundle streams in).
- **Responsive** = a fixed **design canvas** scaled to fit the screen. Game UI lives inside `<DesignStage>`
  and sizes itself via `useStage()` (design coords); full-screen chrome (background, footer, overlays) uses
  `useScreen()` (real coords). Full detail: [responsive-layout.md](responsive-layout.md).

---

## 3. Build-time architecture

### 3.1 The asset pipeline (AssetPack)

`raw-assets/`  →  **`npm run assets`** ([.assetpack.js](../.assetpack.js))  →  `public/assets/**` +
`public/assets/manifest.json` (git-ignored output).

- **Multi-resolution**: source treated as the top tier (`default` = 4K); AssetPack only scales **down**
  (`medium` @0.5x = 2K, `low` @0.25x = 1K). Never upscales.
- **Atlases**: `{tps}` folders pack small images into one texture atlas (`maximumTextureSize: 4096`).
- **Loose**: big panels/backgrounds stay loose (an atlas could exceed the GPU texture limit → blur/fail).
- **Bundles**: `{m}` folders become loadable bundles: `common`, `<game>`, and `<game>-preload`.
- **Cache-bust**: content-hashed filenames **prod only** (`AP_CACHEBUST=1`); dev uses stable names so
  repacks don't leave stale/blurry atlases.
- **Fonts / animations**: `{nomip}` (single resolution) so baked coords stay valid; `{nc}` (no compress)
  for bitmap fonts. See [animations.md](animations.md).

Full placement/naming rules: [assets.md](assets.md).

### 3.2 App build (Vite)

`npm run build` = **lint → `assets:prod` (clean, cache-busted) → `vite build`**. Vite bundles the code
(code-split per game via `React.lazy`) and copies `public/` as-is. Vite does **not** reprocess assets — that's
AssetPack's job.

### 3.3 Commands

| command | what it does |
|---|---|
| `npm run dev` | AssetPack watcher **+** Vite together (incremental). Use this. |
| `npm run assets` | one-shot asset gen (dev: stable filenames, no cache-bust) |
| `npm run assets:prod` | clean + cache-busted gen (used by `build`) |
| `npm run build` | lint → `assets:prod` → `vite build` |
| `npm run lint` | ESLint (keep clean) |

---

## 4. Asset management (common vs game-specific)

| | **Common bundle** (`common{m}/`) | **Game bundle** (`games/<id>{m}/`) |
|---|---|---|
| Contains | footer icons, fonts, bet/speed/autoplay buttons, popup/drawer panels, audio widget, tabs | that game's background, logo, reel frame + bg, symbols, spin button, themed animations |
| Alias declared in | [src/constants/commonTheme.ts](../src/constants/commonTheme.ts) (bare aliases) | each game's `theme.ts` via `makeTheme(id, …)` ([src/game/theme.ts](../src/game/theme.ts)) |
| Alias style | bare short names (`info_idle`, `footer`) — unique because `common` is one bundle | loose art **game-scoped** (`games/<id>/…`); atlas frames bare (`spin_active`) |
| Rule | shared component renders it for all games → common | changes per theme → game folder |

Components never hardcode alias strings — they read `commonTheme.*` (shared) or `theme.*` (this game) and
pass that to a sprite. Full detail: [assets.md](assets.md).

---

## 5. Multi-game management (how 2+ games coexist)

The **game id** is the linchpin — it is simultaneously:
1. the `raw-assets/games/<id>{m}/` folder name → the **bundle** name,
2. the key in the `GAMES` registry ([registry.ts](../src/game/registry.ts)),
3. the string passed to `loadGame(id)`.

```
GAMES = {
  "fortune-teller": { title, Screen: lazy(() => import("./fortune-teller/GameScreen")), theme },
  // "dragon-gold": { … }   ← add a game = ONE entry + its raw-assets folder + theme.ts + GameScreen.tsx
}
```

**Isolation guarantees** (why games don't interfere):
- **Assets**: only `common` + the active game's bundle load; game B's textures never touch memory while
  game A is open.
- **Code**: each `GameScreen` is a separate lazy chunk.
- **Aliases**: per-game loose images are scoped to `games/<id>/…` by `makeTheme`, so `bg_horizontal` in two
  games can't collide.
- **Theme contract**: shared components find a game's art by canonical names every game reuses
  (`spin_active`, `frame/reel_frame_*`, `images/bg_*`, `ui/logo`, `symbols`).

**Add a game** (recap): copy `games/<existing>{m}/` → `games/<new-id>{m}/` (keep canonical filenames) → add
`src/game/<new-id>/theme.ts` (`makeTheme('<new-id>', …)`) + `GameScreen.tsx` → one `registry.ts` entry →
`npm run assets` → reload.

### 5.1 The one caveat at game #2 — atlas frame-name scoping

`nameStyle: 'short'` makes atlas frame names **bare** (path dropped). Two atlases with the same filename →
the same name → clash (`already has key`). Within the current common bundle this already bit us with
duplicated `box_*` frames (fixed by keeping them in one atlas). When you add game #2 with its **own** symbol
atlas (`symbol_wild.png`, …), scope those names so they can't collide with `common` or each other:
- **Option A** — `nameStyle: 'relative'` for game atlases → names keep the path (`games/<id>/ui/…`). *Breaking*
  for existing short-name lookups; adopt deliberately.
- **Option B** — per-game filename prefixes (`ft_symbol_wild`). Keeps `short`; no config change.

---

## 6. Scaling roadmap — 20+ games

### 6.1 The reality (measured with 1 game)

| metric | now (1 game) | ~20 games |
|---|---|---|
| `raw-assets` source art | 35 MB | ~700 MB working tree |
| `.git` history | 64 MB (binaries committed, **no LFS**) | **multiple GB** (git keeps every binary revision) |
| `public/assets` output | 22 MB (git-ignored ✓) | ~440 MB deploy artifact |
| runtime download / player | `common` + 1 game | **unchanged** (still just 1 game) |

**Verdict:** the **runtime is already correct** — don't rebuild it. The problems are **build/repo-side**:
git bloat (binaries in git), build time (`assets:prod` reprocesses *all* games), and the atlas name clash
above.

### 6.2 Phase 1 — do before game #2–3 (keep the monorepo)

| step | what | helps | status |
|---|---|---|---|
| **Configurable asset base** | `loader.ts` reads `VITE_ASSETS_BASE` (fallback = today) | unlocks CDN with no code change | ✅ **done** |
| **Git LFS** | track `raw-assets/**` binaries in LFS; optionally purge old blobs from history | **git**: clones stay small, `.git` stops ballooning | ☐ pending (team-coordinated) |
| **CDN + decoupled asset build** | build `public/assets` in CI, upload to object storage/CDN, set `VITE_ASSETS_BASE` | **runtime**: fast cached delivery; **build**: app deploy = code-only | ☐ pending (needs CDN) |
| **Incremental / per-game asset build** | cache `.assetpack/` in CI; rebuild only games whose `raw-assets/games/<id>/` changed | **build**: time scales with *changed* games, not total | ☐ pending (CI) |
| **Per-game atlas name scoping** | `nameStyle: 'relative'` for game atlases (or filename prefixes) | **correctness**: 20 games' atlases never clash | ☐ do at game #2 (breaking) |

**Git LFS commands** (run on a quiet branch, coordinate with the team):
```
git lfs install
git lfs track "raw-assets/**/*.png" "raw-assets/**/*.jpg" "raw-assets/**/*.webp" \
              "raw-assets/**/*.wav" "raw-assets/**/*.mp3" "raw-assets/**/*.ogg"
git lfs migrate import --include="raw-assets/**/*.{png,jpg,jpeg,webp,wav,mp3,ogg}" --everything
```

### 6.3 Phase 2 — only when you need independent per-game releases

The runtime already supports this, so it's incremental, not a rewrite:
- Host each game's bundle on the CDN and have the shell load it at runtime as a **plugin** — registry
  entries carry a remote bundle URL / dynamic `import()`, so a new or hotfixed game ships **without
  redeploying the shell**.
- Optionally split games into **workspace packages** (`packages/game-<id>`) for independent build/versioning.

Adopt Phase 2 only when separate teams or staggered launches require it — Phase 1 already removes the
size/time pain.

### 6.4 How each phase helps each axis

- **Runtime**: already optimal (on-demand `common` + 1 game, code-split, DPR-capped tiers). Phase 1's CDN
  makes delivery faster/cached; Phase 2 makes games independently deployable.
- **Build time**: Phase 1 incremental/per-game builds make CI time scale with *changed* games; decoupling
  assets from the app build keeps app deploys fast.
- **Git**: Phase 1 LFS (+ optional history purge) stops binaries bloating `.git`; keeping `public/assets`
  git-ignored (already true) keeps generated output out entirely.

---

## 7. TL;DR

- **Runtime is right and final for now**: one shell, on-demand `common` + one game, code-split screens,
  DPR-aware resolution, a scale-to-fit design canvas. 20+ games render fine.
- **Assets**: authored 4K in `raw-assets/`, packed by AssetPack into per-game bundles, referenced by alias
  through `commonTheme` (shared) / `theme` (per game).
- **Multi-game**: id = folder = bundle = registry key; games are isolated by bundle + lazy chunk + scoped
  aliases.
- **To scale**: keep the runtime; do **Phase 1** (LFS + CDN + incremental builds + atlas scoping) before a
  few more games; reach for **Phase 2** (plugin/CDN game bundles) only if you need independent releases.
