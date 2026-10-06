// Multi-tenant data model, phase 2. Pure helpers: competition kinds, catalog visibility/slug, club_competitions rows and
// the user_roles competitionIds field. Enforces nothing and grants nothing. Not anchored on by any scripts/prepare-*.mjs.
// Test: npm run test:migration
import type { Rec } from './tenancy';

export const COMPETITION_KINDS = ['League', 'Tournament', 'Cup'] as const;
export type CompetitionKind = typeof COMPETITION_KINDS[number];

const str = (v: unknown) => (v === undefined || v === null ? '' : String(v).trim());

/** Unknown / missing values read as League (as before); Tournament and Cup are kept. */
export function coerceCompetitionKind(value: unknown): CompetitionKind {
  const v = str(value);
  return (COMPETITION_KINDS as readonly string[]).includes(v) ? (v as CompetitionKind) : 'League';
}
/** Kinds that have no legacy league row and therefore scope their records by competitionId only. */
export const isCompetitionOnlyKind = (value: unknown) => coerceCompetitionKind(value) !== 'League';

export function slugify(input: unknown): string {
  return str(input).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
}
/** Stored boolean wins; otherwise Setup and Archived competitions are not public. */
export function competitionIsPublic(row: Rec): boolean {
  if (typeof row.public === 'boolean') return row.public;
  const status = str(row.status) || 'Setup';
  return status !== 'Setup' && status !== 'Archived';
}
export function competitionSlug(row: Rec): string {
  return str(row.slug) || slugify([row.name, row.season].map(str).filter(Boolean).join(' '));
}
/** Additive read-side fields for a catalog row; existing fields are never altered. */
export const catalogExtras = (row: Rec) => ({ public: competitionIsPublic(row), slug: competitionSlug(row) });

// ---- roles ----
export const GRANTABLE_ROLES = ['Supporter', 'Manager', 'Club', 'LFA Admin'] as const;
export const ACCEPTED_ROLES = [...GRANTABLE_ROLES, 'Tournament Admin', 'Site Admin'] as const;
export type StoredRole = typeof ACCEPTED_ROLES[number];
/** Readable in user_roles rows, but NOT assignable through invites, role requests or the join route (phase 4 grants them). */
export const isAcceptedRole = (role: unknown) => (ACCEPTED_ROLES as readonly string[]).includes(str(role));
export const isGrantableRole = (role: unknown) => (GRANTABLE_ROLES as readonly string[]).includes(str(role));

export type UserRoleRow = Rec & { userId?: string; role?: StoredRole | string; competitionIds?: string[] };
/** competitionIds as a clean, de-duplicated string[]; anything that is not an array reads as []. */
export function normalizeCompetitionIds(value: unknown): string[] {
  return Array.isArray(value) ? [...new Set(value.map(str).filter(Boolean))] : [];
}
export function normalizeUserRoleRow<T extends UserRoleRow>(row: T): T & { competitionIds: string[] } {
  return { ...row, competitionIds: normalizeCompetitionIds(row.competitionIds) };
}

// ---- club_competitions {id, clubId, competitionId, status, joinedAt} ----
export const CLUB_COMPETITIONS_NS = 'club_competitions';
export type ClubCompetition = { id: string; clubId: string; competitionId: string; status: string; joinedAt: number };
export const clubCompetitionId = (clubId: string, competitionId: string) => `cc_${clubId}__${competitionId}`;
export function buildClubCompetition(clubId: string, competitionId: string, joinedAt: number, status = 'Active'): ClubCompetition {
  return { id: clubCompetitionId(clubId, competitionId), clubId, competitionId, status, joinedAt };
}
/** True when any row (whatever its status) already links the pair, so a removed link is never silently revived. */
export const hasClubCompetition = (rows: Rec[], clubId: string, competitionId: string) =>
  rows.some(r => str(r.clubId) === clubId && str(r.competitionId) === competitionId);
