import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 320, height: 180 } });
await p.goto('http://localhost:4173/?autostart&fixeddt=0.05&q=low');
await p.waitForFunction('window.__ready && window.__frames > 2', null, { timeout: 900000 });
console.log(await p.evaluate(() => {
  const B = window.__bagverse, c = B.car, ph = B.world.physics, V = c.pos.constructor;
  const o = c.pos.clone(); o.y += 0.6;
  const rays = [-0.9, 0, 0.9].map((x) => { const t = c.local(x, 2.45); t.y = o.y; const d = t.clone().sub(o); const len = d.length(); return [x, +len.toFixed(2), +ph.raycast(o, d.normalize(), 20).toFixed(2), t.toArray().map((v) => +v.toFixed(2))]; });
  return JSON.stringify({ pos: c.pos.toArray(), h: c.h, blocked: c.blocked(0.2), axle: c.axleGround(), rays, fwd: ph.raycast(o, new V(0, 0, 1), 50) });
}));
await b.close();
