# Deployment — assets to R2, app to Cloudflare

How this project ships to production: **runtime assets** are built and uploaded to **Cloudflare R2**
(served via its CDN URL), and the **app** is built and deployed to a **Cloudflare Worker (static assets)**
connected to GitHub. The two are linked by one build-time variable, `VITE_ASSETS_BASE`.

Related: [asset-pipeline.md](asset-pipeline.md) (the design), [assets.md](assets.md) (asset rules),
[validate-assets.md](validate-assets.md) (the CI validator).

---

## 1. One gated pipeline (`.github/workflows/ci.yml`)

Everything runs through **GitHub Actions**, and the app deploys **only if the checks pass**. Cloudflare's
own Git auto-build is **turned off** so Actions is the single, gated deploy path.

```
   PR         → check (lint + typecheck + validate:assets --strict)                      [no deploy]

   push main  → check ── fail ▶ STOP (nothing ships)
                   ├─ assets   (only if raw-assets changed): AssetPack → s3 sync → R2
                   └─ deploy-app: build:app → wrangler deploy → live
                                        │
                                        ▼
                          app loads assets from R2 (VITE_ASSETS_BASE)
```

- **`check`** is the gate — lint, type-check, and **strict** asset validation. Runs on every PR and push.
- **`assets`** rebuilds + uploads to R2 **only when `raw-assets/**` (etc.) changed** (skipped on code-only pushes).
- **`deploy-app`** builds the app and deploys it to Cloudflare via `wrangler` — only on `main`, only after
  `check` passes (and after `assets`, when that ran). A red lint/type/validate = **no deploy**.
- **Link:** the app build bakes `VITE_ASSETS_BASE` so at runtime it fetches the manifest + bundles from R2.

> Note: Cloudflare merged Pages into Workers, so the app is a **Worker with static assets** (via
> [`wrangler.jsonc`](../wrangler.jsonc)), deployed by `wrangler deploy` from CI — not Cloudflare's auto-build.

---

## 2. Current configuration (real values)

| Thing | Value |
|---|---|
| R2 bucket (runtime) | `slot-assets-runtime` |
| R2 S3 endpoint | `https://43b8bdfdf3eff901a00fe5c0a3e76dc5.r2.cloudflarestorage.com` |
| R2 public CDN URL | `https://pub-160db37f0a074033b49e4006e71f89ca.r2.dev` |
| App asset base (`VITE_ASSETS_BASE`) | `https://pub-160db37f0a074033b49e4006e71f89ca.r2.dev/assets` (in [`.env.production`](../.env.production)) |
| Worker name / URL | `slot-game` → `https://slot-game.darkranger-v7.workers.dev` |
| App build command | `npm run build:app` |
| App deploy command | `npx wrangler deploy` (reads [`wrangler.jsonc`](../wrangler.jsonc)) |

---

## 3. One-time setup

### 3.1 Cloudflare R2 (assets)
1. Create a **private** bucket `slot-assets-runtime`.
2. **Settings → Public Development URL → Enable** → gives `https://pub-….r2.dev` (no custom domain needed).
3. **Settings → CORS Policy → Add** (assets are public, so allow-all is fine for now):
   ```json
   [{ "AllowedOrigins": ["*"], "AllowedMethods": ["GET","HEAD"], "AllowedHeaders": ["*"], "MaxAgeSeconds": 86400 }]
   ```
4. **Manage R2 API Tokens → Create** → permission **Object Read & Write**, scoped to `slot-assets-runtime`.
   Copy the **Access Key ID** + **Secret**.

### 3.2 GitHub Actions secrets (for `ci.yml`)
Repo → Settings → Secrets and variables → Actions → **Secrets**:

| Secret | Value | Used by |
|---|---|---|
| `R2_ENDPOINT` | the S3 endpoint above (must start with `https://`) | `assets` job |
| `R2_ACCESS_KEY_ID` | R2 token access key | `assets` job |
| `R2_SECRET_ACCESS_KEY` | R2 token secret | `assets` job |
| `R2_RUNTIME_BUCKET` | `slot-assets-runtime` | `assets` job |
| `CLOUDFLARE_API_TOKEN` | token with **Workers Scripts:Edit** | `deploy-app` job |
| `CLOUDFLARE_ACCOUNT_ID` | your Cloudflare account id | `deploy-app` job |

*(CF cache-purge secrets `CF_API_TOKEN`/`CF_ZONE_ID` + var `CDN_BASE` are optional — only needed with a
custom domain; the purge step skips on the r2.dev URL.)*

### 3.3 Cloudflare Worker (the app) — deployed from CI, auto-build OFF
The app is a **Worker with static assets**; [`wrangler.jsonc`](../wrangler.jsonc) points `assets.directory`
at `./dist`, and `ci.yml`'s `deploy-app` job runs `wrangler deploy`. `VITE_ASSETS_BASE` comes from the
committed [`.env.production`](../.env.production), baked in by `npm run build:app`.

**Turn OFF Cloudflare's own auto-build** so the app deploys only through the gated CI (no double deploy):
Cloudflare → Workers & Pages → `slot-game` → Settings → Builds → disable "Build on push" / disconnect the
Git auto-deploy (keep the Worker).

