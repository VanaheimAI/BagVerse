import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await (await b.newContext({ viewport: { width: 800, height: 450 } })).newPage();
p.on('pageerror', (e) => console.log('[pageerror]', e.message));
p.on('console', (m) => { if (/bag model|error/i.test(m.text())) console.log('[console]', m.text().slice(0, 200)); });
await p.goto('http://localhost:4173/?autostart&fixeddt=0.1&q=low&unlockall');
await p.waitForFunction('window.__ready && window.__frames > 3', null, { timeout: 900000 });
const frames = async (n) => { const f0 = await p.evaluate('window.__frames'); await p.waitForFunction(`window.__frames > ${f0 + n}`, null, { timeout: 900000, polling: 300 }); };
console.log(await p.evaluate(() => { const c = window.__bagverse.collect; return 'world bag mat map=' + !!c.mesh.material.map + ' tris=' + c.mesh.geometry.index.count / 3; }));
// stand 3 m from a world bag, facing it
await p.evaluate(() => { const B = window.__bagverse, bag = B.collect.nearestBag(B.player.body.pos); const s = bag.pos.clone(); s.x += 3; B.player.teleport(s.setY(s.y + 0.1)); B.player.facing = -Math.PI / 2; B.player.root.rotation.y = B.player.facing; B.cam.yaw = Math.PI / 2; });
await frames(4); await p.screenshot({ path: '/tmp/claude-0/bm_world.png', timeout: 900000 });
await p.evaluate(() => { window.__bagverse.bagRun.forcePlan = 'square'; window.__bagverse.startBagRun(); });
await frames(4); await p.screenshot({ path: '/tmp/claude-0/bm_run.png', timeout: 900000 });
await b.close(); console.log('done');
