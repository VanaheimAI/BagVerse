// Server side of the wallet link (Vercel functions). Needs these Vercel env vars (Settings -> Environment Variables):
//   SUPABASE_SERVICE_ROLE_KEY  secret key from Supabase (Project Settings -> API). Server only: never a VITE_ variable.
//   SOLANA_RPC_URL             an RPC with the DAS API (e.g. https://mainnet.helius-rpc.com/?api-key=...), for holder skins
//   (VITE_SUPABASE_URL is reused for the project URL; SUPABASE_URL overrides it.)
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { NFT_GATES, skinsFromAssets } from '../../src/nft-gates.js';

const A = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
export function b58decode(s) {
  if (typeof s !== 'string' || !s || s.length > 120) return null;
  let n = 0n; for (const ch of s) { const v = A.indexOf(ch); if (v < 0) return null; n = n * 58n + BigInt(v); }
  const bytes = []; while (n > 0n) { bytes.unshift(Number(n & 255n)); n >>= 8n; }
  for (const ch of s) { if (ch !== '1') break; bytes.unshift(0); }
  return Uint8Array.from(bytes);
}
const SPKI = Buffer.from('302a300506032b6570032100', 'hex');
export function verifyEd25519(message, sigB58, addrB58) {
  const pub = b58decode(addrB58), sig = b58decode(sigB58);
  if (!pub || pub.length !== 32 || !sig || sig.length !== 64) return false;
  try { return crypto.verify(null, Buffer.from(message, 'utf8'), crypto.createPublicKey({ key: Buffer.concat([SPKI, pub]), format: 'der', type: 'spki' }), sig); } catch (_) { return false; }
}

/** parse a Sign In With Solana message (the format the game and SIWS wallets produce) */
export function parseSiws(msg) {
  if (typeof msg !== 'string' || msg.length > 1500) return null;
  const lines = msg.split('\n');
  const m = /^(\S+) wants you to sign in with your Solana account:$/.exec(lines[0] || ''); if (!m) return null;
  const f = { domain: m[1], address: (lines[1] || '').trim() };
  for (const l of lines.slice(2)) { const k = /^([A-Za-z ]+): (.*)$/.exec(l); if (k) f[k[1].trim()] = k[2].trim(); }
  return f;
}

/**
 * Checks a link request. Returns { ok: true, address, nonce } or { ok: false, status, error }.
 * host: the host this request came to (the signed domain must match, so a signature made for another site is useless)
 * uid: the caller's account (the signed Request ID must match, so a copied signature can't link the wallet to someone else)
 */
export function checkLink({ address, message, signature }, { host, uid, now = Date.now() }) {
  const f = parseSiws(message);
  if (!f) return { ok: false, status: 400, error: 'Not a sign-in message.' };
  if (f.address !== address) return { ok: false, status: 400, error: 'The message is for a different address.' };
  if (f.domain !== host) return { ok: false, status: 400, error: `Signed for ${f.domain}, not ${host}.` };
  if (f['Request ID'] !== uid) return { ok: false, status: 400, error: 'Signed for a different player.' };
  const t = Date.parse(f['Issued At'] || '');
  if (!isFinite(t) || now - t > 10 * 60e3 || t - now > 2 * 60e3) return { ok: false, status: 400, error: 'Sign-in expired. Connect again.' };
  if (f['Expiration Time'] && Date.parse(f['Expiration Time']) < now) return { ok: false, status: 400, error: 'Sign-in expired. Connect again.' };
  if (!verifyEd25519(message, signature, address)) return { ok: false, status: 401, error: 'Signature does not match the wallet.' };
  return { ok: true, address, nonce: f.Nonce || '' };
}

export function admin() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
/** the signed-in player behind the request (their Supabase access token), or null */
export async function caller(req, sb) {
  const tok = /^Bearer (.+)$/.exec(req.headers?.authorization || '')?.[1];
  if (!tok) return null;
  const { data, error } = await sb.auth.getUser(tok);
  return error ? null : data?.user?.id || null;
}
export const hostOf = (req) => String(req.headers?.['x-forwarded-host'] || req.headers?.host || '').split(',')[0].trim();
export const send = (res, status, body) => { res.statusCode = status; res.setHeader('content-type', 'application/json'); res.setHeader('cache-control', 'no-store'); res.end(JSON.stringify(body)); };
export const readBody = async (req) => {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch (_) { return {}; } }
  let s = ''; for await (const c of req) { s += c; if (s.length > 8000) break; }
  try { return JSON.parse(s || '{}'); } catch (_) { return {}; }
};

/** gated skins this address unlocks, from the DAS API; null when no RPC is set or it fails */
export async function holderSkins(address, { rpc = process.env.SOLANA_RPC_URL, fetchFn = fetch, gates = NFT_GATES } = {}) {
  if (!gates.length) return [];
  if (!rpc) return null;
  const items = [];
  try {
    for (let page = 1; page <= 5; page++) {
      const r = await fetchFn(rpc, { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 'bv', method: 'getAssetsByOwner', params: { ownerAddress: address, page, limit: 1000, displayOptions: { showFungible: gates.some((g) => g.mint) } } }) });
      const j = await r.json(); if (j.error) throw new Error(j.error.message);
      const got = j.result?.items || []; items.push(...got);
      if (got.length < 1000) break;
    }
  } catch (e) { console.warn('holderSkins', e.message); return null; }
  return skinsFromAssets(items, gates);
}
