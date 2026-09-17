import fs from 'node:fs';

const path = 'src/LiveMatchCentre.tsx';
let source = fs.readFileSync(path, 'utf8');

function keepFirstDeclaration(input, pattern, canonical) {
  let seen = false;
  return input.replace(pattern, () => {
    if (seen) return '';
    seen = true;
    return canonical;
  });
}

// The live-match surface is intentionally composed from several feature transformers.
// Normalize shared React state declarations after all transforms have run so the
// production build remains deterministic on both fresh and repeated builds.
source = keepFirstDeclaration(
  source,
  /  const \[quickAssist, setQuickAssist\] = useState\(''\);\n/g,
  "  const [quickAssist, setQuickAssist] = useState('');\n"
);
source = keepFirstDeclaration(
  source,
  /  const \[goalDetail, setGoalDetail\] = useState\('Normal'\);\n/g,
  "  const [goalDetail, setGoalDetail] = useState('Normal');\n"
);
source = keepFirstDeclaration(
  source,
  /  const \[quickDetail, setQuickDetail\] = useState\(''\);\n/g,
  "  const [quickDetail, setQuickDetail] = useState('');\n"
);
source = keepFirstDeclaration(
  source,
  /  const \[quickReview, setQuickReview\] = useState\('None'\);\n/g,
  "  const [quickReview, setQuickReview] = useState('None');\n"
);
source = keepFirstDeclaration(
  source,
  /  const eventCounts = useMemo\(\(\) => \{\n    const counts: Record<string, number> = \{\};\n    for \(const event of live\?\.events \|\| \[\]\) counts\[event\.type\] = \(counts\[event\.type\] \|\| 0\) \+ 1;\n    return counts;\n  \}, \[live\?\.events\]\);\n/g,
  "  const eventCounts = useMemo(() => {\n    const counts: Record<string, number> = {};\n    for (const event of live?.events || []) counts[event.type] = (counts[event.type] || 0) + 1;\n    return counts;\n  }, [live?.events]);\n"
);
source = keepFirstDeclaration(
  source,
  /  const eventCounts = useMemo\(\(\) => \{ const counts: Record<string,number> = \{\}; for \(const event of live\?\.events \|\| \[\]\) counts\[event\.type\]=\(counts\[event\.type\]\|\|0\)\+1; return counts; \}, \[live\?\.events\]\);\n/g,
  "  const eventCounts = useMemo(() => {\n    const counts: Record<string, number> = {};\n    for (const event of live?.events || []) counts[event.type] = (counts[event.type] || 0) + 1;\n    return counts;\n  }, [live?.events]);\n"
);
source = keepFirstDeclaration(
  source,
  /  const eventCounts = useMemo\(\(\) => \{ const counts: Record<string, number> = \{\}; for \(const event of live\?\.events \|\| \[\]\) counts\[event\.type\] = \(counts\[event\.type\] \|\| 0\) \+ 1; return counts; \}, \[live\?\.events\]\);\n/g,
  "  const eventCounts = useMemo(() => {\n    const counts: Record<string, number> = {};\n    for (const event of live?.events || []) counts[event.type] = (counts[event.type] || 0) + 1;\n    return counts;\n  }, [live?.events]);\n"
);

fs.writeFileSync(path, source);
console.log('Pitchline live-depth finalization: normalized shared live-match declarations and eventCounts.');
