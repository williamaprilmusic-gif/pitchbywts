// Multi-tenant data model, phase 2: route wiring. Spread into the router in backend/index.ts (`...tenancyRoutes,`).
// Only the bootstrap admin (isSiteAdmin on the signed session email) may call it; every other caller fails closed.
// Not anchored on by any scripts/prepare-*.mjs. Test: npm run test:migration
import { json, error, db, requireAuth, type RouterMiddleware } from '../server/appdeployCompat';
import { isSiteAdmin, resolveAccess, type Rec } from './tenancy';
import { canonicalAdminRole } from './roles';
import { coerceCompetitionKind } from './competitionModel';
import { migrateTenancy, type MigrationDeps } from './tenancyMigration';

function requireSiteAdminOnly(): RouterMiddleware {
  return async (ctx) => {
    if (!ctx.user?.userId) return error('Unauthorized', 401);
    if (!isSiteAdmin(ctx.user.email)) return error('Site Admin only', 403);
  };
}

const liveDeps = (): MigrationDeps => ({
  list: async (ns, limit) => (await db.list<Record<string, unknown>>(ns, { limit })).items,
  update: async (ns, id, record) => (await db.update(ns, [{ id, record }]))[0] === true,
  add: (ns, records) => db.add(ns, records),
  now: () => Date.now(),
});

// GET /api/my-access: read-only, any signed-in user. Phase 3 reports access but nothing enforces competitionIds yet.
const listNs = async (ns: string) => (await db.list<Rec>(ns, { limit: 5000 })).items;
async function myAccess(userId: string, email: unknown) {
  const access = await resolveAccess(userId, email, listNs);
  const catalog = await listNs('competition_catalog').catch(() => [] as Rec[]);
  const ids = access.competitionIds === 'all' ? null : [...access.competitionIds];
  const competitions = catalog.filter(c => ids === null || ids.includes(String(c.id))).map(c => ({ id: String(c.id), name: c.name, kind: coerceCompetitionKind(c.kind ?? c.type), status: c.status }));
  return { role: access.role, canonicalRole: canonicalAdminRole(access.role), isSiteAdmin: access.isSite, competitionIds: ids ?? 'all', competitions };
}

export const tenancyRoutes: Record<string, RouterMiddleware[]> = {
  'GET /api/my-access': [requireAuth(), async ({ user }) => json(await myAccess(user!.userId, user!.email))],
  'POST /api/admin/migrate-tenancy': [requireAuth(), requireSiteAdminOnly(), async ({ body, user }) => {
    const input = (body && typeof body === 'object' ? body : {}) as { dryRun?: unknown; allowCapped?: unknown };
    const result = await migrateTenancy(liveDeps(), { dryRun: input.dryRun !== false, allowCapped: input.allowCapped === true, actor: { userId: user?.userId, email: user?.email } });
    return json(result.body, result.status);
  }],
};
