import fs from 'node:fs';

const file = 'server/apiEntrypoint.ts';
let source = fs.readFileSync(file, 'utf8');
const importLine = "import { startProductionQa, getProductionQaRun, cleanupProductionQaRun } from './productionQa';";
if (!source.includes(importLine)) {
  const anchor = "import { db } from './appdeployCompat';";
  if (!source.includes(anchor)) throw new Error('Production QA patch anchor not found');
  source = source.replace(anchor, `${anchor}\n${importLine}`);
}
const marker = '// PITCHLINE_PRODUCTION_QA_ROUTES';
if (!source.includes(marker)) {
  const anchor = "  const requestBody = bodyObject(request.body);";
  if (!source.includes(anchor)) throw new Error('Production QA route anchor not found');
  const routes = `  ${marker}\n  if (pathname === '/api/qa/production-run' && request.method === 'POST') {\n    const result = await startProductionQa(request as any);\n    send(response, result.status, result.body, reqId);\n    return;\n  }\n  if (pathname.startsWith('/api/qa/production-run/') && request.method === 'GET') {\n    const runId = decodeURIComponent(pathname.split('/').pop() || '');\n    const result = await getProductionQaRun(request as any, runId);\n    send(response, result.status, result.body, reqId);\n    return;\n  }\n  if (pathname.startsWith('/api/qa/production-run/') && pathname.endsWith('/cleanup') && request.method === 'POST') {\n    const runId = decodeURIComponent(pathname.split('/').slice(-2, -1)[0] || '');\n    const result = await cleanupProductionQaRun(request as any, runId);\n    send(response, result.status, result.body, reqId);\n    return;\n  }\n`;
  source = source.replace(anchor, `${routes}${anchor}`);
}
fs.writeFileSync(file, source);
console.log('Production QA runtime patch applied');
