# Pitchline

Football league management app (fixtures, league tables, live match, clubs, players, finance) with four roles: **LFA Admin**, **Club**, **Manager**, **Supporter**. Production: https://pitchline-william-april.vercel.app (Vercel deploys `main` automatically).

## Layout

- `src/` — Vite + React front end. `src/App.tsx` holds the shell, navigation (`roleNavGroups`, `canSee`, `navigate`) and many page components; larger pages live in their own files (e.g. `ClubManagement.tsx`, `LiveMatchCentre.tsx`, `AddForms.tsx`, `branding.tsx`).
- `backend/index.ts` — API routes as `'METHOD /api/path':[middlewares..., handler]`. Guards: `requireAuth()`, `requireLfaAdmin()`, `requireAnyRole([...])`, `scopedTeamAccess`, `scopedClubAccess`, `scopedFixtureAccess`.
- `server/apiEntrypoint.ts` wraps the API; the build bundles it to `server/apiRuntime.mjs` (generated, gitignored). `api/index.js` is the Vercel function.
- Data is stored in Postgres (Neon) in one table, `pitchline_records(namespace, id, record jsonb, ...)`.
- CSS: `src/index.css`, `src/minimal-professional.css`, `src/mobile-professional.css` (append new styles to the last one).

## Build — read before editing

`npm run build` first runs ~30 `scripts/prepare-*.mjs` scripts that **rewrite source files by matching exact text**, then `vite build`, then two audits (`deep-foundation-audit`, `deep-workspace-audit`; the latter caps navigation at 25 workspaces).

- The build **mutates the working tree**. Always build in a fresh `git worktree`, never in your main checkout.
- Before changing a line, check whether a prepare script anchors on it: `grep -rn "<snippet>" scripts/`. If one does, change something else (e.g. render-time) or the build will fail with "insertion point not found".
- Some backend patches run after the server bundle is built and never reach production — the bundled `server/apiRuntime.mjs` is the source of truth for live behaviour.

## Workflow

- Work on a branch, open a PR to `main`, merge when the Vercel preview is ready and checks are green. Merging deploys to production.
- After a deploy, the GitHub Actions workflow `production-authenticated-qa.yml` runs against production (it also runs on push to `main`, sometimes before the deploy finishes — re-run it via workflow_dispatch to verify).
- Verify UI changes in a real browser (Playwright) on desktop and at 390px width, for each role.

## Security

- The repository is public. Never commit passwords, tokens or `.env` contents.
- Secrets live only in Vercel environment variables and GitHub Actions secrets (`PITCHLINE_ADMIN_EMAIL`, `PITCHLINE_ADMIN_PASSWORD`, `PITCHLINE_QA_EMAIL`, `PITCHLINE_QA_PASSWORD`).
