// Multi-tenant phase 7: Site Admin competition management + the public competition list. Spread into the router through
// tenancyRoutes. Every /api/admin/* and mutating route here is Site Admin only (isSiteAdmin on the signed session email,
// fail-closed): 401 unauthenticated, 403 everyone else, including stored LFA Admins and a stored 'Site Admin' row on
// another email. Not anchored on by any scripts/prepare-*.mjs. Test: npm run test:site-admin
import { json, error, db, requireAuth, type RouterMiddleware } from '../server/appdeployCompat';
import { isSiteAdmin, type Rec } from './tenancy';
import { coerceCompetitionKind, competitionIsPublic, competitionSlug, slugify, normalizeCompetitionIds, buildClubCompetition, CLUB_COMPETITIONS_NS } from './competitionModel';
import { TENANCY_ENFORCED } from './tenancyFlag';

const str = (v: unknown) => (v === undefined || v === null ? '' : String(v).trim());
const listNs = async (ns: string) => (await db.list<Rec>(ns, { limit: 5000 })).items.map(r => r as Rec);
const STATUSES = ['Setup', 'Registration', 'Scheduled', 'Live', 'Completed', 'Archived'];
const ADMIN_KINDS = ['LFA Admin', 'Tournament Admin'];
const INACTIVE = new Set(['inactive', 'removed', 'rejected', 'withdrawn', 'pending']);
const linkActive = (r: Rec) => !INACTIVE.has(str(r.status).toLowerCase());

function siteAdminOnly(): RouterMiddleware {
  return async (ctx) => {
    if (!ctx.user?.userId) return error('Unauthorized', 401);
    if (!isSiteAdmin(ctx.user.email)) return error('Site Admin only', 403);
  };
}
const guard = [requireAuth(), siteAdminOnly()];

async function audit(ctx: { user?: { userId?: string; email?: string } }, action: string, detail: Rec) {
  try { await db.add('audit_log', [{ action, actorId: ctx.user?.userId, actorEmail: ctx.user?.email, ...detail, createdAt: Date.now() }]); }
  catch (e) { console.error('Pitchline site-admin audit write failed', e); }
}

const publicShape = (c: Rec) => ({ id: str(c.id), name: str(c.name), kind: coerceCompetitionKind(c.kind ?? c.type), season: str(c.season), status: str(c.status) || 'Setup' });

/** Public list for the Supporter picker: only public competitions; Setup/Archived are never public. */
export function publicCompetitions(catalog: Rec[]) {
  return catalog.filter(c => competitionIsPublic(c) && !['Setup', 'Archived'].includes(str(c.status) || 'Setup')).map(publicShape);
}

async function adminOverview() {
  const [catalog, links, clubs, roles] = await Promise.all(['competition_catalog', CLUB_COMPETITIONS_NS, 'clubs', 'user_roles'].map(n => listNs(n).catch(() => [] as Rec[])));
  const clubName = new Map(clubs.map(c => [str(c.id), str(c.name)]));
  const competitions = catalog.sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0)).map(c => {
    const id = str(c.id);
    return {
      ...publicShape(c), public: competitionIsPublic(c), slug: competitionSlug(c), country: str(c.country),
      clubs: links.filter(l => str(l.competitionId) === id && linkActive(l)).map(l => ({ linkId: str(l.id), clubId: str(l.clubId), name: clubName.get(str(l.clubId)) || str(l.clubId) })),
      admins: roles.filter(r => ADMIN_KINDS.includes(str(r.role)) && normalizeCompetitionIds(r.competitionIds).includes(id)).map(r => ({ userId: str(r.userId), role: str(r.role) })),
    };
  });
  return { competitions, clubs: clubs.map(c => ({ id: str(c.id), name: str(c.name) })), tenancyEnforced: TENANCY_ENFORCED };
}

