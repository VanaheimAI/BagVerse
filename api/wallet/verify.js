// POST /api/wallet/verify  { address, message, signature }  (Authorization: Bearer <player's Supabase access token>)
// Checks the signed sign-in message and records the wallet as this player's in public.wallets (one player per wallet:
// verifying the same wallet from another account moves it there). Replies { verified, address, skins }.
import { admin, caller, checkLink, holderSkins, hostOf, readBody, send } from '../_lib/wallet.js';

export default async function handler(req, res, deps = {}) {
  if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
  const sb = deps.sb || admin();
  if (!sb) return send(res, 503, { error: 'Wallet verification is not set up on this server yet.' });
  const uid = await caller(req, sb);
  if (!uid) return send(res, 401, { error: 'Sign in first (reload the game).' });
  const body = await readBody(req);
  const chk = checkLink({ address: String(body.address || ''), message: String(body.message || ''), signature: String(body.signature || '') }, { host: hostOf(req), uid, now: deps.now });
  if (!chk.ok) return send(res, chk.status, { error: chk.error });
  const { data: prev } = await sb.from('wallets').select('nonce').eq('address', chk.address).maybeSingle();
  if (prev && prev.nonce && prev.nonce === chk.nonce) return send(res, 409, { error: 'This sign-in was already used. Connect again.' });
  const skins = await holderSkins(chk.address, deps.holdings || {});
  await sb.from('wallets').delete().eq('address', chk.address).neq('user_id', uid);   // the wallet moves to this player
  const row = { user_id: uid, address: chk.address, verified_at: new Date().toISOString(), message: String(body.message), signature: String(body.signature), nonce: chk.nonce };
  if (skins) Object.assign(row, { skins, holdings_at: new Date().toISOString() });
  else { const { data: mine } = await sb.from('wallets').select('address').eq('user_id', uid).maybeSingle(); if (mine?.address !== chk.address) Object.assign(row, { skins: [], holdings_at: null }); }   // a new wallet never keeps the old one's skins
  const { error } = await sb.from('wallets').upsert(row, { onConflict: 'user_id' });
  if (error) return send(res, 500, { error: 'Could not save: ' + error.message });
  return send(res, 200, { verified: true, address: chk.address, skins: skins || [], holdings: skins ? 'ok' : 'unavailable' });
}
