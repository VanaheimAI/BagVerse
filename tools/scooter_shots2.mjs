import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 560, height: 420 } });
p.on('pageerror', (e) => console.log('[pageerror]', e.message));
await p.addInitScript(() => { localStorage.setItem('bagverse.char', 'witch'); });
await p.goto('http://localhost:4173/?autostart&fixeddt=0.05&q=medium');
await p.waitForFunction('window.__ready && window.__frames > 3', null, { timeout: 900000 });
const frames = async (n) => { const f0 = await p.evaluate('window.__frames'); await p.waitForFunction(`window.__frames > ${f0 + n}`, null, { timeout: 900000, polling: 500 }); };
await p.evaluate(() => { document.getElementById('hud').style.visibility = 'hidden'; window.__bagverse.player.facing = Math.PI / 2; window.__bagverse.summonScooter(); });
await p.waitForFunction(() => !!window.__bagverse.player.c.actions.Ride, null, { timeout: 900000, polling: 1000 });
const shot = async (name, x, z, h) => {
  await p.evaluate(([x, z, h]) => { const s = window.__bagverse.scooter; const a = s.local(x, z); window.__camOverride = { pos: [a.x, s.pos.y + h, a.z], at: [s.pos.x, s.pos.y + 0.75, s.pos.z] }; }, [x, z, h]);
  await frames(2); await p.screenshot({ path: `/tmp/claude-0/${name}.png`, timeout: 900000 });
};
await frames(3);
await shot('s2_side_stop', 3.0, 0.1, 1.1); await shot('s2_back_stop', 1.2, -3.0, 2.2);
await p.evaluate(() => { window.__camOverride = null; }); await p.keyboard.down('KeyW'); await frames(14);
await shot('s2_side_ride', 3.0, 0.1, 1.1); await frames(5); await shot('s2_side_ride2', 3.0, 0.1, 1.1); await shot('s2_back_ride', 1.2, -3.0, 2.2);
await b.close(); console.log('done');
