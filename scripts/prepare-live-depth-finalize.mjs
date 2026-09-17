import fs from 'node:fs';

const path = 'src/LiveMatchCentre.tsx';
let source = fs.readFileSync(path, 'utf8');

// The live-match feature is composed from several transforms. Different transforms
// may generate semantically identical eventCounts declarations in different formats.
// Remove all generated forms after the first declaration and keep one canonical block.
const patterns = [
  /  const eventCounts = useMemo\(\(\) => \{\n    const counts: Record<string, number> = \{\};\n    for \(const event of live\?\.events \|\| \[\]\) counts\[event\.type\] = \(counts\[event\.type\] \|\| 0\) \+ 1;\n    return counts;\n  \}, \[live\?\.events\]\);\n/g,
  /  const eventCounts = useMemo\(\(\) => \{ const counts: Record<string,number> = \{\}; for \(const event of live\?\.events \|\| \[\]\) counts\[event\.type\]=\(counts\[event\.type\]\|\|0\)\+1; return counts; \}, \[live\?\.events\]\);\n/g,
  /  const eventCounts = useMemo\(\(\) => \{ const counts: Record<string, number> = \{\}; for \(const event of live\?\.events \|\| \[\]\) counts\[event\.type\] = \(counts\[event\.type\] \|\| 0\) \+ 1; return counts; \}, \[live\?\.events\]\);\n/g
];

const canonical = "  const eventCounts = useMemo(() => {\n    const counts: Record<string, number> = {};\n    for (const event of live?.events || []) counts[event.type] = (counts[event.type] || 0) + 1;\n    return counts;\n  }, [live?.events]);\n";

for (const pattern of patterns) {
  let matchCount = 0;
  source = source.replace(pattern, (match) => {
    matchCount += 1;
    return matchCount === 1 && !source.slice(0, source.indexOf(match)).includes('const eventCounts = useMemo') ? canonical : '';
  });
}

// Defensive final pass: collapse any remaining exact canonical duplicates.
const firstCanonical = source.indexOf(canonical);
if (firstCanonical >= 0) {
  const before = source.slice(0, firstCanonical + canonical.length);
  const after = source.slice(firstCanonical + canonical.length).replaceAll(canonical, '');
  source = before + after;
}

fs.writeFileSync(path, source);
console.log('Pitchline live-depth finalization: normalized eventCounts to one canonical declaration.');
