// Lost-GPU-context handling: a loss while the page is in the background (phone app switch) keeps the tier and
// reloads only once the player is back; a loss while playing restarts one tier lower.   node tools/ctxloss_test.mjs
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
async function run(background) {
  const p = await (await b.newContext({ viewport: { width: 640, height: 360 } })).newPage();
  p.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await p.goto('http://localhost:4175/?autostart&q=medium', { timeout: 900000, waitUntil: 'commit' });
  await p.waitForFunction('window.__ready && window.__frames > 3', null, { timeout: 900000 });
  await p.evaluate(() => { localStorage.setItem('bagverse.q', 'medium'); });
  const setHidden = (h) => p.evaluate((h) => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => h }); document.dispatchEvent(new Event('visibilitychange')); }, h);
  if (background) await setHidden(true);
  await p.evaluate(() => window.__bagverse.renderer.getContext().getExtension('WEBGL_lose_context').loseContext());
  await p.waitForTimeout(2500);
  const mid = await p.evaluate(() => ({ overlay: document.getElementById('gfxcrash')?.innerText.replace(/\n/g, ' ') || null, q: localStorage.getItem('bagverse.q') }));
  let after = null;
  if (background) { await setHidden(false); await p.waitForTimeout(300); after = await p.evaluate(() => document.getElementById('gfxcrash')?.innerText.replace(/\n/g, ' ') || null); }
  console.log(background ? 'background:' : 'foreground:', JSON.stringify(mid), background ? 'on return: ' + after : '');
  await p.close();
}
await run(true); await run(false); await b.close();
