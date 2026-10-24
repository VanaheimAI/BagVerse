// Online services, wherever BagVerse runs:
//   - inside claude.ai (the published artifact): the platform's `room`, `user` and `db` capabilities (window.claude.use)
//   - as its own website (Vercel): Supabase, when VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY are set at build time.
//     The shims below give multiplayer.js and leaderboard.js the same small API they use on claude.ai:
//       room:  presence(patch), onPeers(fn), onConnection(fn), connected(), peers()
//       user:  id(), profiles(ids), can('data.write')
//       db:    collection('lb').where(...).orderBy(...).limit(n).onSnapshot(next, err) / .get()
//              doc('lb/<id>').get() / .set(body) / .onSnapshot(next, err)
//   - anywhere else (local dev, a saved copy): nothing -> single-player.
// Supabase setup: supabase/schema.sql (table + row-level security) and README "Hosting on Vercel".
import { createClient } from '@supabase/supabase-js';

const URL_ = import.meta.env.VITE_SUPABASE_URL, KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const CHANNEL = 'bagverse-world';
const MOVE_KEYS = new Set(['x', 'y', 'z', 'h', 'a', 'sp', 'r']);   // high-rate fields: broadcast, not presence
const MOVE_HZ = 6;

let sb = null, supa = null;
if (typeof window !== 'undefined') queueMicrotask(() => console.info('BagVerse online backend:', backend()));   // which services this build uses
export function backend() { return typeof window !== 'undefined' && window.claude?.use ? 'claude' : URL_ && KEY ? 'supabase' : 'none'; }

/** claude.ai capability or its Supabase equivalent; null when there is no online service */
export async function use(name) {
  const c = typeof window !== 'undefined' ? window.claude : null;
  if (c && typeof c.use === 'function') return c.use(name).catch(() => null);
  if (!URL_ || !KEY) return null;
  supa ||= initSupabase();
  const s = await supa; if (!s) return null;
  return name === 'room' ? s.room : name === 'user' ? s.user : name === 'db' ? s.db : null;
}

async function initSupabase() {
  try {
    sb = createClient(URL_, KEY, { auth: { persistSession: true, autoRefreshToken: true }, realtime: { params: { eventsPerSecond: 20 } } });
    // identity: an anonymous Supabase account per browser (enable "Anonymous sign-ins" in Auth settings);
    // without it the game still joins the room with a local id, but cannot post scores
    let uid = null;
    try {
      const { data: s0 } = await sb.auth.getSession();
      uid = s0?.session?.user?.id || null;
      if (!uid) { const { data, error } = await sb.auth.signInAnonymously(); if (!error) uid = data?.user?.id || null; }
    } catch (_) { uid = null; }
    const localId = uid || (() => { try { let v = localStorage.getItem('bagverse.netid'); if (!v) { v = 'l' + Math.random().toString(36).slice(2, 12); localStorage.setItem('bagverse.netid', v); } return v; } catch (_) { return 'l' + Math.random().toString(36).slice(2, 12); } })();
    return { room: makeRoom(localId), user: makeUser(uid, localId), db: uid ? makeDb(uid) : makeDb(null) };
  } catch (e) { console.warn('net: supabase unavailable', e); return null; }
}

