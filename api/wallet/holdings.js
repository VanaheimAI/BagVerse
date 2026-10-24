// POST /api/wallet/holdings  (Authorization: Bearer <token>) -> { address, skins }
// Re-reads what the player's verified wallet holds and stores the unlocked skins. At most once a minute per player.
import { admin, caller, holderSkins, send } from '../_lib/wallet.js';

export default async function handler(req, res, deps = {}) {
  if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
  const sb = deps.sb || admin();
  if (!sb) return send(res, 503, { error: 'Wallet verification is not set up on this server yet.' });
  const uid = await caller(req, sb);
  if (!uid) return send(res, 401, { error: 'Sign in first (reload the game).' });
  const { data: w } = await sb.from('wallets').select('address, skins, holdings_at').eq('user_id', uid).maybeSingle();
  if (!w) return send(res, 404, { error: 'No verified wallet.' });
  const age = Date.now() - Date.parse(w.holdings_at || 0);
  if (age < 60e3) return send(res, 200, { address: w.address, skins: w.skins || [], cached: true });
  const skins = await holderSkins(w.address, deps.holdings || {});
  if (!skins) return send(res, 200, { address: w.address, skins: w.skins || [], holdings: 'unavailable' });
  await sb.from('wallets').update({ skins, holdings_at: new Date().toISOString() }).eq('user_id', uid);
  return send(res, 200, { address: w.address, skins });
}
