import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 480, height: 270 } });
p.on('pageerror', (e) => console.log('[pageerror]', e.message));
await p.addInitScript(() => { localStorage.setItem('bagverse.char', 'witch'); });
await p.goto('http://localhost:4173/?autostart&fixeddt=0.05&q=' + (process.env.Q || 'low'));
await p.waitForFunction('window.__ready && window.__frames > 3', null, { timeout: 900000 });
const frames = async (n) => { const f0 = await p.evaluate('window.__frames'); await p.waitForFunction(`window.__frames > ${f0 + n}`, null, { timeout: 900000, polling: 500 }); };
const m = () => p.evaluate(() => {
  const B = window.__bagverse, s = B.scooter, c = B.player.c;
  const V = s.pos.constructor, q = new s.root.quaternion.constructor();
  const fwd = (o) => { o.getWorldQuaternion(q); const v = new V(0, 0, 1).applyQuaternion(q); return Math.atan2(v.x, v.z); };
  let hips = null; c.model.traverse((o) => { if (!hips && /Hips$/.test(o.name)) hips = o; });
  const body = s.model.getObjectByName('SCT_BODY');
  const d = (a) => +((a * 180 / Math.PI + 540) % 360 - 180).toFixed(1);
  return { h: d(s.h), scooterRoot: d(fwd(s.root)), scooterBody: body ? d(fwd(body)) : null, playerRoot: d(fwd(B.player.root)), model: d(fwd(c.model)), hips: d(fwd(hips)), anim: c.anim.current?.getClip().name, t: c.anim.current && +c.anim.current.time.toFixed(2), kmh: s.kmh };
});
await p.evaluate(() => window.__bagverse.summonScooter());
await p.waitForFunction(() => !!window.__bagverse.player.c.actions.Ride, null, { timeout: 900000, polling: 1000 }); await frames(3);
console.log('start', JSON.stringify(await m()));
await p.keyboard.down('KeyW'); for (let i = 0; i < 4; i++) { await frames(8); console.log('fwd', JSON.stringify(await m())); }
await p.keyboard.down('KeyD'); for (let i = 0; i < 3; i++) { await frames(8); console.log('turn', JSON.stringify(await m())); }
await p.keyboard.up('KeyD'); await p.keyboard.up('KeyW'); await p.keyboard.down('Space'); await frames(20); await p.keyboard.up('Space');
console.log('stopped', JSON.stringify(await m()));
await b.close();
