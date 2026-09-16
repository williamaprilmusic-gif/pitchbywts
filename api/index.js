import api from '../server/apiRuntime.mjs';
import { cleanupProductionQa } from '../server/qaCleanup.js';

export default async function handler(request, response) {
  const path = String(request.query?.path || '').replace(/^\/+|\/+$/g, '');
  if (request.method === 'POST' && path === 'admin/qa-cleanup') {
    return cleanupProductionQa(request, response);
  }
  return api(request, response);
}
