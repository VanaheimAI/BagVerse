// Exports the static map from the running game (high quality assets) to blender/out/bagverse_map.glb.
//   build: FAKE_SUPABASE=1 VITE_SUPABASE_URL=x VITE_SUPABASE_ANON_KEY=y npx vite build --outDir /tmp/dist-fake
//   serve: node tools/wallet_server.mjs /tmp/dist-fake 4175      then: node tools/export_map.mjs
import { chromium } from 'playwright';
import fs from 'node:fs';
const out = process.argv[2] || 'blender/out/bagverse_map.glb';
fs.mkdirSync(out.replace(/\/[^/]+$/, ''), { recursive: true });
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await (await b.newContext({ viewport: { width: 640, height: 360 }, acceptDownloads: true })).newPage();
p.on('pageerror', (e) => console.log('[pageerror]', e.message)); p.on('console', (m) => { if (/GLTFExporter/.test(m.text())) console.log('[exporter]', m.text().slice(0, 160)); });
await p.goto('http://localhost:4175/?autostart&fixeddt=0.1&q=high&nograss', { timeout: 900000, waitUntil: 'commit' });
await p.waitForFunction('window.__ready && window.__frames > 3', null, { timeout: 900000 });
const dl = p.waitForEvent('download', { timeout: 900000 });
await p.evaluate(async () => { const buf = await window.__bagverse.exportMap(); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([buf], { type: 'model/gltf-binary' })); a.download = 'bagverse_map.glb'; document.body.appendChild(a); a.click(); });
await (await dl).saveAs(out);
console.log('saved', out, (fs.statSync(out).size / 1e6).toFixed(1), 'MB');
await b.close();
