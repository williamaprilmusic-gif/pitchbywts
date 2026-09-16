import fs from 'node:fs';

// Production resource hardening: keep role checks cheap inside warm Vercel instances
// and make live-match polling back off when the tab is hidden.
const apiPath = 'server/apiEntrypoint.ts';
let api = fs.readFileSync(apiPath, 'utf8');

if (!api.includes('PITCHLINE_ROLE_CACHE_TTL')) {
  const marker = "async function isLfaAdmin(userId?: string) {";
  const start = api.indexOf(marker);
  const endMarker = "async function getProtectedInvoices(user: AuthUser) {";
  const end = api.indexOf(endMarker);
  if (start < 0 || end < 0) throw new Error('Role authorization block not found.');
  const replacement = `const PITCHLINE_ROLE_CACHE_TTL = 30_000;\nconst roleCache = new Map<string, { role: string; expiresAt: number }>();\n\nfunction canonicalRole(value: unknown) {\n  const role = String(value || '').trim().toLowerCase();\n  if (role === 'lfa admin' || role === 'lfa-admin' || role === 'admin') return 'LFA Admin';\n  if (role === 'club manager' || role === 'club-manager' || role === 'team manager' || role === 'manager') return 'Manager';\n  if (role === 'club') return 'Club';\n  return 'Supporter';\n}\n\nasync function getCachedUserRole(userId: string) {\n  const cached = roleCache.get(userId);\n  if (cached && cached.expiresAt > Date.now()) return cached.role;\n  const result = await db.list<RecordShape>('user_roles', { limit: 5000 });\n  const found = result.items.find(item => String(item.userId) === userId);\n  const role = canonicalRole(found?.role);\n  roleCache.set(userId, { role, expiresAt: Date.now() + PITCHLINE_ROLE_CACHE_TTL });\n  return role;\n}\n\nasync function isLfaAdmin(userId?: string) {\n  return Boolean(userId && (await getCachedUserRole(userId)) === 'LFA Admin');\n}\n\nasync function isMatchOperator(userId?: string) {\n  if (!userId) return false;\n  const role = await getCachedUserRole(userId);\n  return role === 'LFA Admin' || role === 'Manager';\n}\n\nasync function getUserRole(userId: string) {\n  return getCachedUserRole(userId);\n}\n\n`;
  api = api.slice(0, start) + replacement + api.slice(end);
  fs.writeFileSync(apiPath, api);
}

const livePath = 'src/LiveMatchCentre.tsx';
let live = fs.readFileSync(livePath, 'utf8');
const oldPolling = "const interval = window.setInterval(() => void poll(), 5000);";
if (live.includes(oldPolling) && !live.includes('PITCHLINE_ADAPTIVE_POLLING')) {
  live = live.replace(oldPolling, `// PITCHLINE_ADAPTIVE_POLLING\n    const getInterval = () => document.visibilityState === 'hidden' ? 30000 : (canManage ? 5000 : 10000);\n    let interval = window.setInterval(() => void poll(), getInterval());\n    const onVisibility = () => {\n      window.clearInterval(interval);\n      if (!cancelled) interval = window.setInterval(() => void poll(), getInterval());\n      if (!cancelled && document.visibilityState === 'visible') void poll();\n    };\n    document.addEventListener('visibilitychange', onVisibility);`);
  const cleanup = "      window.clearInterval(interval);\n    };\n  }, [selectedId]);";
  live = live.replace(cleanup, "      window.clearInterval(interval);\n      document.removeEventListener('visibilitychange', onVisibility);\n    };\n  }, [selectedId, canManage]);");
  fs.writeFileSync(livePath, live);
}

console.log('Applied Pitchline resource optimization.');
