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
const MOVE_KEYS = new Set(['x', 'y', 'z', 'h', 'a', 'sp', 'r', 'vx', 'vz']);   // high-rate fields (movement broadcast)
const MOVE_HZ = 6;

let sb = null, supa = null;
if (typeof window !== 'undefined') queueMicrotask(() => console.info('BagVerse online backend:', backend()));   // which services this build uses
export function backend() { return typeof window !== 'undefined' && window.claude?.use ? 'claude' : URL_ && KEY ? 'supabase' : 'none'; }

/** the signed-in Supabase account, for calls to this site's own API (/api/...): { uid, token } or null */
export async function session() {
  if (backend() !== 'supabase') return null;
  supa ||= initSupabase(); await supa; if (!sb) return null;
  try { const { data } = await sb.auth.getSession(); const s = data?.session; return s?.access_token ? { uid: s.user.id, token: s.access_token } : null; } catch (_) { return null; }
}
/** the Supabase client itself (auth: X sign-in, linking), or null off Supabase */
export async function client() {
  if (backend() !== 'supabase') return null;
  supa ||= initSupabase(); await supa; return sb;
}
/** Supabase tables: { from(name) } (reads; writes follow each table's RLS rules), or null off Supabase.
 *  (Wrapped on purpose: a query builder is a thenable, so returning one from an async function would run it.) */
