# Assets — placement, folder structure, naming, and how they render

The single end-to-end guide for **where to put an asset**, **how to name the folder + file**, and
**how it reaches the screen**. The old `raw-assets/README.md` has been consolidated here and renamed to
[`raw-assets/ASSETS.md`](../raw-assets/ASSETS.md), which now points here.

You mostly deal with two things: **which folder** an asset goes in (decides its bundle + how it's
processed) and **its alias** (the string components use to render it).

---

## Mental model in one line

> Drop source art in `raw-assets/` → `npm run assets` packs it into `public/assets/` + a `manifest.json`
> → at runtime a bundle is loaded and each asset is fetched by its **alias** via `Assets.get('alias')`.

---

## The pipeline

```
raw-assets/            npm run assets (AssetPack, see .assetpack.js)      runtime
────────────           ───────────────────────────────────────────      ─────────────────
common{m}/        ─┐                                                      initAssets()  → fetch manifest.json
games/<id>{m}/     ├─►  public/assets/**  +  public/assets/manifest.json  loadGame(id)  → load ['common', id]
  (source art)     ─┘   (multi-res, atlases, transcoded audio)            Assets.get('alias') in components
```

- **Source** = `raw-assets/` (checked in). **Output** = `public/assets/` (**git-ignored — never edit by
  hand**). After adding/removing source assets, the running app needs a **page reload** to see the new
  manifest.
- Author at **4K**; AssetPack only scales **down** to 2K (`@0.5x`) / 1K (`@0.25x`) tiers. Never upscale
  (blur). The device pulls only the tier it needs.
- Runtime loading: [`src/assets/loader.ts`](../src/assets/loader.ts). `initAssets()` fetches only the
  manifest; `loadGame(id)` loads the `common` + `<id>` bundles; `loadPreload(id)` loads the loading-screen
  bundle. Assets for other games are never fetched.

---

## Folder structure (what's there today)

```
raw-assets/
├─ common{m}/                     ← the "common" bundle: shared by EVERY game
│  ├─ audio/                      loose sounds (.wav → .mp3 + .ogg)
│  ├─ fonts{nomip}{nc}/           pre-baked bitmap fonts (Name.fnt + Name.png pairs)
│  ├─ images/                     loose shared images (footer.png)
│  └─ ui/
│     ├─ audio{tps}/              ← {tps} = pack these small images into ONE atlas
│     ├─ betButton{tps}/          bet +/- + bet-settings icon states
│     ├─ setting{tps}/            sound / info / exit icon states
│     ├─ speedButton{tps}/        autoplay + speed 1..3 states
│     ├─ tabBox{tps}/  infoButton{tps}/  buttonIcons{tps}/
│     ├─ popupButton/             LOOSE nine-slice button (atlas trim would cut its caps)
│     └─ menu_container.png  popup_message_container.png   ← loose nine-slice panels
│
└─ games/
   └─ <game>{m}/                  ← one bundle per game (folder name = game id = registry key)
      ├─ animations{nomip}/       custom sprite-sheets (<name>.png + <name>.json), single-res
      ├─ frame/                   LOOSE big art: reel_frame_*, reel_bg_*
      ├─ images/                  LOOSE backgrounds: bg_horizontal, bg_vertical
      └─ ui/
         ├─ logo.png              loose
         └─ spinButton{tps}/      the game's spin-button states (atlas)
```

---

## Bundles & tags (full reference)

A folder becomes a loadable PixiJS **bundle only when tagged `{m}`**. A `{m}` folder nested inside
another `{m}` folder is its **own separate** bundle (the parent does *not* include it). Bundle name =
the folder basename (`nameStyle: 'short'`), so bundle names **must be unique across games** — hence the
per-game prefix on any nested preload folder.

| Folder | Bundle name | Loaded when |
|---|---|---|
| `common{m}/` | `common` | shared, once (with every game) |
| `games/<game>{m}/` | `<game>` | that game |
| `games/<game>{m}/<game>-preload{m}/` | `<game>-preload` | that game's loading UI |

The preload bundle (if used) lives **inside** its game folder. Add a game by copying the whole
`games/<game>{m}/` folder (incl. its `<game>-preload{m}` child, if any) with a new unique prefix.

### Tag cheat-sheet

- `{m}` — start a new manifest **bundle**. `{mIgnore}` — exclude from the manifest.
- `{tps}` — pack a folder of images into a **texture atlas**.
- `{msdf}` / `{sdf}` — generate a bitmap font from a `.ttf` (needs `msdfFont()` in `.assetpack.js` pipes).
- `{fix}` — emit only the base resolution (no downscaled variants).
- `{nomip}` — no resolution variants at all.
- `{nc}` — do not compress.

