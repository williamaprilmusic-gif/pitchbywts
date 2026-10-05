// In-memory stand-in for @neondatabase/serverless used ONLY by tests (no network, no production data).
// Understands exactly the statements issued by server/appdeployCompat.ts for pitchline_records.
const state = (globalThis.__fakeNeon ||= { rows: new Map(), writes: [], clock: 0 });
const key = (ns, id) => ns + '\u0000' + id;

export function resetFakeNeon() { state.rows.clear(); state.writes.length = 0; state.clock = 0; }
export function seedFakeNeon(namespace, records) {
  for (const rec of records) {
    state.rows.set(key(namespace, rec.id), { namespace, id: rec.id, record: structuredClone(rec), created_at: ++state.clock });
  }
}
export function dumpFakeNeon(namespace) {
  return [...state.rows.values()].filter(r => r.namespace === namespace).sort((a, b) => a.created_at - b.created_at).map(r => ({ ...structuredClone(r.record), id: r.id }));
}
export const fakeNeonWrites = () => state.writes;

export function neon() {
  return async (strings, ...values) => {
    const text = strings.join('?').replace(/\s+/g, ' ').trim();
    if (/^CREATE /i.test(text)) return [];
    if (/^SELECT id, record FROM pitchline_records WHERE namespace = \? AND id = ANY/i.test(text)) {
      const [ns, ids] = values;
      return ids.map(id => state.rows.get(key(ns, id))).filter(Boolean).map(r => ({ id: r.id, record: structuredClone(r.record) }));
    }
    if (/^SELECT id, record FROM pitchline_records WHERE namespace = \? ORDER BY/i.test(text)) {
      const [ns, limit] = values;
      return [...state.rows.values()].filter(r => r.namespace === ns).sort((a, b) => a.created_at - b.created_at || (a.id < b.id ? -1 : 1)).slice(0, limit).map(r => ({ id: r.id, record: structuredClone(r.record) }));
    }
    if (/^INSERT INTO pitchline_records/i.test(text)) {
      const [ns, id, json] = values;
      const existing = state.rows.get(key(ns, id));
      state.rows.set(key(ns, id), { namespace: ns, id, record: JSON.parse(json), created_at: existing ? existing.created_at : ++state.clock });
      state.writes.push({ op: 'insert', namespace: ns, id });
      return [];
    }
    if (/^UPDATE pitchline_records SET record/i.test(text)) {
      const [json, , ns, id] = values;
      const existing = state.rows.get(key(ns, id));
      if (!existing) return [];
      existing.record = JSON.parse(json);
      state.writes.push({ op: 'update', namespace: ns, id });
      return [{ id }];
    }
    if (/^DELETE FROM pitchline_records/i.test(text)) {
      const [ns, ids] = values; const out = [];
      for (const id of ids) if (state.rows.delete(key(ns, id))) { out.push({ id }); state.writes.push({ op: 'delete', namespace: ns, id }); }
      return out;
    }
    if (/pitchline_live_locks/i.test(text)) return [];
    throw new Error('fakeNeon: unsupported SQL: ' + text.slice(0, 120));
  };
}
