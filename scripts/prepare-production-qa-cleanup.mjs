import { neon } from '@neondatabase/serverless';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.log('Pitchline QA cleanup skipped: DATABASE_URL is not configured.');
  process.exit(0);
}

const sql = neon(databaseUrl);
const rows = await sql`
  SELECT id, record
  FROM pitchline_records
  WHERE namespace = 'fixtures'
`;

const isQaFixture = (record) => {
  const home = String(record?.home || '').trim();
  const away = String(record?.away || '').trim();
  const venue = String(record?.venue || '').trim();
  return /^QA Home \d+ U\d+$/i.test(home)
    && /^QA Away \d+ U\d+$/i.test(away)
    && /^Pitchline QA Ground \d+$/i.test(venue);
};

const ids = rows.filter(row => isQaFixture(row.record)).map(row => row.id);

if (ids.length) {
  await sql`
    DELETE FROM pitchline_records
    WHERE namespace = 'fixtures' AND id = ANY(${ids})
  `;
}

console.log(`Pitchline production QA cleanup: removed ${ids.length} QA fixture record(s); legitimate fixtures were left untouched.`);
