// Test double for @supabase/supabase-js (vite alias when FAKE_SUPABASE=1): anonymous auth, Realtime channel with
// presence + broadcast over a BroadcastChannel (tabs of one browser = players), and an `lb` table in localStorage
// with the same row-level rule as supabase/schema.sql (a user may only upsert the row whose id is their uid).
export function createClient() {
  let uid = sessionStorage.getItem('fake.uid'); if (!uid) { uid = 'uid-' + Math.random().toString(36).slice(2, 8); sessionStorage.setItem('fake.uid', uid); }
  const table = () => JSON.parse(localStorage.getItem('fake.lb') || '{}'), save = (t) => localStorage.setItem('fake.lb', JSON.stringify(t));
  const auth = { getSession: async () => ({ data: { session: null } }), signInAnonymously: async () => ({ data: { user: { id: uid } }, error: null }) };
  function channel(name, opts) {
    const bc = new BroadcastChannel('fake-rt-' + name), key = opts.config.presence.key, handlers = { sync: [], join: [], mv: [] };
    const presence = {}; let mine = null;
    const sync = () => handlers.sync.forEach((f) => f());
    bc.onmessage = (e) => { const m = e.data;
      if (m.t === 'track') { const isNew = !presence[m.key]; presence[m.key] = [m.meta]; sync(); if (isNew) handlers.join.forEach((f) => f({ key: m.key })); }
      if (m.t === 'leave') { delete presence[m.key]; sync(); }
      if (m.t === 'hello' && mine) bc.postMessage({ t: 'track', key, meta: mine });
      if (m.t === 'bc') handlers.mv.forEach((f) => f({ payload: m.payload })); };
    const ch = {
      on(type, filter, fn) { if (type === 'presence') handlers[filter.event]?.push(fn); if (type === 'broadcast') handlers.mv.push(fn); return ch; },
      subscribe(cb) { setTimeout(() => { cb('SUBSCRIBED'); bc.postMessage({ t: 'hello' }); }, 50); return ch; },
      presenceState: () => ({ ...presence }),
      track: async (meta) => { mine = meta; presence[key] = [meta]; bc.postMessage({ t: 'track', key, meta }); sync(); return 'ok'; },
      untrack: async () => { bc.postMessage({ t: 'leave', key }); },
      send: async (m) => { bc.postMessage({ t: 'bc', payload: m.payload }); return 'ok'; },
    };
    return ch;
  }
  function from(name) {
    const q = { eqs: [], ord: null, lim: 1000 };
    const run = () => { let rows = Object.values(table()); for (const [c, v] of q.eqs) rows = rows.filter((r) => r[c] === v);
      if (q.ord) rows.sort((a, b) => (q.ord.asc ? 1 : -1) * ((a[q.ord.c] ?? 0) - (b[q.ord.c] ?? 0))); return rows.slice(0, q.lim); };
    const api = { select() { return api; }, eq(c, v) { q.eqs.push([c, v]); return api; }, order(c, o) { q.ord = { c, asc: o.ascending }; return api; }, limit(n) { q.lim = n; return api; },
      maybeSingle: async () => ({ data: run()[0] || null, error: null }),
      then(res, rej) { return Promise.resolve({ data: run(), error: null }).then(res, rej); },
      upsert: async (row) => { if (row.id !== uid) return { error: { message: 'new row violates row-level security policy' } }; const t = table(); t[row.id] = row; save(t); return { error: null }; } };
    return api;
  }
  return { auth, channel, from, removeChannel() {} };
}
