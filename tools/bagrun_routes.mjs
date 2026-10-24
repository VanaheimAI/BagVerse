import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await (await b.newContext({ viewport: { width: 640, height: 360 } })).newPage();
p.on('pageerror', (e) => console.log('[pageerror]', e.message));
await p.goto('http://localhost:4173/?autostart&fixeddt=0.1&q=low&unlockall');
await p.waitForFunction('window.__ready && window.__frames > 3', null, { timeout: 900000 });
const ids = ['square', 'bowtie', 'near', 'gm', 'hodl', 'arcade', 'copium', 'vault', 'canyon', 'bull', 'swamp', 'doge'];
const res = await p.evaluate((ids) => { const r = window.__bagverse.bagRun, out = {};
  for (const id of ids) { r.forcePlan = id; const t = performance.now(); r.buildMeshes(); const pts = r.makeCourse(); const ms = performance.now() - t;
    if (!pts) { out[id] = 'FAIL'; continue; } r.layout(pts);
    let L = 0, far = 0, gap = 0; for (let i = 0; i < pts.length; i++) { const a = pts[i].pos, c = pts[(i + 1) % pts.length].pos; const d = Math.hypot(a.x - c.x, a.z - c.z); L += d; gap = Math.max(gap, d); far = Math.max(far, Math.hypot(a.x, a.z)); }
    out[id] = { plan: r.plan.id, bags: pts.length, megas: pts.filter((x) => x.mega).length, barriers: r.barriers.length, len: Math.round(L), maxGap: +gap.toFixed(1), far: Math.round(far), ms: Math.round(ms), path: pts.map((x) => [Math.round(x.pos.x), Math.round(x.pos.z)]) }; }
  r.forcePlan = null; const seq = []; for (let i = 0; i < 8; i++) { r.makeCourse(); seq.push(r.plan.id); } out.randomSeq = seq; return out; }, ids);
const fs = await import('fs'); fs.writeFileSync('/tmp/claude-0/routes.json', JSON.stringify(res));
for (const [k, v] of Object.entries(res)) console.log(k, typeof v === 'object' && !Array.isArray(v) ? JSON.stringify({ ...v, path: undefined }) : JSON.stringify(v));
await b.close();
