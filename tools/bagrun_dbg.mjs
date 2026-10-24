import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await (await b.newContext({ viewport: { width: 640, height: 360 } })).newPage();
await p.goto('http://localhost:4173/?autostart&fixeddt=0.1&q=low&unlockall');
await p.waitForFunction('window.__ready && window.__frames > 3', null, { timeout: 900000 });
console.log(await p.evaluate(() => { const r = window.__bagverse.bagRun; const V = window.__bagverse.player.body.pos.constructor; r.warm(Infinity);
  const zones = Object.fromEntries(window.__bagverse.world.zones.map((z) => [z.id, z])); const out = [];
  for (const id of ['gm', 'bull']) {
    const plan = { id, stops: { near: ['ad_canyon', 'central_tower', 'rwa_vault'], gm: ['gm_gate'], vault: ['rwa_vault', 'central_tower'], canyon: ['ad_canyon', 'arcade'], bull: ['bull_run'] }[id] };
    // replicate waypoint gen with logging: monkeypatch astar
    const orig = r.astar.bind(r), snap = r.snap.bind(r); let log = [];
    r.snap = (x, z, rr) => { const c = snap(x, z, rr); log.push('snap ' + x.toFixed(0) + ',' + z.toFixed(0) + ' -> ' + c); return c; };
    r.astar = (a, c, u) => { const res = orig(a, c, u); log.push('astar ' + a + ' -> ' + c + ' ' + (res ? res.length : 'NULL')); return res; };
    const pts = r.planPoints(plan, zones, () => 0.3); r.astar = orig; r.snap = snap;
    out.push(id + ': ' + (pts ? pts.length : 'null') + '\n  ' + log.join('\n  '));
  } out.push('reach N ' + [20,26,30,32,34,36,40,50,60].map((z) => z + ':' + [-20,-10,0,10,20].map((x) => r.reach.has(r.cellKey(x/2, z/2)) ? 1 : 0).join('')).join(' ')); return out.join('\n'); }));
await b.close();
