// Test double for @supabase/supabase-js (vite alias when FAKE_SUPABASE=1): anonymous auth, Realtime channel with
// presence + broadcast over a BroadcastChannel (tabs of one browser = players), and an `lb` table in localStorage
// with the same row-level rule as supabase/schema.sql (a user may only upsert the row whose id is their uid).
export function createClient() {
  let uid = sessionStorage.getItem('fake.uid'); if (!uid) { uid = 'uid-' + Math.random().toString(36).slice(2, 8); sessionStorage.setItem('fake.uid', uid); }
  const table = () => JSON.parse(localStorage.getItem('fake.lb') || '{}'), save = (t) => localStorage.setItem('fake.lb', JSON.stringify(t));
  const auth = { getSession: async () => ({ data: { session: { access_token: 'tok-' + uid, user: { id: uid } } } }), signInAnonymously: async () => ({ data: { user: { id: uid } }, error: null }) };
  function channel(name, opts) {
    const bc = new BroadcastChannel('fake-rt-' + name), key = opts.config.presence.key, handlers = { sync: [], join: [], leave: [], bc: {} };
    const calls = [];   // like the real limit: 5 presence calls per client per 30 s (extra calls are dropped); ?fakenopresence drops them all
    const presence = {}; let mine = null;
    const sync = () => handlers.sync.forEach((f) => f());
    bc.onmessage = (e) => { const m = e.data;
      if (m.t === 'track') { const isNew = !presence[m.key]; presence[m.key] = [m.meta]; sync(); if (isNew) handlers.join.forEach((f) => f({ key: m.key })); }
      if (m.t === 'leave') { delete presence[m.key]; sync(); handlers.leave.forEach((f) => f({ key: m.key })); }
      if (m.t === 'hello' && mine) bc.postMessage({ t: 'track', key, meta: mine });
      if (m.t === 'bc') (handlers.bc[m.event] || []).forEach((f) => f({ payload: m.payload })); };
    const ch = {
      on(type, filter, fn) { if (type === 'presence') handlers[filter.event]?.push(fn); if (type === 'broadcast') (handlers.bc[filter.event] ||= []).push(fn); return ch; },
      subscribe(cb) { setTimeout(() => { cb('SUBSCRIBED'); bc.postMessage({ t: 'hello' }); }, 50); return ch; },
      presenceState: () => ({ ...presence }),
      track: async (meta) => { const now = Date.now(); while (calls.length && now - calls[0] > 30000) calls.shift(); calls.push(now); window.__presenceCalls = (window.__presenceCalls || 0) + 1;
        if (calls.length > 5 || /fakenopresence/.test(location.search)) { window.__presenceDropped = (window.__presenceDropped || 0) + 1; return 'ok'; }
        mine = meta; presence[key] = [meta]; bc.postMessage({ t: 'track', key, meta }); sync(); return 'ok'; },
      untrack: async () => { bc.postMessage({ t: 'leave', key }); },
      send: async (m) => { bc.postMessage({ t: 'bc', event: m.event, payload: m.payload }); return 'ok'; },
    };
    return ch;
  }
  // server-side tables (wallets, raffles, raffle_entries) live on the test server (tools/wallet_server.mjs), like the
  // real tables the API writes
  const xhr = (method, url, body) => { const x = new XMLHttpRequest(); x.open(method, url, false); x.send(body ? JSON.stringify(body) : null); try { return JSON.parse(x.responseText); } catch (_) { return []; } };
  const SERVER = new Set(['wallets', 'raffles', 'raffle_entries', 'linked_wallets']);
  function from(name) {
    if (SERVER.has(name)) {
      const eqs = []; let del = false, ord = null, lim = 1000;
      const run = () => { let r = xhr('GET', '/__fake/t/' + name).filter((x) => eqs.every(([c, v]) => x[c] === v)); if (ord) r.sort((a, b) => (ord.asc ? 1 : -1) * (a[ord.c] < b[ord.c] ? -1 : a[ord.c] > b[ord.c] ? 1 : 0)); return r.slice(0, lim); };
      const w = { select: () => w, eq: (c, v) => (eqs.push([c, v]), w), order: (c, o = {}) => ((ord = { c, asc: o.ascending !== false }), w), limit: (n) => ((lim = n), w), delete: () => ((del = true), w),
        maybeSingle: async () => ({ data: run()[0] || null, error: null }),
        then: (res, rej) => { if (del) { if (name === 'wallets' && eqs.some(([c, v]) => c === 'user_id' && v === uid)) xhr('POST', '/__fake/t/wallets/delete', { user_id: uid }); return Promise.resolve({ error: null }).then(res, rej); } return Promise.resolve({ data: run(), error: null }).then(res, rej); } };
      return w;
    }
    const q = { eqs: [], ord: null, lim: 1000 };
    const run = () => { let rows = Object.values(table()); for (const [c, v] of q.eqs) rows = rows.filter((r) => r[c] === v); for (const [c, v] of q.gts || []) rows = rows.filter((r) => r[c] > v);
      if (q.ord) rows.sort((a, b) => (q.ord.asc ? 1 : -1) * ((a[q.ord.c] ?? 0) - (b[q.ord.c] ?? 0))); return rows.slice(0, q.lim); };
    const api = { select() { return api; }, eq(c, v) { q.eqs.push([c, v]); return api; }, gt(c, v) { q.gts = [...(q.gts || []), [c, v]]; return api; }, order(c, o) { q.ord = { c, asc: o.ascending }; return api; }, limit(n) { q.lim = n; return api; },
      maybeSingle: async () => ({ data: run()[0] || null, error: null }),
      then(res, rej) { return Promise.resolve({ data: run(), error: null }).then(res, rej); },
      upsert: async (row) => { if (row.id !== uid) return { error: { message: 'new row violates row-level security policy' } }; const t = table(); t[row.id] = row; save(t); return { error: null }; } };
    return api;
  }
  return { auth, channel, from, removeChannel() {} };
}
