// Multiplayer staying visible: 3 players on the Supabase path (fake client, port 4174). C's presence calls are all
// dropped (?fakenopresence, like a rate-limited client): everyone must still see everyone through broadcasts.
// Also: chat, movement, presence calls within the 5-per-30-s limit, message rate, and a clean leave.
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
// node tools/mp_persist_test.mjs [url]   (with a url: the live site and real Supabase, one browser profile per player)
const LIVE = process.argv[2];
const ctx = await b.newContext({ viewport: { width: 640, height: 360 } });
const open = async (tag, extra = '') => { const p = LIVE ? await (await b.newContext({ viewport: { width: 640, height: 360 } })).newPage() : await ctx.newPage(); if (LIVE) extra = ''; p.on('pageerror', (e) => console.log(`[${tag} pageerror]`, e.message));
  await p.goto((LIVE || 'http://localhost:4174/') + '?autostart&fixeddt=0.1&q=low' + extra, { timeout: 900000, waitUntil: 'commit' }); await p.waitForFunction('window.__ready && window.__frames > 3', null, { timeout: 900000 }); return p; };
const frames = async (p, n) => { const f0 = await p.evaluate('window.__frames'); await p.waitForFunction(`window.__frames > ${f0 + n}`, null, { timeout: 900000, polling: 200 }); };
const A = await open('A'), B = await open('B'), C = await open('C', '&fakenopresence');
const P = { A, B, C };
for (const [n, p] of Object.entries(P)) await p.evaluate((n) => { window.__bagverse.progress.s.name = 'QA_' + n; }, n);
const all = async (n) => { for (let i = 0; i < n; i++) for (const p of Object.values(P)) await frames(p, 1); };
await all(6); await new Promise((r) => setTimeout(r, 6000)); await all(3);
const sees = (p) => p.evaluate(() => [...window.__bagverse.mp.remotes.values()].filter((r) => r.c).map((r) => window.__bagverse.mp.displayName(r)).sort().join(','));
for (const [n, p] of Object.entries(P)) console.log(n, 'sees:', await sees(p), '| chip:', await p.evaluate(() => document.getElementById('mpchip').textContent));
// chat and movement
await A.evaluate(() => window.__bagverse.hud.onSend('gm team'));
await A.evaluate(() => { const B = window.__bagverse, V = B.player.root.position.constructor; B.player.teleport(new V(20, B.world.physics.groundAt(20, 30, 10) + 0.1, 30)); });
await all(4); await new Promise((r) => setTimeout(r, 2500)); await all(4);
for (const n of ['B', 'C']) console.log(n, 'chat:', await P[n].evaluate(() => [...document.querySelectorAll('#chatlog > *')].map((e) => e.textContent).filter((t) => /gm team/.test(t)).length), '| A at:', await P[n].evaluate(() => { const r = [...window.__bagverse.mp.remotes.values()].find((x) => window.__bagverse.mp.displayName(x) === 'QA_A'); return r ? r.target.toArray().map((v) => v.toFixed(0)).join(',') : 'missing'; }));
for (const [n, p] of Object.entries(P)) console.log(n, 'presence calls:', await p.evaluate(() => (window.__presenceCalls || 0) + ' (dropped ' + (window.__presenceDropped || 0) + ')'), '| rt:', JSON.stringify(await p.evaluate(() => window.__rtStats?.())));
// B leaves
await B.close(); delete P.B; await all(4); await new Promise((r) => setTimeout(r, 1500)); await all(3);
for (const [n, p] of Object.entries(P)) console.log(n, 'after B left sees:', await sees(p));
await b.close(); console.log('done');
