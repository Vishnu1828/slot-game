# Multi-Game Slot Platform — Technical Architecture Overview

**Prepared for:** Client / Stakeholders
**Audience:** Technical and product stakeholders
**Version:** 1.0 · **Last updated:** 2026-07-20 · **Status:** Living document

---

## 1. Executive summary

This platform is a **single web application that hosts many slot games**. Rather than building and
shipping each game as a separate site, one lightweight "shell" boots any game by its **id**, streams that
game's artwork and sounds on demand behind a branded loading screen, and renders it together with a shared
set of UI overlays (settings, information, betting, etc.).

The architecture is built around three principles that directly benefit cost, performance, and time-to-market:

1. **Load only what the player plays.** A player who opens one game downloads the shared assets plus that
   one game — never the other games. This keeps load times fast and bandwidth low even as the catalogue
   grows to dozens of titles.
2. **One shell, many games.** Common UI, audio, fonts, and behaviour are built once and reused by every
   game. A new game is added as a self-contained package (its art folder + a small theme file + one
   registry entry) — no changes to the shared platform.
3. **Design once, fit every screen.** The interface is authored at a single reference design and uniformly
   scaled to fit any device — phone, tablet, or desktop — so the layout matches the approved design on
   every screen without per-device rework.

The **runtime is production-grade today**. The remaining work to reach a 20+ game catalogue is
**operational** (asset hosting on a CDN, source-art storage, and continuous-integration build tuning),
delivered through a clear two-phase roadmap in §9. No re-architecture is required.

---

## 2. Technology stack & rationale

| Layer | Technology | Why it was chosen |
|---|---|---|
| Rendering | **PixiJS 8** (WebGL/WebGPU) | Hardware-accelerated 2D rendering — the industry standard for high-performance browser games and animations. |
| UI framework | **React 19** via **@pixi/react** | Component model + declarative UI on top of Pixi; fast iteration, maintainable code. |
| Language | **TypeScript** | Type safety reduces defects and makes the codebase self-documenting for future developers. |
| Build tool | **Vite** | Fast builds and instant dev reloads; modern, well-supported. |
| Asset pipeline | **AssetPack** | Automatically converts source art into optimized, multi-resolution, per-game bundles. |
| Audio | **@pixi/sound** | Single audio engine with format transcoding and volume control. |
| State | **Zustand** (UI/game state) + **React Query** (server state) | Lightweight, clear separation between transient UI state and server data. |
| Layout | **@pixi/layout** (Flexbox) | Flexbox-style arrangement inside panels and rows. |

These are mainstream, well-maintained technologies with large communities — reducing long-term maintenance
risk and hiring difficulty.

---

## 3. High-level architecture

```
                        ┌─────────────────────────────────────────────┐
                        │                Web Application               │
                        │                                              │
   Player opens a game  │   ┌───────────┐   loads    ┌─────────────┐   │
   ───────────────────► │   │  Shell    │──manifest──►│  Manifest   │   │
                        │   │ (boots by │            └─────────────┘   │
                        │   │   game id)│   loads    ┌─────────────┐   │
                        │   │           │──"common"──►│ Shared      │   │
                        │   │           │  + <game>  │ + Game       │   │
                        │   └─────┬─────┘   bundles  │ asset bundles│   │
                        │         │                  └──────┬──────┘   │
                        │         ▼                         │          │
                        │   ┌───────────────────────────────▼──────┐   │
                        │   │  Game screen + shared overlays render │   │
                        │   └───────────────────────────────────────┘  │
                        └─────────────────────────────────────────────┘
                                        │
                                        ▼
                        Assets served from the app host today,
                        or a dedicated CDN (configurable — see §9)
```

The system separates cleanly into two concerns:

- **Runtime** (§4) — what happens in the player's browser.
- **Build** (§5) — how source artwork becomes optimized, shippable assets.

---

## 4. Runtime architecture

### 4.1 How a game boots

1. The application shell initialises and fetches a small **manifest** — an index of every asset bundle and
   the resolution variants available for each asset. No artwork is downloaded yet.
2. A branded **loading screen** appears while the selected game's assets stream in.
3. The shell loads exactly two bundles: **`common`** (shared UI) and **`<game>`** (the chosen game).
4. The game screen renders, along with shared overlays (settings, info, betting, notifications).

### 4.2 On-demand loading — the key efficiency

The player only ever downloads the shared assets plus the **one** game they open. With a 20-game
catalogue, opening a single game still downloads a single game's worth of data. This is the central reason
the platform scales to a large catalogue without hurting load time or bandwidth cost.

The same principle applies to **program code**: each game's screen is delivered as a separate code chunk,
fetched only when that game is opened.

