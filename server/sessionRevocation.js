// Shared session revocation rule, used by the API gateway (apiEntrypoint.ts) and the
// standalone Vercel handlers (server/qaCleanup.js). `loadUser` resolves the auth_users record
// (or undefined) for a user id, so each caller supplies its own data access.
// A session is revoked when its owner's credentials were reset after it was issued, or the account no longer exists.
// A failed lookup does not revoke, matching the gateway's previous behaviour.
export async function sessionRevoked(user, loadUser) {
  try {
    const row = await loadUser(String(user.userId));
    if (!row) return true;
    return Number(user.iat || 0) < Number(row.sessionsValidAfter || 0);
  } catch (error) { console.error('Pitchline session revocation check failed', error); return false; }
}
