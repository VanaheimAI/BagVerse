// /api/admin?op=...  — the /admin dashboard's server. Every op except `login` needs the admin token.
//   login        { address, message, signature }        -> { token }
//   overview                                            -> counts for the header
//   raffles                                             -> all raffles (newest first)
//   save_raffle  { id?, vault, prize, min_level, draws_at } create or edit (edit only while open)
//   cancel_raffle{ id }                                  -> status 'cancelled' (entries kept for the record)
//   entries      { raffle_id }                           -> entries with player names / wallets
//   set_winner   { raffle_id, user_id }                  -> manual winner (proof method 'manual')
//   draw_now     { raffle_id }                           -> fair draw right now (moves draws_at to now, then draws)
//   reopen       { raffle_id, draws_at }                 -> undo a draw / cancel, back to open
//   players                                             -> everyone with a leaderboard row or wallet, joined up
//   upload       { name, type, data (base64) }          -> public URL (Supabase Storage bucket "prizes")
//   ads                                                 -> ad bookings
//   ad_check     { id }                                  -> look for the payment on-chain
//   ad_pull      { id, reason }                          -> veto: take the ad off the screen (status 'pulled')
//   ad_reinstate { id }                                  -> put a pulled ad back (if not refunded)
//   refund_prepare { id }                               -> what the dashboard needs to build the USDC refund
//   refund_done  { id, signature }                       -> confirm the refund on-chain (status 'refunded')
//   tags                                                -> Spray Spots: current tags (most reported first) + recent history
//   tag_hide     { spot, hidden }                       -> hide a tag (or restore it, clearing its reports)
//   tag_clear    { spot }                               -> wipe a wall (logged)
import crypto from 'node:crypto';
import { admin, hostOf, readBody, send } from './_lib/wallet.js';
import { checkLogin, checkToken } from './_lib/admin.js';
import { findPayment, checkRefund } from './_lib/pay.js';
import { rpc } from './_lib/raffle.js';
import drawHandler from './raffle/draw.js';
import { TREASURY, USDC_MINT } from '../src/treasury.js';

const clean = (v, n = 200) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);
const PRIZE_KEYS = ['name', 'set', 'grader', 'grade', 'variant', 'cert', 'mint', 'url', 'image', 'chain', 'issuer', 'contract', 'token_id', 'model', 'slot'];

