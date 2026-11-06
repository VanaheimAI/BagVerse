// Thanksgiving Arena / Gobble Obby: the dressed site, every jump on the course (simulated with the real collision),
// bounce / crumble / sweeper / checkpoint / respawn / finish, and a bot race.
// Build + server as in tools/tags_test.mjs.   node tools/obby_test.mjs [outDir]
import fs from 'node:fs';
import { chromium } from 'playwright';
const out = process.argv[2] || '/tmp/obby_test'; fs.mkdirSync(out, { recursive: true });
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await (await b.newContext({ viewport: { width: 960, height: 540 } })).newPage();
const errs = []; p.on('pageerror', (e) => { errs.push(e.message); console.log('[pageerror]', e.message); });
await p.goto('http://localhost:4175/?autostart&fixeddt=0.1&q=low&unlockall', { timeout: 900000, waitUntil: 'commit' });
await p.waitForFunction('window.__ready && window.__frames > 3', null, { timeout: 900000 });
const frames = async (n) => { const f0 = await p.evaluate('window.__frames'); await p.waitForFunction(`window.__frames > ${f0 + n}`, null, { timeout: 900000, polling: 200 }); };
const shot = (n) => p.screenshot({ path: `${out}/${n}.png`, timeout: 600000 });

// 1. the site
await p.evaluate(() => { const B = window.__bagverse; const z = B.world.zones.find((x) => x.id === 'thanksgiving'); B.hud.onTravel(z); });
await frames(4);
console.log('zone:', await p.evaluate(() => window.__bagverse.world.zoneAt(window.__bagverse.player.body.pos).label));
await p.evaluate(() => { window.__camOverride = { pos: [98, 26, 108], at: [145, 10, 155] }; }); await frames(4); await shot('1_site');
await p.evaluate(() => { window.__camOverride = { pos: [180, 40, 190], at: [145, 14, 155] }; }); await frames(4); await shot('2_site_back');

// 2. every jump, with the real collision: run-up from the near edge, full air control, aim at the next element
const sim = await p.evaluate(() => {
  const B = window.__bagverse, C = B.thanks.course, ph = B.player.physics, els = C.els, res = [];
  const V = B.player.body.pos.constructor;
  for (let i = 0; i + 1 < els.length; i++) {
    const a = els[i], n = els[i + 1]; let ok = false, why = '';
    for (const T0 of [0, 1.3, 2.6]) {   // a few moments (moving / spinning parts)
      C.update(T0);
      const dir = new V(n.pos.x - a.pos.x, 0, n.pos.z - a.pos.z).normalize(), edge = (a.shape === 'cyl' ? a.r : Math.min(a.hx, a.hz) + 0.2) - 0.45;
      const body = { pos: a.pos.clone().addScaledVector(dir, Math.max(0, a.type === 'corn' ? a.hx - 0.4 : edge)), vel: new V(), onGround: true, radius: 0.38, height: 1.85, _on: a };
      body.pos.y = a.pos.y; body.vel.copy(dir).multiplyScalar(7); body.vel.y = a.bounce ? a.bounce : 10.5; body.onGround = false;
      let T = T0, landed = null; const wob0 = n.wob;
      for (let k = 0; k < 240 * 2.5; k++) {
        const dt = 1 / 240; T += dt; C.update(T);
        const tgt = new V(n.pos.x - body.pos.x, 0, n.pos.z - body.pos.z), d = tgt.length();
        if (d > 0.25) { tgt.multiplyScalar(7 / d); body.vel.x = tgt.x; body.vel.z = tgt.z; } else { body.vel.x = body.vel.z = 0; }
        ph.step(body, dt);
        if ((body.onGround && body._on === n) || n.wob !== wob0) { landed = n; break; }
        if (body.pos.y < Math.min(a.pos.y, n.pos.y) - 6) break;
      }
      if (landed) { ok = true; break; } why = `y ${body.pos.y.toFixed(1)} on ${body._on?.type ?? '-'}`;
    }
    const gap = Math.hypot(n.base.x - a.base.x, n.base.z - a.base.z);
    if (!ok) res.push(`${i} ${a.type} -> ${i + 1} ${n.type}: MISSED (${why}, centres ${gap.toFixed(1)} m, rise ${(n.base.y - a.base.y).toFixed(1)})`);
  }
  return { n: els.length, top: C.top.toFixed(1), fails: res, finish: [C.finishEl.pos.x, C.finishEl.pos.y, C.finishEl.pos.z].map((v) => v.toFixed(1)) };
});
console.log('jumps:', JSON.stringify(sim));

// 3. standing still on every static element: stays put (no sinking / sliding)
console.log('stand:', await p.evaluate(() => {
  const B = window.__bagverse, C = B.thanks.course, ph = B.player.physics, V = B.player.body.pos.constructor, bad = [];
  C.update(0);
  for (const e of C.els) { if (e.amp || e.spin || e.bounce || e.crumble) continue;
    const body = { pos: e.pos.clone(), vel: new V(), onGround: true, radius: 0.38, height: 1.85, _on: e };
    for (let k = 0; k < 120; k++) ph.step(body, 1 / 240);
    if (Math.abs(body.pos.y - e.pos.y) > 0.02 || body._on !== e) bad.push(`${e.i} ${e.type} y ${body.pos.y.toFixed(2)}/${e.pos.y.toFixed(2)}`); }
  // ground step-up onto the start plate
  const s = C.cps[0], dir = s.radial.clone().negate();
  const body = { pos: new V(s.pos.x + s.radial.x * 4, ph.groundAt(s.pos.x + s.radial.x * 4, s.pos.z + s.radial.z * 4, 5), s.pos.z + s.radial.z * 4), vel: dir.clone().multiplyScalar(5), onGround: true, radius: 0.38, height: 1.85 };
  for (let k = 0; k < 240; k++) { body.vel.x = dir.x * 5; body.vel.z = dir.z * 5; ph.step(body, 1 / 240); }
  return { bad, startStepUp: body._on === s || Math.abs(body.pos.y - s.pos.y) < 0.02 };
}));

