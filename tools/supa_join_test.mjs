// late joiner on the Supabase path (fake client): A is already in the world, B joins later -> A must draw B and get a join notice
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ viewport: { width: 640, height: 360 } });
const open = async (tag) => { const p = await ctx.newPage(); p.on('pageerror', (e) => console.log(`[${tag} pageerror]`, e.message));
  await p.goto('http://localhost:4174/?autostart&fixeddt=0.1&q=low', { timeout: 900000, waitUntil: 'commit' }); await p.waitForFunction('window.__ready && window.__frames > 3', null, { timeout: 900000 }); return p; };
const frames = async (p, n) => { const f0 = await p.evaluate('window.__frames'); await p.waitForFunction(`window.__frames > ${f0 + n}`, null, { timeout: 900000, polling: 300 }); };
const A = await open('A'); await A.evaluate(() => { window.__bagverse.progress.s.name = 'First'; }); await frames(A, 3);
const B = await open('B'); await B.evaluate(() => { window.__bagverse.progress.s.name = 'Newcomer'; });
for (let i = 0; i < 4; i++) { await frames(B, 1); await frames(A, 2); }
console.log('A draws:', await A.evaluate(() => [...window.__bagverse.mp.remotes.values()].map((r) => window.__bagverse.mp.displayName(r) + (r.c ? ' (visible)' : ' (no avatar)')).join(', ') || 'nobody'));
console.log('A chat:', await A.evaluate(() => [...document.querySelectorAll('#chatlog > *')].map((e) => e.textContent).filter((t) => /joined|Already/.test(t)).join(' / ')));
console.log('B chat:', await B.evaluate(() => [...document.querySelectorAll('#chatlog > *')].map((e) => e.textContent).filter((t) => /joined|Already/.test(t)).join(' / ')));
await b.close(); console.log('done');
