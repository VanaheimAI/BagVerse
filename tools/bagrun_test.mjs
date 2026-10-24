import { chromium, devices } from 'playwright';
const mobile = process.argv[2] === 'm';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext(mobile ? { ...devices['iPhone 11 Pro'] } : { viewport: { width: 800, height: 450 } });
const p = await ctx.newPage();
p.on('pageerror', (e) => console.log('[pageerror]', e.message));
p.on('console', (m) => { if (!/THREE|GPU stall|painted/.test(m.text())) console.log('[console]', m.type(), m.text().slice(0, 160)); });
await p.goto('http://localhost:4173/?autostart&fixeddt=0.1&q=low&unlockall');
await p.waitForFunction('window.__ready && window.__frames > 3', null, { timeout: 900000 });
const frames = async (n) => { const f0 = await p.evaluate('window.__frames'); await p.waitForFunction(`window.__frames > ${f0 + n}`, null, { timeout: 900000, polling: 300 }); };
const q = (fn) => p.evaluate(fn);
const tag = mobile ? 'm' : 'd';
// walk to the BAG RUN portal: check prompt
await q(() => { const B = window.__bagverse; B.player.teleport(new B.player.root.position.constructor(-15, B.world.groundAt ? B.world.groundAt(-15, 13) + 0.1 : 0.2, 13)); });
await frames(3);
console.log('prompt:', await q(() => document.getElementById('prompt').textContent));
console.log('course', await q(() => { const r = window.__bagverse.bagRun; r.build?.(); return r.points.length + ' bags, ' + r.points.filter((x) => x.mega).length + ' mega, ' + r.barriers.length + ' barriers'; }));
await p.mouse.click(5, 300); await q(() => { window.__bagverse.bagRun.forcePlan = 'gm'; window.__bagverse.startBagRun(); });
await frames(4);
await frames(6); console.log('route', await q(() => window.__bagverse.bagRun.plan.name + ' ' + document.getElementById('rh-route').textContent), 'music', await q(() => { const a = window.__bagverse.sfx; return a.ctx?.state + ' track=' + (a.track?.name || 'none') + ' buf=' + !!a.buf.bagrun; }));
console.log('state', await q(() => window.__bagverse.bagRun.state), 'input', await q(() => window.__bagverse.input.enabled));
await p.screenshot({ path: `/tmp/claude-0/br_${tag}_count.png`, timeout: 900000 });
for (let i = 0; i < 20; i++) { await q(() => { const B = window.__bagverse, n = B.bagRun.nextBag(B.player.body.pos); B.player.teleport(n.clone().setY(n.y + 0.1)); }); await frames(1); }
await p.waitForFunction('window.__bagverse.bagRun.state === "run"', null, { timeout: 900000, polling: 300 });
// collect 8 bags by teleport in order
for (let i = 0; i < 8; i++) { await q(() => { const B = window.__bagverse, n = B.bagRun.nextBag(B.player.body.pos); B.player.teleport(n.clone().setY(n.y + 0.1)); }); await frames(2); }
console.log('after 8:', await q(() => { const r = window.__bagverse.bagRun; return JSON.stringify({ score: r.score, bags: r.bags, combo: r.combo, left: r.left.toFixed(1) }); }));
// trip a barrier
await q(() => { const B = window.__bagverse, br = B.bagRun.barriers[0]; B.player.teleport(br.pos.clone().setY(br.pos.y + 0.1)); }); await frames(2);
console.log('after trip:', await q(() => { const r = window.__bagverse.bagRun; return JSON.stringify({ score: r.score, trips: r.trips, combo: r.combo }); }));
await p.screenshot({ path: `/tmp/claude-0/br_${tag}_run.png`, timeout: 900000 });
console.log('overlaps', await q(() => { const els = [...document.querySelectorAll('#topleft, #topright, #minimap, .rh-bar, #joy, #jumpbtn')].filter((e) => getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 0);
  const R = els.map((e) => [e.id || e.className, e.getBoundingClientRect()]); const bad = [];
  for (let i = 0; i < R.length; i++) for (let j = i + 1; j < R.length; j++) { const a = R[i][1], c = R[j][1]; if (a.left < c.right && c.left < a.right && a.top < c.bottom && c.top < a.bottom) bad.push(R[i][0] + ' x ' + R[j][0]); } return JSON.stringify(bad); }));
console.log('player at', await q(() => window.__bagverse.player.body.pos.toArray().map((v) => v.toFixed(0)).join(',')));
for (let i = 0; i < 25; i++) { await q(() => { const B = window.__bagverse, n = B.bagRun.nextBag(B.player.body.pos); B.player.teleport(n.clone().setY(n.y + 0.1)); }); await frames(1); }
console.log('far along', await q(() => { const r = window.__bagverse.bagRun; return r.bags + ' bags, idx ' + r.lastIdx + ', at ' + window.__bagverse.player.body.pos.toArray().map((v) => v.toFixed(0)).join(','); }));
await p.screenshot({ path: `/tmp/claude-0/br_${tag}_far.png`, timeout: 900000 });
const xp0 = await q(() => window.__bagverse.progress.s.totalXp);
await q(() => { window.__bagverse.bagRun.left = 0.05; }); await frames(3);
console.log('finished', await q(() => JSON.stringify({ active: window.__bagverse.bagRun.active, mg: window.__bagverse.progress.s.mg.bagrun, stats: { r: window.__bagverse.progress.s.stats.bagrun, best: window.__bagverse.progress.s.stats.bagrunBest }, modal: document.getElementById('mtitle').textContent })), 'xp+', (await q(() => window.__bagverse.progress.s.totalXp)) - xp0);
await p.screenshot({ path: `/tmp/claude-0/br_${tag}_results.png`, timeout: 900000 });
await p.click('#rr-again'); await frames(3);
console.log('again state', await q(() => window.__bagverse.bagRun.state), 'music after', await q(() => window.__bagverse.sfx.track?.name || 'none'));
await q(() => document.getElementById('rh-quit').click()); await frames(2);
console.log('quit', await q(() => window.__bagverse.bagRun.active), await q(() => window.__bagverse.player.body.pos.toArray().map((v) => v.toFixed(1)).join(',')));
await b.close(); console.log('done');
