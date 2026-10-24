import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 720, height: 540 } });
p.on('pageerror', (e) => console.log('[pageerror]', e.message));
await p.addInitScript((ch) => { localStorage.setItem('bagverse.char', ch); }, process.env.CH || 'goldenking');
await p.goto('http://localhost:4173/?autostart&fixeddt=0.05&q=low');
await p.waitForFunction('window.__ready && window.__frames > 3', null, { timeout: 900000 });
const frames = async (n) => { const f0 = await p.evaluate('window.__frames'); await p.waitForFunction(`window.__frames > ${f0 + n}`, null, { timeout: 900000, polling: 500 }); };
await p.evaluate(() => { document.getElementById('hud').style.visibility = 'hidden'; window.__bagverse.player.facing = Math.PI / 2; window.__bagverse.summonScooter(); });
await p.waitForFunction(() => !!window.__bagverse.player.c.actions.Ride, null, { timeout: 900000, polling: 1000 });
const shot = async (name, ang, dist = 3.0, h = 1.0) => {
  await p.evaluate(([ang, dist, h]) => { const B = window.__bagverse, s = B.scooter; const a = s.local(Math.sin(ang) * dist, Math.cos(ang) * dist); window.__camOverride = { pos: [a.x, s.pos.y + h, a.z], at: [s.pos.x, s.pos.y + 0.85, s.pos.z] }; }, [ang, dist, h]);
  await frames(2); await p.screenshot({ path: `/tmp/claude-0/${name}.png`, timeout: 900000 });
};
await frames(4);
await shot('scs_side_stand', Math.PI / 2); await shot('scs_34_stand', Math.PI / 4, 3.2, 1.4);
await p.evaluate(() => { window.__camOverride = null; }); await p.keyboard.down('KeyW'); await frames(16);
for (const k of [0]) { await shot('scs_side_ride' + k, Math.PI / 2); await frames(4); }
await shot('scs_back_ride', Math.PI, 3.6, 1.6);
await b.close(); console.log('done');
