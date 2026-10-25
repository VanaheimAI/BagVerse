// POST /api/wallet/evm { address, message, signature }  (Authorization: Bearer <player's Supabase token>)
// Links a Polygon wallet to the player (public.linked_wallets, chain 'polygon'), after checking the signed
// Sign-In with Ethereum message. One player per address: linking it from another account moves it there.
// The Solana wallet (public.wallets, api/wallet/verify) is separate and unchanged.
import { admin, caller, hostOf, readBody, send } from '../_lib/wallet.js';
import { checkEvmLink } from '../_lib/evm.js';

export default async function handler(req, res, deps = {}) {
  if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
  const sb = deps.sb || admin();
  if (!sb) return send(res, 503, { error: 'Wallet linking is not set up on this server yet.' });
  const uid = await caller(req, sb);
  if (!uid) return send(res, 401, { error: 'Sign in first (reload the game).' });
  const body = await readBody(req);
  const chk = await checkEvmLink({ address: String(body.address || ''), message: String(body.message || ''), signature: String(body.signature || '') }, { host: hostOf(req), uid, now: deps.now, rpcUrl: deps.rpcUrl });
  if (!chk.ok) return send(res, chk.status, { error: chk.error });
  const { data: prev } = await sb.from('linked_wallets').select('nonce').eq('chain', 'polygon').eq('address', chk.address).maybeSingle();
  if (prev && prev.nonce && prev.nonce === chk.nonce) return send(res, 409, { error: 'This sign-in was already used. Try again.' });
  await sb.from('linked_wallets').delete().eq('chain', 'polygon').eq('address', chk.address).neq('user_id', uid);
  const { error } = await sb.from('linked_wallets').upsert({ user_id: uid, chain: 'polygon', address: chk.address, verified_at: new Date().toISOString(), message: String(body.message), signature: String(body.signature), nonce: chk.nonce }, { onConflict: 'user_id,chain' });
  if (error) return send(res, 500, { error: 'Could not save: ' + error.message });
  return send(res, 200, { linked: true, chain: 'polygon', address: chk.address });
}
