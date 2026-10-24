// Test server for the wallet flow: serves a FAKE_SUPABASE build and runs the real api/wallet/* handlers against an
// in-memory `wallets` table and a fake DAS RPC (TEST_OWNED='{"<address>":[asset,...]}' or POST /__fake/owned).
// node tools/wallet_server.mjs <distDir> <port>
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import verify from '../api/wallet/verify.js';
import holdings from '../api/wallet/holdings.js';

const [dist = '/tmp/dist-fake', port = 4175] = process.argv.slice(2);
const rows = []; let owned = {};
const sb = {
  auth: { getUser: async (t) => (t.startsWith('tok-') ? { data: { user: { id: t.slice(4) } }, error: null } : { data: null, error: { message: 'bad jwt' } }) },
  from: () => {
    const f = []; let op = 'select', val = null;
    const match = () => rows.filter((r) => f.every(([k, v, neq]) => (neq ? r[k] !== v : r[k] === v)));
    const q = { select: () => q, eq: (k, v) => (f.push([k, v]), q), neq: (k, v) => (f.push([k, v, 1]), q),
      maybeSingle: async () => ({ data: match()[0] || null }), delete: () => ((op = 'delete'), q), update: (v) => ((op = 'update'), (val = v), q),
      upsert: async (row) => { const i = rows.findIndex((r) => r.user_id === row.user_id); i < 0 ? rows.push({ skins: [], ...row }) : Object.assign(rows[i], row); return { error: null }; },
      then: (ok) => { if (op === 'delete') for (const r of match()) rows.splice(rows.indexOf(r), 1); if (op === 'update') for (const r of match()) Object.assign(r, val); return Promise.resolve({ error: null }).then(ok); } };
    return q;
  },
};
const das = async (_u, { body }) => ({ json: async () => ({ result: { items: owned[JSON.parse(body).params.ownerAddress] || [] } }) });
const deps = { sb, holdings: { rpc: 'fake', fetchFn: das } };
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.glb': 'model/gltf-binary', '.mp3': 'audio/mpeg', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.ktx2': 'image/ktx2', '.txt': 'text/plain', '.wasm': 'application/wasm', '.mp4': 'video/mp4', '.webm': 'video/webm', '.ico': 'image/x-icon' };
const body = (req) => new Promise((r) => { let s = ''; req.on('data', (c) => (s += c)); req.on('end', () => { try { r(JSON.parse(s || '{}')); } catch (_) { r({}); } }); });
http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/api/wallet/verify') { req.body = await body(req); return verify(req, res, deps); }
  if (u.pathname === '/api/wallet/holdings') { req.body = await body(req); return holdings(req, res, deps); }
  if (u.pathname === '/__fake/wallets') { res.setHeader('content-type', 'application/json'); return res.end(JSON.stringify(rows)); }
  if (u.pathname === '/__fake/wallets/delete') { const b = await body(req); for (const r of rows.filter((x) => x.user_id === b.user_id)) rows.splice(rows.indexOf(r), 1); return res.end('{}'); }
  if (u.pathname === '/__fake/owned') { owned = await body(req); for (const r of rows) r.holdings_at = null; return res.end('{}'); }
  let f = path.join(dist, decodeURIComponent(u.pathname)); if (!f.startsWith(dist)) return res.end();
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(dist, 'index.html');
  res.setHeader('content-type', types[path.extname(f)] || 'application/octet-stream'); fs.createReadStream(f).pipe(res);
}).listen(+port, () => console.log('wallet test server on', port));
