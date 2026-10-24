import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 320, height: 180 } });
await p.goto('http://localhost:4173/?autostart&fixeddt=0.05&q=medium');
await p.waitForFunction('window.__ready && window.__frames > 3', null, { timeout: 900000 });
console.log(await p.evaluate(() => {
  const s = window.__bagverse.scooter, body = s.model.getObjectByName('SCT_BODY');
  s.root.position.set(0, 0, 0); s.root.rotation.set(0, 0, 0); s.root.updateMatrixWorld(true);
  const pos = body.geometry.attributes.position, V = s.pos.constructor, v = new V(), pts = [];
  for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i).applyMatrix4(body.matrixWorld); pts.push(v.clone()); }
  const pick = (f) => pts.filter(f);
  const stat = (a, k) => a.length ? [Math.min(...a.map((p) => p[k])), Math.max(...a.map((p) => p[k]))].map((x) => +x.toFixed(2)) : null;
  const grips = pick((p) => p.y > 0.9), deck = pick((p) => p.y < 0.32 && p.y > 0.12 && Math.abs(p.x) < 0.1), wheels = pick((p) => p.y < 0.05);
  const zbins = {}; for (const p of pick((p) => Math.abs(p.x) < 0.08 && p.y > 0.1 && p.y < 0.5)) { const k = Math.round(p.z * 10) / 10; zbins[k] = Math.max(zbins[k] || 0, p.y); }
  return JSON.stringify({ grips: { x: stat(grips, 'x'), z: stat(grips, 'z'), y: stat(grips, 'y') }, deckZ: stat(deck, 'z'), wheelsZ: stat(wheels, 'z'), all: { x: stat(pts, 'x'), y: stat(pts, 'y'), z: stat(pts, 'z') }, topByZ: zbins, deckNode: s.deck.toArray() }, null, 0);
}));
await b.close();
