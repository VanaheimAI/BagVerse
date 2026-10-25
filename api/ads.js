// /api/ads?op=...  — billboard rentals paid with Solana Pay (USDC to the treasury, src/treasury.js).
//   book     { slot, tier, name }          -> { id, key, reference, amount, url (solana: pay link) }  (a pending booking)
//   check    { id }                        -> { paid }  looks for the payment on-chain (needs SOLANA_RPC_URL)
//   status   { id, key }                   -> the booking as its owner sees it
//   creative { id, key, type, data }       -> the payer uploads their image: the ad goes live for AD_DAYS days
//                                             (a later upload replaces the image and keeps the end date)
//   live                                   -> screens with a live ad: [{ id, slot, creative_url, ends_at }]
// `key` is a secret handed to the browser that booked (kept in its localStorage); only it can upload the creative.
// The admin can pull any ad and refund it from /admin.
import crypto from 'node:crypto';
const hash = (k) => crypto.createHash('sha256').update(String(k || '')).digest('hex');
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
    const { data } = await sb.from('ad_bookings').select('id, slot, creative_url, ends_at').eq('status', 'live');
    return send(res, 200, { live: (data || []).filter((a) => a.creative_url && Date.parse(a.ends_at) > Date.now()) });
  }
  if (op === 'book') {
    const slot = String(body.slot || '').replace(/[^\w]/g, '').slice(0, 12), tier = String(body.tier || '').replace(/[^\w]/g, '').slice(0, 12);
    if (!slot) return send(res, 400, { error: 'Which screen?' });
    const { data: taken } = await sb.from('ad_bookings').select('status, ends_at').eq('slot', slot);
    const busy = (taken || []).find((a) => a.status === 'paid' || (a.status === 'live' && Date.parse(a.ends_at) > Date.now()));
    if (busy) return send(res, 409, { error: busy.status === 'live' ? `This screen is rented until ${new Date(busy.ends_at).toUTCString().slice(5, 16)}.` : 'This screen was just rented.' });
    const amount = adPrice(tier), reference = b58(crypto.randomBytes(32)), id = 'ad-' + crypto.randomBytes(5).toString('hex'), key = crypto.randomBytes(18).toString('base64url');
    const uid = await caller(req, sb).catch(() => null);
    const { error } = await sb.from('ad_bookings').insert({ id, slot, tier, days: AD_DAYS, amount, currency: 'USDC', reference, key_hash: hash(key), status: 'pending', payer_user: uid, payer_name: String(body.name || '').replace(/[^\w.-]/g, '').slice(0, 16) || null });
    if (error) return send(res, 500, { error: error.message });
    const pay = `solana:${TREASURY}?amount=${amount}&spl-token=${USDC_MINT}&reference=${reference}&label=${encodeURIComponent('BagVerse')}&message=${encodeURIComponent(`Billboard ${slot} · ${AD_DAYS} days`)}&memo=${id}`;
    return send(res, 200, { id, key, reference, amount, days: AD_DAYS, treasury: TREASURY, url: pay });
  }
  if (op === 'status' || op === 'creative') {
    const { data: a } = await sb.from('ad_bookings').select('*').eq('id', String(body.id || '').slice(0, 32)).maybeSingle();
    if (!a || a.key_hash !== hash(body.key)) return send(res, 404, { error: 'Booking not found on this device.' });
    if (op === 'status') return send(res, 200, { id: a.id, slot: a.slot, status: a.status, amount: Number(a.amount), creative_url: a.creative_url, ends_at: a.ends_at, pulled_reason: a.pulled_reason || null });
    if (!['paid', 'live'].includes(a.status)) return send(res, 409, { error: a.status === 'pending' ? 'Pay for the screen first.' : `This booking is ${a.status}.` });
    const type = /^image\/(png|jpeg|webp|gif)$/.test(body.type) ? body.type : null; if (!type) return send(res, 400, { error: 'PNG, JPEG, WebP or GIF only.' });
    const buf = Buffer.from(String(body.data || ''), 'base64'); if (!buf.length || buf.length > 3.5e6) return send(res, 400, { error: 'Image must be under 3.5 MB.' });
    const st = sb.storage; const { data: bk } = await st.getBucket('ads'); if (!bk) await st.createBucket('ads', { public: true });
    const path = `${a.id}-${Date.now()}.${type.split('/')[1].replace('jpeg', 'jpg')}`;
    const { error: ue } = await st.from('ads').upload(path, buf, { contentType: type, cacheControl: '31536000' }); if (ue) return send(res, 500, { error: ue.message });
    const url2 = st.from('ads').getPublicUrl(path).data.publicUrl, now = Date.now();
    const up = { creative_url: url2, status: 'live' };
    if (a.status === 'paid') Object.assign(up, { starts_at: new Date(now).toISOString(), ends_at: new Date(now + (a.days || AD_DAYS) * 86400e3).toISOString() });
    await sb.from('ad_bookings').update(up).eq('id', a.id);
    return send(res, 200, { live: true, creative_url: url2, ends_at: up.ends_at || a.ends_at });
  }
  if (op === 'check') {
    const rpcUrl = deps.rpc ?? process.env.SOLANA_RPC_URL; if (!rpcUrl) return send(res, 503, { error: 'Payment checks are not set up yet.' });
    const { data: a } = await sb.from('ad_bookings').select('*').eq('id', String(body.id || '').slice(0, 32)).maybeSingle();
    if (!a) return send(res, 404, { error: 'No such booking.' });
    if (a.status !== 'pending') return send(res, 200, { paid: true, status: a.status });
    const pay = await findPayment(rpcUrl, { reference: a.reference, treasury: TREASURY, mint: USDC_MINT, amount: Number(a.amount) }, deps.fetchFn).catch(() => null);
    if (!pay) return send(res, 200, { paid: false });
    await sb.from('ad_bookings').update({ status: 'paid', signature: pay.signature, paid_amount: pay.amount, payer_address: pay.payer, payer_token_account: pay.from }).eq('id', a.id);
    return send(res, 200, { paid: true, status: 'paid' });
  }
  return send(res, 400, { error: 'Unknown op.' });
}
