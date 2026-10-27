// Same views at each quality tier and time of day, for before/after comparisons of rendering changes.
//   node tools/render_compare.mjs <outDir> [tiers=low,medium,high] [looks=day,night]
import { chromium } from 'playwright';
const out = process.argv[2] || '/tmp/rq', tiers = (process.argv[3] || 'low,medium,high').split(','), looks = (process.argv[4] || 'day,night').split(',');
const ONLY = process.env.VIEW; const VIEWS0 = {
  plaza: { pos: [0, 0, 26], yaw: 0, pitch: 0.18, dist: 11 },
  kanto: { pos: [92, 0, 116], yaw: 2.46, pitch: 0.1, dist: 9 },
};
const VIEWS = ONLY ? { [ONLY]: VIEWS0[ONLY] } : VIEWS0;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
for (const q of tiers) for (const look of looks) {
  const p = await (await b.newContext({ viewport: { width: 1280, height: 720 } })).newPage(); p.on('pageerror', (e) => console.log('[pageerror]', q, look, e.message));
  await p.goto(`http://localhost:4175/?autostart&fixeddt=0.1&q=${q}&look=${look}${process.env.EXTRA || ''}`, { timeout: 900000, waitUntil: 'commit' });
  await p.waitForFunction('window.__ready && window.__frames > 3', null, { timeout: 900000 });
  const frames = async (n) => { const f0 = await p.evaluate('window.__frames'); await p.waitForFunction(`window.__frames > ${f0 + n}`, null, { timeout: 900000, polling: 200 }); };
  for (const [name, v] of Object.entries(VIEWS)) {
    await p.evaluate((v) => { document.getElementById('hud').hidden = true; const B = window.__bagverse, V = B.player.root.position.constructor; const s = new V(v.pos[0], 0, v.pos[2]); s.y = B.world.physics.groundAt(s.x, s.z, 8) + 0.1; B.player.teleport(s);
      B.player.facing = v.yaw; B.player.root.rotation.y = v.yaw; B.cam.yaw = v.yaw + Math.PI; B.cam.pitch = v.pitch; B.cam.dist = v.dist; }, v);
    await frames(10); await p.screenshot({ path: `${out}/${name}_${q}_${look}${process.env.TAG || ''}.png`, timeout: 600000 });
  }
  await p.close(); console.log('done', q, look);
}
await b.close();
