import fs from 'node:fs';

const path = 'src/LiveMatchCentre.tsx';
let source = fs.readFileSync(path, 'utf8');

if (!source.includes('Vercel-safe realtime fallback')) {
  const marker = "  useEffect(() => {\n    if (!selectedId) return;\n    void loadMatch(selectedId);";
  if (!source.includes(marker)) throw new Error('LiveMatchCentre polling insertion point not found.');
  const polling = `  // Vercel-safe realtime fallback: keep the persisted live state fresh when WebSocket delivery is unavailable.\n  useEffect(() => {\n    if (!selectedId) return;\n    let cancelled = false;\n    let running = false;\n    const poll = async () => {\n      if (cancelled || running) return;\n      running = true;\n      try {\n        const response = await api.get(\`/api/live-match/\${selectedId}\`);\n        if (!cancelled) setLive(response.data);\n      } catch {\n        // Preserve the last known state; the next interval retries automatically.\n      } finally {\n        running = false;\n      }\n    };\n    void poll();\n    const interval = window.setInterval(() => void poll(), 5000);\n    return () => {\n      cancelled = true;\n      window.clearInterval(interval);\n    };\n  }, [selectedId]);\n\n`;
  source = source.replace(marker, polling + marker);
}

if (!source.includes('Supporter-safe live match context')) {
  const marker = "    try {\n      const [liveResponse, contextResponse] = await Promise.all([";
  if (!source.includes(marker)) throw new Error('LiveMatchCentre context insertion point not found.');
  const supporterSafe = `    if (role === 'Supporter') {\n      try {\n        const liveResponse = await api.get(\`/api/live-match/\${fixtureId}\`);\n        const ruleResponse = await api.get(\`/api/live-match/\${fixtureId}/rules\`).catch(() => ({ data: undefined }));\n        setLive(ruleResponse.data ? { ...liveResponse.data, rules: ruleResponse.data } : liveResponse.data);\n        setPlayers([]);\n        setTeamSheet(null);\n        setVerified(false);\n        setPendingCount(0);\n        return;\n      } catch {\n        setNotice('Could not load the selected live match.');\n        return;\n      }\n    }\n\n`;
  source = source.replace(marker, supporterSafe + marker);
}

fs.writeFileSync(path, source);
console.log('Applied live polling and Supporter-safe context handling.');
