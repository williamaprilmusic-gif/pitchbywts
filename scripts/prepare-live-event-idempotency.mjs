import fs from 'node:fs';

const file = 'backend/index.ts';
const source = fs.readFileSync(file, 'utf8');
const marker = 'LIVE_EVENT_ATOMIC_V2';
if (source.includes(marker)) process.exit(0);

const helperAnchor = "function invoiceStatus(dueDate:string,status:'Due'|'Paid'|'Overdue'='Due'):'Due'|'Paid'|'Overdue'{if(status==='Paid')return 'Paid';return dueDate<'2026-09-13'?'Overdue':'Due';}\n";
const helper = `${helperAnchor}\n// ${marker}: serialize the complete live-event check and mutation per fixture.\nasync function withLiveEventLock(handlerFn: RouterMiddleware): Promise<RouterMiddleware> {\n  return async ctx => {\n    const body = (ctx.body || {}) as Record<string, unknown>;\n    const fixtureId = String(body.fixtureId || '').trim();\n    if (!fixtureId) return error('fixtureId is required', 400);\n    const owner = \`event:\${String(ctx.user?.userId || 'unknown')}:\${Date.now()}:\${Math.random().toString(36).slice(2, 10)}\`;\n    let acquired = false;\n    for (let attempt = 0; attempt < 8 && !acquired; attempt += 1) {\n      acquired = await db.acquireLiveLock(fixtureId, owner, 15000);\n      if (!acquired) await new Promise(resolve => setTimeout(resolve, 75));\n    }\n    if (!acquired) return error('Live match is busy; please retry the event', 409);\n    try { return await handlerFn(ctx); } finally { await db.releaseLiveLock(fixtureId, owner); }\n  };\n}\n`;
if (!source.includes(helperAnchor)) throw new Error('Could not locate backend helper anchor.');
let next = source.replace(helperAnchor, helper);
const routeStart = next.indexOf("  'POST /api/live-match/events-v2':");
const routeEnd = next.indexOf("\n  'POST /api/live-match/undo':", routeStart);
if (routeStart < 0 || routeEnd < 0) throw new Error('Could not locate live-event route.');
const route = next.slice(routeStart, routeEnd);
const open = 'async({body})=>{';
if (!route.includes(open)) throw new Error('Could not locate live-event handler.');
const wrapped = route.replace(open, 'async({body})=>{');
const handlerStart = wrapped.indexOf(open);
const bodyStart = handlerStart + open.length;
const prefix = wrapped.slice(0, handlerStart);
const body = wrapped.slice(bodyStart);
const close = 'return json(out)}],';
if (!body.endsWith(close)) throw new Error('Unexpected live-event route ending.');
const handlerBody = body.slice(0, -close.length);
const newRoute = `${prefix}async(ctx)=>withLiveEventLock(async({body})=>{${handlerBody}})(ctx),`;
next = next.slice(0, routeStart) + newRoute + next.slice(routeEnd);
fs.writeFileSync(file, next);
console.log('Applied atomic live-event idempotency hardening.');
