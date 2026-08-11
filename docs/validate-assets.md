# Asset validator — `scripts/validate-assets.mjs`

A dependency-free Node script that **fails the build if source assets are wrong or missing**, so bad
assets never reach the CDN. It runs in CI before AssetPack and can be run locally at any time.

Related: [asset-pipeline.md](asset-pipeline.md) (the whole pipeline), [assets.md](assets.md) (placement &
naming rules the validator enforces), [animations.md](animations.md) (sprite-sheet rules).

---

## What it does

It scans `raw-assets/`, reads a few source files (`commonTheme.ts`, `registry.ts`), and reports
**errors** (which fail the build, exit code `1`) and **warnings** (reported, exit code `0`). It uses only
Node built-ins — no `sharp`, no npm install — so it runs anywhere.

---

## When it runs

| Trigger | How | Notes |
|---|---|---|
| CI — push to `main` touching assets | `.github/workflows/assets.yml` | Runs **before** AssetPack + upload (fail-fast) |
| CI — manual | `workflow_dispatch` (Actions tab) | Same job |
| Local — on demand | `npm run validate:assets` | Run before pushing |

In CI it is fail-fast: if validation fails, AssetPack never builds and nothing is uploaded to the runtime
bucket. (It is not yet wired into `pull_request`, `npm run build`, or a git hook — see
[asset-pipeline.md](asset-pipeline.md) §9 for recommended additions.)

## How to run

```
npm run validate:assets
# or
node scripts/validate-assets.mjs
```

Exit codes: `0` = passed (warnings allowed); `1` = one or more errors (build should stop).

Example output:

```
✔ asset validation passed (0 warning(s)).
```
```
✖ [anim] raw-assets/games/x{m}/animations{nomip}/foo.png is 6402x12837 — exceeds GPU max 4096px …
✖ asset validation FAILED: 1 error(s), 0 warning(s).
```

---

## Checks

### Errors (fail the build)

| # | Check | Fails when | Fix |
|---|---|---|---|
| 1 | **Animation sheets** — folders named `animations…` **or** `…-win{…}` (the per-game win bundle) | `<name>.png` has no sibling `<name>.json` (or vice-versa); PNG > 4096px per side; JSON `spriteSheetWidth/Height` ≠ PNG dims; unreadable PNG / invalid JSON | Keep the `.png`+`.json` pair together; run `scripts/fit-animation-sheets.mjs` to downscale + rewrite coords |
| 2 | **Atlas frame uniqueness** | Two images in `{tps}` folders of the same bundle share a filename (nameStyle:'short' → same alias → `already has key`) | Rename one file so frame names are unique within the bundle |
| 3 | **Bitmap fonts** | A `.fnt` has no `file=` page / missing sibling `.png` / `file=` has a space; **or** its `face=` has a space or doesn't equal the filename | Keep the `.fnt`/`.png` pair together; `file=` names the sibling; **`face=` must equal the filename** (e.g. `Alexandria_Medium`, not `Alexandria Medium`) — it's the `fontFamily` the code uses |
| 4 | **Bundle ↔ registry** | A `raw-assets/games/<id>{m}/` folder has no `registry.ts` GAMES key, or a registry game has no folder | Keep the game id, folder name, and registry key identical |
| 5 | **commonTheme aliases** | An alias string in `src/constants/commonTheme.ts` doesn't resolve to any source asset | Add the missing asset, or fix the alias string |

### Warnings (reported, do not fail)

| # | Check | Warns when |
|---|---|---|
| 6 | **Per-game theme contract** | A game is missing a default file (`images/bg_horizontal|vertical`, `ui/logo`, `frame/reel_frame_*`, `frame/reel_bg_*`) or a spin frame (`spin_active/pressed/disabled`). OK if the game overrides these in its `theme.ts`. |

---

## How it works (internals)

1. **Walk** `raw-assets/` recursively, skipping `.DS_Store`.
2. **Classify** each file by its folder tags in the path:
   - `{tps}` → atlas frame (alias = filename without extension)
   - `animations…` or `…-win{…}` → animation sheet (`.png` needs a `.json` pair). Both prefixes are
     matched: the win sheets live in `win/<game>-win{m}{nomip}/`, and matching only `animations` used to
     skip every bounce/glow/popup sheet in the game — the largest art there is.
   - `fonts…` → bitmap font (`.fnt`/`.png`)
   - other image/sound → loose asset (alias = filename without extension)
3. **Build the "available alias" set** — every atlas frame, loose image, animation, sound, and font face
   name. This is what referenced aliases are checked against.
4. **Bundle detection** — a file under `common{m}/` belongs to bundle `common`; under `games/<id>{m}/`
   to bundle `<id>`. Used for the per-bundle atlas-uniqueness check.
5. **PNG dimensions** are read directly from the IHDR chunk (bytes 16–24) — no image library needed.
6. **`registry.ts`** is parsed for GAMES keys (`"<id>": {`); **`commonTheme.ts`** is parsed for
   alias-shaped string values (`: "token"`).
7. **Report & exit** — print warnings then errors; `process.exit(1)` if any error.

---

## Extending it

- **Add a new binary type** (e.g. Spine `.skel`): add its extension to the classification so its alias is
  registered, and add a matching pattern to `.gitattributes` for LFS.
- **Add a new check**: push to `errors` (hard fail) or `warnings` (soft) and it's included in the summary.
- **Validate more referenced aliases**: the alias-resolution check currently covers `commonTheme.ts`. To
  also cover per-game `theme.ts` overrides or hardcoded component sheet names (e.g. `candle_light`,
  `gem_shine`), extend the parse in the "commonTheme aliases resolve" section to read those files too.

---

## Limitations / notes

- The `commonTheme.ts` and `registry.ts` parses are **regex-based** (no TypeScript compilation), matching
  the project's simple, literal style. If those files adopt computed alias strings, extend the parser.
- The theme-contract check (warning) assumes **default** filenames; a game that legitimately overrides
  them will produce warnings, not errors — by design.
- It validates **source** assets (`raw-assets/`), not the generated `public/assets/` output; correctness
  of the generated manifest is covered by AssetPack itself plus these upstream rules.
