import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await (await b.newContext({ viewport: { width: 640, height: 360 } })).newPage();
await p.goto('http://localhost:4173/?autostart&fixeddt=0.1&q=low&unlockall');
await p.waitForFunction('window.__ready && window.__frames > 3', null, { timeout: 900000 });
console.log(await p.evaluate(() => JSON.stringify(window.__bagverse.world.zones.map((z) => [z.id, +z.pos.x.toFixed(0), +z.pos.z.toFixed(0), z.radius]))));
console.log(await p.evaluate(() => { const ph = window.__bagverse.world.physics; const t = performance.now(); const V = window.__bagverse.player.body.pos.constructor; const o = new V(), d = new V(1, 0, 0); let n = 0; for (let x = -150; x < 150; x += 3) for (let z = -150; z < 150; z += 3) { ph.groundAt(x, z, 4); o.set(x, 1, z); ph.raycast(o, d, 1.1); n++; } return n + ' samples ' + (performance.now() - t).toFixed(0) + ' ms'; }));
// ascii walkability map, 4 m cells
console.log(await p.evaluate(() => { const ph = window.__bagverse.world.physics; const V = window.__bagverse.player.body.pos.constructor; const o = new V(), up = new V(0, 1, 0), d = new V(); let out = '';
  for (let z = -160; z <= 160; z += 5) { let row = ''; for (let x = -160; x <= 160; x += 5) { const g = ph.groundAt(x, z, 4); let c = '.'; if (!(g > -1 && g < 1.5)) c = g >= 1.5 ? '^' : ' '; else { o.set(x, g + 0.6, z); if (ph.raycast(o, up, 25) < 25) c = '#'; else { for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2; d.set(Math.cos(a), 0, Math.sin(a)); if (ph.raycast(o, d, 1.1) < 1.1) { c = 'x'; break; } } } } row += c; } out += row + '\n'; } return out; }));
await b.close();