### 4.3 Device-appropriate image quality

Every image is produced in three resolution tiers (roughly 4K / 2K / 1K). At runtime the platform
automatically serves the tier that best matches the player's device and screen density (capped so
high-density phones don't waste bandwidth on 4K). Result: crisp visuals on large displays, lean downloads
on phones — automatically, per asset.

### 4.4 Memory management

When a player leaves a game, that game's textures are released from memory while the shared assets remain
resident. This keeps memory usage bounded even across long sessions and multiple game switches.

### 4.5 Responsive rendering (cross-device)

The interface is laid out once in a **fixed design canvas** (the approved reference design) and then
uniformly **scaled to fit** the actual screen, centred, with the themed background filling any margins.
Consequences:

- The layout on every device is a proportionally identical copy of the approved design — **UI elements
  cannot overlap or drift** between device sizes.
- Full-screen "chrome" (background, footer, pop-ups) is sized to the real screen so it always reaches the
  edges, while the game play area scales as a single unit.

This eliminates an entire class of device-specific layout defects and removes the need for per-device
design passes.

---

## 5. Build & asset pipeline

Source artwork is authored at **4K** and stored under a source folder. A single command processes it into
optimized, deployable assets:

```
Source artwork (4K)  ──►  Automated pipeline  ──►  Optimized output + manifest
  raw-assets/                (AssetPack)              (multi-resolution, packed,
  - per game folders                                   compressed, per-game bundles)
  - shared "common" folder
```

The pipeline automatically:

- **Downscales** each image into 4K / 2K / 1K tiers (never upscales — no blur).
- **Packs** small UI images (buttons, icons) into consolidated texture atlases for rendering efficiency,
  while keeping large backgrounds/panels separate to respect hardware texture limits.
- **Compresses** images and **transcodes** audio into web-friendly formats.
- **Groups** everything into bundles: `common` (shared) and one per game.
- **Fingerprints** filenames for production so browsers and CDNs can cache aggressively and safely.

The application build then bundles the program code (split per game) and produces the deployable site.

### 5.1 Commands (for the delivery team)

| Command | Purpose |
|---|---|
| `npm run dev` | Local development (live asset processing + hot reload) |
| `npm run assets` / `assets:prod` | Generate assets (development / production) |
| `npm run build` | Production build (lint → assets → app bundle) |
| `npm run lint` | Code quality checks |

---

## 6. Multi-game architecture

Each game is a **self-contained module** identified by a single **game id**, which ties together three
things: the game's asset folder, its asset bundle, and its entry in the game registry.

**Isolation guarantees** — games cannot interfere with one another:

| Concern | Guarantee |
|---|---|
| **Assets** | Only the shared bundle + the active game's bundle are ever loaded; other games' assets never enter memory. |
| **Code** | Each game screen is a separate code chunk, loaded on demand. |
| **Naming** | Each game's images are namespaced so identically named assets across games never collide. |
| **Theming** | Shared components render any game purely by reading that game's "theme" descriptor — no game-specific code in the shared platform. |

### 6.1 Adding a new game

A new title is added without touching the shared platform:

1. Add the game's artwork folder (following the standard structure and canonical filenames).
2. Add a small **theme file** mapping the game's art to the shared UI roles.
3. Add **one entry** to the game registry (id, title, screen, theme).
4. Regenerate assets.

This low-friction process is what makes a large catalogue economical to produce.

---

## 7. Performance & scalability characteristics

| Dimension | Design | Player/business benefit |
|---|---|---|
| Initial load | Manifest-only, then on-demand bundles | Fast first paint; low bandwidth |
| Per-game download | Shared + one game only | Constant regardless of catalogue size |
| Image quality | Auto device-appropriate tier | Crisp on desktop, lean on mobile |
| Memory | Per-game unload on exit | Stable across long/multi-game sessions |
| Rendering | GPU-accelerated (WebGL/WebGPU) | Smooth animation and effects |
| Layout | Scale-to-fit design canvas | Consistent, defect-free across devices |
| Code delivery | Per-game code splitting | Small initial JS; games load lazily |

The **runtime is already optimised for a large catalogue** — no runtime changes are needed to reach 20+ games.

---

## 8. Quality, maintainability & conventions

- **Type-safe** codebase (TypeScript) with linting enforced.
- **Reusable component library** for all rendering primitives and shared UI (buttons, footer, panels,
  overlays, animations) — consistency across games and less duplicated code.
- **Single sources of truth** for shared and per-game asset references, so swapping an asset is a
  one-line change.
- **Documented conventions** for asset placement/naming, animations, responsive layout, and this
  architecture (see the project `docs/` folder).
