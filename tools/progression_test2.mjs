import { chromium, devices } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ ...devices['iPhone 11 Pro'] });
const p = await ctx.newPage();
p.on('pageerror', (e) => console.log('[pageerror]', e.message));
await p.goto('http://localhost:4173/?autostart&fixeddt=0.1&q=low');
await p.waitForFunction('window.__ready && window.__frames > 3', null, { timeout: 900000 });
await p.evaluate(() => document.body.classList.add('embedded'));
const frames = async (n) => { const f0 = await p.evaluate('window.__frames'); await p.waitForFunction(`window.__frames > ${f0 + n}`, null, { timeout: 900000, polling: 300 }); };
const st = () => p.evaluate(() => { const s = window.__bagverse.progress.s; return JSON.stringify({ lv: s.level, total: s.totalXp, step: s.tut.step, daily: s.q.dprog, ach: Object.keys(s.ach).length }); });
await p.evaluate(() => window.__bagverse.missionsUI.welcome()); await frames(1);
await p.screenshot({ path: '/tmp/claude-0/pg2_welcome.png', timeout: 900000 });
await p.tap('#wl-go'); await frames(2);
const q = (fn) => p.evaluate(fn);
// walk around (zones) during the tutorial: dailies must not move
await q(() => { const Q = window.__bagverse.quests; Q.emit('walk', 15); Q.emit('zone', 1, { id: 'bag_square' }); Q.emit('zone', 1, { id: 'ad_canyon' }); Q.emit('zone', 1, { id: 'arcade' }); });
console.log('during tutorial', await st());
await frames(2); await p.screenshot({ path: '/tmp/claude-0/pg2_hud.png', timeout: 900000 });
// bag spacing: one pickup = one bag
await q(() => { const B = window.__bagverse, bag = B.collect.nearestBag(B.player.body.pos); B.player.teleport(bag.pos.clone().setY(bag.pos.y + 0.1)); }); await frames(4);
console.log('bags found after one pickup', await q(() => window.__bagverse.collect.foundCount), 'min spacing', await q(() => { const bs = window.__bagverse.collect.bags; let m = 1e9; for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) if (bs[i].zone === bs[j].zone) m = Math.min(m, bs[i].pos.distanceTo(bs[j].pos)); return m.toFixed(1) + ' m, ' + bs.length + ' bags'; }));
// finish the guide through the event stream, checking the vault beacon on the way
await q(() => { const Q = window.__bagverse.quests; Q.emit('look'); Q.emit('jump'); Q.emit('chat', 1, { text: 'gm' }); Q.emit('emote', 1, { name: 'Dance' }); Q.emit('ride', 50); });
await frames(2); console.log('vault beacon', await q(() => { const c = window.__bagverse.collect; return c.beacon.visible + ' ' + c.beacon.position.toArray().map((v) => v.toFixed(1)); }), await st());
await q(() => { const Q = window.__bagverse.quests; Q.emit('zone', 1, { id: 'rwa_vault' }); Q.emit('rwa_view', 1, { id: 'vault' }); }); await frames(2);
console.log('bag beacon', await q(() => { const c = window.__bagverse.collect; return c.beacon.visible + ' ' + c.beacon.position.toArray().map((v) => v.toFixed(1)); }));
await q(() => { const Q = window.__bagverse.quests; Q.emit('bag'); Q.emit('billboard'); Q.emit('skin', 1, { id: 'elf' }); Q.emit('flashmob'); });
await frames(3); console.log('tutorial done', await st(), await q(() => window.__bagverse.quests.tutorialDone));
await q(() => { const Q = window.__bagverse.quests; Q.emit('zone', 1, { id: 'doge_park' }); Q.emit('zone', 1, { id: 'swamp' }); Q.emit('zone', 1, { id: 'gm_gate' }); Q.emit('chat', 1, { text: 'gm' }); });
console.log('after tutorial', await st(), JSON.stringify(await q(() => window.__bagverse.quests.dailies.map((d) => [d.id, d.prog, d.done]))));
await frames(3); await p.screenshot({ path: '/tmp/claude-0/pg2_hud_after.png', timeout: 900000 });
for (const t of ['daily', 'journey']) { await q(new Function(`window.__bagverse.missionsUI.open('${t}')`)); await frames(1); await p.screenshot({ path: `/tmp/claude-0/pg2_${t}.png`, timeout: 900000 }); }
// overlap check of the HUD with the tracker
await q(() => window.__bagverse.missionsUI.close());
console.log('overlaps', await q(() => { const els = [...document.querySelectorAll('#topleft, #minimap, #balance, #actions button, #joy, #jumpbtn, #usebtn, #chatlog')].filter((e) => getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 0);
  const R = els.map((e) => [e.id || e.dataset.act, e.getBoundingClientRect()]); const bad = [];
  for (let i = 0; i < R.length; i++) for (let j = i + 1; j < R.length; j++) { const a = R[i][1], c = R[j][1]; if (a.left < c.right && c.left < a.right && a.top < c.bottom && c.top < a.bottom) bad.push(R[i][0] + ' x ' + R[j][0]); } return JSON.stringify(bad); }));
await b.close(); console.log('done');
