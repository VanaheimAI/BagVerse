import { chromium } from 'playwright';
const q = process.argv[2] || 'medium';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await (await b.newContext({ viewport: { width: 1000, height: 560 } })).newPage();
p.on('pageerror', (e) => console.log('[pageerror]', e.message));
await p.goto(`http://localhost:4173/?autostart&fixeddt=0.05&q=${q}&skin=witch`, { timeout: 900000 });
await p.waitForFunction('window.__ready && window.__frames > 3', null, { timeout: 900000 });
const frames = async (n) => { const f0 = await p.evaluate('window.__frames'); await p.waitForFunction(`window.__frames > ${f0 + n}`, null, { timeout: 900000, polling: 300 }); };
// on the road, camera behind, then run sideways for a few frames
await p.evaluate(() => { const B = window.__bagverse, V = B.player.root.position.constructor; B.player.teleport(new V(-2, 0.1, 50)); B.player.facing = Math.PI; B.player.root.rotation.y = Math.PI; B.cam.yaw = 0; B.cam.pitch = 0.08; B.cam.dist = 5; });
await frames(4);
console.log('ao pass:', await p.evaluate(() => !!window.__bagverse.look.passes.ao), 'quality:', await p.evaluate(() => window.__bagverse.quality));
await p.screenshot({ path: `/tmp/claude-0/ghost_${q}_still.png`, timeout: 900000 });
await p.keyboard.down('KeyA'); await frames(5); await p.screenshot({ path: `/tmp/claude-0/ghost_${q}_move.png`, timeout: 900000 }); await p.keyboard.up('KeyA');
await p.evaluate(() => { const L = window.__bagverse.look; if (L.passes.ao) L.passes.ao.enabled = false; }); await frames(3);
await p.screenshot({ path: `/tmp/claude-0/ghost_${q}_noao.png`, timeout: 900000 });
await b.close(); console.log('done');
