// checks the crash-safety paths: (1) a leftover boot flag lowers the tier, (2) a lost WebGL context
// shows the reset overlay and stores a lower tier.  node tools/crashtest.mjs <url>
import { chromium } from 'playwright';
const url = process.argv[2];
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 640, height: 360 } });
p.on('pageerror', (e) => console.log('[pageerror]', e.message));
await p.addInitScript(() => {
  if (!sessionStorage.getItem('seeded')) {           // only on the first load: pretend the last session crashed at HIGH
    localStorage.setItem('bagverse.q', 'high'); localStorage.setItem('bagverse.boot', '1'); sessionStorage.setItem('seeded', '1');
  }
});
await p.goto(url);
await p.waitForFunction('window.__ready && window.__frames > 3', null, { timeout: 1500000 });
console.log('after crash flag:', JSON.stringify(await p.evaluate(() => [__bagverse.quality, localStorage.getItem('bagverse.q'), document.getElementById('gfxbtn').textContent, [...document.querySelectorAll('#chatlog *')].map((e) => e.textContent).join(' | ').slice(0, 200)])));
await p.evaluate(() => __bagverse.renderer.getContext().getExtension('WEBGL_lose_context').loseContext());
await p.waitForTimeout(800);
console.log('after context loss:', JSON.stringify(await p.evaluate(() => [!!document.getElementById('gfxcrash'), document.getElementById('gfxcrash')?.textContent, localStorage.getItem('bagverse.q')])));
await p.screenshot({ path: '/tmp/claude-0/crash_overlay.png' });
await b.close();
