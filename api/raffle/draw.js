// GET|POST /api/raffle/draw — draws every open raffle whose draws_at has passed. Safe for anyone to call (the Vercel
// cron in vercel.json, or the game when it sees a due raffle): the result depends only on the entries and the first
// Solana block at/after draws_at, so calling it early, late or twice changes nothing.
import crypto from 'node:crypto';
import { admin, send } from '../_lib/wallet.js';
import { blockAt, pickIndex } from '../_lib/raffle.js';

export default async function handler(req, res, deps = {}) {
  const sb = deps.sb || admin();
  if (!sb) return send(res, 503, { error: 'Raffles are not set up on this server yet.' });
  const now = deps.now || Date.now(), url = deps.rpc ?? process.env.SOLANA_RPC_URL;
  const { data: due } = await sb.from('raffles').select('id, draws_at').eq('status', 'open').lte('draws_at', new Date(now).toISOString());
  const out = [];
  for (const r of due || []) {
    const { data: es } = await sb.from('raffle_entries').select('user_id, address, name, created_at').eq('raffle_id', r.id);
    const entries = (es || []).filter((e) => Date.parse(e.created_at) <= Date.parse(r.draws_at))
      .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at) || (a.user_id < b.user_id ? -1 : 1));
    let proof;
    if (url) {
      let blk = null; try { blk = await blockAt(url, Math.ceil(Date.parse(r.draws_at) / 1000), deps.fetchFn); } catch (e) { out.push({ id: r.id, error: 'rpc: ' + e.message }); continue; }
      if (!blk) { out.push({ id: r.id, waiting: 'block not finalized yet' }); continue; }
      proof = { method: 'solana-block', slot: blk.slot, blockhash: blk.blockhash, block_time: blk.time, tickets: entries.length };
    } else proof = { method: 'server-random', seed: crypto.randomBytes(16).toString('hex'), tickets: entries.length };   // no RPC: not publicly checkable
    const upd = { status: 'drawn', entries: entries.length, proof };
    if (entries.length) {
      const i = pickIndex(proof.blockhash || proof.seed, r.id, entries.length), w = entries[i];
      Object.assign(upd, { winner_user: w.user_id, winner_address: w.address, winner_name: w.name }); proof.pick = i;
    }
    const { error } = await sb.from('raffles').update(upd).eq('id', r.id).eq('status', 'open');
    out.push(error ? { id: r.id, error: error.message } : { id: r.id, winner: upd.winner_name || null, entries: entries.length });
  }
  return send(res, 200, { drawn: out });
}