// 4. a run vs bots: pad prompt, countdown, checkpoint, fall + respawn, bounce, crumble, finish
await p.evaluate(() => { window.__camOverride = null; const B = window.__bagverse, d = B.thanks.pads[0]; B.player.teleport(d.pos.clone().setY(d.pos.y + 0.2)); }); await frames(3);
console.log('pad prompt:', await p.evaluate(() => document.getElementById('prompt').textContent));
await p.evaluate(() => { const B = window.__bagverse; B.obbyMenu(); document.getElementById('ob-solo').click(); });
await p.waitForFunction(() => window.__bagverse.obby.state === 'run', null, { timeout: 120000 });
await frames(3); await shot('3_run_start');
const checks = await p.evaluate(() => {
  const B = window.__bagverse, O = B.obby, C = B.thanks.course, P = B.player, r = {};
  const put = (e) => { P.teleport(e.pos.clone().setY(e.pos.y + 0.3)); for (let k = 0; k < 30; k++) P.update(1 / 60, B.input, 0); };
  put(C.cps[1]); r.cp = O.cp;
  P.teleport(C.cps[1].pos.clone().setY(1)); for (let k = 0; k < 40; k++) P.update(1 / 60, B.input, 0); O.update(0.016); r.afterFall = { falls: O.falls, y: +P.body.pos.y.toFixed(2), cpY: +C.cps[1].pos.y.toFixed(2) };
  const j = C.els.find((e) => e.bounce); P.teleport(j.pos.clone().setY(j.pos.y + 0.4)); let vy = 0; for (let k = 0; k < 20; k++) { P.update(1 / 60, B.input, 0); vy = Math.max(vy, P.body.vel.y); } r.bounceVy = +vy.toFixed(1);
  const c = C.crusts[0]; P.teleport(c.pos.clone().setY(c.pos.y + 0.2)); for (let k = 0; k < 8; k++) P.update(1 / 60, B.input, 0);
  const t0 = C.T; C.update(t0 + 1.0); r.crumbled = !c.solid; C.update(t0 + 1.0 + 3.5); r.crustBack = c.solid;
  const sw = C.sweeps[0]; C.update(10); const ang = sw.ang; P.teleport(sw.pos.clone().add(new P.body.pos.constructor(Math.cos(ang) * 2, 0, -Math.sin(ang) * 2)).setY(sw.pos.y)); P.body.onGround = true; P.body._on = sw; P.body._bonk = 0;
  for (let k = 0; k < 4; k++) P.update(1 / 240, B.input, 0); r.bonk = +Math.hypot(P.body.vel.x, P.body.vel.z).toFixed(1);
  r.bots = O.bots.map((b) => `${b.name}@${b.idx}`); r.names = new Set(O.bots.map((b) => b.name)).size;
  return r; });
console.log('run:', JSON.stringify(checks));
await p.evaluate(() => { window.__camOverride = { pos: [120, 20, 128], at: [145, 8, 155] }; }); await frames(25); await shot('4_bots_climbing');
console.log('bots after 25 frames:', await p.evaluate(() => window.__bagverse.obby.bots.map((b) => `${b.name}@${b.idx}${b.state === 'fall' ? '(fell)' : ''}`).join(' ')));
// close-ups along the course
for (const [k, i] of [[5, 6], [6, 12], [7, 20], [8, 26], [9, 36]]) {
  await p.evaluate((i) => { const C = window.__bagverse.thanks.course, e = C.els[i], o = e.pos.clone().addScaledVector(e.radial, 9); window.__camOverride = { pos: [o.x, e.pos.y + 4, o.z], at: [e.pos.x, e.pos.y, e.pos.z] }; }, i);
  await frames(3); await shot(`${k}_course_${i}`);
}
await p.evaluate(() => { window.__camOverride = null; const B = window.__bagverse, f = B.thanks.course.finishEl; B.player.teleport(f.pos.clone().setY(f.pos.y + 0.3)); });
await p.waitForFunction(() => !window.__bagverse.obby.active, null, { timeout: 300000 });
await frames(2);
console.log('results:', await p.evaluate(() => document.getElementById('mtitle').textContent + ' | ' + document.getElementById('mbody').innerText.slice(0, 260).replace(/\n/g, ' / ')));
await shot('10_results');
console.log('daily/ach:', await p.evaluate(() => { const st = window.__bagverse.progress.s.stats; return { thanksgiving: st.thanksgiving, finish: st.obby_finish, ach: Object.keys(window.__bagverse.progress.s.ach).filter((k) => k.startsWith('a_obby')) }; }));
console.log('errors:', errs.length); await b.close();