export default async function handler(req, res, deps = {}) {
  const url = new URL(req.url || '/', 'http://x'), body = req.method === 'POST' ? await readBody(req) : {};
  const op = String(url.searchParams.get('op') || body.op || '');
  if (op === 'login') {
    const r = checkLogin(body, { host: hostOf(req), now: deps.now });
    return r.ok ? send(res, 200, { token: r.token }) : send(res, r.status, { error: r.error });
  }
  if (!checkToken(req, deps.now)) return send(res, 401, { error: 'Admin sign-in needed.' });
  const sb = deps.sb || admin();
  if (!sb) return send(res, 503, { error: 'Server is missing SUPABASE_SERVICE_ROLE_KEY.' });
  const q = async (p) => { const { data, error } = await p; if (error) throw new Error(error.message); return data; };
  try {
    switch (op) {
      case 'overview': {
        const [r, e, w, l, a] = await Promise.all(['raffles', 'raffle_entries', 'wallets', 'lb', 'ad_bookings'].map((t) => sb.from(t).select('*', { count: 'exact', head: true })));
        return send(res, 200, { raffles: r.count ?? null, entries: e.count ?? null, wallets: w.count ?? null, players: l.count ?? null, ads: a.count ?? null,
          missing: [r, e, a].some((x) => x.error && /schema cache|does not exist/i.test(x.error.message)) });
      }
      case 'raffles': return send(res, 200, { raffles: await q(sb.from('raffles').select('*').order('draws_at', { ascending: false }).limit(200)) });
      case 'save_raffle': {
        const vault = body.vault === 'kanto' ? 'kanto' : 'wano', when = Date.parse(body.draws_at);
        if (!isFinite(when)) return send(res, 400, { error: 'Pick a draw date and time.' });
        const prize = Object.fromEntries(PRIZE_KEYS.map((k) => [k, clean(body.prize?.[k], k === 'image' || k === 'url' ? 600 : 160)]).filter(([, v]) => v));
        if (!prize.name) return send(res, 400, { error: 'The prize needs a name.' });
        if (prize.slot) { const n = prize.slot | 0; if (n >= 1 && n <= 3) prize.slot = n; else delete prize.slot; }   // which floating showcase (1–3) at the vault
        for (const k of ['url', 'image', 'model']) if (prize[k] && !/^https:\/\//.test(prize[k])) return send(res, 400, { error: `The ${k === 'url' ? 'card link' : 'image'} must start with https://` });
        if (prize.chain === 'polygon') {   // Courtyard slab on Polygon: contract + token id instead of a Solana mint
          prize.issuer = prize.issuer || 'courtyard'; delete prize.mint;
          if (prize.contract && !/^0x[0-9a-fA-F]{40}$/.test(prize.contract)) return send(res, 400, { error: 'Polygon contract must be a 0x… address.' });
          if (prize.token_id && !/^\d{1,80}$/.test(prize.token_id)) return send(res, 400, { error: 'Token ID must be a number.' });
        } else { prize.chain = 'solana'; delete prize.contract; delete prize.token_id; if (prize.mint && !prize.issuer) prize.issuer = 'collector_crypt'; }
        const row = { vault, prize, min_level: Math.max(0, Math.min(999, body.min_level | 0)), draws_at: new Date(when).toISOString() };
        if (body.id) {
          const cur = (await q(sb.from('raffles').select('status').eq('id', body.id).maybeSingle()));
          if (!cur) return send(res, 404, { error: 'No such raffle.' });
          if (cur.status !== 'open') return send(res, 409, { error: 'Only open raffles can be edited (reopen it first).' });
          await q(sb.from('raffles').update(row).eq('id', body.id));
          return send(res, 200, { id: body.id });
        }
        const id = `${vault}-${new Date(when).toISOString().slice(0, 10)}-${crypto.randomBytes(2).toString('hex')}`;
        await q(sb.from('raffles').insert({ id, ...row, status: 'open', entries: 0 }));
        return send(res, 200, { id });
      }
      case 'cancel_raffle': await q(sb.from('raffles').update({ status: 'cancelled' }).eq('id', clean(body.id, 64))); return send(res, 200, { ok: true });
      case 'entries': {
        const es = await q(sb.from('raffle_entries').select('*').eq('raffle_id', clean(body.raffle_id || url.searchParams.get('raffle_id'), 64)));
        const ids = [...new Set(es.map((e) => e.user_id))];
        const lb = ids.length ? await q(sb.from('lb').select('id, doc').in('id', ids)) : [];
        const lv = Object.fromEntries(lb.map((r) => [r.id, r.doc?.lv | 0]));
        const pw = ids.length ? await sb.from('linked_wallets').select('user_id, address').eq('chain', 'polygon').in('user_id', ids).then((x) => x.data || []).catch(() => []) : [];   // table may not exist yet
        const poly = Object.fromEntries(pw.map((w) => [w.user_id, w.address]));
        return send(res, 200, { entries: es.sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at)).map((e) => ({ ...e, level: lv[e.user_id] ?? null, polygon: poly[e.user_id] || null })) });
      }
      case 'set_winner': {
        const id = clean(body.raffle_id, 64);
        const e = await q(sb.from('raffle_entries').select('*').eq('raffle_id', id).eq('user_id', clean(body.user_id, 64)).maybeSingle());
        if (!e) return send(res, 404, { error: 'That player has no entry in this raffle.' });
        const n = (await q(sb.from('raffle_entries').select('user_id').eq('raffle_id', id))).length;
        await q(sb.from('raffles').update({ status: 'drawn', winner_user: e.user_id, winner_address: e.address, winner_name: e.name, entries: n,
          proof: { method: 'manual', by: checkToken(req, deps.now).a, at: new Date().toISOString(), tickets: n } }).eq('id', id));
        return send(res, 200, { ok: true, winner: e.name });
      }
      case 'draw_now': {
        const id = clean(body.raffle_id, 64), now = new Date(Date.now() - 2000).toISOString();
        const r = await q(sb.from('raffles').select('status, draws_at').eq('id', id).maybeSingle());
        if (!r || r.status !== 'open') return send(res, 409, { error: 'Only an open raffle can be drawn.' });
        if (Date.parse(r.draws_at) > Date.now()) await q(sb.from('raffles').update({ draws_at: now }).eq('id', id));
        let out = ''; await drawHandler({ method: 'POST', headers: {} }, { setHeader() {}, set statusCode(_) {}, end: (s) => (out = s) }, { sb, ...(deps.draw || {}) });
        const after = await q(sb.from('raffles').select('*').eq('id', id).maybeSingle());
        if (after?.status === 'open') return send(res, 202, { waiting: true, note: 'Waiting for the Solana block after the draw time to finalize (~20 s). Try again shortly.', result: JSON.parse(out || '{}') });
        return send(res, 200, { raffle: after });
      }
      case 'reopen': {
        const when = Date.parse(body.draws_at); if (!isFinite(when) || when < Date.now()) return send(res, 400, { error: 'Pick a new draw time in the future.' });
        await q(sb.from('raffles').update({ status: 'open', winner_user: null, winner_address: null, winner_name: null, proof: null, draws_at: new Date(when).toISOString() }).eq('id', clean(body.raffle_id, 64)));
        return send(res, 200, { ok: true });
      }
      case 'players': {
        const [lb, ws, es, rs] = await Promise.all([q(sb.from('lb').select('id, doc, updated_at').limit(5000)), q(sb.from('wallets').select('user_id, address, verified_at, skins').limit(5000)),
          q(sb.from('raffle_entries').select('user_id, raffle_id').limit(20000)), q(sb.from('raffles').select('id, winner_user').eq('status', 'drawn').limit(2000))]);
        const P = new Map(), get = (id) => (P.has(id) ? P.get(id) : (P.set(id, { id, name: null, level: null, skin: null, bagrunBest: 0, raceWins: 0, wallet: null, verifiedAt: null, entries: 0, wins: 0, lastSeen: null }), P.get(id)));
        for (const r of lb) { const p = get(r.id), d = r.doc || {}; Object.assign(p, { name: d.n || null, level: d.lv | 0, skin: d.skin || null, bagrunBest: d.best | 0, raceWins: d.wins | 0, lastSeen: r.updated_at }); }
        for (const w of ws) Object.assign(get(w.user_id), { wallet: w.address, verifiedAt: w.verified_at, holderSkins: w.skins || [] });
        const lw = await sb.from('linked_wallets').select('user_id, chain, address').limit(5000).then((x) => x.data || []).catch(() => []);
        for (const w of lw) if (w.chain === 'polygon') get(w.user_id).polygon = w.address;
        for (const e of es) get(e.user_id).entries++;
        for (const r of rs) if (r.winner_user) get(r.winner_user).wins++;
        return send(res, 200, { players: [...P.values()].sort((a, b) => Date.parse(b.lastSeen || 0) - Date.parse(a.lastSeen || 0)) });
      }
      case 'upload': {   // prize images (PNG / JPEG / WebP / GIF) and 3D models (GLB) for the vault showcases
        const glb = body.type === 'model/gltf-binary';
        const type = glb || /^image\/(png|jpeg|webp|gif)$/.test(body.type) ? body.type : null; if (!type) return send(res, 400, { error: 'PNG, JPEG, WebP, GIF or GLB only.' });
        const buf = Buffer.from(String(body.data || ''), 'base64');
        if (!buf.length || buf.length > (glb ? 3e6 : 3.5e6)) return send(res, 400, { error: glb ? 'The GLB must be under 3 MB (compress it, e.g. gltf-transform optimize).' : 'Image must be under 3.5 MB.' });
        if (glb && buf.subarray(0, 4).toString('latin1') !== 'glTF') return send(res, 400, { error: 'That is not a binary glTF (.glb) file.' });
        const st = sb.storage; const { data: b } = await st.getBucket('prizes'); if (!b) await st.createBucket('prizes', { public: true });
        const path = `${Date.now()}-${crypto.randomBytes(3).toString('hex')}.${glb ? 'glb' : type.split('/')[1].replace('jpeg', 'jpg')}`;
        const { error } = await st.from('prizes').upload(path, buf, { contentType: type, cacheControl: '31536000' }); if (error) throw new Error(error.message);
        return send(res, 200, { url: st.from('prizes').getPublicUrl(path).data.publicUrl });
      }
      case 'ads': return send(res, 200, { ads: await q(sb.from('ad_bookings').select('*').order('created_at', { ascending: false }).limit(500)), treasury: TREASURY });
      case 'ad_pull': {
        const a = await q(sb.from('ad_bookings').select('status').eq('id', clean(body.id, 64)).maybeSingle()); if (!a) return send(res, 404, { error: 'No such booking.' });
        if (!['paid', 'live'].includes(a.status)) return send(res, 409, { error: `Can't pull a ${a.status} booking.` });
        await q(sb.from('ad_bookings').update({ status: 'pulled', pulled_reason: clean(body.reason, 200) || null }).eq('id', clean(body.id, 64)));
        return send(res, 200, { ok: true });
      }
      case 'ad_reinstate': {
        const a = await q(sb.from('ad_bookings').select('*').eq('id', clean(body.id, 64)).maybeSingle()); if (!a) return send(res, 404, { error: 'No such booking.' });
        if (a.status !== 'pulled') return send(res, 409, { error: 'Only a pulled ad can be reinstated.' });
        await q(sb.from('ad_bookings').update({ status: a.creative_url ? 'live' : 'paid', pulled_reason: null }).eq('id', a.id));
        return send(res, 200, { ok: true });
      }
      case 'refund_prepare': {
        const rpcUrl = deps.rpc ?? process.env.SOLANA_RPC_URL; if (!rpcUrl) return send(res, 503, { error: 'Set SOLANA_RPC_URL in Vercel to send refunds.' });
        const a = await q(sb.from('ad_bookings').select('*').eq('id', clean(body.id, 64)).maybeSingle()); if (!a) return send(res, 404, { error: 'No such booking.' });
        if (!a.payer_token_account) return send(res, 409, { error: 'No confirmed payment to refund (check the payment first).' });
        if (a.status === 'refunded') return send(res, 409, { error: 'Already refunded.' });
        const amount = Number(a.paid_amount || a.amount);
        const accts = await rpc(rpcUrl, 'getTokenAccountsByOwner', [TREASURY, { mint: USDC_MINT }, { encoding: 'jsonParsed', commitment: 'confirmed' }], deps.fetchFn);
        const src = (accts?.value || []).map((v) => ({ pubkey: v.pubkey, amt: Number(v.account?.data?.parsed?.info?.tokenAmount?.amount || 0) })).sort((x, y) => y.amt - x.amt)[0];
        if (!src || src.amt < amount * 1e6) return send(res, 409, { error: `The treasury's USDC balance is too low for a ${amount} USDC refund.` });
        const bh = await rpc(rpcUrl, 'getLatestBlockhash', [{ commitment: 'confirmed' }], deps.fetchFn);
        return send(res, 200, { from_owner: TREASURY, from: src.pubkey, to: a.payer_token_account, to_owner: a.payer_address, mint: USDC_MINT, decimals: 6, amount, blockhash: bh.value.blockhash,
          pay_url: a.payer_address ? `solana:${a.payer_address}?amount=${amount}&spl-token=${USDC_MINT}&label=${encodeURIComponent('BagVerse refund')}&memo=refund-${a.id}` : null });
      }
      case 'refund_done': {
        const rpcUrl = deps.rpc ?? process.env.SOLANA_RPC_URL; if (!rpcUrl) return send(res, 503, { error: 'Set SOLANA_RPC_URL in Vercel.' });
        const a = await q(sb.from('ad_bookings').select('*').eq('id', clean(body.id, 64)).maybeSingle()); if (!a) return send(res, 404, { error: 'No such booking.' });
        const sig = clean(body.signature, 120);
        const ok = await checkRefund(rpcUrl, { signature: sig, to: a.payer_token_account, mint: USDC_MINT, amount: Number(a.paid_amount || a.amount) }, deps.fetchFn).catch(() => false);
        if (!ok) return send(res, 202, { confirmed: false, note: 'Not confirmed yet. Wait a few seconds and press Confirm again.' });
        await q(sb.from('ad_bookings').update({ status: 'refunded', refund_signature: sig }).eq('id', a.id));
        return send(res, 200, { confirmed: true });
      }
      case 'ad_check': {
        const rpcUrl = deps.rpc ?? process.env.SOLANA_RPC_URL; if (!rpcUrl) return send(res, 503, { error: 'Set SOLANA_RPC_URL in Vercel to check payments.' });
        const a = await q(sb.from('ad_bookings').select('*').eq('id', clean(body.id, 64)).maybeSingle()); if (!a) return send(res, 404, { error: 'No such booking.' });
        const pay = await findPayment(rpcUrl, { reference: a.reference, treasury: TREASURY, mint: USDC_MINT, amount: Number(a.amount) }, deps.fetchFn);
        if (!pay) return send(res, 200, { paid: false });
        await q(sb.from('ad_bookings').update({ status: a.status === 'pending' ? 'paid' : a.status, signature: pay.signature, paid_amount: pay.amount, payer_address: pay.payer, payer_token_account: pay.from }).eq('id', a.id));
        return send(res, 200, { paid: true, ...pay });
      }
      // Spray Spots moderation: every wall's current tag (reported first), hide / restore / clear
      case 'tags': return send(res, 200, { tags: await q(sb.from('tags').select('*').order('reports', { ascending: false }).limit(500)),
        log: await q(sb.from('tag_log').select('*').order('at', { ascending: false }).limit(100)) });
      case 'tag_hide': { const spot = clean(body.spot, 40); await q(sb.from('tags').update({ hidden: !!body.hidden, ...(body.hidden ? {} : { reports: 0 }) }).eq('spot', spot)); return send(res, 200, { ok: true }); }
      case 'tag_clear': { const spot = clean(body.spot, 40); const cur = await q(sb.from('tags').select('owner, handle').eq('spot', spot).maybeSingle());
        await q(sb.from('tags').delete().eq('spot', spot)); if (cur) await sb.from('tag_log').insert({ spot, owner: cur.owner, handle: cur.handle, kind: 'cleared', at: new Date().toISOString() }); return send(res, 200, { ok: true }); }
      default: return send(res, 400, { error: 'Unknown op.' });
    }
  } catch (e) { return send(res, 500, { error: e.message }); }
}
