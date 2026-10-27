// WebGPU build (/webgpu.html): loads on a real WebGPU device (SwiftShader here), reports the backend and any
// errors, and screenshots views at a tier / look:  node tools/webgpu_test.mjs [q=medium] [look=day] [extra=]
import { chromium } from 'playwright';
const q = process.argv[2] || 'medium', look = process.argv[3] || 'day', extra = process.argv[4] || '';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', headless: false,
  args: ['--headless=new', '--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-vulkan=swiftshader', '--use-angle=swiftshader', '--use-gl=angle', '--ignore-gpu-blocklist'] });
const p = await (await b.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
const errs = new Map(); const note = (k) => errs.set(k, (errs.get(k) || 0) + 1);
p.on('pageerror', (e) => note('[pageerror] ' + e.message.slice(0, 300)));
p.on('console', (m) => { const t = m.text(); if (m.type() === 'error' || /warn/.test(m.type()) && /WebGPU|TSL|Node|shader|WGSL|GPU/i.test(t)) note(`[${m.type()}] ` + t.slice(0, 300)); if (/^graphics:/.test(t)) console.log(t); });
await p.goto(`http://localhost:4175/webgpu.html?autostart&fixeddt=0.1&q=${q}&look=${look}${extra}`, { timeout: 900000, waitUntil: 'commit' });
await p.waitForFunction('window.__ready && window.__frames > 3', null, { timeout: 900000 }).catch((e) => console.log('NOT READY', e.message.slice(0, 100)));
console.log('backend:', await p.evaluate(() => window.__bagverse?.GFX));
const frames = async (n) => { const f0 = await p.evaluate('window.__frames'); await p.waitForFunction(`window.__frames > ${f0 + n}`, null, { timeout: 900000, polling: 200 }); };
await p.evaluate(() => { document.getElementById('hud').hidden = true; const B = window.__bagverse, V = B.player.root.position.constructor; const s = new V(0, 0, 26); s.y = B.world.physics.groundAt(s.x, s.z, 8) + 0.1; B.player.teleport(s); B.player.facing = 0; B.player.root.rotation.y = 0; B.cam.yaw = Math.PI; B.cam.pitch = 0.18; B.cam.dist = 11; }).catch((e) => console.log('pose', e.message));
await frames(8).catch(() => {});
await p.screenshot({ path: `/tmp/claude-0/rq/plaza_${q}_${look}_webgpu${extra.replace(/[^a-z0-9]/gi, '')}.png`, timeout: 600000 });
for (const [k, n] of errs) console.log(n + 'x', k);
await b.close(); console.log('done');
