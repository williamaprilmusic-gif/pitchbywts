# Pitchline One-Click Authenticated Production QA

The repository now contains a manual GitHub Actions workflow that exercises the authenticated production matchday lifecycle against the production Vercel URL.

## One-time setup

Create these GitHub Actions repository secrets:

- `PITCHLINE_QA_EMAIL` — email of a dedicated LFA Admin QA account.
- `PITCHLINE_QA_PASSWORD` — password for that QA account.

Do not commit credentials to the repository and do not place them in workflow YAML.

## Run

Open GitHub Actions → **Pitchline One-Click Authenticated Production QA** → **Run workflow**.

The workflow accepts an optional production base URL and defaults to:

`https://pitchline-william-april.vercel.app`

## What it verifies

1. Production health and database/session configuration.
2. LFA Admin authentication and authenticated session.
3. Active competition, registered teams, players and available official.
4. Temporary QA venue and fixture creation.
5. Official appointment and confirmation.
6. Digital team sheet, matchday readiness and matchday confirmation.
7. Live match start and state persistence.
8. Goal, yellow card and substitution events.
9. Duplicate live-event idempotency.
10. Full-time transition and fixture/result persistence.
11. Match verification/locking.
12. Automatic standings recalculation after the completed result.
13. Logout invalidation.
14. Fresh login and persistence of the verified match report.

Each run creates a uniquely identified QA fixture so it does not touch an existing real fixture. QA fixtures are intentionally retained as audit evidence; repeated runs therefore add test records and alter standings. Use a dedicated QA competition/database when repeated destructive QA is required.
