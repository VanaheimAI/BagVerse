// /api/ads?op=...  — billboard rentals paid with Solana Pay (USDC to the treasury, src/treasury.js).
//   book  { slot, tier, name }  -> { id, reference, amount, url (solana: pay link) }   (a pending booking)
//   check { id }                -> { paid }  looks for the payment on-chain (needs SOLANA_RPC_URL)
//   live                        -> screens with a live paid ad: [{ slot, creative_url, ends_at }]
import crypto from 'node:crypto';
import { admin, caller, readBody, send } from './_lib/wallet.js';
import { findPayment } from './_lib/pay.js';
import { TREASURY, USDC_MINT, AD_DAYS, adPrice } from '../src/treasury.js';

const A = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const b58 = (bytes) => { let z = 0; while (z < bytes.length && !bytes[z]) z++; const d = []; for (const x of bytes) { let c = x; for (let i = 0; i < d.length; i++) { c += d[i] * 256; d[i] = c % 58; c = (c / 58) | 0; } while (c) { d.push(c % 58); c = (c / 58) | 0; } } return '1'.repeat(z) + d.reverse().map((x) => A[x]).join(''); };

export default async function handler(req, res, deps = {}) {
  const url = new URL(req.url || '/', 'http://x'), body = req.method === 'POST' ? await readBody(req) : {};
  const op = String(url.searchParams.get('op') || body.op || '');
  const sb = deps.sb || admin();
  if (!sb) return send(res, 503, { error: 'Ad bookings are not set up on this server yet.' });
  if (op === 'live') {
    const { data } = await sb.from('ad_bookings').select('slot, creative_url, ends_at').eq('status', 'live');
    return send(res, 200, { live: (data || []).filter((a) => a.creative_url && Date.parse(a.ends_at) > Date.now()) });
  }
  if (op === 'book') {
    const slot = String(body.slot || '').replace(/[^\w]/g, '').slice(0, 12), tier = String(body.tier || '').replace(/[^\w]/g, '').slice(0, 12);
    if (!slot) return send(res, 400, { error: 'Which screen?' });
    const amount = adPrice(tier), reference = b58(crypto.randomBytes(32)), id = 'ad-' + crypto.randomBytes(5).toString('hex');
    const uid = await caller(req, sb).catch(() => null);
    const { error } = await sb.from('ad_bookings').insert({ id, slot, tier, days: AD_DAYS, amount, currency: 'USDC', reference, status: 'pending', payer_user: uid, payer_name: String(body.name || '').replace(/[^\w.-]/g, '').slice(0, 16) || null });
    if (error) return send(res, 500, { error: error.message });
    const pay = `solana:${TREASURY}?amount=${amount}&spl-token=${USDC_MINT}&reference=${reference}&label=${encodeURIComponent('BagVerse')}&message=${encodeURIComponent(`Billboard ${slot} · ${AD_DAYS} days`)}&memo=${id}`;
    return send(res, 200, { id, reference, amount, days: AD_DAYS, treasury: TREASURY, url: pay });
  }
  if (op === 'check') {
    const rpcUrl = deps.rpc ?? process.env.SOLANA_RPC_URL; if (!rpcUrl) return send(res, 503, { error: 'Payment checks are not set up yet.' });
    const { data: a } = await sb.from('ad_bookings').select('*').eq('id', String(body.id || '').slice(0, 32)).maybeSingle();
    if (!a) return send(res, 404, { error: 'No such booking.' });
    if (a.status !== 'pending') return send(res, 200, { paid: true, status: a.status });
    const pay = await findPayment(rpcUrl, { reference: a.reference, treasury: TREASURY, mint: USDC_MINT, amount: Number(a.amount) }, deps.fetchFn).catch(() => null);
    if (!pay) return send(res, 200, { paid: false });
    await sb.from('ad_bookings').update({ status: 'paid', signature: pay.signature, paid_amount: pay.amount }).eq('id', a.id);
    return send(res, 200, { paid: true, status: 'paid' });
  }
  return send(res, 400, { error: 'Unknown op.' });
}
