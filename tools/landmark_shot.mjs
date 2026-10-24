// GM arch + Doge statue: screenshots from the street and collision checks.  node tools/landmark_shot.mjs [q]
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await (await b.newContext({ viewport: { width: 900, height: 506 } })).newPage();
p.on('pageerror', (e) => console.log('[pageerror]', e.message));
p.on('console', (m) => { if (/landmark|failed|error/i.test(m.text())) console.log('[console]', m.text().slice(0, 200)); });
await p.goto('http://localhost:4173/?autostart&fixeddt=0.1&unlockall&q=' + (process.argv[2] || 'low'));
await p.waitForFunction('window.__ready && window.__frames > 3', null, { timeout: 900000 });
const frames = async (n) => { const f0 = await p.evaluate('window.__frames'); await p.waitForFunction(`window.__frames > ${f0 + n}`, null, { timeout: 900000, polling: 300 }); };
await p.evaluate(() => { document.getElementById('hud').hidden = true; });
// view: stand at (x,z), look toward (tx,tz)
const view = async (tag, x, z, tx, tz, dist = 8, pitch = 0.1) => {
  await p.evaluate(([x, z, tx, tz, dist, pitch]) => { const B = window.__bagverse, V = B.player.root.position.constructor;
    const s = new V(x, B.world.physics.groundAt(x, z, 30) + 0.1, z); B.player.teleport(s);
    const f = Math.atan2(tx - x, tz - z); B.player.facing = f; B.player.root.rotation.y = f; B.cam.yaw = f + Math.PI; B.cam.pitch = pitch; B.cam.dist = dist; }, [x, z, tx, tz, dist, pitch]);
  await frames(5); await p.screenshot({ path: `/tmp/claude-0/lm_${tag}.png`, timeout: 900000 });
};
await view('arch_plaza', 0, 55, 0, 92, 9, 0.05);      // from the plaza side: GM! faces you
await view('arch_out', 6, 130, 0, 92, 9, 0.05);        // from the south
await view('doge', -103, -103, -125, -125, 14, 0.32);
await view('doge_close', -112, -112, -125, -125, 6, 0.2);
// walk south through the arch opening along x = 0, then try the plinth at x = 10
const walk = (x0, z0, vx, vz, n = 200) => p.evaluate(([x0, z0, vx, vz, n]) => { const B = window.__bagverse, V = B.player.root.position.constructor;
  B.player.teleport(new V(x0, B.world.physics.groundAt(x0, z0, 5) + 0.1, z0));
  for (let i = 0; i < n; i++) { B.player.body.vel.x = vx; B.player.body.vel.z = vz; for (let k = 0; k < 4; k++) B.world.physics.step(B.player.body, 0.025 / 4); }
  return B.player.body.pos.toArray().map((v) => +v.toFixed(2)); }, [x0, z0, vx, vz, n]);
console.log('through the arch (x=0, z 80 -> ~105):', JSON.stringify(await walk(0, 80, 0, 5)));
console.log('into the right plinth (x=10):', JSON.stringify(await walk(10, 80, 0, 5)));
console.log('into the statue from the basin edge:', JSON.stringify(await walk(-112, -112, -4, -4)));
await b.close(); console.log('done');
