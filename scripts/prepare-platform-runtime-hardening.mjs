import fs from 'node:fs';

const path = 'src/platformClient.ts';
let source = fs.readFileSync(path, 'utf8');

// Protected GETs must not silently become null. Only auth/me is allowed to use
// a 401 as the normal signed-out state; all other protected reads must surface
// the auth failure so tabs cannot appear dead or blank.
source = source.replace(
`        // A protected GET without a session is treated as empty data. Mutations remain hard failures.\n        if (response.status === 401 && method === 'GET') {\n            return { data: null as T };\n        }`,
`        // Only /api/auth/me treats 401 as the normal signed-out state. Other\n        // protected GETs must surface 401 so the UI can show an actionable\n        // authentication/permission state instead of rendering a dead tab.\n        if (response.status === 401 && method === 'GET' && url === '/api/auth/me') {\n            return { data: null as T };\n        }`
);

// Vercel Functions cannot carry the old AppDeploy WebSocket transport. Replace
// the fake no-op client with a same-browser BroadcastChannel transport. The
// server-side live polling remains the cross-device source of truth.
const start = source.indexOf('export const ws = {');
if (start >= 0) {
  const replacement = `export const ws = {\n    connect: (): WsConnection => {\n        const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('pitchline-realtime') : null;\n        let closeHandler: () => void = () => undefined;\n        let messageHandler: ((message: unknown) => void) | null = null;\n        let connected = true;\n        const connectionId = \`browser-\${globalThis.crypto?.randomUUID?.() || \`${Date.now()}-\${Math.random()}\`}\`;\n        if (channel) {\n            channel.onmessage = event => messageHandler?.(event.data);\n        }\n        return {\n            connectionId,\n            ready: Promise.resolve(),\n            onMessage: handler => { messageHandler = handler; },\n            onOpen: handler => queueMicrotask(handler),\n            onClose: handler => { closeHandler = handler; },\n            onError: () => undefined,\n            disconnect: () => {\n                if (!connected) return;\n                connected = false;\n                if (channel) channel.close();\n                closeHandler();\n            },\n        };\n    },\n};\n`;
  source = source.slice(0, start) + replacement;
}

// Broadcast every successful mutation to other tabs. Components that subscribe
// through ws.connect() can refresh immediately without depending on unsupported
// WebSockets; server polling remains authoritative for other devices.
const marker = "        emitMutation(method, url, response.status);\n        return { data: data as T };";
const hardenedMarker = `        emitMutation(method, url, response.status);\n        if (typeof BroadcastChannel !== 'undefined' && method !== 'GET') {\n            try {\n                const channel = new BroadcastChannel('pitchline-realtime');\n                channel.postMessage({ type: 'api.mutation', method, path: url, status: response.status, at: Date.now() });\n                channel.close();\n            } catch { /* optional browser transport */ }\n        }\n        return { data: data as T };`;
source = source.replace(marker, hardenedMarker);

fs.writeFileSync(path, source);
console.log('Platform runtime hardening applied.');
