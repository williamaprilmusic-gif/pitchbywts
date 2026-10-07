// Phase 3 multi-tenant roles: the server may report 'Site Admin' / 'Tournament Admin'. The UI keeps treating every admin
// kind as 'LFA Admin' so existing role checks and navigation are unchanged; extra access info is stored separately.
export type ServerRole = 'Supporter' | 'Manager' | 'Club' | 'Club Manager' | 'LFA Admin' | 'Site Admin' | 'Tournament Admin';
export type AccessInfo = { isSiteAdmin: boolean; competitionIds: string[] | 'all'; competitions: Array<{ id: string; name?: unknown; kind?: unknown }> };
export const noAccess: AccessInfo = { isSiteAdmin: false, competitionIds: [], competitions: [] };

/** Role string from /api/my-role, with every admin kind mapped to 'LFA Admin'. */
export function normalizeRole(data: unknown): string {
  const d = (data || {}) as { role?: unknown; canonicalRole?: unknown };
  const raw = String(d.canonicalRole || d.role || 'Supporter');
  return raw === 'Site Admin' || raw === 'Tournament Admin' ? 'LFA Admin' : raw;
}

export async function loadAccess(get: (path: string) => Promise<{ data?: unknown }>): Promise<AccessInfo> {
  try {
    const d = ((await get('/api/my-access')).data || {}) as Partial<AccessInfo>;
    return { isSiteAdmin: d.isSiteAdmin === true, competitionIds: d.competitionIds === 'all' ? 'all' : Array.isArray(d.competitionIds) ? d.competitionIds.map(String) : [], competitions: Array.isArray(d.competitions) ? d.competitions : [] };
  } catch { return noAccess; }
}
