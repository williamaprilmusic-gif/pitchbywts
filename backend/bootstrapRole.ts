// Multi-tenant phase 4: the bootstrap account's STORED role is 'Site Admin'. Pure planning helper for the sign-in block in
// server/apiEntrypoint.ts. Safety invariant: access never depends on this row (the bootstrap email is admin from the signed
// session), so a missing/garbage/failed write can never lock the account out. Not anchored on by any scripts/prepare-*.mjs.
// Test: npm run test:bootstrap
export type StoredRow = Record<string, unknown>;
export type RolePlan = { add?: StoredRow; updates: Array<{ id: string; record: StoredRow }> };
export const BOOTSTRAP_ROLE = 'Site Admin';
export const BOOTSTRAP_SOURCE = 'Vercel bootstrap administrator';

/**
 * Decide the role-row writes for a bootstrap sign-in. `rows` are all user_roles rows; only rows whose userId is the
 * bootstrap user's are ever planned. Every other field of an existing row (competitionIds, club, team...) is preserved.
 * Returns no writes at all when every row of the user already says 'Site Admin'.
 */
export function planBootstrapRole(rows: StoredRow[], userId: string, now: number): RolePlan {
  const mine = rows.filter(r => String(r.userId) === userId);
  if (!mine.length) return { add: { userId, role: BOOTSTRAP_ROLE, updatedAt: now, source: BOOTSTRAP_SOURCE }, updates: [] };
  const updates = mine
    .filter(r => r.id && r.role !== BOOTSTRAP_ROLE)
    .map(r => ({ id: String(r.id), record: { ...r, role: BOOTSTRAP_ROLE, updatedAt: now, source: BOOTSTRAP_SOURCE } }));
  return { updates };
}
