# Pitchline Four-Agent Engineering Workflow

## Agents

### 1. Diagnostician
Read-only. Finds the problem, root cause, evidence, affected surface, risks, and recommended solution.

### 2. Solver
Implementation specialist. Works in an isolated branch/workspace. Applies the approved fix and runs real verification.

### 3. Deep Reviewer
Independent verifier. Reviews the actual diff, reruns relevant checks, looks for regressions/security issues, and returns PASS or FAIL.

### 4. Controller
Parent/orchestrator. Owns the lifecycle, passes only the necessary context between agents, decides whether evidence is sufficient, and loops Solver → Reviewer when the reviewer fails the change.

## State machine

`INTAKE → DIAGNOSE → CONTROLLER APPROVAL → SOLVE → VERIFY → DEEP REVIEW → PASS`

Failure path:

`DEEP REVIEW → FAIL → REMEDIATION → SOLVE → VERIFY → DEEP REVIEW`

Maximum three remediation cycles per issue.

## Stop conditions

The Controller stops only when:
- the original issue is fixed;
- the relevant build/type/test checks pass;
- the reviewer independently returns PASS;
- no critical security or regression finding remains;
- the change is isolated from `main` until human merge/approval.

## Separation of powers

The Diagnostician does not edit.
The Solver does not approve its own work.
The Deep Reviewer does not depend on Solver's reasoning.
The Controller does not skip the Deep Reviewer.

## Pitchline-specific review targets

For football-platform changes, always consider fixture/competition relationships, role isolation (Supporter/Manager/Club/LFA Admin/Controller), live-match state transitions, timestamps, score/discipline integrity, team-sheet eligibility, standings/statistics recalculation, auditability, duplicate-event protection, and Vercel deployment compatibility.
