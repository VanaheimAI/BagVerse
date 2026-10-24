// POST /api/raffle/enter { raffle_id, name }  (Authorization: Bearer <player's Supabase token>)
// One free entry per player and per wallet; needs a wallet verified by api/wallet/verify. Entries close at draws_at.
import { admin, caller, readBody, send } from '../_lib/wallet.js';

export default async function handler(req, res, deps = {}) {
  if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
  const sb = deps.sb || admin();
  if (!sb) return send(res, 503, { error: 'Raffles are not set up on this server yet.' });
  const uid = await caller(req, sb);
  if (!uid) return send(res, 401, { error: 'Sign in first (reload the game).' });
  const body = await readBody(req), id = String(body.raffle_id || '').slice(0, 64);
  const { data: r } = await sb.from('raffles').select('id, status, draws_at').eq('id', id).maybeSingle();
  if (!r) return send(res, 404, { error: 'No such raffle.' });
  if (r.status !== 'open' || Date.parse(r.draws_at) <= (deps.now || Date.now())) return send(res, 409, { error: 'Entries for this raffle are closed.' });
  const { data: w } = await sb.from('wallets').select('address').eq('user_id', uid).maybeSingle();
  if (!w) return send(res, 403, { error: 'Connect and verify a Solana wallet first.' });
  const { data: dup } = await sb.from('raffle_entries').select('user_id').eq('raffle_id', id).eq('address', w.address).maybeSingle();
  if (dup && dup.user_id !== uid) return send(res, 409, { error: 'This wallet already has an entry.' });
  const name = String(body.name || '').replace(/[^\w.-]/g, '').slice(0, 16) || 'Player';
  const { error } = await sb.from('raffle_entries').upsert({ raffle_id: id, user_id: uid, address: w.address, name }, { onConflict: 'raffle_id,user_id', ignoreDuplicates: true });
  if (error) return send(res, 500, { error: 'Could not enter: ' + error.message });
  const { count } = await sb.from('raffle_entries').select('user_id', { count: 'exact', head: true }).eq('raffle_id', id);
  if (typeof count === 'number') await sb.from('raffles').update({ entries: count }).eq('id', id);
  return send(res, 200, { entered: true, entries: count ?? null });
}
