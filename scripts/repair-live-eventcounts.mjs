import fs from 'node:fs';

const file = 'src/LiveMatchCentre.tsx';
let text = fs.readFileSync(file, 'utf8');
const marker = 'const eventCounts = useMemo(() => {';
let positions = [];
let from = 0;
while (true) {
  const index = text.indexOf(marker, from);
  if (index < 0) break;
  positions.push(index);
  from = index + marker.length;
}

while (positions.length > 1) {
  const start = positions[positions.length - 1];
  const brace = text.indexOf('{', start);
  if (brace < 0) throw new Error('Unable to locate duplicate eventCounts block.');
  let depth = 0;
  let end = -1;
  for (let i = brace; i < text.length; i += 1) {
    if (text[i] === '{') depth += 1;
    else if (text[i] === '}') {
      depth -= 1;
      if (depth === 0) {
        const semi = text.indexOf(';', i);
        end = semi >= 0 ? semi + 1 : i + 1;
        break;
      }
    }
  }
  if (end < 0) throw new Error('Unable to find duplicate eventCounts block end.');
  text = text.slice(0, start) + text.slice(end);
  positions = [];
  from = 0;
  while (true) {
    const index = text.indexOf(marker, from);
    if (index < 0) break;
    positions.push(index);
    from = index + marker.length;
  }
}

fs.writeFileSync(file, text);
console.log(`Live eventCounts declarations after repair: ${positions.length}`);
