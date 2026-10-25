// Unit test for Polygon wallet linking (api/wallet/evm), Polygon raffle prizes in /api/admin, and Polygon gates.
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import { fakeAdmin } from './fake-admin.mjs';
import evm from '../api/wallet/evm.js';
import { skinsFromAssets } from '../src/nft-gates.js';
import { prizeChain, prizeIssuer, ISSUERS } from '../src/chains.js';
process.env.ADMIN_SECRET = 's'; 
const ok = (c, m) => console.log((c ? 'PASS ' : 'FAIL ') + m);
const host = 'bag-verse-ten.vercel.app', sb = fakeAdmin();
const call = async (fn, body, tok, deps = {}) => { let status = 0, out = '';
  await fn({ method: 'POST', url: '/api/x', headers: { host, authorization: tok ? 'Bearer ' + tok : '' }, body }, { setHeader() {}, set statusCode(s) { status = s; }, end: (s) => (out = s) }, { sb, rpcUrl: '', ...deps });
  return [status, JSON.parse(out)]; };
const siwe = (address, uid, { chain = 137, domain = host, at = new Date().toISOString(), nonce = Math.random().toString(36).slice(2) } = {}) =>
  `${domain} wants you to sign in with your Ethereum account:\n${address}\n\nLink this Polygon wallet to BagVerse player Ada to receive raffle prizes. Signing is free and sends no transaction.\n\nURI: https://${domain}\nVersion: 1\nChain ID: ${chain}\nNonce: ${nonce}\nIssued At: ${at}\nRequest ID: ${uid}`;
