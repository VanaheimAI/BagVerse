// Kit instance culling check: the same views with culling on and off (?nocull). node tools/cull_shots.mjs [q] [outDir]
import fs from 'node:fs';
import { chromium } from 'playwright';
const q = process.argv[2] || 'low', out = process.argv[3] || '/tmp/cull_shots'; fs.mkdirSync(out, { recursive: true });
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const views = [{ pos: [0, 6, 30], at: [0, 4, -40] }, { pos: [0, 6, -10], at: [60, 10, 120] }, { pos: [-60, 60, -60], at: [80, 0, 80] }, { pos: [120, 3, 0], at: [0, 8, 0] }];
for (const mode of ['cull', 'nocull']) {
  const p = await (await b.newContext({ viewport: { width: 640, height: 360 } })).newPage();
  p.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await p.goto(`http://localhost:4175/?autostart&fixeddt=0.1&q=${q}${mode === 'nocull' ? '&nocull' : ''}`, { timeout: 900000, waitUntil: 'commit' });
  await p.waitForFunction('window.__ready && window.__frames > 3', null, { timeout: 900000 });
  await p.evaluate(() => { document.getElementById('hud').hidden = true; });
  for (let i = 0; i < views.length; i++) {
    await p.evaluate((v) => { window.__camOverride = v; }, views[i]);
    const f0 = await p.evaluate('window.__frames'); await p.waitForFunction(`window.__frames > ${f0 + 3}`, null, { timeout: 900000, polling: 200 });
    await p.screenshot({ path: `${out}/${q}_v${i}_${mode}.png`, timeout: 600000 });
    console.log(mode, i, await p.evaluate(() => window.__bagverse.kit.meshes.reduce((a, m) => a + m.count, 0)));
  }
  await p.close();
}
await b.close();
