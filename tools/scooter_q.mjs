import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
for (const q of ['low', 'medium']) {
  const p = await b.newPage({ viewport: { width: 640, height: 400 } });
  await p.addInitScript(() => { localStorage.setItem('bagverse.char', 'witch'); });
  await p.goto('http://localhost:4173/?autostart&fixeddt=0.05&q=' + q);
  await p.waitForFunction('window.__ready && window.__frames > 3', null, { timeout: 900000 });
  const frames = async (n) => { const f0 = await p.evaluate('window.__frames'); await p.waitForFunction(`window.__frames > ${f0 + n}`, null, { timeout: 900000, polling: 500 }); };
  await p.evaluate(() => { document.getElementById('hud').style.visibility = 'hidden'; window.__bagverse.summonScooter(); });
  await p.waitForFunction(() => !!window.__bagverse.player.c.actions.Ride, null, { timeout: 900000, polling: 1000 });
  await p.evaluate(() => { const s = window.__bagverse.scooter, a = s.local(0.8, -3.2); window.__camOverride = { pos: [a.x, s.pos.y + 1.9, a.z], at: [s.pos.x, s.pos.y + 0.6, s.pos.z] }; });
  await frames(3); await p.screenshot({ path: `/tmp/claude-0/sq_${q}.png`, timeout: 900000 });
  console.log(q, await p.evaluate(() => { const s = window.__bagverse.scooter, body = s.model.getObjectByName('SCT_BODY'); body.geometry.computeBoundingBox(); const bb = body.geometry.boundingBox; return JSON.stringify({ min: bb.min.toArray().map((v) => +v.toFixed(2)), max: bb.max.toArray().map((v) => +v.toFixed(2)), q: body.quaternion.toArray().map((v) => +v.toFixed(3)), s: body.scale.toArray().map((v) => +v.toFixed(3)), deck: s.deck.toArray().map((v) => +v.toFixed(2)) }); }));
  await p.close();
}
await b.close();