// ---------------------------------------------------------------- room (Supabase Realtime presence + broadcast)
function makeRoom(userId) {
  const peer = 'p' + Math.random().toString(36).slice(2, 10);   // one per open tab, like claude.ai's peer label
  const ch = sb.channel(CHANNEL, { config: { presence: { key: peer }, broadcast: { self: false } } });
  const state = new Map();     // peer -> { by, presence, updatedAt }
  let mine = {}, slow = {}, trackedKey = '', online = false, lastMove = 0, moveTimer = 0, snap = Object.freeze([]);
  const peerFns = new Set(), connFns = new Set();
  let queued = false;
  const emit = () => { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; rebuild(); peerFns.forEach((f) => f({ peers: snap, joined: [], left: [], updated: [] })); }); };
  const rebuild = () => {
    const list = [{ peer, by: userId, isMe: true, sameTab: true, kind: 'viewer', guest: false, presence: Object.freeze({ ...mine }), updatedAt: Date.now() }];
    for (const [p, v] of state) if (p !== peer) list.push({ peer: p, by: v.by || null, isMe: v.by && v.by === userId, sameTab: false, kind: 'viewer', guest: false, presence: Object.freeze({ ...v.presence }), updatedAt: v.updatedAt });
    snap = Object.freeze(list);
  };
  ch.on('presence', { event: 'sync' }, () => {
    const ps = ch.presenceState(), seen = new Set();
    for (const [p, metas] of Object.entries(ps)) {
      const m = metas[metas.length - 1] || {}; seen.add(p);
      const known = state.has(p), cur = state.get(p) || { presence: {} };
      cur.by = typeof m.by === 'string' ? m.by : null;
      // presence carries a position snapshot from when it was last tracked; once a peer's live movement is
      // flowing it is newer, so the snapshot must not drag them back (that left idle teammates "stuck" elsewhere)
      const tracked = m.s || {};
      const slowOnly = known ? Object.fromEntries(Object.entries(tracked).filter(([k]) => !MOVE_KEYS.has(k))) : tracked;
      cur.presence = { ...cur.presence, ...slowOnly }; cur.updatedAt = Date.now();
      state.set(p, cur);
    }
    for (const p of [...state.keys()]) if (!seen.has(p)) state.delete(p);
    emit();
  });
  ch.on('presence', { event: 'join' }, ({ key }) => { if (key !== peer) { trackedKey = ''; sendSlow(); sendMove(true); } });   // newcomers get our current spot
  ch.on('broadcast', { event: 'mv' }, ({ payload }) => {
    const p = payload?.p; if (typeof p !== 'string' || p === peer) return;
    const cur = state.get(p); if (!cur) return;   // movement only for peers present in the room
    cur.presence = { ...cur.presence, ...(payload.m || {}) }; cur.updatedAt = Date.now(); emit();
  });
  ch.subscribe((status) => {
    const on = status === 'SUBSCRIBED';
    if (on !== online) { online = on; connFns.forEach((f) => f(on)); }
    if (on) { trackedKey = ''; sendSlow(); sendMove(true); }
  });
  const sendSlow = () => {
    const k = JSON.stringify(slow); if (k === trackedKey || !online) return;
    trackedKey = k; ch.track({ by: userId, s: { ...slow, ...pick(mine, MOVE_KEYS) } }).catch(() => {});
  };
  const sendMove = (force) => {
    if (!online) return;
    const now = performance.now(), gap = 1000 / MOVE_HZ;
    if (!force && now - lastMove < gap) { if (!moveTimer) moveTimer = setTimeout(() => { moveTimer = 0; sendMove(true); }, gap - (now - lastMove)); return; }
    lastMove = now; ch.send({ type: 'broadcast', event: 'mv', payload: { p: peer, m: pick(mine, MOVE_KEYS) } }).catch(() => {});
  };
  const pick = (o, keys) => Object.fromEntries(Object.entries(o).filter(([k]) => keys.has(k)));
  // keepalive: re-send where we are every 2 s, so anyone who missed a movement message (or just joined) catches up
  setInterval(() => { if (online && performance.now() - lastMove > 2000) sendMove(true); }, 1000);
  addEventListener('pagehide', () => { try { ch.untrack(); sb.removeChannel(ch); } catch (_) {} });
  return Object.freeze({
    async presence(patch) {
      const before = JSON.stringify(slow);
      for (const [k, v] of Object.entries(patch)) { if (v === null) delete mine[k]; else mine[k] = v; }
      slow = Object.fromEntries(Object.entries(mine).filter(([k]) => !MOVE_KEYS.has(k)));
      if (JSON.stringify(slow) !== before) sendSlow();
      if (Object.keys(patch).some((k) => MOVE_KEYS.has(k))) sendMove(false);
      emit();
    },
    onPeers(fn) { peerFns.add(fn); setTimeout(() => { rebuild(); fn({ peers: snap, joined: snap, left: [], updated: [] }); }, 0); return () => peerFns.delete(fn); },
    onConnection(fn) { connFns.add(fn); setTimeout(() => fn(online), 0); return () => connFns.delete(fn); },
    connected: () => online,
    peers: () => snap,
    async emit() {}, on() { return () => {}; },
  });
}

