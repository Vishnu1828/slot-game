# Asset Pipeline — Technical Design (GitHub LFS + Cloudflare, AWS-ready)

**Project:** Multi-game PixiJS slot platform · **Audience:** Engineering & stakeholders · **Version:** 1.0

> Pricing figures are representative (approx. 2025) and vary by region/plan — confirm current provider
> pricing before committing. They show the shape of the cost, which is stable even as exact numbers move.

## 1. Executive summary

This document specifies how source artwork and runtime assets are stored, validated, built, and delivered
for a platform that will host 20+ themed slot games. It covers the current **Cloudflare** implementation
and the documented path to **AWS**, chosen so that migration is a configuration swap rather than a rewrite.

Three concerns, three solutions:

- **Source art** (`raw-assets/`, authored 4K) — versioned with the code but kept out of the main git
  history via **GitHub LFS**.
- **Runtime assets** (`public/assets/`, generated) — delivered to players from **Cloudflare R2 + CDN**
  now (free egress), with **Amazon S3 + CloudFront** documented as the future target.
- **Quality** — guarded by an automated **asset validator** that runs in CI before every publish.

Design principle: the pipeline is **provider-agnostic**. R2 is S3-compatible, so the same `aws s3`
tooling and the same runtime hook (`VITE_ASSETS_BASE`) serve both Cloudflare and AWS. Switching later
changes only endpoints, credentials, and the CDN cache-purge command.

## 2. The two kinds of asset

|                       | Source artwork              | Runtime assets                                |
| --------------------- | --------------------------- | --------------------------------------------- |
| Folder                | raw-assets/                 | public/assets/                                |
| In version control    | Yes (via GitHub LFS)        | No (generated, git-ignored)                   |
| Consumed by           | Developers and CI           | Players' browsers                             |
| Stored / delivered by | GitHub LFS                  | Cloudflare R2 + CDN (future: S3 + CloudFront) |
| Primary concern       | Repository size, versioning | Delivery speed and egress cost                |

These use different, independent systems and must not be conflated: source art is private and
version-controlled; runtime assets are public and cache-optimized.

## 3. Architecture

Current (Cloudflare); source art via GitHub LFS:

```
raw-assets/  (binaries tracked by GitHub LFS)
   |
   v
 GitHub  -->  GitHub Actions
                 |  1. Validate (scripts/validate-assets.mjs)
                 |  2. AssetPack build (incremental, cache-busted)
                 |  3. Upload generated assets
                 v
        Cloudflare R2 (runtime bucket, private)
                 |
                 v
        Cloudflare CDN (custom domain, free egress)
                 |
                 v
              Players
```

Future (AWS): the runtime bucket becomes Amazon S3, the CDN becomes CloudFront, CI auth becomes AWS OIDC.
Everything upstream (LFS, validator, AssetPack) is unchanged.

```
... GitHub Actions --> Amazon S3 (runtime) --> CloudFront --> Players
```

## 4. Source-art storage — GitHub LFS (chosen)

### 4.1 Why LFS

Git stores a full copy of every revision of every binary forever. Committing 4K art directly bloats the
repository (already ~64 MB with one game; projected to multiple GB across 20). GitHub LFS keeps a small
pointer in git and stores the binary content in GitHub's LFS store, so clones and CI stay small.
Versioning is preserved: each commit references the exact art that matches its code.

### 4.2 Setup (one-time)

```
git lfs install
git lfs track "raw-assets/**/*.png" "raw-assets/**/*.jpg" "raw-assets/**/*.webp" \
              "raw-assets/**/*.wav" "raw-assets/**/*.mp3" "raw-assets/**/*.ogg"
git add .gitattributes
git commit -m "chore: track source art with Git LFS"
```

The repository already contains a `.gitattributes` with these patterns. Each developer runs
`git lfs install` once. Optional history migration (rewrites history — coordinate with the team, run on
a branch):

