// Unit test for api/raffle/*: entry rules and the block-hash draw, on a fake Supabase admin and a fake Solana RPC.
import enter from '../api/raffle/enter.js';
import draw from '../api/raffle/draw.js';
import { blockAt, pickIndex } from '../api/_lib/raffle.js';
import { fakeAdmin } from './fake-admin.mjs';

const ok = (c, m) => console.log((c ? 'PASS ' : 'FAIL ') + m);
const call = async (fn, { tok, body, method = 'POST' }, deps) => {
  let status = 0, out = '';
  const res = { setHeader() {}, set statusCode(s) { status = s; }, end: (s) => (out = s) };
  await fn({ method, headers: { authorization: tok ? 'Bearer ' + tok : '' }, body }, res, deps);
  return [status, JSON.parse(out)];
};
// fake chain: slot s has blockTime 1.7e9 + s * 0.4 (s), every 7th slot skipped; finalized tip = 200000
let TIP = 200000; const T0 = 1_700_000_000, slotTime = (s) => Math.floor(T0 + s * 0.4);
let calls = 0;
const chain = async (_u, { body }) => { calls++; const { method, params } = JSON.parse(body); let result, error;
  if (method === 'getSlot') result = TIP;
  else if (method === 'getBlockTime') { const s = params[0]; if (s > TIP || s % 7 === 3) error = { code: -32009, message: 'skipped' }; else result = slotTime(s); }
  else if (method === 'getBlock') result = { blockhash: 'HASH' + params[0] };
  return { json: async () => (error ? { error } : { result }) }; };

const blk = await blockAt('x', T0 + 50000, chain);
ok(blk && blk.time >= T0 + 50000 && slotTime(blk.slot - 1) < T0 + 50000 || (blk.slot - 1) % 7 === 3, `first block at/after the draw time: slot ${blk?.slot} (${calls} rpc calls)`);
const blk2 = await blockAt('x', T0 + 50000, chain);
ok(blk2.slot === blk.slot && blk2.blockhash === blk.blockhash, 'same block whenever it is computed');
ok(await blockAt('x', slotTime(TIP) + 60, chain) === null, 'draw time past the finalized tip: wait');

const sb = fakeAdmin(), now = Date.now();
sb.db.raffles = [{ id: 'wano-1', vault: 'wano', status: 'open', draws_at: new Date(now + 3600e3).toISOString(), entries: 0 },
  { id: 'old', vault: 'kanto', status: 'drawn', draws_at: new Date(now - 3600e3).toISOString() }];
sb.db.wallets = [{ user_id: 'u1', address: 'ADDR1' }, { user_id: 'u2', address: 'ADDR2' }, { user_id: 'u3', address: 'ADDR3' }];
let [s, j] = await call(enter, { tok: 'tok-u1', body: { raffle_id: 'wano-1', name: 'Ada<b>' } }, { sb });
ok(s === 200 && j.entries === 1, 'verified wallet enters');
[s, j] = await call(enter, { tok: 'tok-u1', body: { raffle_id: 'wano-1' } }, { sb }); ok(s === 200 && j.entries === 1, 'entering twice keeps one entry');
[s, j] = await call(enter, { tok: 'tok-u9', body: { raffle_id: 'wano-1' } }, { sb }); ok(s === 403, 'no verified wallet: ' + j.error);
[s, j] = await call(enter, { tok: 'tok-u2', body: { raffle_id: 'old' } }, { sb }); ok(s === 409, 'drawn raffle closed: ' + j.error);
[s, j] = await call(enter, { tok: 'tok-u2', body: { raffle_id: 'nope' } }, { sb }); ok(s === 404, 'unknown raffle');
[s, j] = await call(enter, { tok: '', body: { raffle_id: 'wano-1' } }, { sb }); ok(s === 401, 'not signed in');
sb.db.wallets.push({ user_id: 'u4', address: 'ADDR1' });   // (can't really happen: address is unique) same wallet, other account
[s, j] = await call(enter, { tok: 'tok-u4', body: { raffle_id: 'wano-1' } }, { sb }); ok(s === 409, 'one entry per wallet: ' + j.error);
for (const u of ['u2', 'u3']) await call(enter, { tok: 'tok-' + u, body: { raffle_id: 'wano-1', name: u.toUpperCase() } }, { sb });
ok(sb.db.raffles[0].entries === 3 && sb.db.raffle_entries[0].name === 'Adab', 'entry count kept on the raffle; names cleaned');
[s, j] = await call(draw, { method: 'GET' }, { sb, rpc: 'x', fetchFn: chain }); ok(s === 200 && j.drawn.length === 0, 'nothing due yet');
// time passes: the draw is due
const drawsAt = Date.parse(sb.db.raffles[0].draws_at), dueNow = drawsAt + 300e3;
const chain2 = async (u, o) => { const b = JSON.parse(o.body); if (b.method === 'getSlot') return { json: async () => ({ result: Math.floor((dueNow / 1000 - T0) / 0.4) }) }; return chain(u, o); };
[s, j] = await call(enter, { tok: 'tok-u2', body: { raffle_id: 'wano-1' } }, { sb, now: dueNow }); ok(s === 409, 'entries close at the draw time');
TIP = Math.floor((dueNow / 1000 - T0) / 0.4);
[s, j] = await call(draw, { method: 'GET' }, { sb, now: dueNow, rpc: 'x', fetchFn: chain });
const R = sb.db.raffles[0];
console.log('  draw:', JSON.stringify(j), JSON.stringify(R.proof));
ok(R.status === 'drawn' && R.winner_user && R.proof.blockhash && R.proof.tickets === 3, 'drawn with a Solana block hash');
const sorted = [...sb.db.raffle_entries].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at) || (a.user_id < b.user_id ? -1 : 1));
ok(sorted[pickIndex(R.proof.blockhash, 'wano-1', 3)].user_id === R.winner_user, 'anyone can recompute the winner from the proof');
[s, j] = await call(draw, { method: 'GET' }, { sb, now: dueNow, rpc: 'x', fetchFn: chain }); ok(j.drawn.length === 0, 'a second call draws nothing');
// no RPC configured: server random, marked as such
sb.db.raffles.push({ id: 'k2', vault: 'kanto', status: 'open', draws_at: new Date(now - 1000).toISOString() });
[s, j] = await call(draw, { method: 'GET' }, { sb, rpc: '' }); ok(sb.db.raffles[2].status === 'drawn' && sb.db.raffles[2].proof.method === 'server-random' && !sb.db.raffles[2].winner_user, 'no entries, no RPC: closed with no winner');
