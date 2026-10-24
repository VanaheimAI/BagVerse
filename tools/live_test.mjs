// two separate players (own browser contexts = own Supabase sessions) on the LIVE site
import { chromium } from 'playwright';
const URL = process.argv[2] || 'https://bag-verse-ten.vercel.app/';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const open = async (tag) => { const ctx = await b.newContext({ viewport: { width: 800, height: 450 } }); const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log(`[${tag} pageerror]`, e.message)); p.on('console', (m) => { if (/backend|multiplayer|leaderboard|error|supabase|realtime/i.test(m.text())) console.log(`[${tag}]`, m.text().slice(0, 160)); });
  await p.goto(URL + '?autostart&fixeddt=0.1&q=low', { timeout: 900000, waitUntil: 'commit' }); await p.waitForFunction('window.__ready && window.__frames > 3', null, { timeout: 900000 }); return p; };
const frames = async (p, n) => { const f0 = await p.evaluate('window.__frames'); await p.waitForFunction(`window.__frames > ${f0 + n}`, null, { timeout: 900000, polling: 300 }); };
const A = await open('A'), B = await open('B');
await A.evaluate(() => { window.__bagverse.progress.s.name = 'QA_Alice'; }); await B.evaluate(() => { window.__bagverse.progress.s.name = 'QA_Bob'; });
const pa = await A.evaluate(() => window.__bagverse.player.root.position.toArray());
await B.evaluate(([x, y, z]) => { const B = window.__bagverse, V = B.player.root.position.constructor; B.player.teleport(new V(x + 2.5, y + 0.1, z + 5)); }, pa);
for (let i = 0; i < 6; i++) { await frames(B, 2); await frames(A, 2); }
console.log('A connected:', await A.evaluate(() => window.__bagverse.mp.online), '| A sees:', await A.evaluate(() => [...window.__bagverse.mp.remotes.values()].map((r) => window.__bagverse.mp.displayName(r) + ' @ ' + r.pos.toArray().map((v) => v.toFixed(1))).join(' | ') || 'nobody'), '|', await A.evaluate(() => document.getElementById('mpchip').textContent));
console.log('B sees:', await B.evaluate(() => [...window.__bagverse.mp.remotes.values()].map((r) => window.__bagverse.mp.displayName(r)).join(' | ') || 'nobody'));
await B.evaluate(() => window.__bagverse.hud.onSend('qa ping from B')); for (let i = 0; i < 4; i++) { await frames(B, 1); await frames(A, 1); }
console.log('A chat tail:', await A.evaluate(() => [...document.querySelectorAll('#chatlog > *')].slice(-3).map((e) => e.textContent).join(' / ')));
console.log('lb:', await A.evaluate(() => JSON.stringify({ db: !!window.__bagverse.lb.db, canWrite: window.__bagverse.lb.canWrite })));
await A.screenshot({ path: '/tmp/claude-0/live_a.png', timeout: 900000 });
await b.close(); console.log('done');
