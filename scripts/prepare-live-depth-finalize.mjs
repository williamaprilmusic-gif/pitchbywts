import fs from 'node:fs';

const path = 'src/LiveMatchCentre.tsx';
let source = fs.readFileSync(path, 'utf8');

function normalizeLineDeclaration(input, marker, canonical) {
  const indexes = [];
  let cursor = 0;
  while (true) {
    const index = input.indexOf(marker, cursor);
    if (index < 0) break;
    indexes.push(index);
    cursor = index + marker.length;
  }
  if (indexes.length <= 1) return input;

  let result = input;
  for (let i = indexes.length - 1; i >= 1; i -= 1) {
    const start = indexes[i];
    const end = result.indexOf('\n', start) + 1;
    if (end <= start) throw new Error(`Could not remove duplicate ${marker}`);
    result = result.slice(0, start) + result.slice(end);
  }
  const first = result.indexOf(marker);
  const end = result.indexOf('\n', first) + 1;
  if (first < 0 || end <= first) throw new Error(`Could not normalize ${marker}`);
  return result.slice(0, first) + canonical + result.slice(end);
}

function normalizeEventCounts(input) {
  const marker = '  const eventCounts = useMemo(';
  const endMarker = '\n  }, [live?.events]);';
  const ranges = [];
  let cursor = 0;
  while (true) {
    const start = input.indexOf(marker, cursor);
    if (start < 0) break;
    const end = input.indexOf(endMarker, start);
    if (end < 0) throw new Error('Live-depth finalization could not locate eventCounts closing boundary.');
    ranges.push({ start, end: end + endMarker.length });
    cursor = end + endMarker.length;
  }
  if (ranges.length === 0) return input;

  let result = input;
  for (let i = ranges.length - 1; i >= 1; i -= 1) {
    result = result.slice(0, ranges[i].start) + result.slice(ranges[i].end);
  }

  const canonical = "  const eventCounts = useMemo(() => {\n    const counts: Record<string, number> = {};\n    for (const event of live?.events || []) counts[event.type] = (counts[event.type] || 0) + 1;\n    return counts;\n  }, [live?.events]);";
  const firstStart = result.indexOf(marker);
  const firstEnd = result.indexOf(endMarker, firstStart);
  if (firstStart < 0 || firstEnd < 0) throw new Error('Live-depth finalization could not normalize eventCounts.');
  return result.slice(0, firstStart) + canonical + result.slice(firstEnd + endMarker.length);
}

source = normalizeLineDeclaration(
  source,
  '  const [quickAssist, setQuickAssist]',
  "  const [quickAssist, setQuickAssist] = useState('');\n"
);
source = normalizeLineDeclaration(
  source,
  '  const [goalDetail, setGoalDetail]',
  "  const [goalDetail, setGoalDetail] = useState('Normal');\n"
);
source = normalizeLineDeclaration(
  source,
  '  const [quickDetail, setQuickDetail]',
  "  const [quickDetail, setQuickDetail] = useState('');\n"
);
source = normalizeLineDeclaration(
  source,
  '  const [quickReview, setQuickReview]',
  "  const [quickReview, setQuickReview] = useState('None');\n"
);
source = normalizeEventCounts(source);

function count(input, marker) {
  let total = 0;
  let cursor = 0;
  while (true) {
    const index = input.indexOf(marker, cursor);
    if (index < 0) return total;
    total += 1;
    cursor = index + marker.length;
  }
}

for (const marker of [
  '  const [quickAssist, setQuickAssist]',
  '  const [goalDetail, setGoalDetail]',
  '  const [quickDetail, setQuickDetail]',
  '  const [quickReview, setQuickReview]',
  '  const eventCounts = useMemo('
]) {
  if (count(source, marker) > 1) throw new Error(`Live-depth finalization failed: duplicate ${marker} remains.`);
}

fs.writeFileSync(path, source);
console.log('Pitchline live-depth finalization: canonicalized shared declarations and asserted uniqueness.');
