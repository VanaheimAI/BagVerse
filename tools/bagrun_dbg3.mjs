import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await (await b.newContext({ viewport: { width: 640, height: 360 } })).newPage();
p.on('pageerror', (e) => console.log('[pageerror]', e.message, e.stack?.split('\n').slice(0, 4).join(' | ')));
p.on('console', (m) => console.log('[console]', m.text().slice(0, 200)));
await p.goto('http://localhost:4173/?autostart&fixeddt=0.1&q=low&unlockall');
await p.waitForFunction('window.__ready && window.__frames > 3', null, { timeout: 900000 });
await p.mouse.click(5, 300);
console.log(await p.evaluate(() => { try { window.__bagverse.bagRun.forcePlan = 'gm'; window.__bagverse.startBagRun(); return 'ok ' + window.__bagverse.bagRun.state; } catch (e) { return 'ERR ' + e.stack; } }));
for (let i = 0; i < 3; i++) { await new Promise((r) => setTimeout(r, 15000)); console.log('frames', await p.evaluate('window.__frames')); }
await p.screenshot({ path: '/tmp/claude-0/br_smoke.png', timeout: 900000 }); await b.close();