export async function tables() {
  if (backend() !== 'supabase') return null;
  supa ||= initSupabase(); await supa; return sb ? { from: (name) => sb.from(name) } : null;
}

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
    sb = createClient(URL_, KEY, { auth: { persistSession: true, autoRefreshToken: true }, realtime: { params: { eventsPerSecond: 20 }, worker: true, heartbeatIntervalMs: 15000 } });   // worker: heartbeats keep going in background tabs (timer throttling dropped players from the room)
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
// Built to stay inside Supabase Realtime's limits (Free plan: 100 messages/s for the whole project, counted as
// every message sent AND every copy delivered; 20 presence messages/s; 5 presence calls per client per 30 s).
// Going over disconnects everyone ("tenant_events") and players vanish for each other, so:
//   - presence is only for "who is here": a tiny { by, s: name/skin/level + spot } tracked at most once per 8 s;
//   - everything else is broadcast: 'mv' movement (rate shrinks with the room: ~60 / players² per second, only while
//     moving), 'st' state (chat line, races, flashmob; on change, at most ~2/s), 'hb' heartbeat (state + spot, every
//     few seconds, slower in a big room), 'bye' on leaving;
//   - a peer counts as here while presence lists them OR we heard from them in the last 15 s, so a dropped presence
//     update never hides someone who is clearly still playing, and a newcomer is drawn from their first message.
const BASIC = ['v', 'n', 'tag', 'lv', 'skin', 'id'];
const HEARD_MS = 15000;
function makeRoom(userId) {
  const peer = 'p' + Math.random().toString(36).slice(2, 10);   // one per open tab, like claude.ai's peer label
  const ch = sb.channel(CHANNEL, { config: { presence: { key: peer }, broadcast: { self: false } } });
  const state = new Map();     // peer -> { by, tracked, slow, move, inPresence, heard, presence }
  let mine = {}, online = false, snap = Object.freeze([]);
  const peerFns = new Set(), connFns = new Set();
  const stats = { sent: 0, got: 0, t0: performance.now() };
  let queued = false;
  const emit = () => { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; rebuild(); peerFns.forEach((f) => f({ peers: snap, joined: [], left: [], updated: [] })); }); };
  const rebuild = () => {
    const list = [{ peer, by: userId, isMe: true, sameTab: true, kind: 'viewer', guest: false, presence: Object.freeze({ ...mine }), updatedAt: Date.now() }];
    for (const [p, v] of state) if (p !== peer) list.push({ peer: p, by: v.by || null, isMe: !!v.by && v.by === userId, sameTab: false, kind: 'viewer', guest: false, presence: Object.freeze({ ...v.presence }), updatedAt: v.heard });
    snap = Object.freeze(list);
  };
  const entry = (p, by) => {
    let cur = state.get(p);
    if (!cur) { cur = { by: null, tracked: {}, slow: {}, move: {}, inPresence: false, heard: Date.now(), presence: {} }; state.set(p, cur); }
    if (typeof by === 'string') cur.by = by;
    return cur;
  };
  // tracked basics + latest state + latest movement (movement wins over the tracked spot once it flows)
  const merge = (cur) => { cur.presence = { ...cur.tracked, ...cur.slow, ...cur.move }; };
  const count = () => 1 + [...state.keys()].filter((p) => p !== peer).length;

  ch.on('presence', { event: 'sync' }, () => {
    stats.got++;
    const ps = ch.presenceState(), seen = new Set();
    for (const [p, metas] of Object.entries(ps)) {
      if (p === peer) continue;
      const m = metas[metas.length - 1] || {}; seen.add(p);
      const cur = entry(p, m.by); cur.inPresence = true; cur.tracked = m.s && typeof m.s === 'object' ? m.s : {}; merge(cur);
    }
    for (const [p, cur] of state) if (!seen.has(p)) cur.inPresence = false;
    prune(); emit();
  });
  ch.on('presence', { event: 'join' }, ({ key }) => { if (key !== peer) setTimeout(() => { sendState(true); sendMove(true); }, 200 + Math.random() * 800); });   // newcomers get our state and spot
  ch.on('presence', { event: 'leave' }, ({ key }) => { const cur = state.get(key); if (cur && Date.now() - cur.heard > 6000) { state.delete(key); emit(); } });
  const hear = (event, fn) => ch.on('broadcast', { event }, ({ payload }) => {
    stats.got++;
    const p = payload?.p; if (typeof p !== 'string' || p === peer) return;
    const cur = entry(p, payload.b); cur.heard = Date.now(); fn(cur, payload); merge(cur); emit();
  });
  hear('mv', (cur, pl) => { if (pl.m && typeof pl.m === 'object') cur.move = { ...cur.move, ...pl.m }; });
  hear('st', (cur, pl) => { if (pl.s && typeof pl.s === 'object') cur.slow = pl.s; });
  hear('hb', (cur, pl) => { if (pl.s && typeof pl.s === 'object') cur.slow = pl.s; if (pl.m && typeof pl.m === 'object') cur.move = { ...cur.move, ...pl.m }; });
  ch.on('broadcast', { event: 'bye' }, ({ payload }) => { stats.got++; if (payload?.p && payload.p !== peer) { state.delete(payload.p); emit(); } });
  const prune = () => { const now = Date.now(); for (const [p, cur] of state) if (!cur.inPresence && now - cur.heard > HEARD_MS) state.delete(p); };
  setInterval(() => { const n = state.size; prune(); if (state.size !== n) emit(); }, 3000);

  ch.subscribe((status) => {
    const on = status === 'SUBSCRIBED';
    if (on !== online) { online = on; connFns.forEach((f) => f(on)); }
    if (on) { lastTracked = ''; track(); sendState(true); sendMove(true); }
    if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') console.warn('multiplayer: realtime', status);
  });
  const send = (event, payload) => { if (!online) return; stats.sent++; ch.send({ type: 'broadcast', event, payload: { p: peer, b: userId, ...payload } }).catch(() => {}); };
  const pick = (o, keys) => Object.fromEntries(Object.entries(o).filter(([k]) => keys.has(k)));
  const slowOf = () => Object.fromEntries(Object.entries(mine).filter(([k]) => !MOVE_KEYS.has(k)));

  // presence: basics only, rate-limited (5 calls / 30 s / client is the hard cap)
  let lastTracked = '', lastTrackAt = -1e9, trackTimer = 0;
  const track = () => {
    if (!online) return;
    const basics = Object.fromEntries(BASIC.filter((k) => mine[k] !== undefined).map((k) => [k, mine[k]]));
    if (!Object.keys(basics).length) return;
    const body = { ...basics, ...pick(mine, new Set(['x', 'y', 'z', 'h'])) }, k = JSON.stringify(basics);
    if (k === lastTracked) return;
    const wait = 8000 - (performance.now() - lastTrackAt);
    if (wait > 0) { if (!trackTimer) trackTimer = setTimeout(() => { trackTimer = 0; track(); }, wait); return; }
    lastTracked = k; lastTrackAt = performance.now(); stats.sent++;
    ch.track({ by: userId, s: body }).catch(() => { lastTracked = ''; });
  };
  // state: on change, at most every 500 ms (trailing)
  let lastState = '', lastStateAt = -1e9, stateTimer = 0;
  const sendState = (force) => {
    const s = slowOf(), k = JSON.stringify(s);
    if (!online || !Object.keys(s).length || (!force && k === lastState)) return;
    const wait = 500 - (performance.now() - lastStateAt);
    if (wait > 0 && !force) { if (!stateTimer) stateTimer = setTimeout(() => { stateTimer = 0; sendState(false); }, wait); return; }
    lastState = k; lastStateAt = performance.now(); send('st', { s });
  };
  // movement: the rate shrinks with the room so the whole project stays under ~60 messages/s
  let lastMove = -1e9, moveTimer = 0, lastMoveKey = '';
  const moveGap = () => { const n = count(); return 1000 / Math.max(0.5, Math.min(MOVE_HZ, 60 / (n * n))); };
  const sendMove = (force) => {
    if (!online) return;
    const m = pick(mine, MOVE_KEYS), k = JSON.stringify(m);
    if (!force && k === lastMoveKey) return;
    const now = performance.now(), gap = moveGap();
    if (!force && now - lastMove < gap) { if (!moveTimer) moveTimer = setTimeout(() => { moveTimer = 0; sendMove(false); }, gap - (now - lastMove)); return; }
    lastMove = now; lastMoveKey = k; send('mv', { m });
  };
  // heartbeat: state + spot, so anyone who missed something (or just arrived) catches up; slower in a big room
  let lastHb = performance.now();
  setInterval(() => {
    if (!online) return;
    const n = count(), every = Math.min(15000, Math.max(4000, n * 1500));
    if (performance.now() - lastHb < every) return;
    lastHb = performance.now(); send('hb', { s: slowOf(), m: pick(mine, MOVE_KEYS) });
  }, 1000);
  // back in the foreground (or online again): announce ourselves straight away
  const reannounce = () => { if (!online) return; lastTracked = ''; track(); sendState(true); sendMove(true); };
  document.addEventListener('visibilitychange', () => { if (!document.hidden) reannounce(); });
  addEventListener('online', reannounce);
  addEventListener('pagehide', () => { try { send('bye', {}); ch.untrack(); sb.removeChannel(ch); } catch (_) {} });
  if (typeof window !== 'undefined') window.__rtStats = () => { const s = (performance.now() - stats.t0) / 1000; return { sent: stats.sent, got: stats.got, perSec: +((stats.sent + stats.got) / s).toFixed(2), peers: count(), moveHz: +(1000 / moveGap()).toFixed(2) }; };
  return Object.freeze({
    async presence(patch) {
      for (const [k, v] of Object.entries(patch)) { if (v === null) delete mine[k]; else mine[k] = v; }
      track(); sendState(false);
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
