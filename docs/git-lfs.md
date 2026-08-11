# Git LFS — large binary source art

Source art in `raw-assets/` (PNG, JPG, WEBP, WAV, MP3, OGG) is stored with **Git LFS** so the normal
git history stays small and clones stay fast. In git, each binary is a tiny **pointer** file; the real
bytes live in GitHub's LFS store and are fetched on demand.

Related: [asset-pipeline.md](asset-pipeline.md) (raw-assets → R2), [deployment.md](deployment.md) (CI),
[assets.md](assets.md) (placement & naming). The tracking rules live in [`.gitattributes`](../.gitattributes).

---

## What is and isn't in LFS

| In LFS (pointer in git, bytes on GitHub) | NOT in LFS (normal git) |
|---|---|
| `raw-assets/**/*.png` `*.jpg` `*.jpeg` `*.webp` | all code (`.ts`, `.tsx`, `.js`) |
| `raw-assets/**/*.wav` `*.mp3` `*.ogg` | text assets: `.json`, `.fnt`, `.md` |
| — | generated `public/assets/` (git-ignored — never committed) |

The patterns are declared in [`.gitattributes`](../.gitattributes). A file is in LFS **only** if its
path matches a pattern there.

---

## One-time setup (per machine, not per repo)

`git lfs install` registers LFS filters in your **global** git config — do it **once per machine**, not
per clone. The repo itself is already LFS-enabled because `.gitattributes` is committed and travels with
every clone.

```bash
brew install git-lfs   # once per machine
git lfs install        # once per machine (sets up global filters + hooks)
git clone https://github.com/Vishnu1828/slot-game.git   # LFS files fetch automatically
```

A new teammate / new machine does exactly the two commands above. Nothing repo-specific.

---

## Day-to-day flow

### Adding an asset of an already-tracked type (the common case)

**No LFS command needed.** The `.gitattributes` filter converts the file to a pointer automatically on
`git add`. Your workflow is plain git:

```bash
cp new_symbol.png "raw-assets/games/fortune-teller{m}/ui/"
git add "raw-assets/games/fortune-teller{m}/ui/new_symbol.png"
git commit -m "add new_symbol art"
git push
```

Confirm it landed in LFS:

```bash
git lfs ls-files | grep new_symbol     # listed → stored in LFS ✅
```

### Introducing a brand-new file type (rare)

Only when adding a type **not yet** in `.gitattributes` (e.g. the first `.mp4` or `.svg`):

```bash
git lfs track "raw-assets/**/*.mp4"    # edits .gitattributes only
git add .gitattributes                 # commit the rule so everyone gets it
git add "raw-assets/.../intro.mp4"
git commit -m "add intro video (lfs)"
git push
```

`git lfs track` **only edits `.gitattributes`** — it never moves files. You must commit `.gitattributes`
so the rule applies for everyone.

---

## Command reference & use cases

| Command | Use case |
|---|---|
| `git lfs install` | Once per machine — enable LFS filters/hooks globally. |
| `git lfs track "pattern"` | Start tracking a **new file type**. Edits `.gitattributes` (commit it). |
| `git lfs track` *(no args)* | List which patterns are currently tracked. |
| `git lfs untrack "pattern"` | Stop tracking a pattern (future commits only; commit `.gitattributes`). |
| `git lfs ls-files` | List every file currently stored in LFS. |
| `git lfs status` | Show staged LFS files before committing. |
| `git add` / `git commit` / `git push` | **Normal flow** — pointers are created and objects uploaded automatically. |
| `git pull` | Fetches code **and** LFS objects for the checked-out commit automatically. |
| `git lfs pull` | Force-download LFS objects if the working tree has pointer stubs instead of real files. |
| `git lfs checkout` | Replace pointer text in the working tree with real file content. |
| `git lfs push --all origin` | Re-upload all LFS objects (safe no-op if already present). |
| `git lfs migrate import --include="…"` | **One-time** — convert already-committed blobs in history into LFS (rewrites history → force-push). |
| `git lfs env` | Show LFS config, including the remote endpoint. |

### Commit / push use cases

- **Normal commit of tracked art** → just `git add`/`git commit`. The pointer is written for you.
- **`git push`** → uploads the new LFS objects to GitHub in the same step. No separate upload command.
- **After a history rewrite** (`migrate`) → `git push --force origin main`; other clones must re-clone.
- **Working tree shows a small text file starting with `version https://git-lfs…`** → objects weren't
  smudged; run `git lfs pull` (or `git lfs checkout`) to restore real bytes.

---

## Storage & bandwidth (GitHub)

See usage at **Settings → Billing and licensing → Usage → Git LFS Data**
(<https://github.com/settings/billing>). Two separate meters:

| Resource | Free tier | Notes |
|---|---|---|
| **Storage** | **1 GB** | Total of all LFS objects, **including every past version** of a changed file. |
| **Bandwidth** | **1 GB / month** | Every download/CI checkout with `lfs: true` counts; resets monthly. |
| More of either | **$5/mo data pack → +50 GB** storage & bandwidth | Buy under the billing page. |

Current repo footprint: **~36 MB** of LFS objects — well within free tier.

**Two gotchas:**
1. **Storage grows with churn, not file count.** Re-exporting the same PNG 20 times keeps all 20 copies
   in LFS storage even though only the latest is on disk.
2. **Bandwidth usually runs out before storage.** Each `lfs: true` CI checkout pulls all objects. Keep
   `lfs: true` only on jobs that read the real source art (`check`, `assets`) — the app-deploy job loads
   assets from R2 at runtime and does **not** need it. See [deployment.md](deployment.md).

---

## CI

CI checks out with `lfs: true` on jobs that read source art:

- **`check`** — the asset validator reads real PNG header bytes (dimensions), so it needs the files.
- **`assets`** — AssetPack reads every source PNG to build the R2 bundles.
- **`deploy-app`** — builds the app only; assets load from R2 at runtime → `lfs: true` **not required**.

See [`.github/workflows/ci.yml`](../.github/workflows/ci.yml).
