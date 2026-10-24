import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 320, height: 180 } });
await p.goto('http://localhost:4173/?autostart&fixeddt=0.05&q=low');
await p.waitForFunction('window.__ready && window.__frames > 2', null, { timeout: 900000 });
console.log(await p.evaluate(() => {
  const B = window.__bagverse, c = B.car, ph = B.world.physics;
  const save = [c.pos.clone(), c.h], out = [];
  for (const [x, z] of [[-4, 26], [-6, 26], [4, 26], [6, 26], [-6, 28], [6, 28], [-8, 27], [8, 27], [-3, 25], [3, 25]]) for (const h of [0, Math.PI / 2, -Math.PI / 2]) {
    c.pos.set(x, ph.groundAt(x, z, 5), z); c.h = h;
    let run = 0; while (run < 40 && !c.blocked(0.5)) { const f = c.forward; c.pos.x += f.x * 0.5; c.pos.z += f.z * 0.5; c.pos.y = ph.groundAt(c.pos.x, c.pos.z, c.pos.y + 1.6); run += 0.5; }
    c.pos.set(x, ph.groundAt(x, z, 5), z);
    out.push(`${x},${z},h=${h.toFixed(2)} clear=${run} g=${c.pos.y.toFixed(2)} side=${Math.min(ph.raycast(c.pos.clone().setY(c.pos.y + .6), new c.pos.constructor(Math.cos(h), 0, -Math.sin(h)), 9), ph.raycast(c.pos.clone().setY(c.pos.y + .6), new c.pos.constructor(-Math.cos(h), 0, Math.sin(h)), 9)).toFixed(1)}`);
  }
  c.pos.copy(save[0]); c.h = save[1];
  return out.join('\n');
}));
await b.close();
