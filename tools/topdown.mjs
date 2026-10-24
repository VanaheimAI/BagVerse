import { chromium } from 'playwright';
const [cx, cz, span, out] = [+process.argv[2], +process.argv[3], +process.argv[4], process.argv[5]];
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await (await b.newContext({ viewport: { width: 800, height: 800 } })).newPage();
await p.goto('http://localhost:4173/?autostart&fixeddt=0.1&unlockall&q=low');
await p.waitForFunction('window.__ready && window.__frames > 3', null, { timeout: 900000 });
await p.evaluate(([cx, cz, span]) => { const B = window.__bagverse; const T = B.player.root.position.constructor;
  document.getElementById('hud').hidden = true;
  B.__topdown = { cx, cz, span };
  const cam = B.camera || B.cam.camera || B.cam.cam; window.__tdcam = cam;
}, [cx, cz, span]);
// override the camera each frame via a render hook: place an ortho-like high camera
await p.evaluate(([cx, cz, span]) => { const B = window.__bagverse; const cam = window.__tdcam;
  const orig = B.cam.update.bind(B.cam); B.cam.update = (...a) => { orig(...a); cam.position.set(cx, 400, cz + 0.001); cam.up.set(0, 0, -1); cam.lookAt(cx, 0, cz); cam.fov = 2 * Math.atan(span / 2 / 400) * 180 / Math.PI; cam.far = 1000; cam.updateProjectionMatrix(); };
  B.player.teleport(new B.player.root.position.constructor(cx, B.world.physics.groundAt(cx, cz, 60) + 0.2, cz)); }, [cx, cz, span]);
const f0 = await p.evaluate('window.__frames'); await p.waitForFunction(`window.__frames > ${f0 + 4}`, null, { timeout: 900000, polling: 300 });
await p.screenshot({ path: out, timeout: 900000 });
await b.close();
