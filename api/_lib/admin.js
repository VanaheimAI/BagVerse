// Admin sessions for /admin: the admin wallet signs a short message, the server checks it and hands back a token
// (HMAC-signed, 12 h). Secret: ADMIN_SECRET, else the service-role key (both server-only).
import crypto from 'node:crypto';
import { verifyEd25519 } from './wallet.js';
import { ADMIN_WALLET } from '../../src/treasury.js';

export const adminWallet = () => process.env.ADMIN_WALLET || ADMIN_WALLET;
const secret = () => process.env.ADMIN_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const b64u = (b) => Buffer.from(b).toString('base64url');
const sign = (s) => crypto.createHmac('sha256', secret()).update(s).digest('base64url');

export function loginMessage(f) {   // what the admin page asks the wallet to sign
  return `BagVerse admin sign-in\nDomain: ${f.domain}\nWallet: ${f.address}\nIssued At: ${f.issuedAt}\nNonce: ${f.nonce}`;
}
export function checkLogin({ address, message, signature }, { host, now = Date.now() }) {
  if (!secret()) return { ok: false, status: 503, error: 'Admin is not set up on this server (needs SUPABASE_SERVICE_ROLE_KEY).' };
  if (address !== adminWallet()) return { ok: false, status: 403, error: 'This wallet is not the BagVerse admin wallet.' };
  const m = /^BagVerse admin sign-in\nDomain: (.+)\nWallet: (.+)\nIssued At: (.+)\nNonce: (.+)$/.exec(String(message || ''));
  if (!m) return { ok: false, status: 400, error: 'Unexpected sign-in message.' };
  if (m[1] !== host) return { ok: false, status: 400, error: `Signed for ${m[1]}, not ${host}.` };
  if (m[2] !== address) return { ok: false, status: 400, error: 'Wallet mismatch.' };
  const t = Date.parse(m[3]); if (!isFinite(t) || Math.abs(now - t) > 5 * 60e3) return { ok: false, status: 400, error: 'Sign-in expired. Try again.' };
  if (!verifyEd25519(message, signature, address)) return { ok: false, status: 401, error: 'Signature does not match the wallet.' };
  const body = b64u(JSON.stringify({ a: address, exp: now + 12 * 3600e3 }));
  return { ok: true, token: body + '.' + sign(body) };
}
export function checkToken(req, now = Date.now()) {
  const tok = /^Bearer (.+)$/.exec(req.headers?.authorization || '')?.[1] || '';
  const [body, mac] = tok.split('.');
  if (!body || !mac || !secret()) return null;
  const want = sign(body);
  if (want.length !== mac.length || !crypto.timingSafeEqual(Buffer.from(want), Buffer.from(mac))) return null;
  try { const j = JSON.parse(Buffer.from(body, 'base64url').toString()); return j.a === adminWallet() && j.exp > now ? j : null; } catch (_) { return null; }
}
