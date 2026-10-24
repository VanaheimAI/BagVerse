// LIVE: A is in the world first; B joins later. Log what A's room and avatars contain over time.
import { chromium } from 'playwright';
const URL = process.argv[2] || 'https://bag-verse-ten.vercel.app/';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const open = async (tag) => { const ctx = await b.newContext({ viewport: { width: 640, height: 360 } }); const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log(`[${tag} pageerror]`, e.message)); p.on('console', (m) => { if (/error|warn|net:|multiplayer/i.test(m.text())) console.log(`[${tag}]`, m.text().slice(0, 160)); });
  await p.goto(URL + '?autostart&fixeddt=0.1&q=low', { timeout: 900000, waitUntil: 'commit' }); await p.waitForFunction('window.__ready && window.__frames > 3', null, { timeout: 900000 }); return p; };
const A = await open('A');
await A.evaluate(() => { window.__bagverse.progress.s.name = 'QA_First'; });
const snapA = () => A.evaluate(() => { const M = window.__bagverse.mp; const peers = M.room ? M.room.peers() : [];
  return JSON.stringify({ t: new Date().toISOString().slice(11, 19), roomPeers: peers.map((p) => (p.sameTab ? 'me' : (p.presence?.n || '?') + (typeof p.presence?.x === 'number' ? '' : '(no pos)'))), avatars: [...M.remotes.values()].map((r) => M.displayName(r) + (r.c ? '' : '(loading)')) }); });
await new Promise((r) => setTimeout(r, 8000));
console.log('A alone:', await snapA());
const B = await open('B');
await B.evaluate(() => { window.__bagverse.progress.s.name = 'QA_Newcomer'; });
console.log('B in. B sees:', await B.evaluate(() => [...window.__bagverse.mp.remotes.values()].map((r) => window.__bagverse.mp.displayName(r)).join(', ') || 'nobody'));
for (let i = 0; i < 4; i++) { await new Promise((r) => setTimeout(r, 6000)); console.log('A:', await snapA()); }
console.log('A join notices:', await A.evaluate(() => [...document.querySelectorAll('#chatlog > *')].map((e) => e.textContent).filter((t) => /joined|Already here/.test(t)).join(' / ')));
console.log('B arrival line:', await B.evaluate(() => [...document.querySelectorAll('#chatlog > *')].map((e) => e.textContent).filter((t) => /joined|Already here/.test(t)).join(' / ')));
await b.close(); console.log('done');
