// regression: an idle teammate must not snap back to an old position when the room re-syncs (Supabase path)
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ viewport: { width: 800, height: 450 } });
const open = async (tag) => { const p = await ctx.newPage(); p.on('pageerror', (e) => console.log(`[${tag} pageerror]`, e.message));
  await p.goto('http://localhost:4174/?autostart&fixeddt=0.1&q=low', { timeout: 900000, waitUntil: 'commit' }); await p.waitForFunction('window.__ready && window.__frames > 3', null, { timeout: 900000 }); return p; };
const frames = async (p, n) => { const f0 = await p.evaluate('window.__frames'); await p.waitForFunction(`window.__frames > ${f0 + n}`, null, { timeout: 900000, polling: 300 }); };
const A = await open('A'), B = await open('B');
const seenB = () => A.evaluate(() => { const r = [...window.__bagverse.mp.remotes.values()][0]; return r ? r.target.toArray().map((v) => v.toFixed(1)).join(',') : 'none'; });
for (let i = 0; i < 3; i++) { await frames(A, 2); await frames(B, 2); }
console.log('B at join, A sees:', await seenB());
await B.evaluate(() => { const B = window.__bagverse, V = B.player.root.position.constructor; B.player.teleport(new V(30, 0.1, -10)); });
for (let i = 0; i < 4; i++) { await frames(B, 2); await frames(A, 2); }
console.log('B moved to 30,-10, A sees:', await seenB());
// room re-sync: A changes something that is tracked in presence (name), B stays idle
await A.evaluate(() => { window.__bagverse.progress.s.name = 'ResyncTrigger'; });
for (let i = 0; i < 4; i++) { await frames(A, 2); await frames(B, 1); }
console.log('after a presence re-sync, A sees B at:', await seenB(), '(must stay at 30,-10)');
// name stored online
await B.evaluate(() => window.__bagverse.skins.setName('Bob_Builder')); await frames(B, 3);
console.log('B profile row:', await B.evaluate(() => JSON.stringify(Object.values(JSON.parse(localStorage.getItem('fake.lb') || '{}')).map((r) => ({ week: r.week, n: r.doc.n })))));
await b.close(); console.log('done');