const alice = privateKeyToAccount(generatePrivateKey()), bob = privateKeyToAccount(generatePrivateKey());
let m = siwe(alice.address, 'u1');
let [s, j] = await call(evm, { address: alice.address, message: m, signature: await alice.signMessage({ message: m }) }, 'tok-u1');
ok(s === 200 && j.address === alice.address && sb.db.linked_wallets[0].chain === 'polygon', 'Polygon wallet linked: ' + j.address);
[s, j] = await call(evm, { address: alice.address, message: m, signature: await alice.signMessage({ message: m }) }, 'tok-u1'); ok(s === 409, 'replay refused');
m = siwe(alice.address, 'u1', { chain: 1 }); [s, j] = await call(evm, { address: alice.address, message: m, signature: await alice.signMessage({ message: m }) }, 'tok-u1'); ok(s === 400, 'wrong chain refused: ' + j.error);
m = siwe(alice.address, 'u1', { domain: 'evil.example' }); [s, j] = await call(evm, { address: alice.address, message: m, signature: await alice.signMessage({ message: m }) }, 'tok-u1'); ok(s === 400, 'other site refused');
m = siwe(alice.address, 'u2'); [s, j] = await call(evm, { address: alice.address, message: m, signature: await alice.signMessage({ message: m }) }, 'tok-u1'); ok(s === 400, 'signed for another player refused');
m = siwe(alice.address, 'u1'); [s, j] = await call(evm, { address: alice.address, message: m, signature: await bob.signMessage({ message: m }) }, 'tok-u1'); ok(s === 401, "someone else's key refused");
m = siwe(alice.address, 'u1', { at: new Date(Date.now() - 11 * 60e3).toISOString() }); [s, j] = await call(evm, { address: alice.address, message: m, signature: await alice.signMessage({ message: m }) }, 'tok-u1'); ok(s === 400, 'old sign-in refused');
[s, j] = await call(evm, { address: alice.address, message: m, signature: '0x' }, ''); ok(s === 401, 'not signed in');
m = siwe(alice.address, 'u3'); [s, j] = await call(evm, { address: alice.address, message: m, signature: await alice.signMessage({ message: m }) }, 'tok-u3');
ok(s === 200 && sb.db.linked_wallets.length === 1 && sb.db.linked_wallets[0].user_id === 'u3', 'same wallet from another account moves there');
ok(!sb.db.wallets?.length, 'the Solana wallets table is not touched');
// gates
const G = [{ skin: 'pepe', chain: 'polygon', contract: ISSUERS.courtyard.contract }, { skin: 'santa', collection: 'COLL' }];
ok(JSON.stringify(skinsFromAssets([{ chain: 'polygon', contract: ISSUERS.courtyard.contract.toUpperCase().replace('0X', '0x') }], G)) === '["pepe"]', 'a Courtyard NFT unlocks a Polygon-gated skin (address case ignored)');
ok(JSON.stringify(skinsFromAssets([{ grouping: [{ group_key: 'collection', group_value: 'COLL' }] }], G)) === '["santa"]', 'Solana gates work as before');
ok(prizeChain({ mint: 'x' }) === 'solana' && prizeChain({}) === 'solana' && prizeChain({ chain: 'polygon' }) === 'polygon' && prizeIssuer({ chain: 'polygon' }).name === 'Courtyard' && prizeIssuer({ mint: 'x' }).name === 'Collector Crypt', 'old prizes are Solana; Polygon prizes are Courtyard');
// admin: polygon prize + winner polygon wallet
const crypto = await import('node:crypto'); const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
const A = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'; const b58 = (bytes) => { let z = 0; while (z < bytes.length && !bytes[z]) z++; const d = []; for (const x of bytes) { let c = x; for (let i = 0; i < d.length; i++) { c += d[i] * 256; d[i] = c % 58; c = (c / 58) | 0; } while (c) { d.push(c % 58); c = (c / 58) | 0; } } return '1'.repeat(z) + d.reverse().map((x) => A[x]).join(''); };
const adminAddr = b58(publicKey.export({ format: 'der', type: 'spki' }).subarray(12)); process.env.ADMIN_WALLET = adminAddr;
const { default: adminApi } = await import('../api/admin.js');
const am = `BagVerse admin sign-in\nDomain: ${host}\nWallet: ${adminAddr}\nIssued At: ${new Date().toISOString()}\nNonce: n`;
const [, lj] = await call(adminApi, { op: 'login', address: adminAddr, message: am, signature: b58(crypto.sign(null, Buffer.from(am), privateKey)) }, ''); const tok = lj.token;
const adm = (op, body) => { let status = 0, out = ''; return adminApi({ method: 'POST', url: '/api/admin?op=' + op, headers: { host, authorization: 'Bearer ' + tok }, body }, { setHeader() {}, set statusCode(x) { status = x; }, end: (x) => (out = x) }, { sb }).then(() => [status, JSON.parse(out)]); };
const when = new Date(Date.now() + 86400e3).toISOString();
[s, j] = await adm('save_raffle', { vault: 'kanto', prize: { name: 'Charizard', chain: 'polygon', contract: 'nope' }, draws_at: when }); ok(s === 400, 'bad Polygon contract refused');
[s, j] = await adm('save_raffle', { vault: 'kanto', prize: { name: 'Charizard', grader: 'PSA', grade: '10', chain: 'polygon', contract: ISSUERS.courtyard.contract, token_id: '58251309559212678585', mint: 'stray' }, draws_at: when });
const R = sb.db.raffles[0]; ok(s === 200 && R.prize.chain === 'polygon' && R.prize.issuer === 'courtyard' && !R.prize.mint && R.prize.token_id === '58251309559212678585', 'Courtyard prize saved (contract + token id, no Solana mint)');
[s, j] = await adm('save_raffle', { vault: 'wano', prize: { name: 'Luffy', mint: 'inuRT', contract: '0xabc' }, draws_at: when }); ok(sb.db.raffles[1].prize.chain === 'solana' && sb.db.raffles[1].prize.issuer === 'collector_crypt' && !sb.db.raffles[1].prize.contract, 'Collector Crypt prize stays Solana');
sb.db.raffle_entries = [{ raffle_id: R.id, user_id: 'u3', address: 'SOL3', name: 'Ada', created_at: new Date().toISOString() }, { raffle_id: R.id, user_id: 'u4', address: 'SOL4', name: 'Bob', created_at: new Date().toISOString() }];
[s, j] = await adm('entries', { raffle_id: R.id }); ok(j.entries.find((e) => e.user_id === 'u3').polygon === alice.address && j.entries.find((e) => e.user_id === 'u4').polygon === null, 'entries show who has a Polygon wallet (winner only needs one)');
[s, j] = await adm('players', {}); ok(j.players.find((p) => p.id === 'u3')?.polygon === alice.address, 'players list shows the Polygon wallet');
