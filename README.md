# payload-admin

Shared Payload CMS v3 admin panel. Used as a **git submodule** inside svelteload project monorepos.

Not a standalone app. Requires a parent monorepo with `packages/payload-config/` providing project-specific collections, globals, blocks, components, and branding assets.

## What's shared here

- `src/components/` — reusable admin UI components (`ArrayRowLabel`, `TextareaWithCounter`, `DraftReviewNavLink`, `RedirectRowLabel`)
- `next.config.mjs` — Next.js + Payload wiring
- `tsconfig.json` — path aliases for `@payload-admin/*` and `@payload-config/*`
- `scripts/copy-assets.ts` — prebuild script that copies branding from `packages/payload-config/src/assets/public/` into `public/`
- `public/robots.txt` — generic robots file

## What lives in the project (not here)

- `packages/payload-config/src/components/` — project-specific admin components (`Logo`, `Icon`, `ColorPicker`, etc.)
- `packages/payload-config/src/assets/public/` — branding assets (`logo.png`, `favicon.png`, `icon.png`, `apple-touch-icon.png`, block preview images)
- `packages/payload-config/src/payload.config.ts` — full admin config (DB, storage, localization, component refs)
- `apps/payload-admin/.env` — credentials (never committed)

## Adding to a new project

```bash
git submodule add git@github.com:nodebrush/payload-admin.git apps/payload-admin
```

Then create `apps/payload-admin/.env`:

```
POSTGRES_URL=
PAYLOAD_SECRET=
S3_BUCKET=
S3_ENDPOINT=
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
FRONTEND_URL=http://localhost:5173
```

## Component aliases

Components referenced in `packages/payload-config` use two aliases:

| Alias | Resolves to | Purpose |
|---|---|---|
| `@payload-admin/components/X` | `apps/payload-admin/src/components/X` | Shared components (this repo) |
| `@payload-config/components/X` | `packages/payload-config/src/components/X` | Project-specific components |

## Branding assets

`scripts/copy-assets.ts` runs automatically before every build (`prebuild` in `package.json`) and copies `packages/payload-config/src/assets/public/` into `apps/payload-admin/public/`. The copied files are gitignored in this repo.

## Updating this submodule

```bash
cd apps/payload-admin
git pull origin main
cd ../..
git add apps/payload-admin
git commit -m "update payload-admin submodule"
git push
```
