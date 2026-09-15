import fs from 'node:fs';

const path = 'src/LiveMatchCentre.tsx';
const source = fs.readFileSync(path, 'utf8');
if (source.includes('Vercel-safe realtime fallback')) {
  console.log('Live polling fallback already present.');
  process.exit(0);
}
const marker = "  useEffect(() => {\n    if (!selectedId) return;\n    void loadMatch(selectedId);";
if (!source.includes(marker)) throw new Error('LiveMatchCentre polling insertion point not found.');
const polling = `  // Vercel-safe realtime fallback: keep the persisted live state fresh when WebSocket delivery is unavailable.\n  useEffect(() => {\n    if (!selectedId) return;\n    let cancelled = false;\n    let running = false;\n    const poll = async () => {\n      if (cancelled || running) return;\n      running = true;\n      try {\n        const response = await api.get(\`/api/live-match/\${selectedId}\`);\n        if (!cancelled) setLive(response.data);\n      } catch {\n        // Preserve the last known state; the next interval retries automatically.\n      } finally {\n        running = false;\n      }\n    };\n    void poll();\n    const interval = window.setInterval(() => void poll(), 5000);\n    return () => {\n      cancelled = true;\n      window.clearInterval(interval);\n    };\n  }, [selectedId]);\n\n`;
fs.writeFileSync(path, source.replace(marker, polling + marker));
console.log('Applied deterministic live polling fallback.');
