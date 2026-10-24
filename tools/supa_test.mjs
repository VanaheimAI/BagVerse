// two players on the Supabase code path (fake client: tools/fake-supabase.js, build with FAKE_SUPABASE=1)
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ viewport: { width: 800, height: 450 } });
const open = async (tag) => { const p = await ctx.newPage(); p.on('pageerror', (e) => console.log(`[${tag} pageerror]`, e.message)); p.on('console', (m) => { if (/error|multiplayer|leaderboard/i.test(m.text())) console.log(`[${tag}]`, m.text().slice(0, 140)); });
  await p.goto('http://localhost:4174/?autostart&fixeddt=0.1&unlockall&q=low', { timeout: 900000, waitUntil: 'commit' }); await p.waitForFunction('window.__ready && window.__frames > 3', null, { timeout: 900000 }); return p; };
const frames = async (p, n) => { const f0 = await p.evaluate('window.__frames'); await p.waitForFunction(`window.__frames > ${f0 + n}`, null, { timeout: 900000, polling: 300 }); };
const A = await open('A'), B = await open('B');
await A.evaluate(() => { window.__bagverse.progress.s.name = 'Alice'; }); await B.evaluate(() => { window.__bagverse.progress.s.name = 'Bob'; });
const pa = await A.evaluate(() => window.__bagverse.player.root.position.toArray());
await B.evaluate(([x, y, z]) => { const B = window.__bagverse, V = B.player.root.position.constructor; B.player.teleport(new V(x + 2.5, y + 0.1, z + 5)); }, pa);
await frames(B, 4); await frames(A, 6);
console.log('A sees:', await A.evaluate(() => [...window.__bagverse.mp.remotes.values()].map((r) => window.__bagverse.mp.displayName(r) + ' @ ' + r.pos.toArray().map((v) => v.toFixed(1))).join(' | ')), await A.evaluate(() => document.getElementById('mpchip').textContent));
await B.evaluate(() => window.__bagverse.hud.onSend('gm from vercel')); await frames(B, 2); await frames(A, 4);
console.log('A chat:', await A.evaluate(() => [...document.querySelectorAll('#chatlog > *')].slice(-3).map((e) => e.textContent).join(' / ')));
// leaderboard: A posts a run, B sees it; A cannot write B's row
console.log('A write ok:', await A.evaluate(() => window.__bagverse.lb.submit({ score: 777 })));
console.log('A forged write:', await A.evaluate(async () => { try { await window.__bagverse.lb.db.doc('lb/someone-else').set({ wBest: 99999 }); return 'ALLOWED (bad)'; } catch (e) { return 'refused: ' + e.code; } }));
await B.evaluate(() => window.__bagverse.lb.subscribe()); await frames(B, 3);
console.log('B week board:', await B.evaluate(() => JSON.stringify(window.__bagverse.lb.top('week', 5))));
await B.keyboard.press('KeyL'); await frames(B, 2);
await B.screenshot({ path: '/tmp/claude-0/supa_lb.png', timeout: 900000 });
await b.close(); console.log('done');