### Which folder for which asset

| Asset kind | Folder | Tag | Why |
|---|---|---|---|
| Small buttons / icons (a set) | `ui/<name>{tps}/` | `{tps}` | packed into one atlas → fewer draw calls, mipmapped to 3 tiers |
| Symbols | `reels{tps}/` | `{tps}` | atlas |
| Large panel / background | `images/` or `frame/` | none (loose) | a big image in an atlas can exceed `maximumTextureSize` (4096) → blur/fail; loose is still mipmapped |
| Nine-slice button/panel | loose (e.g. `popupButton/`) | none | atlas trimming cuts nine-slice caps → keep loose |
| Custom frame animation | `animations{nomip}/` | `{nomip}` | JSON coords baked to one resolution; tiers would misalign — see [animations.md](animations.md) |
| Bitmap font | `fonts{nomip}{nc}/` | `{nomip}{nc}` | glyph coords baked to the exact `.png`; no resize/compress/rename |
| Sound | `audio/` | none | transcoded to `.mp3` + `.ogg` |

### Bitmap fonts (important)

Put pre-baked bitmap fonts (`Name.fnt` + `Name.png`) in a `fonts{nomip}{nc}/` folder:

- `{nomip}` — no resolution variants (a font atlas's glyph coords are baked to its exact `.png`; a
  resized copy would be wrong).
- `{nc}` — no compression (the `.fnt` references the `.png` specifically, not a `.webp`).
- `.assetpack.js` additionally **exempts `fonts/` from cache-busting** (a no-op passthrough), so the
  `.png` keeps its name and the `.fnt`'s `file="Name.png"` reference stays valid.
- Both files sit together; the `.fnt`'s `file=` must name the sibling `.png`. A `BitmapText`'s
  `fontFamily` must equal the `.fnt`'s internal `face` (e.g. `Alexandria_SemiBold`), **not** the filename.
- To generate a font from a `.ttf` instead, tag it `{msdf}`/`{sdf}` and add `msdfFont()` to the pipes —
  output is the same `.fnt` + `.png` pair.

---

## Common vs game-specific — where does it go?

| Put it in **`common{m}/`** if… | Put it in **`games/<id>{m}/`** if… |
|---|---|
| every game uses the same art (footer icons, fonts, bet/speed/autoplay buttons, popup/drawer panels, audio widget, tab boxes) | it's this game's look (background, logo, reel frame + reel bg, symbols, spin button, themed animations) |
| it's chrome driven by a shared component (Footer, PopupModal, SettingsDrawer, VolumeSlider) | it's referenced through the game's **theme** ([`makeTheme`](../src/game/theme.ts)) |

Decision rule: **if a shared component in `src/components/` renders it for all games → common. If it
changes per theme → game folder.**

---

## Naming & aliases — the important part

An asset's **alias** is the string you pass to `Assets.get(...)` / a `PixiSprite`. How it's formed
depends on the asset type (config in [`.assetpack.js`](../.assetpack.js), all `nameStyle: 'short'`):

### 1. Atlas frames (`{tps}`) → bare short name
`removeFileExtension: true` + `nameStyle: 'short'`, so `common/ui/setting{tps}/info_idle.png` is
addressable simply as **`info_idle`**. The folder/atlas name is NOT part of the alias.

> ⚠️ **Frame names must be unique across ALL atlases in the same bundle.** Two atlases in `common` both
> containing `box_left_idle` (today: `tabBox{tps}` and `infoButton{tps}`) collide → the
> `[Cache] already has key: box_left_idle` warning. Give clashing frames distinct filenames.

### 2. Loose images → short alias, **game-scoped** for per-game art
A loose image also gets a short alias (`footer.png` → `footer`). Short aliases would **collide across
games** (every game has a `bg_horizontal`), so per-game loose art is **scoped** by
[`makeTheme`](../src/game/theme.ts) to `games/<id>/<path>` (e.g. `games/fortune-teller/images/bg_horizontal`).
Common loose images stay bare (`footer`) because the `common` bundle is unique.

### 3. Custom animations → base name
`animations{nomip}/chandelier.png` + `chandelier.json` are loaded by the base alias **`chandelier`**
(the component resolves the `.png`+`.json` pair). See [animations.md](animations.md).

### 4. Bitmap fonts → the `.fnt`'s internal `face`, not the filename (see above).

### Names that MUST be identical across games (the "theme contract")
Shared components look up game art by a **canonical name** that every game must reuse, or the shared
component won't find it:

- **Spin button** frames: `spin_active`, `spin_pressed`, `spin_disabled` (defaults in
  [`src/game/theme.ts`](../src/game/theme.ts) `SPIN_DEFAULTS`).