```
git lfs migrate import --include="raw-assets/**/*.{png,jpg,jpeg,webp,wav,mp3,ogg}" --everything
```

### 4.3 Alternative (documented, not implemented) — self-hosted LFS on Cloudflare R2

For organizations that want to own all storage, a self-hosted LFS server (open-source `rudolfs` or
`giftless`) can be backed by a private R2 bucket. Versioning behaves identically (it is git-driven). The
repository points at it via a committed `.lfsconfig` (`[lfs] url = https://lfs.example.com/<org>/<repo>`).
Trade-off: free egress and full ownership, but you run and maintain the server. We use GitHub LFS for now.

## 5. Runtime delivery — Cloudflare (now)

### 5.1 Infrastructure

- **R2 runtime bucket** (private) holds the generated `public/assets/` output.
- **Custom domain + Cloudflare CDN** in front of the bucket → edge-cached, **free egress**. This URL is
  the app's asset base.
- **R2 API token** (S3-compatible access key/secret) is stored as GitHub Actions secrets for CI upload.

### 5.2 App configuration

The runtime already supports a configurable asset origin in `src/assets/loader.ts`:

```
ASSETS_BASE = import.meta.env.VITE_ASSETS_BASE ?? `${import.meta.env.BASE_URL}assets`
```

Set `VITE_ASSETS_BASE=https://cdn.example.com/assets` at build time to serve from the CDN; leave it unset
to serve locally in development. No code change is needed to switch origins.

### 5.3 Cache strategy

- Content-hashed files (production) → `Cache-Control: public, max-age=31536000, immutable`. They never
  need invalidation; a change produces a new filename.
- `manifest.json` → short cache (`max-age=60, must-revalidate`) so new deployments are picked up promptly.

## 6. Future migration — AWS

Because the pipeline is S3-compatible and env-driven, moving to AWS changes only three things:

| Concern        | Cloudflare (now)             | AWS (future)                            |
| -------------- | ---------------------------- | --------------------------------------- |
| Runtime bucket | R2 (`--endpoint-url` set)    | S3 (no endpoint override)               |
| CDN            | Cloudflare CDN + cache purge | CloudFront + create-invalidation        |
| CI auth        | R2 API token (secrets)       | GitHub OIDC → IAM role (no static keys) |
| App            | `VITE_ASSETS_BASE` = CDN URL | `VITE_ASSETS_BASE` = CloudFront URL     |

AWS specifics when migrating: create a private S3 runtime bucket; put CloudFront in front with Origin
Access Control (OAC); register GitHub's OIDC provider and an IAM role scoped to `s3:PutObject/ListBucket`

- `cloudfront:CreateInvalidation`; update the workflow's publish + purge steps (see comments in
  `.github/workflows/assets.yml`). Source-art LFS and the validator are unaffected.

## 7. AssetPack configuration

Source art is processed by AssetPack (`.assetpack.js`) into `public/assets/` plus a `manifest.json`:

- **Resolutions** `{ default: 1, medium: 0.5, low: 0.25 }` — 4K source scaled down to 2K/1K tiers; never
  upscaled. The client requests the tier matching its device (DPR capped at 2).
- **Texture atlases** for `{tps}` folders, `maximumTextureSize: 4096`, `nameStyle: 'short'`,
  `removeFileExtension: true` — frames are addressed by bare name (e.g. `spin_active`).
- **Bundles** from `{m}` folders: `common`, `<game>`, `<game>-preload`, `<game>-win`. A nested `{m}` is
  its own bundle and its assets leave the parent — which is how `<game>-win` (the celebration sheets,
  by far the heaviest thing a slot ships) stays out of `loadGame` and is fetched per win instead.
- **Cache-bust** content-hashed filenames only in production (`AP_CACHEBUST=1`); dev uses stable names.
- **Incremental cache** (`cache: true`, `.assetpack/`) — the basis for fast CI rebuilds.

