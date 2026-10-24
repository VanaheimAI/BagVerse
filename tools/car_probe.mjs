import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 480, height: 270 } });
await p.goto('http://localhost:4173/?autostart&fixeddt=0.05&q=low');
await p.waitForFunction('window.__ready && window.__frames > 2', null, { timeout: 900000 });
const r = await p.evaluate(async () => {
  const THREE = await import('three').catch(() => null);
  const B = window.__bagverse, ph = B.world.physics, V = B.player.body.pos.constructor;
  const out = [];
  for (const z of [17, 21.5, 25, 27, 29, 31, 33, 35]) for (const x of [-12, -8, -4, 4, 8, 12]) for (const h of [Math.PI / 2, -Math.PI / 2, 0, Math.PI]) {
    const g = ph.groundAt(x, z, 5), o = new V(x, g + 0.6, z), d = new V(Math.sin(h), 0, Math.cos(h));
    const free = ph.raycast(o, d, 80);
    const side = Math.min(ph.raycast(o, new V(Math.cos(h), 0, -Math.sin(h)), 10), ph.raycast(o, new V(-Math.cos(h), 0, Math.sin(h)), 10));
    out.push([x, z, +h.toFixed(2), +g.toFixed(2), Math.round(Math.min(free, 99)), +Math.min(side, 99).toFixed(1)]);
  }
  return { spawn: B.world.spawn.toArray(), out: out.filter((o) => o[4] > 25 && o[5] > 1.6).slice(0, 60) };
});
console.log(JSON.stringify(r.spawn)); for (const o of r.out) console.log(JSON.stringify(o));
await b.close();
