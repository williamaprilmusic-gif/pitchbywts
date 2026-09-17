import fs from 'node:fs';

const path = 'src/LiveMatchCentre.tsx';
let source = fs.readFileSync(path, 'utf8');

// Multiple depth passes historically added the same memoized eventCounts block.
// Keep the first declaration and remove only exact duplicate blocks so the composed
// production build remains valid and idempotent.
const block = "  const eventCounts = useMemo(() => {\n    const counts: Record<string, number> = {};\n    for (const event of live?.events || []) counts[event.type] = (counts[event.type] || 0) + 1;\n    return counts;\n  }, [live?.events]);\n";
let first = source.indexOf(block);
if (first >= 0) {
  let searchFrom = first + block.length;
  while (true) {
    const duplicate = source.indexOf(block, searchFrom);
    if (duplicate < 0) break;
    source = source.slice(0, duplicate) + source.slice(duplicate + block.length);
    searchFrom = duplicate;
  }
}

fs.writeFileSync(path, source);
console.log('Pitchline live-depth finalization: removed duplicate eventCounts declarations from composed feature transforms.');
