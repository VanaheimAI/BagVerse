import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await (await b.newContext({ viewport: { width: 800, height: 450 } })).newPage();
p.on('pageerror', (e) => console.log('[pageerror]', e.message));
p.on('console', (m) => { if (/standing|bag model|error|failed/i.test(m.text())) console.log('[console]', m.text().slice(0, 200)); });
await p.goto('http://localhost:4173/?autostart&fixeddt=0.1&q=' + (process.argv[2] || 'low'));
await p.waitForFunction('window.__ready && window.__frames > 3', null, { timeout: 900000 });
const frames = async (n) => { const f0 = await p.evaluate('window.__frames'); await p.waitForFunction(`window.__frames > ${f0 + n}`, null, { timeout: 900000, polling: 300 }); };
console.log(await p.evaluate(() => { const W = window.__bagverse.world; return W.billboards.filter((b) => b.userData.tier === 'totem').map((b) => b.name + ' c=' + b.userData.center.toArray().map((v) => v.toFixed(2)) + ' n=' + b.userData.normal.toArray().map((v) => v.toFixed(2))).join(' | '); }));
for (const [tag, x, z, tx, tz] of [['a', -16.5, 16.0, -21.2, 21.2], ['g1', 0, 26, 0, 45.6], ['g2', 30, 3, 45.6, 0], ['g3', 0, 62, 0, 45.6]]) {
  await p.evaluate(([x, z, tx, tz]) => { const B = window.__bagverse, V = B.player.body.pos.constructor; B.player.teleport(new V(x, B.world.physics.groundAt(x, z, 5) + 0.1, z)); B.player.facing = Math.atan2(tx - x, tz - z); B.player.root.rotation.y = B.player.facing; B.cam.yaw = B.player.facing + Math.PI; B.cam.pitch = 0.15; }, [x, z, tx, tz]);
  await frames(5); await p.screenshot({ path: `/tmp/claude-0/st_${tag}.png`, timeout: 900000 });
}
await b.close(); console.log('done');
