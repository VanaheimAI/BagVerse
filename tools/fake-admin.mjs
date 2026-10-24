// In-memory stand-in for the Supabase admin client used by api/* (tables keyed by name; eq/neq/lte filters,
// select with { count, head }, maybeSingle, insert/upsert/update/delete). Tokens 'tok-<uid>' sign in as <uid>.
export function fakeAdmin() {
  const db = {};
  const T = (n) => (db[n] ||= []);
  return {
    db,
    auth: { getUser: async (t) => (t?.startsWith('tok-') ? { data: { user: { id: t.slice(4) } }, error: null } : { data: null, error: { message: 'bad jwt' } }) },
    from(name) {
      const rows = T(name), f = []; let op = 'select', val = null, countMode = false, head = false;
      const match = () => rows.filter((r) => f.every(([k, v, how]) => (how === 'neq' ? r[k] !== v : how === 'lte' ? r[k] <= v : r[k] === v)));
      const result = () => {
        if (op === 'delete') { for (const r of match()) rows.splice(rows.indexOf(r), 1); return { error: null }; }
        if (op === 'update') { for (const r of match()) Object.assign(r, val); return { error: null }; }
        const m = match(); return { data: head ? null : m, count: countMode ? m.length : null, error: null };
      };
      const q = {
        select: (_c, o = {}) => { countMode = o.count === 'exact'; head = !!o.head; return q; },
        eq: (k, v) => (f.push([k, v]), q), neq: (k, v) => (f.push([k, v, 'neq']), q), lte: (k, v) => (f.push([k, v, 'lte']), q),
        maybeSingle: async () => ({ data: match()[0] || null, error: null }),
        delete: () => ((op = 'delete'), q), update: (v) => ((op = 'update'), (val = v), q),
        insert: async (row) => { rows.push({ ...row }); return { error: null }; },
        upsert: async (row, o = {}) => {
          const keys = (o.onConflict || 'id').split(','); const i = rows.findIndex((r) => keys.every((k) => r[k] === row[k]));
          if (name === 'raffle_entries' && rows.some((r) => r.raffle_id === row.raffle_id && r.address === row.address && r.user_id !== row.user_id)) return { error: { message: 'duplicate key (raffle_id, address)' } };
          if (i < 0) rows.push({ created_at: new Date().toISOString(), ...row }); else if (!o.ignoreDuplicates) Object.assign(rows[i], row);
          return { error: null };
        },
        then: (ok, bad) => Promise.resolve(result()).then(ok, bad),
      };
      return q;
    },
  };
}