- **No hidden coupling** between games; the shared platform has no game-specific logic.

---

## 9. Scalability roadmap (to 20+ games)

The runtime is ready. The remaining work is **operational** — where source art and generated assets live,
and how they are built and delivered. Current baseline (measured with one game):

| Metric | Today (1 game) | Projected (~20 games) | Concern |
|---|---|---|---|
| Source artwork | 35 MB | ~700 MB | Version-control storage |
| Generated assets | 22 MB | ~440 MB | Delivery/hosting |
| Repository history | 64 MB | Multiple GB | Version-control performance |
| Per-player download | 1 game | **1 game (unchanged)** | None — runtime scales already |

### Phase 1 — foundation for scale (recommended before the next few games)

| Initiative | What it does | Benefit | Status |
|---|---|---|---|
| **Configurable asset origin** | Assets can be served from a dedicated CDN via a single setting, with no code change | Faster global delivery; app and assets deploy independently | ✅ Implemented |
| **Large-file storage for source art** | Store binary artwork via large-file storage (e.g. Git LFS) or an external store | Keeps the code repository small and fast to clone | ◻ Planned |
| **CDN-hosted assets + separated build** | Build assets in CI and publish to a CDN/object store | Fast, cached delivery worldwide; smaller app deployments | ◻ Planned |
| **Incremental, per-game asset builds** | Rebuild only the games that changed | Build time scales with *changes*, not with catalogue size | ◻ Planned |
| **Per-game asset namespacing** | Ensure each game's packed assets are uniquely named | Prevents naming collisions as the catalogue grows | ◻ At game #2 |

### Phase 2 — independent game delivery (optional, when the catalogue/teams demand it)

- **Games as independently deployable packages** hosted on the CDN and loaded by the shell at runtime. A new
  or updated game can go live **without redeploying the whole application** — enabling staggered launches,
  hotfixes, and multiple teams working in parallel.

The current architecture already supports this model, so Phase 2 is an incremental enhancement, not a
rewrite. **Phase 2 is only needed if independent per-game release cadence becomes a requirement**; Phase 1
alone removes the storage and build-time concerns.

### How the roadmap maps to outcomes

- **Faster delivery (runtime):** CDN hosting (Phase 1) → cached, geographically close assets.
- **Faster, cheaper builds:** incremental per-game builds + separated asset pipeline (Phase 1).
- **Healthy version control:** large-file storage keeps the repository lean and clone times short (Phase 1).
- **Business agility:** independent per-game deployment (Phase 2) enables release flexibility.

---

## 10. Risks & mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Binary artwork stored directly in version control | Repository grows to multiple GB; slow clones | Phase 1 large-file storage (Git LFS / external store) |
| Full asset rebuild per change | Longer CI/build times as catalogue grows | Phase 1 incremental, per-game builds |
| Asset name collisions across games | Rendering errors as catalogue grows | Phase 1 per-game namespacing (adopt at game #2) |
| Oversized animation/image sources on mobile | Fails to render on some devices | Enforced size limits + automated downscaling already in place |
| Single large app deploy for all games | Any game change requires full redeploy | Phase 2 independent game bundles (when needed) |

---

## 11. Glossary

- **Shell** — the small application that boots and hosts any game.
- **Bundle** — a downloadable group of assets (`common` = shared; one per game).
- **Manifest** — the index listing all bundles and asset variants; fetched first.
- **Atlas** — a single image packing many small UI images for rendering efficiency.
- **Design canvas** — the fixed reference layout that is uniformly scaled to fit every device.
- **CDN** — Content Delivery Network; geographically distributed asset hosting for fast, cached delivery.

---

## 12. Appendix — directory structure

```
raw-assets/                 Source artwork (authored at 4K)
  common{m}/                Shared assets (UI, fonts, audio, panels)
  games/<id>{m}/            One folder per game (backgrounds, frame, symbols, animations, logo)
public/assets/              Generated, optimized output (not in version control)
src/
  App.tsx                   Application root
  game/
    GameShell.tsx           Load gate (manifest → loading screen → game)
    registry.ts             Catalogue of games (id → title, screen, theme)
    <id>/                   Per-game screen + theme
  navigation/               Screen/overlay routing
  components/pixi/          Reusable rendering primitives
  components/ui/            Shared UI (footer, buttons, panels, overlays, animations)
  assets/loader.ts          Runtime asset loading (manifest + on-demand bundles)
  constants/, hooks/, store/, utils/
docs/                       Architecture & engineering documentation
```

---

*This document describes the current implementation and the recommended path to a large game catalogue. It
is intended as a living reference and will be updated as the roadmap is delivered.*
