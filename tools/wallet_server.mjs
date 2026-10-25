// Test server for the wallet + raffle flows: serves a FAKE_SUPABASE build and runs the real api/* handlers against
// an in-memory admin client (tools/fake-admin.mjs) and a fake DAS / Solana RPC.
// node tools/wallet_server.mjs <distDir> <port>
//   GET  /__fake/t/<table>          rows of a server table (the fake browser client reads through this)
//   POST /__fake/t/<table>          replace a table's rows (tests seed raffles this way)
//   POST /__fake/env               set server env vars (ADMIN_WALLET for the admin page test)
//   POST /__fake/owned              { "<address>": [DAS asset, ...] } what each wallet holds
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import verify from '../api/wallet/verify.js';
import holdings from '../api/wallet/holdings.js';
import enter from '../api/raffle/enter.js';
import draw from '../api/raffle/draw.js';
import adminApi from '../api/admin.js';
import adsApi from '../api/ads.js';
import evmApi from '../api/wallet/evm.js';
import { fakeAdmin } from './fake-admin.mjs';

const [dist = '/tmp/dist-fake', port = 4175] = process.argv.slice(2);
const sb = fakeAdmin(); let owned = {};
const das = async (_u, { body }) => ({ json: async () => ({ result: { items: owned[JSON.parse(body).params.ownerAddress] || [] } }) });
const deps = { sb, holdings: { rpc: 'fake', fetchFn: das }, rpc: '' };
// fake chain for ad payments: POST /__fake/pay { reference, amount, payer } records a USDC payment to the treasury
const { TREASURY, USDC_MINT } = await import('../src/treasury.js');
const pays = new Map();
const payChain = async (_u, { body }) => { const { method, params } = JSON.parse(body); let result = null;
  if (method === 'getSignaturesForAddress') result = pays.has(params[0]) ? [{ signature: 'SIG-' + params[0].slice(0, 8), err: null }] : [];
  if (method === 'getTransaction') { const p = [...pays.values()].find((x) => 'SIG-' + x.reference.slice(0, 8) === params[0]);
    if (p) result = { slot: 1, blockTime: 1, transaction: { message: { accountKeys: [{ pubkey: p.payer }, { pubkey: 'PayerAta1111111111111111111111111111111111' }, { pubkey: 'TreasAta1111111111111111111111111111111111' }] } }, meta: { err: null,
      preTokenBalances: [{ accountIndex: 2, owner: TREASURY, mint: USDC_MINT, uiTokenAmount: { amount: '0' } }, { accountIndex: 1, owner: p.payer, mint: USDC_MINT, uiTokenAmount: { amount: '1000000000' } }],
      postTokenBalances: [{ accountIndex: 2, owner: TREASURY, mint: USDC_MINT, uiTokenAmount: { amount: String(p.amount * 1e6) } }, { accountIndex: 1, owner: p.payer, mint: USDC_MINT, uiTokenAmount: { amount: String(1e9 - p.amount * 1e6) } }] } }; }
  return { json: async () => ({ result }) }; };
const payDeps = { ...deps, rpc: 'fake', fetchFn: payChain };
const routes = { '/api/wallet/verify': verify, '/api/wallet/holdings': holdings, '/api/raffle/enter': enter, '/api/raffle/draw': draw, '/api/admin': adminApi, '/api/ads': adsApi, '/api/wallet/evm': evmApi };
process.env.ADMIN_SECRET ||= 'test-secret';
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.glb': 'model/gltf-binary', '.mp3': 'audio/mpeg', '.woff2': 'font/woff2', '.woff': 'font/woff', '.svg': 'image/svg+xml', '.txt': 'text/plain', '.wasm': 'application/wasm', '.ico': 'image/x-icon' };
const body = (req) => new Promise((r) => { let s = ''; req.on('data', (c) => (s += c)); req.on('end', () => { try { r(JSON.parse(s || '{}')); } catch (_) { r({}); } }); });
http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  if (routes[u.pathname]) { req.body = req.method === 'POST' ? await body(req) : {}; return routes[u.pathname](req, res, /\/api\/(ads|admin)$/.test(u.pathname) ? payDeps : deps); }
  if (u.pathname === '/__fake/pay') { const b = await body(req); pays.set(b.reference, b); return res.end('{}'); }
  if (u.pathname === '/__fake/env') { Object.assign(process.env, await body(req)); return res.end('{}'); }   // tests: e.g. ADMIN_WALLET = the fake wallet's address
  const t = /^\/__fake\/t\/(\w+)(\/delete)?$/.exec(u.pathname);
  if (t) {
    const rows = (sb.db[t[1]] ||= []);
    if (t[2]) { const b = await body(req); for (const r of rows.filter((x) => x.user_id === b.user_id)) rows.splice(rows.indexOf(r), 1); return res.end('{}'); }
    if (req.method === 'POST') { sb.db[t[1]] = await body(req); return res.end('{}'); }
    res.setHeader('content-type', 'application/json'); return res.end(JSON.stringify(rows));
  }
  if (u.pathname === '/__fake/owned') { owned = await body(req); for (const r of sb.db.wallets || []) r.holdings_at = null; return res.end('{}'); }
  let f = path.join(dist, decodeURIComponent(u.pathname)); if (!f.startsWith(dist)) return res.end();
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(dist, 'index.html');
  res.setHeader('content-type', types[path.extname(f)] || 'application/octet-stream'); fs.createReadStream(f).pipe(res);
}).listen(+port, () => console.log('wallet test server on', port));