Fonts (`{nomip}{nc}`) and custom animations (`{nomip}`, both `animations…` and `<game>-win…`) ship
single-resolution so their baked coordinates stay valid. See docs/assets.md and docs/animations.md for
placement/naming rules.

## 8. Asset validation

An automated validator (`scripts/validate-assets.mjs`, run via `npm run validate:assets`) fails CI before
any publish. It catches the defect classes we have hit in practice.

Rules enforced (errors — fail the build):

- **Referenced-alias resolution** — every alias in `src/constants/commonTheme.ts` resolves to a real
  source asset (atlas frame, loose image, animation, sound, or font).
- **Animation sheets** — each `<name>.json` has a sibling `<name>.png`; the PNG is <= 4096px per side; the
  JSON `spriteSheetWidth/Height` matches the PNG dimensions.
- **Atlas frame uniqueness** — within a bundle no two `{tps}` frames share a filename (nameStyle:'short'
  would otherwise collide, e.g. the `box_left_idle` clash).
- **Bitmap fonts** — each `.fnt` references an existing sibling `.png` via `file=` (no spaces), and its
  `face=` equals the filename with no spaces (a `BitmapText`'s `fontFamily` must match the `.fnt` face —
  e.g. `Alexandria_Medium`, not `Alexandria Medium`).
- **Bundle integrity** — every `raw-assets/games/<id>{m}/` folder has a matching `registry.ts` key, and
  vice-versa.

Warnings (reported, do not fail): per-game "theme contract" default files (background, logo, reel frame/bg,
spin frames) are present unless the game overrides them.

Local usage:

```
npm run validate:assets        # exits non-zero on any error
```

## 9. CI/CD — GitHub Actions

Workflow `.github/workflows/assets.yml` runs on pushes to `main` that touch `raw-assets/**` (or manually):

1. Checkout with `lfs: true` (pulls the GitHub LFS art).
2. Setup Node, `npm ci`, restore the `.assetpack/` cache.
3. `npm run validate:assets` — fail fast on bad assets.
4. `npm run assets:ci` — incremental, cache-busted build (only changed games reprocess).
5. `aws s3 sync public/assets s3://<runtime-bucket>/assets --endpoint-url $R2_ENDPOINT` — upload only
   changed files, with immutable cache headers; upload `manifest.json` with a short cache.
6. Purge the CDN edge cache for `/assets/manifest.json` only.

Required secrets: `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_RUNTIME_BUCKET`,
`CF_API_TOKEN`, `CF_ZONE_ID`; variable `CDN_BASE`. The app-deploy workflow (code) is kept separate, so
asset and app deployments are independent.

## 10. End-to-end developer workflow

1. A designer/developer edits or adds art under `raw-assets/` and commits (binaries go to LFS automatically).
2. Locally: `npm run dev` runs the AssetPack watcher + Vite; `npm run validate:assets` can be run before push.
3. On push to `main`, the assets workflow validates, builds incrementally, uploads to R2, and purges the manifest.
4. Players load the new `manifest.json` (short cache) which points at the new content-hashed bundles
   (cached forever at the edge).

## 11. Deployment & rollback

Deployments are atomic: content-hashed files plus a `manifest.json` that references specific versions.

