import { chromium, devices } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext(process.env.DEV ? { ...devices[process.env.DEV] } : { viewport: { width: 1100, height: 650 } });
const p = await ctx.newPage();
p.on('pageerror', (e) => console.log('[pageerror]', e.message));
p.on('console', (m) => { if (/collectibles|error/i.test(m.text())) console.log('[console]', m.text().slice(0, 160)); });
await p.goto('http://localhost:4173/?autostart&fixeddt=0.1&q=low');
await p.waitForFunction('window.__ready && window.__frames > 3', null, { timeout: 900000 });
const frames = async (n) => { const f0 = await p.evaluate('window.__frames'); await p.waitForFunction(`window.__frames > ${f0 + n}`, null, { timeout: 900000, polling: 300 }); };
const st = () => p.evaluate(() => { const B = window.__bagverse, s = B.progress.s; return JSON.stringify({ lv: s.level, xp: s.xp, total: s.totalXp, step: s.tut.step, tutProg: s.tut.prog, tracker: document.getElementById('tracker').innerText.replace(/\n/g, ' | ').slice(0, 120), toast: document.getElementById('toast').textContent }); });
const tag = process.env.DEV ? 'm' : 'd';
await p.evaluate(() => window.__bagverse.missionsUI.welcome());
await frames(2); await p.screenshot({ path: `/tmp/claude-0/pg_${tag}_welcome.png`, timeout: 900000 });
await p.click('#wl-go'); await frames(2);
console.log('start', await st(), 'bags', await p.evaluate('window.__bagverse.collect.bags.length'), 'kiosks', await p.evaluate('window.__bagverse.collect.kiosks.map(k=>k.id).join(",")'));
// locked emote before Lv 2
await p.keyboard.press('Digit2'); await frames(1); console.log('dance locked toast:', await p.evaluate(`document.getElementById('toast').textContent`));
// 1 walk
await p.keyboard.down('KeyW'); await frames(30); await p.keyboard.up('KeyW'); await frames(2); console.log('walk', await st());
await p.screenshot({ path: `/tmp/claude-0/pg_${tag}_hud.png`, timeout: 900000 });
// 2 look, 3 jump, 4 chat gm, 5 dance — via the event stream where input is awkward headless
await p.evaluate(() => window.__bagverse.quests.emit('look', 1)); await p.keyboard.press('Space'); await frames(3);
await p.evaluate(() => window.__bagverse.hud.onSend('gm frens')); await frames(2);
await p.keyboard.press('Digit2'); await frames(3); console.log('after dance', await st());
// 6 ride: summon + ride
await p.evaluate(() => window.__bagverse.summonScooter()); await p.keyboard.down('KeyW'); await frames(40); await p.keyboard.up('KeyW');
await p.evaluate(() => window.__bagverse.summonScooter()); await frames(3); console.log('after ride', await st());
// beacon to the vault
console.log('beacon', await p.evaluate(() => { const c = window.__bagverse.collect; return c.beacon.visible + ' ' + c.beacon.position.toArray().map((v) => v.toFixed(1)); }));
await p.evaluate(() => { const q = window.__bagverse.quests; q.emit('zone', 1, { id: 'rwa_vault' }); q.emit('rwa_view', 1, { id: 'vault' }); }); await frames(2);
// 9 bag: teleport onto the nearest bag
await p.evaluate(() => { const B = window.__bagverse, bag = B.collect.nearestBag(B.player.body.pos); B.player.teleport(bag.pos.clone().setY(bag.pos.y + 0.1)); }); await frames(6);
console.log('after bag', await st(), 'found', await p.evaluate('window.__bagverse.collect.foundCount'));
await p.evaluate(() => { const q = window.__bagverse.quests; q.emit('billboard', 1); q.emit('skin', 1, { id: 'shiba' }); }); await frames(2);
console.log('before flashmob', await st(), 'thriller allowed', await p.evaluate(`window.__bagverse.progress.has('emote:Thriller')`));
await p.keyboard.press('Digit1'); await frames(6); await p.waitForFunction(() => { const c = window.__bagverse.player.c; return c.anim.current === c.actions.Thriller; }, null, { timeout: 900000, polling: 1000 });
await p.keyboard.press('KeyF'); await frames(3); console.log('after flashmob', await st());
// kiosk: teleport next to one and open it
await p.evaluate(() => { const B = window.__bagverse, k = B.collect.kiosks[0]; B.player.teleport(k.pos.clone().add({ x: 1.5, y: 0.1, z: 1.5 })); window.__camOverride = { pos: [k.pos.x + 5, k.pos.y + 3, k.pos.z + 5], at: [k.pos.x, k.pos.y + 2, k.pos.z] }; }); await frames(4);
console.log('kiosk prompt', await p.evaluate(`document.getElementById('prompt').textContent`));
await p.screenshot({ path: `/tmp/claude-0/pg_${tag}_kiosk.png`, timeout: 900000 });
await p.keyboard.press('KeyE'); await frames(2); console.log('kiosk modal', await p.evaluate(`document.getElementById('mtitle').textContent + ' | ' + document.getElementById('mbody').innerText.replace(/\\n/g,' ').slice(0,200)`));
await p.screenshot({ path: `/tmp/claude-0/pg_${tag}_kioskmodal.png`, timeout: 900000 });
await p.evaluate(() => { window.__camOverride = null; window.__bagverse.hud.closeModal(); });
for (const t of ['guide', 'daily', 'weekly', 'achievements', 'journey']) { await p.evaluate((t) => window.__bagverse.missionsUI.open(t), t); await frames(1); await p.screenshot({ path: `/tmp/claude-0/pg_${tag}_${t}.png`, timeout: 900000 }); }
console.log('dailies', await p.evaluate(() => JSON.stringify(window.__bagverse.quests.dailies.map((d) => [d.title, d.prog, d.done]))));
await b.close(); console.log('done');
