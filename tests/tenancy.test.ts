// Run with: npm run test:tenancy  (Node 22+/24 strips types natively)
import assert from 'node:assert/strict';
import { isSiteAdmin, competitionOf, inScope, resolveAccessFrom, resolveAccess } from '../backend/tenancy.ts';

const env = { PITCHLINE_ADMIN_EMAIL: '  Owner@Example.com ' };
assert.equal(isSiteAdmin('owner@example.COM', env), true);
assert.equal(isSiteAdmin(' owner@example.com', env), true);
assert.equal(isSiteAdmin('other@example.com', env), false);
assert.equal(isSiteAdmin('owner@example.com', {}), false);
assert.equal(isSiteAdmin('', { PITCHLINE_ADMIN_EMAIL: '' }), false);
assert.equal(isSiteAdmin(undefined, env), false);

const catalog = [{ id: 'cA', legacyLeagueId: 'L1' }, { id: 'cB' }];
const teams = [
  { id: 't1', name: 'Reds', clubId: 'k1', competitionId: 'cA' },
  { id: 't2', name: 'Blues', clubId: 'k2', leagueId: 'L1' },
  { id: 't3', name: 'Greens', clubId: 'k3', competitionId: 'cB' },
];
const fixtures = [{ id: 'f1', home: 'Reds', competitionId: 'cA' }, { id: 'f2', leagueId: 'L1' }];
const ctx = { fixtures, teams, catalog };

assert.equal(competitionOf({ competitionId: 'cB', leagueId: 'L1' }, ctx), 'cB');
assert.equal(competitionOf({ fixtureId: 'f1' }, ctx), 'cA');
assert.equal(competitionOf({ fixtureId: 'f2' }, ctx), 'cA');
assert.equal(competitionOf({ teamId: 't3' }, ctx), 'cB');
assert.equal(competitionOf({ team: 'Blues' }, ctx), 'cA');
assert.equal(competitionOf({ leagueId: 'L1' }, ctx), 'cA');
assert.equal(competitionOf({ leagueId: 'Lx' }, ctx), 'Lx');
assert.equal(competitionOf({}, ctx), undefined);
assert.equal(competitionOf(null), undefined);

assert.equal(inScope('all', {}), true);
assert.equal(inScope(new Set(['cA']), { fixtureId: 'f1' }, ctx), true);
assert.equal(inScope(new Set(['cA']), { teamId: 't3' }, ctx), false);
assert.equal(inScope(new Set(['cA']), {}, ctx), false);
assert.equal(inScope(new Set(), { competitionId: 'cA' }), false);

const user_roles = [
  { userId: 'lfa', role: 'LFA Admin', competitionIds: ['cA'] },
  { userId: 'lfaNone', role: 'LFA Admin' },
  { userId: 'lfaEmpty', role: 'Tournament Admin', competitionIds: [] },
  { userId: 'tour', role: 'Tournament Admin', competitionIds: ['cB'] },
  { userId: 'clubA', role: 'Club', clubId: 'k1' },
  { userId: 'clubAB', role: 'Club', clubId: 'k3' },
  { userId: 'mgr', role: 'Manager', team: 'Blues' },
  { userId: 'bootstrapRow', role: 'Supporter' },
];
const club_competitions = [
  { clubId: 'k3', competitionId: 'cA', status: 'Active' },
  { clubId: 'k3', competitionId: 'cB' },
  { clubId: 'k3', competitionId: 'cZ', status: 'Removed' },
];
const data = { user_roles, club_competitions, teams, competition_catalog: catalog };
const r = (id: string, email = id + '@x.com') => resolveAccessFrom(data, id, email, env);
const set = (a: { competitionIds: Set<string> | 'all' }) => [...(a.competitionIds as Set<string>)].sort();

const site = r('bootstrapRow', 'OWNER@example.com');
assert.deepEqual([site.role, site.isSite, site.competitionIds], ['Site Admin', true, 'all']);
// the bootstrap email is always Site Admin even with a lesser stored row
assert.equal(resolveAccessFrom({ user_roles: [{ userId: 'u', role: 'LFA Admin' }] }, 'u', 'owner@example.com', env).isSite, true);
// Site Admin = bootstrap email only: a stored 'Site Admin' row on anyone else is a plain admin with no cross-tenant power
{ const f = resolveAccessFrom({ user_roles: [{ userId: 'fake', role: 'Site Admin', competitionIds: ['cA'] }] }, 'fake', 'fake@example.com', env);
  assert.deepEqual([f.role, f.isSite, [...(f.competitionIds as Set<string>)]], ['LFA Admin', false, ['cA']]);
  const g = resolveAccessFrom({ user_roles: [{ userId: 'fake', role: 'Site Admin' }] }, 'fake', 'fake@example.com', env);
  assert.deepEqual([g.role, g.isSite, g.competitionIds === 'all'], ['LFA Admin', false, false]);
  assert.equal(resolveAccessFrom({ user_roles: [{ userId: 'fake', role: 'Site Admin' }] }, 'fake', 'fake@example.com', {}).isSite, false); }
assert.deepEqual(set(r('lfa')), ['cA']);
assert.equal(r('lfa').isSite, false);
assert.deepEqual(set(r('lfaNone')), []);
assert.deepEqual(set(r('lfaEmpty')), []);
assert.deepEqual(set(r('tour')), ['cB']);
// club via teams fallback
assert.deepEqual(set(r('clubA')), ['cA']);
// club via club_competitions (removed link ignored, links take precedence)
assert.deepEqual(set(r('clubAB')), ['cA', 'cB']);
assert.deepEqual([...r('clubAB').clubIds], ['k3']);
// manager via team name; leagueId mapped through catalog
const m = r('mgr');
assert.equal(m.role, 'Manager');
assert.deepEqual(set(m), ['cA']);
assert.deepEqual([...m.clubIds], ['k2']);
// supporter / unknown user: no competition scope
const nobody = r('nobody');
assert.equal(nobody.role, 'Supporter');
assert.deepEqual(set(nobody), []);

const store: Record<string, Record<string, unknown>[]> = { user_roles, club_competitions, teams, competition_catalog: catalog };
assert.deepEqual(set(await resolveAccess('clubAB', 'clubAB@x.com', async ns => store[ns] || [], env)), ['cA', 'cB']);
assert.equal((await resolveAccess('x', 'owner@example.com', async () => { throw new Error('must not load'); }, env)).isSite, true);

console.log('tenancy tests passed');
