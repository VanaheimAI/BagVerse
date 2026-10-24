import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 320, height: 180 } });
await p.addInitScript(() => { localStorage.setItem('bagverse.char', 'witch'); });
await p.goto('http://localhost:4173/?autostart&fixeddt=0.05&q=low');
await p.waitForFunction('window.__ready && window.__frames > 3', null, { timeout: 900000 });
await p.evaluate(() => window.__bagverse.summonScooter());
await p.waitForFunction(() => !!window.__bagverse.player.c.actions.Ride, null, { timeout: 900000, polling: 1000 });
console.log(await p.evaluate(() => {
  const B = window.__bagverse, c = B.player.c, a = c.actions.Ride, dur = a.getClip().duration;
  const names = ['Hips', 'Spine2', 'Head', 'LeftFoot', 'RightFoot', 'LeftHand', 'RightHand'];
  const bones = {}; c.model.traverse((o) => { for (const n of names) if (o.name.endsWith(n) && !bones[n]) bones[n] = o; });
  const V = B.scooter.pos.constructor, q = new B.scooter.root.quaternion.constructor(), out = [];
  c.mixer.stopAllAction(); a.reset().play(); a.setEffectiveWeight(1); a.timeScale = 1;
  for (let t = 0; t <= dur; t += dur / 12) {
    a.time = t; c.mixer.update(0); B.player.root.updateMatrixWorld(true);
    const inv = B.player.root.matrixWorld.clone().invert();
    const loc = (o) => new V().setFromMatrixPosition(o.matrixWorld).applyMatrix4(inv);
    bones.Spine2.getWorldQuaternion(q); const f = new V(0, 0, 1).applyQuaternion(q); const rq = B.player.root.getWorldQuaternion(new q.constructor()).invert(); f.applyQuaternion(rq);
    const r = (v) => v.toArray().map((x) => +x.toFixed(2));
    out.push(`t=${t.toFixed(2)} chestYaw=${(Math.atan2(f.x, f.z) * 57.3).toFixed(0)} hips=${r(loc(bones.Hips))} head=${r(loc(bones.Head))} Lfoot=${r(loc(bones.LeftFoot))} Rfoot=${r(loc(bones.RightFoot))} Lhand=${r(loc(bones.LeftHand))}`);
  }
  return out.join('\n');
}));
await b.close();
