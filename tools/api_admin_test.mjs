// Unit test for /api/admin and /api/ads: admin wallet sign-in, raffles CRUD, manual winners, players, ad bookings
// with a Solana Pay payment found on a fake RPC.
import crypto from 'node:crypto';
import { fakeAdmin } from './fake-admin.mjs';

const A = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const b58 = (bytes) => { let z = 0; while (z < bytes.length && !bytes[z]) z++; const d = []; for (const x of bytes) { let c = x; for (let i = 0; i < d.length; i++) { c += d[i] * 256; d[i] = c % 58; c = (c / 58) | 0; } while (c) { d.push(c % 58); c = (c / 58) | 0; } } return '1'.repeat(z) + d.reverse().map((x) => A[x]).join(''); };
const kp = () => { const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519'); return { address: b58(publicKey.export({ format: 'der', type: 'spki' }).subarray(12)), sign: (m) => b58(crypto.sign(null, Buffer.from(m), privateKey)) }; };
const adminKey = kp(), other = kp();
process.env.ADMIN_WALLET = adminKey.address; process.env.ADMIN_SECRET = 'test-secret';
const { default: adminApi } = await import('../api/admin.js');
const { default: adsApi } = await import('../api/ads.js');
const { TREASURY, USDC_MINT } = await import('../src/treasury.js');

const ok = (c, m) => console.log((c ? 'PASS ' : 'FAIL ') + m);
const host = 'bag-verse-ten.vercel.app';
const call = async (fn, op, body, { tok = '', method = 'POST' } = {}, deps) => {
  let status = 0, out = '';
  const res = { setHeader() {}, set statusCode(s) { status = s; }, end: (s) => (out = s) };
  await fn({ method, url: `/api/x?op=${op}`, headers: { host, authorization: tok ? 'Bearer ' + tok : '' }, body }, res, deps);
  return [status, JSON.parse(out)];
};
const msg = (address, at = new Date().toISOString(), domain = host) => `BagVerse admin sign-in\nDomain: ${domain}\nWallet: ${address}\nIssued At: ${at}\nNonce: abc`;
const sb = fakeAdmin();
let [s, j] = await call(adminApi, 'login', { address: other.address, message: msg(other.address), signature: other.sign(msg(other.address)) }, {}, { sb });
ok(s === 403, 'another wallet cannot sign in: ' + j.error);
let m = msg(adminKey.address); [s, j] = await call(adminApi, 'login', { address: adminKey.address, message: m, signature: other.sign(m) }, {}, { sb }); ok(s === 401, 'wrong signature refused');
m = msg(adminKey.address, new Date(Date.now() - 10 * 60e3).toISOString()); [s, j] = await call(adminApi, 'login', { address: adminKey.address, message: m, signature: adminKey.sign(m) }, {}, { sb }); ok(s === 400, 'old sign-in refused');
m = msg(adminKey.address, undefined, 'evil.example'); [s, j] = await call(adminApi, 'login', { address: adminKey.address, message: m, signature: adminKey.sign(m) }, {}, { sb }); ok(s === 400, 'other site refused');
m = msg(adminKey.address); [s, j] = await call(adminApi, 'login', { address: adminKey.address, message: m, signature: adminKey.sign(m) }, {}, { sb });
const tok = j.token; ok(s === 200 && tok, 'admin wallet signs in');
[s, j] = await call(adminApi, 'raffles', null, { method: 'GET' }, { sb }); ok(s === 401, 'no token, no data');
[s, j] = await call(adminApi, 'raffles', null, { method: 'GET', tok: tok.slice(0, -2) + 'xx' }, { sb }); ok(s === 401, 'tampered token refused');
// raffles
const when = new Date(Date.now() + 86400e3).toISOString();
[s, j] = await call(adminApi, 'save_raffle', { vault: 'wano', prize: { name: '' }, draws_at: when }, { tok }, { sb }); ok(s === 400, 'prize name required');
[s, j] = await call(adminApi, 'save_raffle', { vault: 'wano', prize: { name: 'Luffy', image: 'http://x' }, draws_at: when }, { tok }, { sb }); ok(s === 400, 'https images only');
[s, j] = await call(adminApi, 'save_raffle', { vault: 'wano', min_level: 25, prize: { name: 'Monkey D. Luffy', grader: 'PSA', grade: '10', image: 'https://img.example/l.webp', junk: 'x' }, draws_at: when }, { tok }, { sb });
const rid = j.id; ok(s === 200 && /^wano-/.test(rid) && !sb.db.raffles[0].prize.junk && sb.db.raffles[0].status === 'open', 'raffle created: ' + rid);
[s, j] = await call(adminApi, 'save_raffle', { id: rid, vault: 'wano', min_level: 30, prize: { name: 'Monkey D. Luffy (Alt Art)', grade: '10' }, draws_at: when }, { tok }, { sb });
ok(s === 200 && sb.db.raffles[0].prize.name.includes('Alt') && sb.db.raffles[0].min_level === 30, 'raffle edited');
sb.db.raffle_entries = [{ raffle_id: rid, user_id: 'u1', address: 'ADDR1', name: 'Ada', created_at: new Date(Date.now() - 5000).toISOString() }, { raffle_id: rid, user_id: 'u2', address: 'ADDR2', name: 'Bob', created_at: new Date().toISOString() }];
sb.db.lb = [{ id: 'u1', doc: { n: 'Ada', lv: 31, skin: 'kaizokuguy', best: 900, wins: 2 }, updated_at: new Date().toISOString() }, { id: 'u3', doc: { n: 'Cy', lv: 4 }, updated_at: new Date(Date.now() - 3600e3).toISOString() }];
sb.db.wallets = [{ user_id: 'u1', address: 'ADDR1', verified_at: new Date().toISOString(), skins: [] }, { user_id: 'u2', address: 'ADDR2', verified_at: new Date().toISOString(), skins: [] }];
[s, j] = await call(adminApi, 'entries', { raffle_id: rid }, { tok }, { sb }); ok(s === 200 && j.entries.length === 2 && j.entries[0].name === 'Ada' && j.entries[0].level === 31, 'entries with levels, oldest first');
[s, j] = await call(adminApi, 'set_winner', { raffle_id: rid, user_id: 'u9' }, { tok }, { sb }); ok(s === 404, 'winner must have entered');
[s, j] = await call(adminApi, 'set_winner', { raffle_id: rid, user_id: 'u2' }, { tok }, { sb });
const R = sb.db.raffles[0]; ok(s === 200 && R.status === 'drawn' && R.winner_name === 'Bob' && R.proof.method === 'manual' && R.proof.by === adminKey.address, 'manual winner set (proof: manual, by admin)');
[s, j] = await call(adminApi, 'save_raffle', { id: rid, vault: 'wano', prize: { name: 'x' }, draws_at: when }, { tok }, { sb }); ok(s === 409, 'drawn raffle cannot be edited');
[s, j] = await call(adminApi, 'reopen', { raffle_id: rid, draws_at: new Date(Date.now() + 3600e3).toISOString() }, { tok }, { sb }); ok(s === 200 && R.status === 'open' && !R.winner_user, 'reopened: winner cleared');
[s, j] = await call(adminApi, 'cancel_raffle', { id: rid }, { tok }, { sb }); ok(R.status === 'cancelled', 'cancelled');
[s, j] = await call(adminApi, 'players', {}, { tok }, { sb });
const ada = j.players.find((p) => p.id === 'u1'), bob = j.players.find((p) => p.id === 'u2');
ok(s === 200 && j.players.length === 3 && ada.level === 31 && ada.wallet === 'ADDR1' && ada.entries === 1 && bob.name === null && bob.wallet === 'ADDR2', 'players joined from leaderboard, wallets and entries');
[s, j] = await call(adminApi, 'upload', { type: 'image/webp', data: Buffer.from('fake').toString('base64') }, { tok }, { sb }); ok(s === 200 && /\/prizes\//.test(j.url), 'image upload returns a public URL');
// ads
[s, j] = await call(adsApi, 'book', { slot: 'BB_07', tier: 'totem', name: 'Ada' }, {}, { sb });
const ad = j; ok(s === 200 && ad.amount === 120 && ad.url.startsWith(`solana:${TREASURY}?amount=120&spl-token=${USDC_MINT}&reference=${ad.reference}`), 'booking returns a Solana Pay link to the treasury: ' + ad.url.slice(0, 60) + '…');
const PAYER = 'Payer1111111111111111111111111111111111111', PAYER_ATA = 'PayerAta11111111111111111111111111111111111', T_ATA = 'TreasAta1111111111111111111111111111111111';
const chain = (paid) => async (_u, { body }) => { const { method, params } = JSON.parse(body); let result;
  if (method === 'getSignaturesForAddress') result = paid ? [{ signature: 'SIG1', err: null }] : [];
  if (method === 'getTransaction' && params[0] === 'SIG1') result = { slot: 9, blockTime: 1, transaction: { message: { accountKeys: [{ pubkey: PAYER }, { pubkey: PAYER_ATA }, { pubkey: T_ATA }] } }, meta: { err: null,
    preTokenBalances: [{ accountIndex: 2, owner: TREASURY, mint: USDC_MINT, uiTokenAmount: { amount: '5000000' } }, { accountIndex: 1, owner: PAYER, mint: USDC_MINT, uiTokenAmount: { amount: '900000000' } }],
    postTokenBalances: [{ accountIndex: 2, owner: TREASURY, mint: USDC_MINT, uiTokenAmount: { amount: String(5e6 + paid * 1e6) } }, { accountIndex: 1, owner: PAYER, mint: USDC_MINT, uiTokenAmount: { amount: String(900e6 - paid * 1e6) } }] } };
  if (method === 'getTransaction' && params[0] === 'REFUND1') result = { slot: 10, transaction: { message: { accountKeys: [{ pubkey: TREASURY }, { pubkey: T_ATA }, { pubkey: PAYER_ATA }] } }, meta: { err: null,
    preTokenBalances: [{ accountIndex: 2, owner: PAYER, mint: USDC_MINT, uiTokenAmount: { amount: '780000000' } }], postTokenBalances: [{ accountIndex: 2, owner: PAYER, mint: USDC_MINT, uiTokenAmount: { amount: '900000000' } }] } };
  if (method === 'getTokenAccountsByOwner') result = { value: [{ pubkey: T_ATA, account: { data: { parsed: { info: { tokenAmount: { amount: '500000000' } } } } } }] };
  if (method === 'getLatestBlockhash') result = { value: { blockhash: 'BH111' } };
  return { json: async () => ({ result }) }; };
const img = Buffer.from('fakeimage').toString('base64');
[s, j] = await call(adsApi, 'creative', { id: ad.id, key: ad.key, type: 'image/webp', data: img }, {}, { sb }); ok(s === 409, 'no upload before paying: ' + j.error);
[s, j] = await call(adsApi, 'check', { id: ad.id }, {}, { sb, rpc: 'x', fetchFn: chain(0) }); ok(j.paid === false, 'no payment yet');
[s, j] = await call(adsApi, 'check', { id: ad.id }, {}, { sb, rpc: 'x', fetchFn: chain(100) }); ok(j.paid === false, 'underpaid (100 of 120) does not count');
[s, j] = await call(adsApi, 'check', { id: ad.id }, {}, { sb, rpc: 'x', fetchFn: chain(120) });
const AD = sb.db.ad_bookings[0]; ok(j.paid === true && AD.status === 'paid' && AD.payer_address === PAYER && AD.payer_token_account === PAYER_ATA, 'paid in full: payer wallet and USDC account recorded');
[s, j] = await call(adsApi, 'book', { slot: 'BB_07', tier: 'totem' }, {}, { sb }); ok(s === 409, 'screen taken once paid: ' + j.error);
[s, j] = await call(adsApi, 'creative', { id: ad.id, key: 'wrong', type: 'image/webp', data: img }, {}, { sb }); ok(s === 404, 'another device (wrong key) cannot upload');
[s, j] = await call(adsApi, 'creative', { id: ad.id, key: ad.key, type: 'image/webp', data: img }, {}, { sb });
ok(s === 200 && AD.status === 'live' && /\/prizes\/|\/ads\//.test(AD.creative_url) && Date.parse(AD.ends_at) - Date.now() > 6.9 * 86400e3, 'the payer uploads their image: live for 7 days');
const ends = AD.ends_at; await new Promise((r) => setTimeout(r, 5));
[s, j] = await call(adsApi, 'creative', { id: ad.id, key: ad.key, type: 'image/png', data: img }, {}, { sb }); ok(s === 200 && AD.ends_at === ends, 'replacing the image keeps the end date');
[s, j] = await call(adsApi, 'live', null, { method: 'GET' }, { sb }); ok(j.live.length === 1 && j.live[0].slot === 'BB_07' && j.live[0].id === ad.id, 'the game sees the live ad');
[s, j] = await call(adminApi, 'ad_pull', { id: ad.id, reason: 'Off-brand' }, { tok }, { sb }); ok(AD.status === 'pulled' && AD.pulled_reason === 'Off-brand', 'admin pulls the ad (veto)');
[s, j] = await call(adsApi, 'live', null, { method: 'GET' }, { sb }); ok(j.live.length === 0, 'pulled ad is off the screens');
[s, j] = await call(adsApi, 'status', { id: ad.id, key: ad.key }, {}, { sb }); ok(j.status === 'pulled' && j.pulled_reason === 'Off-brand', 'the advertiser sees it was pulled and why');
[s, j] = await call(adminApi, 'ad_reinstate', { id: ad.id }, { tok }, { sb }); ok(AD.status === 'live', 'reinstated');
[s, j] = await call(adminApi, 'ad_pull', { id: ad.id, reason: 'Refund requested' }, { tok }, { sb });
[s, j] = await call(adminApi, 'refund_prepare', { id: ad.id }, { tok }, { sb, rpc: 'x', fetchFn: chain(120) });
ok(s === 200 && j.from === T_ATA && j.to === PAYER_ATA && j.to_owner === PAYER && j.amount === 120 && j.blockhash === 'BH111', 'refund prepared: treasury USDC account -> the account that paid, 120 USDC');
[s, j] = await call(adminApi, 'refund_done', { id: ad.id, signature: 'SIG1' }, { tok }, { sb, rpc: 'x', fetchFn: chain(120) }); ok(s === 202 && AD.status === 'pulled', 'a transaction that is not a refund to the payer is not accepted');
[s, j] = await call(adminApi, 'refund_done', { id: ad.id, signature: 'REFUND1' }, { tok }, { sb, rpc: 'x', fetchFn: chain(120) }); ok(j.confirmed && AD.status === 'refunded' && AD.refund_signature === 'REFUND1', 'refund confirmed on-chain: booking refunded');
[s, j] = await call(adminApi, 'refund_prepare', { id: ad.id }, { tok }, { sb, rpc: 'x', fetchFn: chain(120) }); ok(s === 409, 'cannot refund twice');
