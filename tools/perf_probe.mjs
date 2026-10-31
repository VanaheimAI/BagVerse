// GPU budget probe: per tier, on a phone-sized viewport, report draw calls, triangles, shadow maps, render targets
// and an estimate of GPU texture memory.   node tools/perf_probe.mjs low|medium|high [outDir]
import fs from 'node:fs';
import { chromium } from 'playwright';
const q = process.argv[2] || 'low', out = process.argv[3] || '/tmp/perf_probe'; fs.mkdirSync(out, { recursive: true });
const mobile = !process.env.DESKTOP;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-precise-memory-info'] });
const ctx = await b.newContext(mobile ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' } : { viewport: { width: 1280, height: 720 } });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', (e) => errs.push(e.message));
await p.goto(`http://localhost:4175/?autostart&fixeddt=0.1&q=${q}${process.env.EXTRA || ''}`, { timeout: 900000, waitUntil: 'commit' });
await p.waitForFunction('window.__ready && window.__frames > 3', null, { timeout: 900000 });
const f0 = await p.evaluate('window.__frames'); await p.waitForFunction(`window.__frames > ${f0 + 4}`, null, { timeout: 900000, polling: 200 });
await p.evaluate(() => { const R = window.__bagverse.renderer; R.info.autoReset = false; R.info.reset(); });
const f1 = await p.evaluate('window.__frames'); await p.waitForFunction(`window.__frames > ${f1}`, null, { timeout: 900000, polling: 50 });
await p.evaluate(() => { const R = window.__bagverse.renderer; window.__rinfo = { calls: R.info.render.calls, tris: R.info.render.triangles, frames: 0 }; });
const r = await p.evaluate(() => {
  const B = window.__bagverse, R = B.renderer, info = R.info;
  const tex = new Set(), bytesOf = (t) => {
    const im = t.image || t.source?.data; if (!im) return 0;
    const w = im.width || 0, h = im.height || 0, faces = t.isCubeTexture ? 6 : 1, mip = t.generateMipmaps !== false ? 1.33 : 1;
    return w * h * 4 * faces * mip;
  };
  let geoBytes = 0; const geos = new Set(); let meshes = 0, shadowCasters = 0, skinned = 0;
  B.scene.traverse((o) => {
    if (!o.isMesh && !o.isPoints && !o.isLine) return;
    meshes++; if (o.castShadow) shadowCasters++; if (o.isSkinnedMesh) skinned++;
    if (o.geometry && !geos.has(o.geometry)) { geos.add(o.geometry); for (const a of Object.values(o.geometry.attributes)) geoBytes += a.array?.byteLength || 0; if (o.geometry.index) geoBytes += o.geometry.index.array.byteLength; }
    let top = o; while (top.parent && top.parent !== B.scene) top = top.parent;
    for (const m of [].concat(o.material)) if (m) for (const v of Object.values(m)) if (v && v.isTexture) { tex.add(v); v.__owner = v.__owner || (top.name || top.type); }
  });
  let texBytes = 0; const big = [];
  for (const t of tex) { const by = bytesOf(t); texBytes += by; const im = t.image || {}; big.push([t.__owner, t.name || '?', im.width, im.height, Math.round(by / 1048576 * 10) / 10]); }
  big.sort((a, b) => b[4] - a[4]); const byOwner = {}; for (const x of big) byOwner[x[0]] = Math.round(((byOwner[x[0]] || 0) + x[4]) * 10) / 10;
  const lights = []; B.scene.traverse((o) => { if (o.isLight && o.castShadow && o.shadow) lights.push(o.shadow.mapSize.x); });
  const comp = B.look?.passes;
  const size = { w: R.domElement.width, h: R.domElement.height, pr: R.getPixelRatio() };
  return { quality: B.quality, calls: window.__rinfo.calls, tris: window.__rinfo.tris, gpuGeos: info.memory.geometries, gpuTex: info.memory.textures, programs: info.programs?.length,
    meshes, shadowCasters, skinned, shadowMaps: lights, texMB: Math.round(texBytes / 1048576), geoMB: Math.round(geoBytes / 1048576), heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null,
    size, passes: Object.keys(comp || {}), npcs: B.crowd.list.length, detail: big.filter((x) => x[0] === 'Scene').slice(0, 60), topTex: Object.entries(byOwner).sort((a, b) => b[1] - a[1]).slice(0, 30) };
});
const { topTex, detail, ...rest } = r; for (const t of detail) console.log('  D', t.join(' ')); console.log(JSON.stringify(rest)); for (const t of topTex) console.log("  ", t.join(" "));
if (process.env.SHOT) await p.screenshot({ path: `${out}/${q}.png`, timeout: 600000 });
console.log('errors:', errs.length, errs.slice(0, 3)); await b.close();
