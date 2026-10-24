// Tile Drop match, two players on the Supabase code path (fake client). Build/serve like tools/supa_test.mjs (port 4174).
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ viewport: { width: 800, height: 450 } });
const open = async (tag) => { const p = await ctx.newPage(); p.on('pageerror', (e) => console.log(`[${tag} pageerror]`, e.message));
  await p.goto('http://localhost:4174/?autostart&fixeddt=0.05&unlockall&q=low', { timeout: 900000, waitUntil: 'commit' }); await p.waitForFunction('window.__ready && window.__frames > 3', null, { timeout: 900000 }); return p; };
const frames = async (p, n) => { const f0 = await p.evaluate('window.__frames'); await p.waitForFunction(`window.__frames > ${f0 + n}`, null, { timeout: 900000, polling: 200 }); };
const A = await open('A'), B = await open('B');
await A.evaluate(() => { window.__bagverse.progress.s.name = 'Alice'; }); await B.evaluate(() => { window.__bagverse.progress.s.name = 'Bob'; });
await frames(A, 4); await frames(B, 4);
await A.evaluate(() => window.__bagverse.tileDropMenu()); await A.click('#td-host'); await frames(A, 3);
await A.evaluate(() => { const B = window.__bagverse; B.tileDrop.race.at = Date.now() + 600000; B.mp.setRace(B.tileDrop.race); });   // slow headless frames: keep the invite open
await B.waitForFunction('!document.getElementById("mpinvite").hidden', null, { timeout: 120000, polling: 300 });
console.log('B invite:', await B.evaluate(() => document.getElementById('mpinvite').textContent));
await B.evaluate(() => document.getElementById('mpinvite').click()); await frames(B, 2);
console.log('B joined:', await B.evaluate(() => { const T = window.__bagverse.tileDrop; return T.active + ' ' + T.state + ' race=' + T.race?.id; }), 'A race', await A.evaluate(() => window.__bagverse.tileDrop.race.id));
// fast-forward the countdown for both (shared wall-clock start)
await A.evaluate(() => { window.__bagverse.tileDrop.race.at = Date.now() + 1500; }); await B.evaluate((id) => { window.__bagverse.tileDrop.race.at = Date.now() + 1500; }, null);
await Promise.all([A.waitForFunction('window.__bagverse.tileDrop.state === "run"', null, { timeout: 900000, polling: 200 }), B.waitForFunction('window.__bagverse.tileDrop.state === "run"', null, { timeout: 900000, polling: 200 })]);
// Alice keeps hopping onto fresh tiles (test cheat); Bob stands still and drops out
let aStatus = '';
for (let k = 0; k < 40; k++) {
  await A.evaluate(() => { const B = window.__bagverse, T = B.tileDrop; if (!T.active) return; const P = B.player.body.pos; // walk in a circle so Alice keeps finding fresh tiles
    const a = (T.clock * 1.3) % (Math.PI * 2); B.player.body.vel.x = Math.cos(a) * 6; B.player.body.vel.z = Math.sin(a) * 6; });
  await frames(A, 4);
  const done = await B.evaluate(() => !window.__bagverse.tileDrop.active);
  if (done) break;
}
console.log('B out:', await B.evaluate(() => document.getElementById('mtitle').textContent));
console.log('A tiles: mine', await A.evaluate(() => window.__bagverse.tileDrop.mine.length), 'seen from Bob', await A.evaluate(() => window.__bagverse.tileDrop.seen.size));
await A.waitForFunction('!window.__bagverse.tileDrop.active', null, { timeout: 300000, polling: 300 }).catch(() => {});
console.log('A result:', await A.evaluate(() => document.getElementById('mtitle').textContent), '|', await A.evaluate(() => [...document.querySelectorAll('#td-stand .row')].map((e) => e.textContent).join(' | ')));
await frames(B, 30);
console.log('B standings:', await B.evaluate(() => [...document.querySelectorAll('#td-stand .row')].map((e) => e.textContent).join(' | ')));
console.log('A wins:', await A.evaluate(() => window.__bagverse.tileDrop.S.wins), 'lb wins A:', await A.evaluate(async () => { const L = window.__bagverse.lb; await new Promise((r) => setTimeout(r, 500)); return L.mine?.wins; }));
await b.close(); console.log('done');
