// Halloween Arena: the dressed site, a Grave Drop round (lightning, ghost after falling) and a Pumpkin Rush round
// (pickups, rotten freeze, results). Build + server as in tools/tags_test.mjs.   node tools/halloween_test.mjs [outDir]
import fs from 'node:fs';
import { chromium } from 'playwright';
const out = process.argv[2] || '/tmp/halloween_test'; fs.mkdirSync(out, { recursive: true });
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await (await b.newContext({ viewport: { width: 960, height: 540 } })).newPage();
const errs = []; p.on('pageerror', (e) => { errs.push(e.message); console.log('[pageerror]', e.message); });
await p.goto('http://localhost:4175/?autostart&fixeddt=0.1&q=low&unlockall', { timeout: 900000, waitUntil: 'commit' });
await p.waitForFunction('window.__ready && window.__frames > 3', null, { timeout: 900000 });
const frames = async (n) => { const f0 = await p.evaluate('window.__frames'); await p.waitForFunction(`window.__frames > ${f0 + n}`, null, { timeout: 900000, polling: 200 }); };
const shot = (n) => p.screenshot({ path: `${out}/${n}.png`, timeout: 600000 });
// 1. the site
await p.evaluate(() => { const B = window.__bagverse; const z = B.world.zones.find((x) => x.id === 'halloween'); B.hud.onTravel(z); });
await frames(4);
console.log('zone:', await p.evaluate(() => window.__bagverse.world.zoneAt(window.__bagverse.player.body.pos).label));
await p.evaluate(() => { window.__camOverride = { pos: [112, 14, 120], at: [145, 2, 155] }; }); await frames(4); await shot('1_site_day');
await p.evaluate(() => window.__bagverse.setLook('night')); await frames(6); await shot('2_site_night');
await p.evaluate(() => { window.__camOverride = null; const B = window.__bagverse, d = B.halloween.pads[0]; B.player.teleport(d.pos.clone().setY(d.pos.y + 0.2)); }); await frames(4);
console.log('pad prompt:', await p.evaluate(() => document.getElementById('prompt').textContent));
await p.evaluate(() => window.__bagverse.setLook('day'));
// 2. Grave Drop
await p.evaluate(() => { const B = window.__bagverse; B.tileDropMenu(B.graveDrop); document.getElementById('td-solo').click(); });
await p.waitForFunction(() => window.__bagverse.graveDrop.state === 'run', null, { timeout: 120000 });
console.log('look during grave:', await p.evaluate(() => localStorage.getItem('bagverse.look')), '(stored stays the player\'s own)');
await p.evaluate(() => { const g = window.__bagverse.graveDrop; g.nextBolt = 0; }); await frames(3); await shot('3_grave_lightning');
console.log('doomed tiles:', await p.evaluate(() => { const g = window.__bagverse.graveDrop; return g.tiles.reduce((a, tl) => a + [...tl].filter((v) => v > g.clock).length, 0); }));
await p.evaluate(() => { const B = window.__bagverse; B.player.body.pos.y = B.graveDrop.outY - 1; }); await frames(6);
console.log('ghost:', await p.evaluate(() => { const g = window.__bagverse.graveDrop; return { ghost: g.ghost, active: g.active, alive: g.alive() }; }));
await p.evaluate(() => { const B = window.__bagverse; window.__camOverride = { pos: [145 + 24, 50, 155 + 24], at: [145, 34, 155] }; }); await frames(4); await shot('4_grave_ghost');
await p.evaluate(() => { window.__camOverride = null; window.__bagverse.graveDrop.finish(false); }); await frames(3);
console.log('grave results:', await p.evaluate(() => document.getElementById('mtitle').textContent));
await p.evaluate(() => window.__bagverse.hud.closeModal());
// 3. Pumpkin Rush
await p.evaluate(() => { const B = window.__bagverse; B.pumpkinMenu(); document.getElementById('pr-solo').click(); });
await p.waitForFunction(() => window.__bagverse.pumpkinRush.state === 'run', null, { timeout: 120000 });
await frames(4); await shot('5_pumpkin_round');
const grab = await p.evaluate(async () => { const B = window.__bagverse, pr = B.pumpkinRush; let got = 0;
  for (const kind of ['orange', 'gold']) { const pk = pr.pumps.find((x) => x.alive && x.kind === kind); if (pk) { B.player.body.pos.copy(pk.pos); pr.update(0.016); got++; } }
  const before = pr.haul, rot = pr.pumps.find((x) => x.alive && x.kind === 'rotten'); if (rot) { B.player.body.pos.copy(rot.pos); pr.update(0.016); }
  return { haul: before, afterRotten: pr.haul, frozen: pr.frozen, spots: pr.spots().length, bots: pr.bots.map((b) => b.haul) }; });
console.log('pumpkin:', grab);
await p.evaluate(() => { const B = window.__bagverse; window.__camOverride = { pos: [125, 10, 135], at: [145, 0.5, 155] }; }); await frames(10); await shot('6_pumpkin_wide');
await p.evaluate(() => { window.__camOverride = null; window.__bagverse.pumpkinRush.left = 0; }); await frames(3);
console.log('pumpkin results:', await p.evaluate(() => document.getElementById('mtitle').textContent + ' | ' + document.getElementById('mbody').innerText.slice(0, 160).replace(/\n/g, ' / ')));
await shot('7_pumpkin_results');
console.log('look after:', await p.evaluate(() => localStorage.getItem('bagverse.look')));
console.log('errors:', errs.length); await b.close();
