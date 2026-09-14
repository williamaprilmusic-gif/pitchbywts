export default function ping(_request: unknown, response: { statusCode: number; setHeader(name: string, value: string): void; end(body: string): void }) {
  response.statusCode = 200;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.end(JSON.stringify({ ok: true, runtime: 'vercel-node' }));
}
