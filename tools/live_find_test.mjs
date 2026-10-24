// LIVE site + real Supabase: two players, one far away and idle; the other must see them, their marker and map entry
import { chromium } from 'playwright';
const URL = process.argv[2] || 'https://bag-verse-ten.vercel.app/';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const open = async (tag) => { const ctx = await b.newContext({ viewport: { width: 900, height: 506 } }); const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log(`[${tag} pageerror]`, e.message)); p.on('console', (m) => { if (/backend|error/i.test(m.text())) console.log(`[${tag}]`, m.text().slice(0, 140)); });
  await p.goto(URL + '?autostart&fixeddt=0.1&q=low', { timeout: 900000, waitUntil: 'commit' }); await p.waitForFunction('window.__ready && window.__frames > 3', null, { timeout: 900000 }); return p; };
const frames = async (p, n) => { const f0 = await p.evaluate('window.__frames'); await p.waitForFunction(`window.__frames > ${f0 + n}`, null, { timeout: 900000, polling: 300 }); };
const both = async (n) => { for (let i = 0; i < n; i++) { await frames(A, 1); await frames(B, 1); } };
const A = await open('A'), B = await open('B');
await A.evaluate(() => { window.__bagverse.progress.s.name = 'QA_Alice'; }); await B.evaluate(() => { window.__bagverse.progress.s.name = 'QA_Bob'; });
await both(4);
await B.evaluate(() => { const B = window.__bagverse, V = B.player.root.position.constructor; B.player.teleport(new V(108, 0.1, 118)); });   // far away (Bull Run), then idle
await both(6);
const report = async (label) => console.log(label, await A.evaluate(() => { const M = window.__bagverse.mp, r = [...M.remotes.values()][0]; const m = document.querySelector('.mpmark');
  return JSON.stringify({ online: M.count + 1, sees: r ? M.displayName(r) + ' @ ' + r.pos.toArray().map((v) => v.toFixed(0)).join(',') : 'nobody', marker: m && !m.hidden ? m.textContent : 'none', mapMates: M.mapMates().map((x) => x.name) }); }));
await report('A after B went far:');
// a presence re-sync from A (name change) while B idles: B must stay at Bull Run
await A.evaluate(() => { window.__bagverse.progress.s.name = 'QA_Alice2'; }); await both(6);
await report('A after a re-sync:');
await A.screenshot({ path: '/tmp/claude-0/live_find.png', timeout: 900000 });
// click B's marker: A teleports next to B
await A.evaluate(() => document.querySelector('.mpmark')?.click()); await both(3);
console.log('A after clicking the marker:', await A.evaluate(() => window.__bagverse.player.body.pos.toArray().map((v) => v.toFixed(0)).join(',')));
await b.close(); console.log('done');