// ---------------------------------------------------------------- user
function makeUser(uid, localId) {
  return Object.freeze({
    async id() { return uid || localId; },
    async profiles() { return {}; },            // no account names off claude.ai: the in-game name is shown
    async can(what) { return what === 'data.write' ? !!uid : null; },
    isOwner: () => false, canEdit: () => false,
  });
}

// ---------------------------------------------------------------- db (table `lb`, see supabase/schema.sql)
const COL = { week: 'week', day: 'day', wBest: 'wbest', dBest: 'dbest', wins: 'wins' };
function makeDb(uid) {
  const listeners = new Set();
  const refreshAll = () => listeners.forEach((f) => f());
  setInterval(refreshAll, 20000);
  const rowToDoc = (r) => ({ id: r.id, exists: true, data: () => r.doc || {}, metadata: { fromCache: false, hasPendingWrites: false } });
  const query = (q) => ({
    where: (f, op, v) => query({ ...q, w: [...q.w, [f, op, v]] }),
    orderBy: (f, d = 'asc') => query({ ...q, o: [f, d] }),
    limit: (n) => query({ ...q, l: n }),
    async get() {
      let r = sb.from('lb').select('id, doc');
      for (const [f, op, v] of q.w) { const c = COL[f]; if (!c) continue; r = op === '==' ? r.eq(c, v) : op === '>' ? r.gt(c, v) : op === '>=' ? r.gte(c, v) : op === '<' ? r.lt(c, v) : op === '<=' ? r.lte(c, v) : r; }
      if (q.o && COL[q.o[0]]) r = r.order(COL[q.o[0]], { ascending: q.o[1] !== 'desc', nullsFirst: false });
      r = r.limit(q.l || 100);
      const { data, error } = await r; if (error) throw { code: 'unavailable', message: error.message };
      const docs = (data || []).map(rowToDoc);
      return { docs, size: docs.length, empty: !docs.length, docChanges: () => [], metadata: { fromCache: false, hasPendingWrites: false } };
    },
    onSnapshot(next, err) {
      let dead = false; const run = () => !dead && this.get().then((s) => !dead && next(s)).catch(() => {});
      listeners.add(run); run();
      return () => { dead = true; listeners.delete(run); };
    },
  });
  const doc = (path) => {
    const [, id] = path.split('/');
    return {
      id, path,
      async get() { const { data } = await sb.from('lb').select('id, doc').eq('id', id).maybeSingle(); return data ? rowToDoc(data) : { id, exists: false, data: () => undefined, metadata: {} }; },
      async set(body) {
        if (!uid || id !== uid) throw { code: 'invalid_argument', message: 'can only write your own row' };
        const row = { id, doc: body, week: body.week ?? null, day: body.day ?? null, wbest: body.wBest | 0, dbest: body.dBest | 0, wins: body.wins | 0, updated_at: new Date().toISOString() };   // a name-only row has no week/day, so it never shows on a board
        const { error } = await sb.from('lb').upsert(row); if (error) throw { code: 'invalid_argument', message: error.message };
        refreshAll();
      },
      onSnapshot(next) { let dead = false; const run = () => !dead && this.get().then((s) => !dead && next(s)).catch(() => {}); listeners.add(run); run(); return () => { dead = true; listeners.delete(run); }; },
    };
  };
  return Object.freeze({ collection: (c) => ({ ...query({ col: c, w: [] }), doc: (id) => doc(c + '/' + id) }), doc });
}
