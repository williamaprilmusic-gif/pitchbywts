# Pitchline authenticated production QA

The project now includes a one-click GitHub Actions workflow:

`.github/workflows/production-authenticated-qa.yml`

## Required GitHub Actions secrets

Create these repository secrets under **Settings → Secrets and variables → Actions**:

- `PITCHLINE_QA_EMAIL` — a dedicated Pitchline QA account email
- `PITCHLINE_QA_PASSWORD` — the password for that QA account

Use a dedicated LFA Admin QA account rather than a personal production account. Never commit credentials to the repository and never put them in workflow YAML.

## Run

Open **GitHub → Actions → Pitchline One-Click Authenticated Production QA → Run workflow**.

Leave `cleanup=true` for normal runs.

The workflow:

1. Logs into production using the GitHub Actions secrets.
2. Confirms the account resolves to `LFA Admin`.
3. Creates a temporary QA fixture using real production APIs.
4. Assigns an official.
5. Creates the matchday team sheet and readiness record.
6. Starts the live match.
7. Records a goal, yellow card and substitution through `/api/live-match/events-v2`.
8. Finishes and verifies the match.
9. Confirms the league table recalculates from the completed result.
10. Signs out.
11. Signs back in.
12. Confirms the final score, events and standings survive the new authenticated session.
13. Restores the two affected team rows and removes the temporary QA records when cleanup is enabled.

## Failure behavior

The workflow deliberately fails on authentication errors, non-LFA roles, unexpected API status codes, incorrect score/event persistence, failed standings recalculation, failed second-login persistence, or failed cleanup.

This is a real production mutation test. It should therefore be run deliberately and normally with cleanup enabled.