- **Rollback** — restore the previous `manifest.json` (or re-publish the prior commit's `public/assets`).
  Because old hashed files remain in the bucket, the previous version is intact.
- **Retention** — keep old objects for a grace window via an R2 lifecycle rule (expire after N days).
  Never use `s3 sync --delete`, which could remove files an in-flight player's manifest still references.

## 12. Cost comparison

Source art is small (~700 MB across 20 games) and the runtime output modest (~440 MB); **storage is
negligible on any provider**. The variable cost is **egress** (player downloads).

Source-art LFS:

|        | GitHub LFS (chosen)                             | Self-hosted LFS on R2                       |
| ------ | ----------------------------------------------- | ------------------------------------------- |
| Server | none (managed)                                  | small server you run                        |
| Cost   | free 1 GB + 1 GB/mo, then ~$5/mo per 50 GB pack | ~$5/mo server + ~$0 R2 storage, free egress |
| Ops    | none                                            | you maintain it                             |

Runtime delivery (egress-driven; ~5 MB per new session):

| Monthly new sessions | Egress  | Cloudflare R2 + CDN | AWS S3 + CloudFront |
| -------------------- | ------- | ------------------- | ------------------- |
| 100,000              | ~500 GB | $0 (free egress)    | ~$42                |
| 1,000,000            | ~5 TB   | $0 (free egress)    | ~$425               |

Cloudflare R2's free egress is the reason it is the current runtime target; AWS remains the documented
future target for organizations standardizing on AWS.

## 13. Best practices & recommendations

- Keep source and runtime buckets separate (private vs public; developers vs players).
- Never commit generated `public/assets/` — it is rebuildable and git-ignored.
- Author art at 4K; keep animation sheets and any single texture <= 4096px per side.
- Put small UI images in `{tps}` atlases; keep large backgrounds/panels loose.
- Give each game's atlas frames unique names (or scope per game) before adding game #2.
- Rely on content-hashing for cache-busting; invalidate only the manifest.
- Run `npm run validate:assets` in CI (and locally) so bad assets never reach the CDN.
- Adopt GitHub LFS now; revisit self-hosted-on-R2 only if LFS bandwidth cost grows.

## 14. Appendix

### 14.1 Repository files

| File                         | Purpose                                       |
| ---------------------------- | --------------------------------------------- |
| .gitattributes               | GitHub LFS tracking for raw-assets binaries   |
| scripts/validate-assets.mjs  | Asset validator (run in CI and locally)       |
| .github/workflows/assets.yml | Validate → build → upload to R2 → purge CDN   |
| src/assets/loader.ts         | Runtime asset loading; reads VITE_ASSETS_BASE |
| .assetpack.js                | AssetPack pipeline configuration              |
| package.json                 | Scripts: assets, assets:ci, validate:assets   |

### 14.2 npm scripts

| Script                  | Purpose                                      |
| ----------------------- | -------------------------------------------- |
| npm run dev             | AssetPack watcher + Vite (local development) |
| npm run assets          | One-shot asset build (stable names)          |
| npm run assets:ci       | Incremental, cache-busted build (CI)         |
| npm run assets:prod     | Clean, cache-busted build (app release)      |
| npm run validate:assets | Run the asset validator                      |
| npm run build           | lint → assets:prod → vite build              |

### 14.3 Environment variables

| Name                                    | Where     | Purpose                                            |
| --------------------------------------- | --------- | -------------------------------------------------- |
| VITE_ASSETS_BASE                        | app build | CDN URL for runtime assets (unset = local /assets) |
| R2_ENDPOINT                             | CI        | R2 S3-compatible endpoint                          |
| R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY | CI        | R2 API token credentials                           |
| R2_RUNTIME_BUCKET                       | CI        | Runtime bucket name                                |
| CF_API_TOKEN / CF_ZONE_ID               | CI        | Cloudflare cache-purge auth                        |

## 15. Glossary

- **Git LFS** — stores large binary contents outside the git repo (content-hashed blobs) with small
  pointers in git; preserves full version history.
- **Bundle** — a downloadable group of assets (`common`, plus one per game).
- **Manifest** — the index listing all bundles and resolution variants; fetched first.
- **Atlas** — one image packing many small UI images for rendering efficiency.
- **CDN** — Content Delivery Network; edge caching for fast, cheap delivery.
- **Egress** — data downloaded out of a provider (per GB); the dominant runtime cost.
- **OIDC** — OpenID Connect; lets GitHub Actions assume an AWS IAM role without static keys.
- **Content-hashing (cache-busting)** — naming files by a hash of their contents so they can be cached
  forever; a change yields a new filename.
