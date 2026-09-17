import fs from 'node:fs';

const path = 'src/LiveMatchCentre.tsx';
let source = fs.readFileSync(path, 'utf8');

function keepFirstBlock(input, pattern, canonical) {
  const matches = input.match(pattern) || [];
  if (matches.length <= 1) return input;
  const firstIndex = input.indexOf(matches[0]);
  let stripped = input.replace(pattern, '');
  return stripped.slice(0, firstIndex) + canonical + stripped.slice(firstIndex);
}

const quickAssistPattern = /  const \[quickAssist, setQuickAssist\] = useState\(''\);\n/g;
source = keepFirstBlock(source, quickAssistPattern, "  const [quickAssist, setQuickAssist] = useState('');\n");

const goalDetailPattern = /  const \[goalDetail, setGoalDetail\] = useState\('Normal'\);\n/g;
source = keepFirstBlock(source, goalDetailPattern, "  const [goalDetail, setGoalDetail] = useState('Normal');\n");

const quickDetailPattern = /  const \[quickDetail, setQuickDetail\] = useState\(''\);\n/g;
source = keepFirstBlock(source, quickDetailPattern, "  const [quickDetail, setQuickDetail] = useState('');\n");

const quickReviewPattern = /  const \[quickReview, setQuickReview\] = useState\('None'\);\n/g;
source = keepFirstBlock(source, quickReviewPattern, "  const [quickReview, setQuickReview] = useState('None');\n");

// Catch all formatting variants of the event-count useMemo block and keep exactly one.
const eventCountsPattern = /  const eventCounts = useMemo\(\(\) => \{[\s\S]*?\n  \}, \[live\?\.events\]\);\n/g;
const canonicalEventCounts = "  const eventCounts = useMemo(() => {\n    const counts: Record<string, number> = {};\n    for (const event of live?.events || []) counts[event.type] = (counts[event.type] || 0) + 1;\n    return counts;\n  }, [live?.events]);\n";
source = keepFirstBlock(source, eventCountsPattern, canonicalEventCounts);

function countMatches(input, pattern) {
  return (input.match(pattern) || []).length;
}

if (countMatches(source, /const \[quickAssist, setQuickAssist\]/g) > 1) {
  throw new Error('Live-depth finalization failed: duplicate quickAssist declaration remains.');
}
if (countMatches(source, /const eventCounts = useMemo/g) > 1) {
  throw new Error('Live-depth finalization failed: duplicate eventCounts declaration remains.');
}

fs.writeFileSync(path, source);
console.log('Pitchline live-depth finalization: canonicalized shared live-match declarations and asserted uniqueness.');
