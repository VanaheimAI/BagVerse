// ghosting repro: the old slow-device fallback froze the shadow map (stale character shadows = "ghosts");
// the fix shrinks shadow maps instead and keeps them live
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await (await b.newContext({ viewport: { width: 1000, height: 560 } })).newPage();
p.on('pageerror', (e) => console.log('[pageerror]', e.message));
await p.goto('http://localhost:4173/?autostart&fixeddt=0.05&q=medium', { timeout: 900000 });
await p.waitForFunction('window.__ready && window.__frames > 3', null, { timeout: 900000 });
const frames = async (n) => { const f0 = await p.evaluate('window.__frames'); await p.waitForFunction(`window.__frames > ${f0 + n}`, null, { timeout: 900000, polling: 300 }); };
const place = () => p.evaluate(() => { const B = window.__bagverse, V = B.player.root.position.constructor; B.player.teleport(new V(-2, 0.1, 50)); B.player.facing = Math.PI / 2; B.player.root.rotation.y = Math.PI / 2; B.cam.yaw = Math.PI; B.cam.pitch = 0.25; B.cam.dist = 7; });
const slide = () => p.evaluate(() => { const B = window.__bagverse, P = B.player.body.pos; B.player.teleport(P.clone().setX(P.x + 4)); });
// 1) old behaviour: frozen shadow map, then move -> the old shadow stays behind
await place(); await frames(3);
await p.evaluate(() => { const r = window.__bagverse.renderer; r.shadowMap.autoUpdate = false; r.shadowMap.needsUpdate = true; }); await frames(2);
await slide(); await frames(3); await p.screenshot({ path: '/tmp/claude-0/ghost_old.png', timeout: 900000 });
// 2) fix: shrink + keep live, then move
await p.evaluate(() => window.__bagverse.look.shrinkShadows(1024)); await place(); await frames(3);
await slide(); await frames(3); await p.screenshot({ path: '/tmp/claude-0/ghost_fixed.png', timeout: 900000 });
console.log('shadow autoUpdate after fix:', await p.evaluate(() => window.__bagverse.renderer.shadowMap.autoUpdate), 'map sizes:', await p.evaluate(() => { const L = window.__bagverse.look; return (L.csm ? L.csm.lights : [L.sun]).map((l) => l.shadow.mapSize.x).join(','); }));
await b.close(); console.log('done');
