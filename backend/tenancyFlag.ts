// Single switch for competition-scoped administration. Phase 5 enforcement has shipped (backend/index.ts: scoped reads on
// /api/fixtures and /api/teams, competition checks in requireLfaAdmin and the scoped fixture/team/club guards, all
// lock-out-safe — an admin with no competitionIds and the bootstrap Site Admin stay global). With this true, Site Admins
// can create competition-scoped admins via assign/revoke-competition-admin, and those admins are isolated to their set.
export const TENANCY_ENFORCED = true;