---

## 4. Everyday deploy flow

```bash
git add -A
git commit -m "…"
git push
```
On push to `main`, **`ci.yml`** runs:
1. **`check`** — lint + type-check + `validate:assets --strict`. If it fails, **nothing deploys**.
2. **`assets`** — *only if `raw-assets/**` changed* → AssetPack → `aws s3 sync` → R2.
3. **`deploy-app`** — `npm run build:app` → `wrangler deploy` → app live (runs after `check`, and after
   `assets` when it ran).

A **PR** runs only `check` (no deploy). To force a run without changes: GitHub → **Actions → ci → Re-run**.

---

## 5. Where to check each stage

| Check | Where |
|---|---|
| Checks (lint/type/validate) | GitHub → **Actions → ci** run → `check` job log |
| App built & deployed | GitHub → **Actions → ci** → `deploy-app` job; then Cloudflare → `slot-game` → **Deployments** |
| App is live / URL | Cloudflare Deployments (or `https://slot-game.…workers.dev`) |
| Assets uploaded to R2 | GitHub → **Actions → ci** → `assets` job log; or R2 → bucket → **Objects** |
| R2 has correct assets | `curl https://pub-….r2.dev/assets/manifest.json` |
| App uses R2 at runtime | Site → DevTools → **Network** → asset requests go to `pub-….r2.dev` (not the worker `/assets`) |

---

## 6. Verify a deploy
1. Cloudflare Deployments → latest build **green**.
2. Open the site → **hard-refresh** (Cmd/Ctrl+Shift+R).
3. DevTools → Network → a UI asset (e.g. `setting`) loads from `pub-….r2.dev/assets/…` with **HTTP 200**.
4. No CORS errors; the game renders.

---

## 7. Rollback
Assets are content-hashed + indexed by `manifest.json`, so deploys are atomic:
- **App:** Cloudflare → Deployments → an older deployment → **Rollback**.
- **Assets:** re-publish the previous `manifest.json` (old hashed files remain in R2). Prune old objects
  later with an R2 lifecycle rule — never `s3 sync --delete` (would break in-flight sessions).

---

## 8. Troubleshooting (issues we actually hit)

| Symptom | Cause | Fix |
|---|---|---|
| App loads assets from `…workers.dev/assets` (stale), not R2 | `VITE_ASSETS_BASE` wasn't set **at build time** → app fell back to bundled `/assets` | Ensure `.env.production` is committed; the `deploy-app` build bakes it |
| App deployed twice / un-gated deploy appeared | Cloudflare's own auto-build is still on alongside CI | Turn OFF Cloudflare auto-build (§3.3) — deploy only via `ci.yml` |
| `deploy-app` skipped | `check` failed, or it was a PR (PRs only run `check`) | Fix the failing check; deploy runs on `main` pushes after `check` passes |
| CI fails on `validate:assets` warning | `--strict` blocks warnings | Fix the warning, or if it's the cosmetic icon-size advisory it's a NOTICE (won't block) |
| `aws … --endpoint-url ""` (exit 252) | `R2_ENDPOINT` secret missing/empty | Add the `R2_ENDPOINT` secret (with `https://`) |
| `AccessDenied` on `ListObjectsV2` | R2 token lacks list/write, or wrong bucket scope | Recreate token as **Object Read & Write**, scoped to the bucket |
| UI icons blurry — worse in prod than local | Downscaled tier (`@0.25x`) loaded via manifest-order fallback | Tag small UI atlases `{fix}` (full-res only); see [assets.md](assets.md) |
| Font/asset works locally, fails in CI | macOS case-insensitive hides a filename-case mismatch | Match git filename case to the reference (Linux CI is case-sensitive) |
| `wrangler deploy` doesn't serve `dist` | no `wrangler.jsonc` / wrong `assets.directory` | Ensure `wrangler.jsonc` has `"assets": { "directory": "./dist" }` |

---

## 9. Key files
| File | Role |
|---|---|
| [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) | Gated pipeline: `check` → `assets` (→ R2) → `deploy-app` (→ Cloudflare) |
| [`scripts/validate-assets.mjs`](../scripts/validate-assets.mjs) | Asset validator (`--strict`; errors/warnings block, notices advisory) |
| [`wrangler.jsonc`](../wrangler.jsonc) | Worker config: serve `dist/` as static assets |
| [`.env.production`](../.env.production) | `VITE_ASSETS_BASE` for production builds (→ R2) |
| [`src/assets/loader.ts`](../src/assets/loader.ts) | Runtime: reads `VITE_ASSETS_BASE`, loads manifest + bundles |
| `package.json` | `build:app`, `assets:ci`, `typecheck`, `validate:assets:strict` |

---

## 10. Future: moving to AWS
The pipeline is provider-agnostic (R2 is S3-compatible). To move runtime assets to **AWS S3 + CloudFront**
later: point `aws s3 sync` at S3 (drop `--endpoint-url`), swap CI auth to an OIDC role, replace the CDN
purge with `cloudfront create-invalidation`, and set `VITE_ASSETS_BASE` to the CloudFront URL. Nothing in
the app changes. See [asset-pipeline.md](asset-pipeline.md) §6.
