// Finds wall spots for Spray Spots: flat, vertical, tall-enough collider walls in each district, reachable on foot,
// away from doors / portals / billboards / kiosks / spawn. Prints JSON (paste into src/tagspots.js) and saves a
// screenshot per spot to verify it lands on a real wall.
//   build: FAKE_SUPABASE=1 VITE_SUPABASE_URL=x VITE_SUPABASE_ANON_KEY=y npx vite build --outDir /tmp/dist-fake
//   node tools/wallet_server.mjs /tmp/dist-fake 4175 &  node tools/find_tag_spots.mjs [outDir] [--shots]
import fs from 'node:fs';
import { chromium } from 'playwright';
const out = process.argv[2] || '/tmp/tagspots', shots = process.argv.includes('--shots');
fs.mkdirSync(out, { recursive: true });
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await (await b.newContext({ viewport: { width: 800, height: 450 } })).newPage(); p.on('pageerror', (e) => console.log('[pageerror]', e.message));
await p.goto('http://localhost:4175/?autostart&fixeddt=0.1&q=low&unlockall', { timeout: 900000, waitUntil: 'commit' });
await p.waitForFunction('window.__ready && window.__frames > 3', null, { timeout: 900000 });
const spots = await p.evaluate(() => {
  const B = window.__bagverse, ph = B.world.physics, V = B.camera.position.constructor;
  const avoid = [];
  for (const o of B.world.portals) avoid.push([o.userData.center, 9]);
  for (const bb of B.world.billboards) if (bb.userData.tier !== 'hero') avoid.push([bb.userData.center, 11]);
  for (const k of B.collect.kiosks) avoid.push([k.pos, 6]);
  for (const id of ['rwa_vault', 'apex_arena']) { const f = B.vaultFront(id); if (f) avoid.push([f, 10]); }
  avoid.push([B.world.spawn, 6]);
  const far = (pt) => avoid.every(([c, r]) => Math.hypot(pt.x - c.x, pt.z - c.z) > r);
  let seed = 7; const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const DIST = ['bag_square', 'ad_canyon', 'arcade', 'gm_gate', 'copium', 'hodl_heights', 'rekt', 'bull_run', 'doge_park', 'swamp', 'apex_arena', 'rwa_vault'];
  const res = [];
  for (const id of DIST) {
    const z = B.world.zones.find((q) => q.id === id); if (!z) continue;
    const cands = [];
    const R = Math.min(z.radius, 40);
    for (let i = 0; i < 500; i++) {
      const a = rand() * Math.PI * 2, rr = Math.sqrt(rand()) * R, x = z.pos.x + Math.cos(a) * rr, zz = z.pos.z + Math.sin(a) * rr;
      const g = ph.groundAt(x, zz, 40); if (g > 8 || g < -2) continue;
      if (B.world.zoneAt(new V(x, g, zz))?.id !== id) continue;
      for (let k = 0; k < 16; k++) {
        const t = (k / 16) * Math.PI * 2, d = new V(Math.cos(t), 0, Math.sin(t));
        const o = new V(x, g + 1.9, zz), h = ph.raycastHit(o, d, 6);
        if (!h || h.distance < 1.6 || Math.abs(h.normal.y) > 0.08) continue;
        const n = new V(h.normal.x, 0, h.normal.z).normalize(), tan = new V(-n.z, 0, n.x);
        if (n.dot(d) > -0.6) continue;   // facing the stander
        // flat over 3.2 m x 1.8 m: 5 x 3 rays straight at the wall from 1.2 m out
        let ok = true;
        for (let u = -2.0; u <= 2.0 && ok; u += 0.5) for (let v = -1.05; v <= 1.05 && ok; v += 0.7) {   // the 4 m x 2.25 m tag
          const c = h.point.clone().addScaledVector(n, 1.2).addScaledVector(tan, u); c.y += v;
          const hh = ph.raycastHit(c, n.clone().negate(), 1.6);
          if (!hh || Math.abs(hh.distance - 1.2) > 0.08 || hh.normal.dot(n) < 0.98) ok = false;
        }
        if (!ok) continue;
        // open space in front (nothing between stander and wall at several heights), wall continues up 1.2 m above
        for (const dy of [0.6, 1.2, 2.6]) { const c = h.point.clone().addScaledVector(n, 3); c.y += dy - 1.9 + 0.0; const hh = ph.raycastHit(c, n.clone().negate(), 3.2); if (!hh || Math.abs(hh.distance - 3) > 0.15) ok = false; }
        const up = h.point.clone().addScaledVector(n, 0.5); up.y += 1.3; const hu = ph.raycastHit(up, n.clone().negate(), 0.7); if (!hu) ok = false;
        if (!ok) continue;
        const stand = h.point.clone().addScaledVector(n, 2.6), gs = ph.groundAt(stand.x, stand.z, h.point.y + 2);
        if (Math.abs(gs - g) > 0.6) continue;
        if (!far(h.point)) continue;
        cands.push({ p: h.point, n, d: Math.hypot(h.point.x - z.pos.x, h.point.z - z.pos.z), g });
      }
    }
    cands.sort((a, b) => a.d - b.d);
    const pick = [];
    const want = 3;
    for (const c of cands) {
      if (pick.length >= want) break;
      if (pick.some((q) => q.p.distanceTo(c.p) < 16) || res.some((q) => Math.hypot(q.x - c.p.x, q.z - c.p.z) < 16)) continue;
      pick.push(c);
    }
    pick.forEach((c, i) => res.push({ id: `${id}_${i + 1}`, zone: id, x: +c.p.x.toFixed(2), y: +c.p.y.toFixed(2), z: +c.p.z.toFixed(2), nx: +c.n.x.toFixed(3), nz: +c.n.z.toFixed(3), cands: cands.length }));
  }
  return res;
});
console.log(JSON.stringify(spots.map(({ cands, ...s }) => s)));
for (const s of spots) console.log(s.id, 'candidates', s.cands);
if (shots) {
  for (const s of spots) {
    await p.evaluate((s) => { window.__camOverride = { pos: [s.x + s.nx * 7, s.y + 1.2, s.z + s.nz * 7], at: [s.x, s.y, s.z] }; const B = window.__bagverse; B.player.teleport(new B.camera.position.constructor(s.x + s.nx * 2.6, s.y - 1.9 + 0.3, s.z + s.nz * 2.6)); }, s);
    const f0 = await p.evaluate('window.__frames'); await p.waitForFunction(`window.__frames > ${f0 + 4}`, null, { timeout: 900000, polling: 200 });
    await p.screenshot({ path: `${out}/${s.id}.png` });
  }
}
await b.close();
