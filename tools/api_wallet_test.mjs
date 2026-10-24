// Unit test for api/wallet/*: real Ed25519 keys, a fake Supabase admin client and a fake DAS RPC.
import crypto from 'node:crypto';
import verify from '../api/wallet/verify.js';
import holdings from '../api/wallet/holdings.js';
import { b58decode, checkLink } from '../api/_lib/wallet.js';
import { skinsFromAssets } from '../src/nft-gates.js';

const A = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const b58 = (bytes) => { let z = 0; while (z < bytes.length && !bytes[z]) z++; const d = []; for (const x of bytes) { let c = x; for (let i = 0; i < d.length; i++) { c += d[i] * 256; d[i] = c % 58; c = (c / 58) | 0; } while (c) { d.push(c % 58); c = (c / 58) | 0; } } return '1'.repeat(z) + d.reverse().map((x) => A[x]).join(''); };
const keypair = () => { const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519'); const raw = publicKey.export({ format: 'der', type: 'spki' }).subarray(12); return { address: b58(raw), sign: (m) => b58(crypto.sign(null, Buffer.from(m), privateKey)) }; };
const siws = ({ host, address, uid, nonce = b58(crypto.randomBytes(9)), at = new Date().toISOString() }) =>
  `${host} wants you to sign in with your Solana account:\n${address}\n\nLink this wallet to BagVerse player Ada. Signing is free and sends no transaction.\n\nURI: https://${host}\nVersion: 1\nChain ID: mainnet\nNonce: ${nonce}\nIssued At: ${at}\nRequest ID: ${uid}`;

// fake supabase admin: one table, tokens map to users
const rows = [];
const sb = {
  auth: { getUser: async (t) => (t.startsWith('tok-') ? { data: { user: { id: t.slice(4) } }, error: null } : { data: null, error: { message: 'bad jwt' } }) },
  from: () => {
    const f = []; let op = 'select', val = null;
    const match = () => rows.filter((r) => f.every(([k, v, neq]) => (neq ? r[k] !== v : r[k] === v)));
    const q = {
      select: () => q, eq: (k, v) => (f.push([k, v]), q), neq: (k, v) => (f.push([k, v, 1]), q),
      maybeSingle: async () => ({ data: match()[0] || null }),
      delete: () => ((op = 'delete'), q), update: (v) => ((op = 'update'), (val = v), q),
      upsert: async (row) => { if (rows.some((r) => r.address === row.address && r.user_id !== row.user_id)) return { error: { message: 'duplicate address' } }; const i = rows.findIndex((r) => r.user_id === row.user_id); i < 0 ? rows.push({ skins: [], ...row }) : Object.assign(rows[i], row); return { error: null }; },
      then: (ok) => { if (op === 'delete') for (const r of match()) rows.splice(rows.indexOf(r), 1); if (op === 'update') for (const r of match()) Object.assign(r, val); return Promise.resolve({ error: null }).then(ok); },
    };
    return q;
  },
};
const GATES = [{ skin: 'kaizokuguy', collection: 'COLL1' }, { skin: 'pepe', creator: 'CREATOR1' }, { skin: 'santa', mint: 'BAGMINT', min: 1000 }];
const das = (owned) => async (_url, { body }) => { const p = JSON.parse(body).params; return { json: async () => ({ result: { items: owned[p.ownerAddress] || [] } }) }; };
const call = async (fn, { tok, body, host = 'bag-verse-ten.vercel.app', method = 'POST' }, deps) => {
  let status = 0, out = '';
  const res = { setHeader() {}, set statusCode(s) { status = s; }, end: (s) => (out = s) };
  await fn({ method, headers: { host, authorization: tok ? 'Bearer ' + tok : '' }, body }, res, { sb, ...deps });
  return [status, JSON.parse(out)];
};
const ok = (c, m) => console.log((c ? 'PASS ' : 'FAIL ') + m);

const host = 'bag-verse-ten.vercel.app', alice = keypair(), bob = keypair();
const owned = { [alice.address]: [{ id: 'nft1', grouping: [{ group_key: 'collection', group_value: 'COLL1' }] }, { id: 'BAGMINT', token_info: { balance: 2500_000000, decimals: 6 } }] };
const H = { holdings: { rpc: 'x', fetchFn: das(owned), gates: GATES } };

ok(b58decode(alice.address).length === 32, 'b58 roundtrip length');
ok(JSON.stringify(skinsFromAssets([{ creators: [{ address: 'CREATOR1', verified: false }] }], GATES)) === '[]', 'unverified creator does not count');
ok(JSON.stringify(skinsFromAssets([{ id: 'BAGMINT', token_info: { balance: 999e6, decimals: 6 } }], GATES)) === '[]', 'token below min does not count');

let m = siws({ host, address: alice.address, uid: 'u1' });
let [s, j] = await call(verify, { tok: 'tok-u1', body: { address: alice.address, message: m, signature: alice.sign(m) } }, H);
ok(s === 200 && j.verified && JSON.stringify(j.skins.sort()) === '["kaizokuguy","santa"]', `alice verifies, skins ${JSON.stringify(j.skins)}`);
[s, j] = await call(verify, { tok: 'tok-u1', body: { address: alice.address, message: m, signature: alice.sign(m) } }, H);
ok(s === 409, 'replay of the same sign-in refused: ' + j.error);
[s, j] = await call(verify, { tok: 'tok-u2', body: { address: alice.address, message: m, signature: alice.sign(m) } }, H);
ok(s === 400, 'copied signature for another player refused: ' + j.error);
m = siws({ host: 'evil.example', address: alice.address, uid: 'u2' });
[s, j] = await call(verify, { tok: 'tok-u2', body: { address: alice.address, message: m, signature: alice.sign(m) } }, H);
ok(s === 400, 'signature made for another site refused: ' + j.error);
m = siws({ host, address: alice.address, uid: 'u2' });
[s, j] = await call(verify, { tok: 'tok-u2', body: { address: alice.address, message: m, signature: bob.sign(m) } }, H);
ok(s === 401, "someone else's key refused: " + j.error);
m = siws({ host, address: alice.address, uid: 'u2', at: new Date(Date.now() - 11 * 60e3).toISOString() });
[s, j] = await call(verify, { tok: 'tok-u2', body: { address: alice.address, message: m, signature: alice.sign(m) } }, H);
ok(s === 400, 'old sign-in refused: ' + j.error);
[s, j] = await call(verify, { tok: 'nope', body: {} }, H); ok(s === 401, 'no session refused');
[s, j] = await call(verify, { tok: 'tok-u1', body: {} }, { sb: null, ...H }).catch(() => [0]); 
// the wallet moves when its owner verifies from a second account
m = siws({ host, address: alice.address, uid: 'u3' });
[s, j] = await call(verify, { tok: 'tok-u3', body: { address: alice.address, message: m, signature: alice.sign(m) } }, H);
ok(s === 200 && rows.length === 1 && rows[0].user_id === 'u3', 'same wallet from a new device moves to it (rows: ' + rows.map((r) => r.user_id) + ')');
// switching to a wallet with nothing clears the skins (also when the RPC is down)
m = siws({ host, address: bob.address, uid: 'u3' });
[s, j] = await call(verify, { tok: 'tok-u3', body: { address: bob.address, message: m, signature: bob.sign(m) } }, { holdings: { rpc: '', gates: GATES } });
ok(s === 200 && j.holdings === 'unavailable' && rows.find((r) => r.user_id === 'u3').skins.length === 0, 'new wallet with RPC down: old skins dropped');
// holdings: cached within a minute, refreshed after
rows.find((r) => r.user_id === 'u3').holdings_at = new Date(Date.now() - 120e3).toISOString();
owned[bob.address] = [{ id: 'n2', creators: [{ address: 'CREATOR1', verified: true }] }];
[s, j] = await call(holdings, { tok: 'tok-u3' }, H);
ok(s === 200 && JSON.stringify(j.skins) === '["pepe"]', 'holdings refresh finds a newly bought NFT: ' + JSON.stringify(j));
[s, j] = await call(holdings, { tok: 'tok-u3' }, H); ok(j.cached === true, 'second refresh within a minute is cached');
[s, j] = await call(holdings, { tok: 'tok-u9' }, H); ok(s === 404, 'no wallet -> 404');
// checkLink directly: message must name the same address as the request
ok(!checkLink({ address: bob.address, message: siws({ host, address: alice.address, uid: 'u1' }), signature: 'x' }, { host, uid: 'u1' }).ok, 'address mismatch refused');
