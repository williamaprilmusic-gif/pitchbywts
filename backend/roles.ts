// Shared role helpers (multi-tenant phase 3). Pure; not anchored on by any scripts/prepare-*.mjs.
// Imported with an explicit .ts extension from fixtureGenerator so node can run its test directly.
import { isSiteAdmin } from './tenancy.ts';

export const ADMIN_ROLES = ['LFA Admin', 'Tournament Admin', 'Site Admin'] as const;

/** True for every kind of administrator ('LFA Admin', 'Tournament Admin', 'Site Admin'). */
export function isAdminRole(role: unknown): boolean {
  return typeof role === 'string' && (ADMIN_ROLES as readonly string[]).includes(role);
}

/** Label check only. A stored 'Site Admin' row carries NO power unless the session email is the bootstrap email (isSiteAdmin). */
export function isSiteAdminRole(role: unknown): boolean {
  return role === 'Site Admin';
}

/** Old clients only know 'LFA Admin': every admin kind maps to it, everything else is returned unchanged. */
export function canonicalAdminRole<T>(role: T): T | 'LFA Admin' {
  return isAdminRole(role) ? 'LFA Admin' : role;
}

/**
 * Role the guards should evaluate. The bootstrap email (PITCHLINE_ADMIN_EMAIL on the signed session) always counts as
 * an admin; any stored admin kind maps to 'LFA Admin'. PHASE 3 ONLY: a stored LFA/Tournament admin with empty
 * competitionIds still passes - competition membership is enforced in phase 5, so existing users keep access.
 */
export function guardRole<T>(stored: T, email?: unknown): T | 'LFA Admin' {
  return isSiteAdmin(email) ? 'LFA Admin' : canonicalAdminRole(stored);
}