- **Reel frame / bg** loose paths: `frame/reel_frame_horizontal|vertical`, `frame/reel_bg_horizontal|vertical`.
- **Background / logo**: `images/bg_horizontal|vertical`, `ui/logo`.
- **Symbols**: the keys the game declares in its `theme.symbols` map.

(These loose paths get game-scoped automatically by `makeTheme`.) A game overrides a name only if its
filenames differ — pass overrides to `makeTheme`.

---

## Where aliases are declared (single sources of truth)

- **Common (bare aliases):** [`src/constants/commonTheme.ts`](../src/constants/commonTheme.ts) — every
  shared alias (fonts, footer, all button sets, tabs, audio, overlay panels, sfx). Components import
  `commonTheme.buttons.sound.idle` etc. instead of hardcoding strings.
- **Per-game (scoped aliases):** each game's `theme.ts` calls `makeTheme(id, overrides)`
  ([`src/game/fortune-teller/theme.ts`](../src/game/fortune-teller/theme.ts)), producing a `ThemeAssets`
  descriptor ([`src/types/theme.ts`](../src/types/theme.ts)) with `header`, `background_*`, `spin`,
  `symbols`, `reel`. Registered in [`src/game/registry.ts`](../src/game/registry.ts).

A component never invents an alias string — it reads `commonTheme.*` (shared) or `theme.*` (this game)
and passes that to a `PixiSprite`.

---

## How an asset actually renders

```tsx
// common asset — bare alias from commonTheme
<PixiSprite texture={commonTheme.footer.background} /* "footer" */ />

// game asset — scoped alias from the theme descriptor
<Header art={theme.header} /* "games/fortune-teller/ui/logo" */ />
```

- `PixiSprite`/`PixiNineSliceSprite`/`PixiGameAnimation` accept **an alias string** (or a `Texture`) and
  render nothing until that alias is loaded — so screens are safe to mount while a bundle streams in.
- Under the hood they call `Assets.get(alias)`; atlas frames resolve by frame name, loose images by
  their (scoped) short alias.
- `loadGame(id)` loads the `common` + `<id>` bundles before the game's screen shows, so every alias in
  `commonTheme` and the game's `theme` is resolvable.

---

## Recipe: add a **common** asset

1. Drop the file(s) in the right `common{m}/` folder (icon set → a `{tps}` folder; big panel → loose).
2. Add its alias to [`commonTheme.ts`](../src/constants/commonTheme.ts) (bare frame name / loose alias).
3. Reference `commonTheme.<...>` from the component.
4. `npm run assets` (or it's already running under `npm run dev`) → **reload** the page.
5. Watch the console for `[Cache] already has key` (a frame-name clash) — rename if it appears.

## Recipe: add a **new game**

1. Copy `games/<existing>{m}/` to `games/<new-id>{m}/`; replace the art (keep the **canonical
   filenames** above so shared components resolve them). Small buttons → `{tps}`, big art → loose.
2. Add `src/game/<new-id>/theme.ts` calling `makeTheme('<new-id>', { …overrides… })`, and
   `src/game/<new-id>/GameScreen.tsx`.
3. Register it in [`registry.ts`](../src/game/registry.ts) — **the key must equal the folder/bundle name
   `<new-id>`** (that string is what `loadGame` loads).
4. `npm run assets` → reload.

---

## Common pitfalls

- **`[Cache] already has key: <frame>`** → two atlases in the same bundle share a frame name
  (`nameStyle: 'short'`). Rename one file. (Currently open for `box_*` across `tabBox`/`infoButton`.)
- **Asset vanished / went blurry after a repack** → don't enable cache-bust in dev; dev uses stable
  filenames on purpose (`AP_CACHEBUST=1` is prod-only).
- **Big image blurry / won't load** → it's in a `{tps}` atlas and exceeded `maximumTextureSize` (4096),
  forcing a downscale. Move it to a loose folder. (Loose animation sheets have no such cap — keep them
  ≤ 4096 yourself; see [animations.md](animations.md).)
- **Nine-slice edges look cut** → the texture is in a `{tps}` atlas (trim eats the caps). Keep
  nine-slice art loose (like `popupButton/`).
- **New asset not showing** → you didn't reload after the repack, or the alias is wrong. Confirm it
  exists in `public/assets/manifest.json`.
- **BitmapText renders nothing** → `fontFamily` must be the `.fnt`'s internal `face`, not the filename.
- **Per-game short alias collides with another game** → per-game loose art must go through `makeTheme`
  scoping; don't hardcode a bare `bg_horizontal`.