export const siteAdminRoutes: Record<string, RouterMiddleware[]> = {
  // Public: no auth. Same data shape the Supporter picker needs, nothing else.
  'GET /api/competitions': [async () => json({ competitions: publicCompetitions(await listNs('competition_catalog').catch(() => [] as Rec[])) })],

  'GET /api/admin/competitions': [...guard, async () => json(await adminOverview())],

  // Edit only: creation reuses POST /api/competition-portfolio (Site Admin passes requireLfaAdmin). Adds public/slug.
  'PUT /api/admin/competitions/:id': [...guard, async (ctx) => {
    const old = (await db.get<Rec>('competition_catalog', [ctx.params.id]))[0];
    if (!old) return error('Competition not found', 404);
    const input = (ctx.body && typeof ctx.body === 'object' ? ctx.body : {}) as Rec;
    const next: Rec = { ...old };
    if (input.name !== undefined) { const name = str(input.name).slice(0, 80); if (!name) return error('Competition name is required', 400); next.name = name; }
    if (input.season !== undefined) { const season = str(input.season).slice(0, 20); if (!season) return error('Season is required', 400); next.season = season; }
    if (input.public !== undefined) { if (typeof input.public !== 'boolean') return error('public must be true or false', 400); next.public = input.public; }
    if (input.status !== undefined) {
      if (!STATUSES.includes(str(input.status))) return error('Invalid competition status', 400);
      if (str(input.status) === 'Archived' && old.isActive) return error('Active competition must be changed before archiving', 409);
      next.status = str(input.status);
    }
    if (input.slug !== undefined) {
      const slug = slugify(input.slug);
      if (!slug) return error('Invalid slug', 400);
      if ((await listNs('competition_catalog')).some(c => str(c.id) !== str(old.id) && competitionSlug(c) === slug)) return error('Slug already in use', 409);
      next.slug = slug;
    } else if (!str(old.slug)) next.slug = competitionSlug(next);
    next.updatedAt = Date.now();
    const ok = await db.update('competition_catalog', [{ id: ctx.params.id, record: next }]);
    if (!ok[0]) return error('Could not update competition', 500);
    await audit(ctx, 'site-admin.competition.update', { competitionId: ctx.params.id, fields: Object.keys(input).filter(k => ['name', 'season', 'public', 'status', 'slug'].includes(k)) });
    return json({ ...publicShape(next), public: competitionIsPublic(next), slug: competitionSlug(next) });
  }],

  'POST /api/club-competitions': [...guard, async (ctx) => {
    const input = (ctx.body && typeof ctx.body === 'object' ? ctx.body : {}) as Rec;
    const clubId = str(input.clubId), competitionId = str(input.competitionId);
    if (!clubId || !competitionId) return error('clubId and competitionId are required', 400);
    const [club] = await db.get<Rec>('clubs', [clubId]);
    if (!club) return error('Club not found', 404);
    const [competition] = await db.get<Rec>('competition_catalog', [competitionId]);
    if (!competition) return error('Competition not found', 404);
    const link = buildClubCompetition(clubId, competitionId, Date.now());
    const [existing] = await db.get<Rec>(CLUB_COMPETITIONS_NS, [link.id]);
    if (existing && linkActive(existing)) return json({ ...existing, created: false });
    await db.add(CLUB_COMPETITIONS_NS, [existing ? { ...existing, status: 'Active', joinedAt: link.joinedAt } : link]);
    await audit(ctx, 'site-admin.club-competition.link', { clubId, competitionId, linkId: link.id, reactivated: Boolean(existing) });
    return json({ ...link, created: true }, 201);
  }],

  'DELETE /api/club-competitions/:id': [...guard, async (ctx) => {
    const [existing] = await db.get<Rec>(CLUB_COMPETITIONS_NS, [ctx.params.id]);
    if (!existing) return error('Link not found', 404);
    if (!linkActive(existing)) return json({ id: ctx.params.id, removed: false });
    await db.update(CLUB_COMPETITIONS_NS, [{ id: ctx.params.id, record: { ...existing, status: 'Removed', removedAt: Date.now() } }]);
    await audit(ctx, 'site-admin.club-competition.unlink', { linkId: ctx.params.id, clubId: str(existing.clubId), competitionId: str(existing.competitionId) });
    return json({ id: ctx.params.id, removed: true });
  }],

  // DISABLED until TENANCY_ENFORCED (backend/tenancyFlag.ts): 409 and no writes.
  'POST /api/admin/assign-competition-admin': [...guard, async (ctx) => {
    if (!TENANCY_ENFORCED) return error('Competition scoping is not enabled yet', 409);
    const input = (ctx.body && typeof ctx.body === 'object' ? ctx.body : {}) as Rec;
    const kind = str(input.kind);
    if (!ADMIN_KINDS.includes(kind)) return error("kind must be 'LFA Admin' or 'Tournament Admin'", 400);
    const competitionIds = normalizeCompetitionIds(input.competitionIds);
    if (!competitionIds.length) return error('competitionIds is required', 400);
    const found = await db.get<Rec>('competition_catalog', competitionIds);
    if (found.length !== competitionIds.length) return error('Unknown competition id', 400);
    const users = await listNs('auth_users');
    const email = str(input.email).toLowerCase();
    const user = users.find(u => (str(input.userId) && str(u.id) === str(input.userId)) || (email && str(u.email).toLowerCase() === email));
    if (!user) return error('User not found', 404);
    const userId = str(user.id);
    if (isSiteAdmin(user.email)) return error('The Site Admin account cannot be changed here', 403);
    const row = (await listNs('user_roles')).find(r => str(r.userId) === userId);
    if (row && str(row.role) === 'Site Admin') return error('A Site Admin role row cannot be changed here', 403);
    if (row && (ADMIN_KINDS.includes(str(row.role)) || ['Club', 'Manager'].includes(str(row.role))) && input.overwrite !== true) return error('User already has a role; pass overwrite:true to replace it', 409);
    if (row) await db.update('user_roles', [{ id: str(row.id), record: { ...row, role: kind, competitionIds, updatedAt: Date.now() } }]);
    else await db.add('user_roles', [{ userId, role: kind, competitionIds, createdAt: Date.now() }]);
    await audit(ctx, 'site-admin.competition-admin.assign', { targetUserId: userId, kind, competitionIds, previousRole: str(row?.role) || null });
    return json({ userId, role: kind, competitionIds });
  }],

  'POST /api/admin/revoke-competition-admin': [...guard, async (ctx) => {
    if (!TENANCY_ENFORCED) return error('Competition scoping is not enabled yet', 409);
    const input = (ctx.body && typeof ctx.body === 'object' ? ctx.body : {}) as Rec;
    const userId = str(input.userId);
    if (!userId) return error('userId is required', 400);
    const row = (await listNs('user_roles')).find(r => str(r.userId) === userId);
    if (!row || !ADMIN_KINDS.includes(str(row.role))) return json({ userId, revoked: false });
    await db.update('user_roles', [{ id: str(row.id), record: { ...row, role: 'Supporter', competitionIds: [], updatedAt: Date.now() } }]);
    await audit(ctx, 'site-admin.competition-admin.revoke', { targetUserId: userId, previousRole: str(row.role) });
    return json({ userId, revoked: true });
  }],
};
